import json
import base64
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone, date
from auth.auth_models import User
from auth.auth_database import local_session

from services.blockchain_service import blockchain
from services.qr import generate_qr_image
from database.database import get_db
from models.batch_model import DrugBatch, DrugItem, BatchStatus
from services.hash import generate_secure_hash
from services.ipfs import upload_image_to_ipfs
from auth.dependencies import get_authed_user, get_current_user

router = APIRouter()


STATUS_MAP = ["NONE", "CREATED", "IN_TRANSIT_TO_DIST", "AT_DISTRIBUTOR", "IN_TRANSIT_TO_PHARM", "AT_PHARMACY", "DEPLETED"]

ROLE_MAP = {0: "NONE", 1: "MANUFACTURER", 2: "DISTRIBUTOR", 3: "PHARMACY", 4: "VALIDATOR"}

class CreateBatchT1(BaseModel):
    batch_id:str
    drug_name:str
    manufacturer_name: str
    mfd: date
    exp: date
    batch_quantity: int
    image: str   

    @field_validator("batch_quantity")
    @classmethod
    def qty_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("batch_quantity must be > 0")
        return v

    @field_validator("exp")
    @classmethod
    def exp_after_mfd(cls, v, info):
        mfd = info.data.get("mfd")
        if mfd and v <= mfd:
            raise ValueError("Expiry date must be after manufacturing date")
        return v


class SplitBatch(BaseModel):
    batch_id: str
    no_of_batches: int
    quantity_per_batch: int


class ShipToDist(BaseModel):
    batch_id: str
    recipient_username: str


class ReceiveAtDist(BaseModel):
    batch_id: str


class ShipToPharma(BaseModel):
    batch_id: str
    recipient_username: str   


class ReceiveAtPharma(BaseModel):
    batch_id:str


class SellDrug(BaseModel):
    batch_id:str
    drug_id: str  

class AssignRolePayload(BaseModel):
    target_username: str
    role_index: int   


def _get_wallet_address(username: str, auth_db) -> str:
    user = auth_db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    return blockchain.w3.eth.account.from_key(user.private_key).address



@router.post("/create-drugs-t1", status_code=201)
async def create_batch_t1(payload:CreateBatchT1,auth = Depends(get_authed_user("MANUFACTURER")),db: Session = Depends(get_db),):
    user, current_user = auth

    if db.query(DrugBatch).filter(DrugBatch.batch_id == payload.batch_id).first():
        raise HTTPException(status_code=409, detail="Batch ID already exists")

    try:
        timestamp  = datetime.now(timezone.utc).replace(microsecond=0)

   
        image_data = base64.b64decode(payload.image)
        with open("temp_image.png", "wb") as f:
            f.write(image_data)
        ipfs_hash = upload_image_to_ipfs("temp_image.png")

        unique_hash = generate_secure_hash({
            "id": payload.batch_id,
            "name":payload.drug_name,
            "mfg":str(payload.mfd),
            "exp": str(payload.exp),
            "manu_name": payload.manufacturer_name,
            "ts":timestamp.isoformat(),
        })

        qr_img = generate_qr_image(unique_hash, is_batch=True)

        receipt = blockchain.create_batch(
            payload.batch_id, unique_hash, payload.batch_quantity,
            private_key=user.private_key
        )

        new_batch = DrugBatch(
            batch_id = payload.batch_id,
            drug_name= payload.drug_name,
            manufacturer_name = payload.manufacturer_name,
            mfd  = payload.mfd,
            exp  = payload.exp,
            created_at = timestamp,
            tot_drugs  = payload.batch_quantity,
            ipfs_hash = ipfs_hash,
        )
        db.add(new_batch)
        db.flush()

        drug_items = [
            {"batch_id": payload.batch_id,
             "drug_id":  f"{payload.batch_id}-D{i}",
             "is_sold":  False}
            for i in range(1, payload.batch_quantity + 1)
        ]
        db.bulk_insert_mappings(DrugItem, drug_items)
        db.commit()

        return StreamingResponse(
            qr_img,
            media_type="image/png",
            headers={
                "Status": "Success",
                "Blockchain_hash": unique_hash,
                "db_id": new_batch.batch_id,
                "transaction": receipt.transactionHash.hex(),
                "created_by": current_user["username"],
            },
        )

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Batch creation failed: {e}")


@router.post("/split-batch")
async def split_batch(payload: SplitBatch,auth = Depends(get_authed_user("MANUFACTURER", "DISTRIBUTOR")),db: Session = Depends(get_db),):
    user, current_user = auth

    parent = db.query(DrugBatch).filter(DrugBatch.batch_id == payload.batch_id).first()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent batch not found")
    if parent.tot_drugs == 0:
        raise HTTPException(status_code=400, detail="Batch is already empty / fully split")

    total_needed = payload.no_of_batches * payload.quantity_per_batch
    if total_needed > parent.tot_drugs:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough units. Available: {parent.tot_drugs}, requested: {total_needed}"
        )

    try:
        timestamp = datetime.now(timezone.utc)
        all_drugs = db.query(DrugItem).filter(DrugItem.batch_id == payload.batch_id).all()
        drug_index = 0

        for i in range(payload.no_of_batches):
            child_id = f"{payload.batch_id}-S{i + 1}"

            child_hash = generate_secure_hash({
                "id":child_id,
                "name": parent.drug_name,
                "mfg":str(parent.mfd),
                "exp": str(parent.exp),
                "manu_name": parent.manufacturer_name,
                "ts":  timestamp.isoformat(),
            })

            blockchain.split_batch(
                payload.batch_id, child_id, child_hash,
                payload.quantity_per_batch, user.private_key
            )

            child = DrugBatch(
                batch_id = child_id,
                drug_name = parent.drug_name,
                manufacturer_name = parent.manufacturer_name,
                mfd  = parent.mfd,
                exp  = parent.exp,
                tot_drugs = payload.quantity_per_batch,
                parent_batch_id  = payload.batch_id,
            )
            db.add(child)

            for _ in range(payload.quantity_per_batch):
                if drug_index < len(all_drugs):
                    all_drugs[drug_index].batch_id = child_id
                    drug_index += 1

        parent.tot_drugs -= total_needed
        db.commit()

        return {
            "status":  "success",
            "message": f"Batch {payload.batch_id} split into {payload.no_of_batches} sub-batches",
            "split_by": current_user["username"],
            "remaining_in_parent": parent.tot_drugs,
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Split failed: {e}")

@router.post("/ship-dist")
async def ship_to_distributor(payload:ShipToDist,auth = Depends(get_authed_user("MANUFACTURER")),db: Session = Depends(get_db),):
    user, current_user = auth

    if not db.query(DrugBatch).filter(DrugBatch.batch_id == payload.batch_id).first():
        raise HTTPException(status_code=404, detail="Batch not found")

    try:
        auth_db = local_session()
        try:
            distributor_address = _get_wallet_address(payload.recipient_username, auth_db)
            recipient = auth_db.query(User).filter(User.username == payload.recipient_username).first()
            if recipient.role != "DISTRIBUTOR":
                raise HTTPException(status_code=400, detail=f"'{payload.recipient_username}' is not registered as a DISTRIBUTOR")
        finally:
            auth_db.close()

        receipt = blockchain.ship_to_distributor(
            payload.batch_id, distributor_address, user.private_key
        )

        db.add(BatchStatus(
            batch_id = payload.batch_id,
            status = "IN_TRANSIT_TO_DIST",
            location = f"En route to {payload.recipient_username}",
            lat=0.0, lng=0.0,
            timestamp = datetime.now(timezone.utc),
        ))
        db.commit()

        return {
            "status": "success",
            "message": f"Batch {payload.batch_id} shipped to distributor {payload.recipient_username}",
            "shipped_by": current_user["username"],
            "recipient": payload.recipient_username,
            "transaction": receipt.transactionHash.hex(),
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Shipment failed: {e}")

@router.post("/receive-dist")
async def receive_at_distributor(
    payload:ReceiveAtDist,auth = Depends(get_authed_user("DISTRIBUTOR")),db: Session = Depends(get_db),):
    user, current_user = auth

    if not db.query(DrugBatch).filter(DrugBatch.batch_id == payload.batch_id).first():
        raise HTTPException(status_code=404, detail="Batch not found")

    try:
        receipt = blockchain.receive_at_distributor(payload.batch_id, user.private_key)

        db.add(BatchStatus(
            batch_id  = payload.batch_id,
            status = "AT_DISTRIBUTOR",
            location = f"Received by {current_user['username']}",
            lat=0.0, lng=0.0,
            timestamp = datetime.now(timezone.utc),
        ))
        db.commit()

        return {
            "status": "success",
            "message": f"Batch {payload.batch_id} received at distributor",
            "received_by": current_user["username"],
            "transaction": receipt.transactionHash.hex(),
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Could not accept batch: {e}")



@router.post("/ship-pharma")
async def ship_to_pharmacy(payload: ShipToPharma,auth = Depends(get_authed_user("DISTRIBUTOR")),db: Session = Depends(get_db),):
    user, current_user = auth

    if not db.query(DrugBatch).filter(DrugBatch.batch_id == payload.batch_id).first():
        raise HTTPException(status_code=404, detail="Batch not found")

    try:
        auth_db = local_session()
        try:
            pharmacy_address = _get_wallet_address(payload.recipient_username, auth_db)
            recipient = auth_db.query(User).filter(User.username == payload.recipient_username).first()
            if recipient.role != "PHARMACY":
                raise HTTPException(status_code=400, detail=f"'{payload.recipient_username}' is not registered as a PHARMACY")
        finally:
            auth_db.close()

        receipt = blockchain.ship_to_pharmacy(
            payload.batch_id, pharmacy_address, user.private_key
        )

        db.add(BatchStatus(
            batch_id  = payload.batch_id,
            status  = "IN_TRANSIT_TO_PHARM",
            location = f"En route to {payload.recipient_username}",
            lat=0.0, lng=0.0,
            timestamp = datetime.now(timezone.utc),
        ))
        db.commit()

        return {
            "status": "success",
            "message": f"Batch {payload.batch_id} shipped to pharmacy {payload.recipient_username}",
            "shipped_by":  current_user["username"],
            "recipient":   payload.recipient_username,
            "transaction": receipt.transactionHash.hex(),
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Shipment to pharmacy failed: {e}")

@router.post("/receive-pharma")
async def receive_at_pharmacy(payload: ReceiveAtPharma, auth = Depends(get_authed_user("PHARMACY")),db: Session = Depends(get_db),):
    user, current_user = auth

    if not db.query(DrugBatch).filter(DrugBatch.batch_id == payload.batch_id).first():
        raise HTTPException(status_code=404, detail="Batch not found")

    try:
        receipt = blockchain.receive_at_pharmacy(payload.batch_id, user.private_key)

        db.add(BatchStatus(
            batch_id  = payload.batch_id,
            status = "AT_PHARMACY",
            location = f"Received by {current_user['username']}",
            lat=0.0, lng=0.0,
            timestamp = datetime.now(timezone.utc),
        ))
        db.commit()

        return {
            "status":"success",
            "message": f"Batch {payload.batch_id} received at pharmacy",
            "received_by": current_user["username"],
            "transaction": receipt.transactionHash.hex(),
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Could not accept batch: {e}")


@router.post("/drug-status")
async def sell_drug(payload:  SellDrug,auth = Depends(get_authed_user("PHARMACY")),db: Session = Depends(get_db),):
    user, current_user = auth

    drug = db.query(DrugItem).filter(DrugItem.drug_id == payload.drug_id).first()
    if not drug:
        raise HTTPException(status_code=404, detail="Drug ID not found in database")
    if drug.is_sold:
        raise HTTPException(status_code=409, detail="This drug unit has already been sold")

    try:
        blockchain.sell_item(payload.batch_id, payload.drug_id, user.private_key)

        drug.is_sold = True
        drug.sold_at = datetime.now(timezone.utc)
        db.commit()

        return {
            "status": "success",
            "sold_unit": payload.drug_id,
            "sold_by":current_user["username"],
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Sale failed: {e}")

@router.post("/assign-role")
async def assign_role(payload: AssignRolePayload,auth= Depends(get_authed_user("VALIDATOR")),):
    user, current_user = auth

    if payload.role_index not in ROLE_MAP or payload.role_index == 0:
        raise HTTPException(status_code=400, detail="role_index must be 1 - 4")

    try:
        auth_db = local_session()
        try:
            target_address = _get_wallet_address(payload.target_username, auth_db)
        finally:
            auth_db.close()

        receipt = blockchain.assign_role(
            target_address, payload.role_index, private_key=user.private_key
        )

        return {
            "status": "success",
            "assigned_to":  payload.target_username,
            "role":ROLE_MAP[payload.role_index],
            "by_validator": current_user["username"],
            "transaction":  receipt.transactionHash.hex(),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Role assignment failed: {e}")


@router.get("/batch-det/{batch_id}")
def get_batch_details(batch_id:str,current_user: dict = Depends(get_current_user),db: Session  = Depends(get_db),):
    batch = db.query(DrugBatch).filter(DrugBatch.batch_id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    latest_status = (
        db.query(BatchStatus)
        .filter(BatchStatus.batch_id == batch_id)
        .order_by(BatchStatus.timestamp.desc())
        .first()
    )

    return {
        "batch_id":batch.batch_id,
        "manu_name":batch.manufacturer_name,
        "drug_name":batch.drug_name,
        "created_at":batch.created_at,
        "mfd_date":batch.mfd,
        "exp_date":batch.exp,
        "quantity":batch.tot_drugs,
        "status":latest_status.status if latest_status else "CREATED",
        "location":latest_status.location if latest_status else None,
    }


@router.get("/verify/{batch_id}")
async def verify_batch(batch_id:str,current_user: dict = Depends(get_current_user),db: Session= Depends(get_db),):
    batch = db.query(DrugBatch).filter(DrugBatch.batch_id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    try:
        ts_str = (
            batch.created_at
            if isinstance(batch.created_at, str)
            else batch.created_at.strftime("%Y-%m-%dT%H:%M:%S+00:00")
        )
        if isinstance(ts_str, str) and "+00:00" not in ts_str:
            ts_str += "+00:00"

        recomputed = generate_secure_hash({
            "id":batch.batch_id,
            "name":batch.drug_name,
            "mfg":str(batch.mfd),
            "exp":str(batch.exp),
            "manu_name": batch.manufacturer_name,
            "ts": ts_str,
        })

        chain = blockchain.get_batch_data(batch_id)
        chain_hash = chain[2]   

        if recomputed == chain_hash:
            return {
                "status": "VERIFIED",
                "message": "Cryptographic seal matches — data is authentic",
                "data": {
                    "drug":batch.drug_name,
                    "manufacturer": batch.manufacturer_name,
                    "mfg_date": batch.mfd,
                    "exp_date": batch.exp,
                },
            }
        else:
            return {
                "status":"TAMPERED",
                "message": "WARNING: database record does not match the blockchain seal",
                "mismatched_hashes": {
                    "database_hash": recomputed,
                    "blockchain_hash": chain_hash,
                },
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {e}")


@router.get("/verify_drug/{drug_id}")
async def verify_drug(drug_id:str,current_user: dict = Depends(get_current_user),db: Session = Depends(get_db),):
    item = db.query(DrugItem).filter(DrugItem.drug_id == drug_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Drug ID not found")

    try:
        batch = db.query(DrugBatch).filter(DrugBatch.batch_id == item.batch_id).first()
        ts_str = (
            batch.created_at.strftime("%Y-%m-%dT%H:%M:%S+00:00")
            if not isinstance(batch.created_at, str)
            else batch.created_at + ("+00:00" if "+00:00" not in batch.created_at else "")
        )

        recomputed = generate_secure_hash({
            "id": batch.batch_id,
            "name":batch.drug_name,
            "mfg": str(batch.mfd),
            "exp": str(batch.exp),
            "manu_name": batch.manufacturer_name,
            "ts":ts_str,
        })

        chain_data = blockchain.get_batch_data(batch.batch_id)
        chain_hash  = chain_data[2]
        is_authentic = recomputed == chain_hash

        return {
            "is_authentic":is_authentic,
            "blockchain_status":"VERIFIED" if is_authentic else "TAMPERED",
            "drug_id": drug_id,
            "batch_id": batch.batch_id,
            "drug_name":batch.drug_name,
            "manufacturer": batch.manufacturer_name,
            "mfd": batch.mfd,
            "exp": batch.exp,
            "is_sold": item.is_sold,
            "sold_at": item.sold_at if item.is_sold else None,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {e}")


@router.get("/get-qr/{identifier}")
async def get_qr(identifier:str,current_user: dict = Depends(get_current_user),):
    is_batch = "-D" not in identifier
    return StreamingResponse(
        generate_qr_image(identifier, is_batch=is_batch),
        media_type="image/png",
    )


@router.get("/role/{address}")
async def check_role(address:str,current_user: dict = Depends(get_current_user),):
    try:
        role_index = blockchain.get_role(address)
        return {
            "address":    address,
            "role_index": role_index,
            "role":       ROLE_MAP.get(role_index, "UNKNOWN"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Role lookup failed: {e}")