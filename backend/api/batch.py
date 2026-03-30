import json
from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional

from services.blockchain_service import blockchain 
from services.qr import generate_secure_hash, generate_qr_image
from database.database import get_db
from models.batch_model import DrugBatch

router = APIRouter()

# Mapping for Enums from your Solidity Contract
STATUS_MAP = ["NONE", "CREATED", "IN_DISTRIBUTION", "AT_DISTRIBUTOR", "AT_PHARMACY", "SOLD"]
ROLE_MAP = ["NONE", "TIER1_MANUFACTURER", "TIER2_MANUFACTURER", "DISTRIBUTOR", "PHARMACY", "VALIDATOR"]

# -----------------------------
# PYDANTIC SCHEMAS
# -----------------------------

class BatchCreationRequest(BaseModel):
    batch_id: str
    drug_name: str
    manufacturer: str
    manufacturing_date: str
    expiry_date: str
    quantity: int

class SplitRequest(BaseModel):
    parent_id: str
    new_id: str
    to_address: str
    quantity: int

class SellRequest(BaseModel):
    batch_id: str
    quantity: int

class ProposalRequest(BaseModel):
    candidate_address: str
    role_index: int 

class MedicineInfoUpdate(BaseModel):
    batch_id: str
    drug_name: Optional[str] = None
    side_effects: List[str] = []
    allergies: List[str] = []

# -----------------------------
# SUPPLY CHAIN ROUTES
# -----------------------------

@router.post("/create-with-qr")
async def create_batch_and_generate_qr(payload: BatchCreationRequest, db: Session = Depends(get_db)):
    existing = db.query(DrugBatch).filter(DrugBatch.batch_id == payload.batch_id).first()
    if existing: 
        raise HTTPException(status_code=400, detail="Batch ID already exists in Database!")

    try:
        unique_hash = generate_secure_hash(payload.manufacturer, payload.manufacturing_date)
        receipt = blockchain.create_batch(
            payload.batch_id, payload.manufacturing_date, 
            payload.expiry_date, unique_hash, payload.quantity
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Blockchain Fail: {str(e)}")

    new_drug = DrugBatch(
        batch_id=payload.batch_id, expected_hash=unique_hash,
        drug_name=payload.drug_name, manufacturer=payload.manufacturer,
        manufacturing_date=payload.manufacturing_date, expiry_date=payload.expiry_date
    )
    db.add(new_drug)
    db.commit()

    return StreamingResponse(generate_qr_image(payload.batch_id, unique_hash), media_type="image/png")

@router.post("/split")
async def split_batch(payload: SplitRequest, db: Session = Depends(get_db), x_private_key: str = Header(...)):
    try:
        receipt = blockchain.split_batch(
            payload.parent_id, payload.new_id, 
            payload.to_address, payload.quantity, x_private_key
        )
        parent = db.query(DrugBatch).filter(DrugBatch.batch_id == payload.parent_id).first()
        new_entry = DrugBatch(
            batch_id=payload.new_id,
            drug_name=parent.drug_name if parent else "Split Medicine",
            manufacturer=parent.manufacturer if parent else "Unknown",
            manufacturing_date=parent.manufacturing_date if parent else "N/A",
            expiry_date=parent.expiry_date if parent else "N/A"
        )
        db.add(new_entry)
        db.commit()
        return {"status": "Split Success", "tx_hash": receipt.transactionHash.hex()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/transfer")
async def transfer(batch_id: str, to_address: str, x_private_key: str = Header(...)):
    try:
        receipt = blockchain.transfer_batch(batch_id, to_address, x_private_key)
        return {"status": "Transfer Initiated", "tx_hash": receipt.transactionHash.hex()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/accept")
async def accept(batch_id: str, x_private_key: str = Header(...)):
    try:
        receipt = blockchain.accept_batch(batch_id, x_private_key)
        return {"status": "Accepted", "tx_hash": receipt.transactionHash.hex()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/sell")
async def sell(payload: SellRequest, x_private_key: str = Header(...)):
    try:
        receipt = blockchain.sell_units(payload.batch_id, payload.quantity, x_private_key)
        return {"status": "Sale Recorded", "tx_hash": receipt.transactionHash.hex()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# -----------------------------
# GOVERNANCE ROUTES
# -----------------------------

@router.post("/propose")
async def propose_company(payload: ProposalRequest, x_private_key: str = Header(...)):
    try:
        receipt = blockchain.propose_company(payload.candidate_address, payload.role_index, x_private_key)
        return {"status": "Proposal Created", "tx_hash": receipt.transactionHash.hex()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/vote/{proposal_id}")
async def vote_on_company(proposal_id: int, x_private_key: str = Header(...)):
    try:
        receipt = blockchain.vote_proposal(proposal_id, x_private_key)
        return {"status": "Vote Cast", "tx_hash": receipt.transactionHash.hex()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# -----------------------------
# DATABASE & INFO ROUTES (MUST BE BEFORE VIEW BATCH)
# -----------------------------

@router.get("/info/{batch_id}")
async def get_medicine_info(batch_id: str, db: Session = Depends(get_db)):
    """Fetches side effects and allergies from local SQLite DB"""
    drug = db.query(DrugBatch).filter(DrugBatch.batch_id == batch_id).first()
    if not drug:
        raise HTTPException(status_code=404, detail="Batch not found in local database")
    
    return {
        "batch_id": drug.batch_id,
        "drug_name": drug.drug_name,
        "side_effects": json.loads(drug.side_effects) if drug.side_effects else [],
        "allergies": json.loads(drug.allergies) if drug.allergies else []
    }

@router.patch("/info/{batch_id}")
@router.put("/info/{batch_id}")
async def update_medicine_info(batch_id: str, payload: MedicineInfoUpdate, db: Session = Depends(get_db)):
    """Updates side effects and allergies in local SQLite DB"""
    drug = db.query(DrugBatch).filter(DrugBatch.batch_id == batch_id).first()
    if not drug:
        # If it's a split batch not yet fully synced, create a placeholder
        drug = DrugBatch(batch_id=batch_id, drug_name=payload.drug_name)
        db.add(drug)
    elif payload.drug_name:
        drug.drug_name = payload.drug_name

    drug.side_effects = json.dumps(payload.side_effects)
    drug.allergies = json.dumps(payload.allergies)
    
    db.commit()
    return {"status": "Success", "message": "Medicine info updated in DB"}

@router.get("/user/role/{address}")
async def get_user_role(address: str):
    """Check the role of any wallet address"""
    role_idx = blockchain.get_role(address)
    return {"address": address, "role": ROLE_MAP[role_idx]}

# -----------------------------
# VIEW ROUTES (MUST BE ABSOLUTELY LAST)
# -----------------------------

@router.get("/{batch_id}")
async def get_batch_details(batch_id: str):
    """Public view for scanning QR codes (Layman view from Blockchain)"""
    try:
        data = blockchain.get_batch(batch_id)
        return {
            "id": data[0],
            "parent_id": data[1] if data[1] != "" else "Original",
            "mfgDate": data[2],
            "expDate": data[3],
            "total_quantity": data[5],
            "sold_quantity": data[6],
            "current_owner": data[7],
            "pending_owner": data[8] if data[8] != "0x0000000000000000000000000000000000000000" else "None",
            "status": STATUS_MAP[data[9]] if data[9] < len(STATUS_MAP) else "UNKNOWN",
            "is_authentic": data[10]
        }
    except Exception:
        raise HTTPException(status_code=404, detail="Batch not found on blockchain")