from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Import Services & Database
from services.blockchain_service import *
from services.qr import generate_secure_hash, generate_qr_image
from database.database import get_db
from models.batch_model import DrugBatch
from api.dependencies import verify_manufacturer_role

router = APIRouter()

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

class BlockchainCreateRequest(BaseModel):
    id: str
    mfgDate: str
    expDate: str
    ipfsHash: str
    quantity: int

# -----------------------------
# HYBRID ROUTE: DB + QR CODE
# -----------------------------
@router.post("/create-with-qr")
async def create_batch_and_generate_qr(
    payload: BatchCreationRequest, 
    db: Session = Depends(get_db),
    company: str = Depends(verify_manufacturer_role)
):
    # 1. Check for duplicates in SQLite
    existing_batch = db.query(DrugBatch).filter(DrugBatch.batch_id == payload.batch_id).first()
    if existing_batch:
        raise HTTPException(status_code=400, detail="Batch ID already exists in Database!")

    # 2. Generate the unique cryptographic hash
    unique_hash = generate_secure_hash(payload.manufacturer, payload.manufacturing_date)

    # 3. 🚀 NEW: SEND IT TO THE BLOCKCHAIN 🚀
    try:
        # We will use the unique_hash as our "IPFS Hash" for now!
        tx_hash = create_batch(
            batch_id=payload.batch_id,
            mfg_date=payload.manufacturing_date,
            exp_date=payload.expiry_date,
            ipfs_hash=unique_hash,
            quantity=payload.quantity
        )
        print(f"✅ Blockchain Transaction Successful! Hash: {tx_hash}")
    except Exception as e:
        # If the blockchain rejects it (e.g., you don't have the Manufacturer role), stop the process!
        raise HTTPException(status_code=500, detail=f"Blockchain Error: {str(e)}")

    # 4. Save to SQLite Database (Only if blockchain succeeds!)
    new_drug = DrugBatch(
        batch_id=payload.batch_id,
        expected_hash=unique_hash,
        drug_name=payload.drug_name,
        manufacturer=company, 
        manufacturing_date=payload.manufacturing_date,
        expiry_date=payload.expiry_date,
    )
    db.add(new_drug)
    db.commit()

    # 5. Generate the physical QR Code image
    qr_buffer = generate_qr_image(payload.batch_id, unique_hash)
    
    return StreamingResponse(qr_buffer, media_type="image/png")

# -----------------------------
# BLOCKCHAIN ROUTES
# -----------------------------
@router.post("/create")
def create(data: BlockchainCreateRequest):
    tx = create_batch(data.id, data.mfgDate, data.expDate, data.ipfsHash, data.quantity)
    return {"tx_hash": tx}

@router.post("/split")
def split(data: dict):
    split_batch(data.get("parentId"), data.get("newId"), data.get("to"), data.get("quantity"))
    return {"message": "Batch split successful"}

@router.post("/transfer")
def transfer(data: dict):
    transfer_batch(data.get("id"), data.get("to"))
    return {"message": "Transfer initiated"}

@router.post("/accept")
def accept(data: dict):
    accept_batch(data.get("id"))
    return {"message": "Batch accepted"}

@router.post("/sell")
def sell(data: dict):
    sell_units(data.get("id"), data.get("quantity"))
    return {"message": "Units sold"}

@router.get("/{batch_id}")
def get(batch_id: str):
    data = get_batch(batch_id)
    return {
        "id": data[0], "parentId": data[1], "mfgDate": data[2], 
        "expDate": data[3], "ipfsHash": data[4], "totalQuantity": data[5],
        "soldQuantity": data[6], "currentOwner": data[7], 
        "pendingOwner": data[8], "status": data[9], "exists": data[10]
    }