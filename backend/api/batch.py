from fastapi import APIRouter
from services.blockchain_service import *

router = APIRouter()

# 🟢 CREATE
@router.post("/create")
def create(data: dict):
    tx = create_batch(
        data["id"],
        data["mfgDate"],
        data["expDate"],
        data["ipfsHash"],
        data["quantity"]
    )
    return {"tx_hash": tx}


# 🟡 SPLIT
@router.post("/split")
def split(data: dict):
    split_batch(
        data["parentId"],
        data["newId"],
        data["to"],
        data["quantity"]
    )
    return {"message": "Batch split successful"}


# 🔵 TRANSFER
@router.post("/transfer")
def transfer(data: dict):
    transfer_batch(data["id"], data["to"])
    return {"message": "Transfer initiated"}


# 🟣 ACCEPT
@router.post("/accept")
def accept(data: dict):
    accept_batch(data["id"])
    return {"message": "Batch accepted"}


# 🟤 SELL
@router.post("/sell")
def sell(data: dict):
    sell_units(data["id"], data["quantity"])
    return {"message": "Units sold"}


# ⚪ GET
@router.get("/{batch_id}")
def get(batch_id: str):
    data = get_batch(batch_id)

    return {
        "id": data[0],
        "parentId": data[1],
        "mfgDate": data[2],
        "expDate": data[3],
        "ipfsHash": data[4],
        "totalQuantity": data[5],
        "soldQuantity": data[6],
        "currentOwner": data[7],
        "pendingOwner": data[8],
        "status": data[9],
        "exists": data[10]
    }
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from services.blockchain_service import *

# --- NEW IMPORTS FOR QR & SQLITE ---
from services.qr import generate_secure_hash, generate_qr_image
from database.database import get_db
from models.batch_model import DrugBatch

router = APIRouter()

# ==========================================================
# 🛑 EXISTING CODE (UNCHANGED)
# ==========================================================

# 🟢 CREATE
@router.post("/create")
def create(data: dict):
    tx = create_batch(
        data["id"],
        data["mfgDate"],
        data["expDate"],
        data["ipfsHash"],
        data["quantity"]
    )
    return {"tx_hash": tx}


# 🟡 SPLIT
@router.post("/split")
def split(data: dict):
    split_batch(
        data["parentId"],
        data["newId"],
        data["to"],
        data["quantity"]
    )
    return {"message": "Batch split successful"}


# 🔵 TRANSFER
@router.post("/transfer")
def transfer(data: dict):
    transfer_batch(data["id"], data["to"])
    return {"message": "Transfer initiated"}


# 🟣 ACCEPT
@router.post("/accept")
def accept(data: dict):
    accept_batch(data["id"])
    return {"message": "Batch accepted"}


# 🟤 SELL
@router.post("/sell")
def sell(data: dict):
    sell_units(data["id"], data["quantity"])
    return {"message": "Units sold"}


# ⚪ GET
@router.get("/{batch_id}")
def get(batch_id: str):
    data = get_batch(batch_id)

    return {
        "id": data[0],
        "parentId": data[1],
        "mfgDate": data[2],
        "expDate": data[3],
        "ipfsHash": data[4],
        "totalQuantity": data[5],
        "soldQuantity": data[6],
        "currentOwner": data[7],
        "pendingOwner": data[8],
        "status": data[9],
        "exists": data[10]
    }

# ==========================================================
# 🟩 NEW CODE (QR GENERATION & SQLITE)
# ==========================================================

# Define what data the endpoint expects
class BatchCreationRequest(BaseModel):
    batch_id: str
    drug_name: str
    manufacturer: str
    manufacturing_date: str
    expiry_date: str

# New route so it doesn't break the existing '/create'
@router.post("/create-with-qr")
async def create_batch_and_generate_qr(
    payload: BatchCreationRequest, 
    db: Session = Depends(get_db)
):
    # 1. Check for duplicates in SQLite
    existing_batch = db.query(DrugBatch).filter(DrugBatch.batch_id == payload.batch_id).first()
    if existing_batch:
        raise HTTPException(status_code=400, detail="Batch ID already exists!")

    # 2. Generate the unique cryptographic hash
    unique_hash = generate_secure_hash(payload.manufacturer, payload.manufacturing_date)

    # 3. Save the official record to the SQLite Database
    new_drug = DrugBatch(
        batch_id=payload.batch_id,
        expected_hash=unique_hash,
        drug_name=payload.drug_name,
        manufacturer=payload.manufacturer,
        manufacturing_date=payload.manufacturing_date,
        expiry_date=payload.expiry_date,
    )
    db.add(new_drug)
    db.commit()

    # 4. Generate the physical QR Code image
    qr_buffer = generate_qr_image(payload.batch_id, unique_hash)
    
    # 5. Send the image back!
    return StreamingResponse(qr_buffer, media_type="image/png")