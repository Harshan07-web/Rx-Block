import json
import base64
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator, EmailStr
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone, date
from auth.auth_models import User
from auth.auth_database import local_session, get_db as get_auth_db
from auth.schemas import NewUser

from services.blockchain_service import blockchain
from services.qr import generate_batch_qr, generate_drug_qr
from database.database import get_db
from models.batch_model import DrugBatch, DrugItem, BatchStatus
from services.hash import generate_secure_hash
from services.ipfs import upload_image_to_ipfs
from auth.dependencies import get_authed_user, get_current_user
from auth.auth_utils import hashpass,verifypass

import os
from dotenv import load_dotenv

load_dotenv()

adm_pk = os.getenv("ADMIN_PRIVATE_KEY")
val2_pk = os.getenv("VAL2_PRIVATE_KEY")
val3_pk = os.getenv("VAL3_PRIVATE_KEY")
val4_pk = os.getenv("VAL4_PRIVATE_KEY")

admin_wa = os.getenv("AD_WA")
admin2_wa = os.getenv("V2_WA")
admin3_wa = os.getenv("V3_WA")
admin4_wa = os.getenv("V4_WA")

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
    private_key: str
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

class VotePayload(BaseModel):
    proposal_id : int


def _get_wallet_address(username: str, auth_db) -> str:
    user = auth_db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    return blockchain.w3.eth.account.from_key(user.private_key).address



@router.post("/create-drugs-t1", status_code=201)
async def create_batch_t1(payload:CreateBatchT1,auth = Depends(get_authed_user("MANUFACTURER")),db: Session = Depends(get_db)):
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

        receipt = blockchain.create_batch(
            payload.batch_id, unique_hash, payload.batch_quantity,
            private_key= user.private_key
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

        return {
                "Status": "Success",
                "Blockchain_hash": unique_hash,
                "batch_id": payload.batch_id,
                "transaction": receipt.transactionHash.hex(),
                "created_by": current_user["username"],
            }

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
            if recipient.requested_role != "DISTRIBUTOR":
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
            lat = recipient.lat,
            lng = recipient.lng,
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
            lat = user.lat,
            lng = user.lng,
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
            if recipient.requested_role != "PHARMACY":
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
            lat = recipient.lat,
            lng = recipient.lng,
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
            lat = user.lat,
            lng = user.lng,
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
            "sold_at": drug.sold_at
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Sale failed: {e}")

@router.get("/batch-det/{batch_id}")
def get_batch_details(batch_id:str,current_user: dict = Depends(get_current_user),db: Session  = Depends(get_db),):
    batch = db.query(DrugBatch).filter(DrugBatch.batch_id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    status_rows = (
        db.query(BatchStatus)
        .filter(BatchStatus.batch_id == batch_id)
        .order_by(BatchStatus.timestamp.asc())
        .all()
    )
    latest = status_rows[-1] if status_rows else None

    auth_db = local_session()
    try:
        mfr_user = auth_db.query(User).filter(User.company_name == batch.manufacturer_name).first()
        mfr_lat  = mfr_user.lat if mfr_user else None
        mfr_lng  = mfr_user.lng if mfr_user else None
    finally:
        auth_db.close()

    history = [{
        "status": "CREATED",
        "location": batch.manufacturer_name,
        "lat": mfr_lat,
        "lng": mfr_lng,
        "timestamp": str(batch.created_at),
    }] + [
        {
            "status":row.status,
            "location": row.location,
            "lat": row.lat,
            "lng":row.lng,
            "timestamp": str(row.timestamp),
        }
        for row in status_rows
    ]

    return {
        "batch_id":batch.batch_id,
        "manu_name":batch.manufacturer_name,
        "drug_name":batch.drug_name,
        "created_at":batch.created_at,
        "mfd_date":batch.mfd,
        "exp_date":batch.exp,
        "quantity":batch.tot_drugs,
        "status": latest.status if latest else "CREATED",
        "location":latest.location if latest else batch.manufacturer_name,
        "history": history,
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

        history_records = db.query(BatchStatus).filter(BatchStatus.batch_id == batch_id).order_by(BatchStatus.timestamp.desc()).all()
        history = [{
            "status" : h.status,
            "location" : h.location,
            "timestamp" : h.timestamp.isoformat()
        }for h in history_records]

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
async def verify_drug(drug_id:str,db: Session = Depends(get_db),):
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

        history_records = db.query(BatchStatus).filter(BatchStatus.batch_id == batch.batch_id).order_by(BatchStatus.timestamp.desc()).all()
        history = [{
            "status" : h.status,
            "location" : h.location,
            "timestamp" : h.timestamp.isoformat()
        }for h in history_records]


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

@router.get("/role/{address}")
async def check_role(address:str,current_user: dict = Depends(get_current_user),):
    try:
        role_index = blockchain.get_role(address)
        return {
            "address": address,
            "role_index": role_index,
            "role":  ROLE_MAP.get(role_index, "UNKNOWN"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Role lookup failed: {e}")
    

@router.get("/qr/{identifier}", tags=["Utilities"])
async def get_qr_code(identifier: str):
    try:
        if "-D" in identifier:
            qr_buffer = generate_drug_qr(identifier)
        else:
            qr_buffer = generate_batch_qr(identifier)
            
        return StreamingResponse(qr_buffer, media_type="image/png")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate QR: {e}")
    
@router.post("/request_access")
async def new_chain_member(payload: NewUser, db : Session = Depends(get_auth_db)):
    exists = db.query(User).filter(payload.username == User.username).first()

    if exists:
        raise HTTPException(status_code=500, detail="Username already exists")

    hashed_pass = hashpass(payload.password)

    lat = payload.lat
    lng = payload.lng

    new_chain_user = User(
        username = payload.username,
        email = payload.email,
        hashed_password = hashed_pass,
        requested_role = payload.req_role,
        company_name = payload.company_name,
        wallet_address = payload.acc_address,
        private_key = payload.private_key,
        lat = lat,
        lng = lng
    )

    db.add(new_chain_user)
    db.commit()

    return{
        "status" : f"Your application has been submitted and waiting approval",
        "username" : new_chain_user.username,
        "requested_role" : new_chain_user.requested_role
    }

@router.get("/pending_requests")
async def pending_requests(auth = Depends(get_authed_user("VALIDATOR")), db : Session = Depends(get_auth_db)):
    user,current_user = auth

    pending = []

    count = blockchain.get_proposal_count()
    already_proposed_comp = []
    for i in range(1, count + 1):
        prop = blockchain.get_proposal(i)
        if not prop["is_executed"]:
            already_proposed_comp.append(prop["target_address"])

    pending_users = db.query(User).filter(User.is_approved==False).all()

    for pu in pending_users:
        if pu.wallet_address not in already_proposed_comp:
            pending.append({
                "user_id" : pu.id,
                "username" : pu.username,
                "company_name" : pu.company_name,
                "role_requested" : pu.requested_role,
                "wallet_address" : pu.wallet_address
            })

    return {
        "pending_users" : pending
    }

@router.post("/propose_company")
async def propose_comp_to_vote(payload : AssignRolePayload , auth = Depends(get_authed_user("VALIDATOR")), db : Session = Depends(get_auth_db)):
    user,current_user = auth

    still_pending = db.query(User).filter(User.username == payload.target_username).filter(User.is_approved==False).first()

    if not still_pending:
        raise HTTPException(status_code=404,detail="user is alredy approved")
    
    count = blockchain.get_proposal_count()
    for i in range(1, count + 1):
        prop = blockchain.get_proposal(i)
        if not prop["is_executed"] and prop["target_address"] == still_pending.wallet_address:
            raise HTTPException(status_code=400, detail="This company is already being voted on!")
    
    blockchain.propose_company(still_pending.wallet_address,payload.role_index)

    return {
        "status" : f"company has been proposed to voting {still_pending.company_name} -- {still_pending.requested_role}"
    }

@router.get("/active_proposals")
async def get_active_proposals(auth = Depends(get_authed_user("VALIDATOR")), db: Session = Depends(get_auth_db)):
    user, current_user = auth
    
    try:
        count = blockchain.get_proposal_count()
        active_list = []
        for i in range(1, count + 1):
            prop = blockchain.get_proposal(i)
            
            if not prop["is_executed"]:
                db_user = db.query(User).filter(User.wallet_address == prop["target_address"]).first()
                prop["company_name"] = db_user.company_name if db_user else "Unknown Company"
                
                active_list.append(prop)

        return {"active_proposals": active_list}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch proposals: {e}")

GANACHE_VAULT = {
    admin_wa: adm_pk,
    admin2_wa : val2_pk,
    admin3_wa : val3_pk,
    admin4_wa : val4_pk,
}

@router.post("/vote")
async def execute_vote(payload: VotePayload, auth = Depends(get_authed_user("VALIDATOR")), db: Session = Depends(get_auth_db)):
    user, current_user = auth

    try:
        if hasattr(user, 'wallet_address'):
            wallet = user.wallet_address
        else:
            db_user = db.query(User).filter(User.username == user).first()
            wallet = db_user.wallet_address
            
        voter_pk = GANACHE_VAULT.get(wallet)
        
        if not voter_pk:
            raise HTTPException(status_code=400, detail=f"Private key for {wallet} not found in the Ganache Vault!") 
        receipt = blockchain.vote_on_proposal(payload.proposal_id, private_key=voter_pk)

        message = f"Your vote for Proposal #{payload.proposal_id} has been cast on-chain!"
        prop = blockchain.get_proposal(payload.proposal_id)
        
        if prop.get("is_executed"):
            target_wallet = prop.get("target_address")
            approved_user = db.query(User).filter(User.wallet_address == target_wallet).first()
            
            if approved_user and not approved_user.is_approved:
                approved_user.is_approved = True
                db.commit() 
                message += f" The DAO threshold was reached! {approved_user.company_name} is officially approved."

        return {
            "status": "success",
            "message": message,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Voting transaction failed: {e}")
    

@router.post("/run_genesis_setup")
async def run_genesis_setup(db: Session = Depends(get_auth_db)):
    pending_vals = db.query(User).filter(User.requested_role == "VALIDATOR", User.is_approved == False).all()
    
    if not pending_vals:
        return {"error": "No pending validators found in the waiting room!"}

    added = []
    for v in pending_vals:
        blockchain.add_genesis_validator(v.wallet_address)
        
        v.is_approved = True
        added.append(v.username)
        
    db.commit()
    return {
        "status": "Genesis Phase Complete! The DAO backdoor is now permanently locked.", 
        "added_validators": added
    }

@router.post("/clear_proposals")
async def wipe_proposals_clean(auth = Depends(get_authed_user("VALIDATOR"))):
    user, current_user = auth
    
    try:
        blockchain.clear_all_proposals()
        
        return {
            "status": "success", 
            "message": "Nuclear option engaged. All proposals have been cleared from the board!"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear proposals: {e}")