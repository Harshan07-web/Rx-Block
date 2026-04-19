import json
from fastapi import APIRouter, HTTPException, Depends, Header, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime,timezone

from services.blockchain_service import blockchain 
from services.qr import generate_qr_image
from database.database import get_db, engine
from models.batch_model import DrugBatch, DrugItem, BatchStatus
from services.hash import generate_secure_hash
from services.ipfs import upload_image_to_ipfs

router = APIRouter()

# Mapping for Enums from your Solidity Contract
STATUS_MAP = ["NONE", "CREATED", "IN_DISTRIBUTION", "AT_DISTRIBUTOR", "AT_PHARMACY", "SOLD"]
ROLE_MAP = ["NONE", "TIER1_MANUFACTURER", "TIER2_MANUFACTURER", "DISTRIBUTOR", "PHARMACY", "VALIDATOR"]

class CreateBatchT1(BaseModel):
    batch_id : str
    drug_name : str
    manufacturer_name : str
    mfd : str
    exp : str
    batch_quantity : int

class CreateBatchT2(BaseModel):
    batch_id : int
    batch_quantity : int
    manufacturer_name : str
    drug_name : str
    mfd : str
    exp : str

class DrugMarking(BaseModel):
    drug_id : int
    manufacturer_name : str
    mfd : str
    exp : str
    sold : bool

class SplitBatch(BaseModel):
    batch_id : str
    no_of_batches : int
    quantity_per_batch: int
    curr_owner_id : str

class SendBatch(BaseModel):
    batch_id : int
    curr_owner_id : str
    new_owner_id : str
    del_out_time : str
    new_owner_name : str
    new_owner_address : str

class ReceiveAtDist(BaseModel):
    batch_id : int
    receiver_id : str
    receiving_time : str

class SendtoPharma(BaseModel):
    batch_id : int
    current_owner_id : str
    new_owner_id : str
    del_out_time : str
    new_owner_name : str
    new_owner_address : str

class ReceiveAtPharma(BaseModel):
    batch_id : int
    receiver_id : str
    receiving_time : str

class SellDrugs(BaseModel):
    drug_id : int
    sold : bool

@router.post("/create-drugs-t1")
async def Create_Batch_T1(create_batch_t1 : CreateBatchT1, db : Session = Depends(get_db)):
    exists = db.query(DrugBatch).filter(DrugBatch.batch_id == create_batch_t1.batch_id).first()
    if exists:
        raise HTTPException(status_code= status.HTTP_409_CONFLICT ,detail="BatchId already exisits in the chain")

    try:
        timestamp = datetime.now(timezone.utc)
        curr_owner = blockchain.get_role()
        ipfs = upload_image_to_ipfs()

        unique_hash = generate_secure_hash({
            "id": create_batch_t1.batch_id,
            "name": create_batch_t1.drug_name,
            "mfg": create_batch_t1.mfd,
            "exp" : create_batch_t1.exp,
            "manu_name" : create_batch_t1.manufacturer_name,
            "ts": timestamp.isoformat()
        })

        batch_status = "CREATED"

        receipt = blockchain.create_batch(unique_hash, create_batch_t1.batch_id,batch_status)
        new_batch = DrugBatch(
            batch_id = create_batch_t1.batch_id,
            drug_name = create_batch_t1.drug_name,
            manufacturer_name = create_batch_t1.manufacturer_name,
            mfd = create_batch_t1.mfd,
            exp = create_batch_t1.exp,
            created_at = timestamp,
            tot_drugs = create_batch_t1.batch_quantity,
            ipfs_hash = ipfs,
        )

        db.add(new_batch)


        drug_data = [
            {
                "batch_id": create_batch_t1.batch_id,
                "drug_id": f"{create_batch_t1.batch_id}-D{i}",
                "is_sold": False
            }
            for i in range(1, create_batch_t1.batch_quantity + 1)
        ]

        db.bulk_insert_mappings(DrugItem, drug_data)
        db.commit()

        return{
            "Status" : "Success",
            "Blockchain_hash" : unique_hash,
            "db_id" : new_batch.batch_id,
            "transaction" : receipt.transactionHash.hex()
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500,detail=f"Transaction failed: {str(e)}")

@router.post("/create-drugs-t2")
def Create_Batch_T2(create_batch_t2 : CreateBatchT2):
    pass

@router.post("/split-batch")
async def Split_Batch(split: SplitBatch, db: Session = Depends(get_db)):
    parent_batch = db.query(DrugBatch).filter(DrugBatch.batch_id == split.batch_id).first()
    if not parent_batch:
        raise HTTPException(status_code=404, detail="Parent batch not found")
    if parent_batch.tot_drugs == 0:
        raise HTTPException(status_code=400, detail="This batch is already empty or split")
    total_needed = split.no_of_batches * split.quantity_per_batch
    if total_needed > parent_batch.tot_drugs:
        raise HTTPException(status_code=400, detail=f"Insufficient quantity. Have {parent_batch.tot_drugs}, need {total_needed}")

    try:
        timestamp = datetime.now(timezone.utc)
        
        all_drugs = db.query(DrugItem).filter(DrugItem.batch_id == split.batch_id).all()
        drug_index = 0

        for i in range(split.no_of_batches):
            new_child_id = f"{split.batch_id}-S{i+1}" # e.g., 101-S1, 101-S2
            
            child_hash = generate_secure_hash({
                "id": new_child_id,                    
                "name": parent_batch.drug_name,        
                "mfg": parent_batch.mfd,               
                "exp": parent_batch.exp,               
                "manu_name": parent_batch.manufacturer_name, 
                "ts": timestamp.isoformat()             
            })

            blockchain.create_batch(child_hash, new_child_id, "SPLIT_CHILD")

            new_child = DrugBatch(
                batch_id = new_child_id,
                drug_name = parent_batch.drug_name,
                manufacturer_name = parent_batch.manufacturer_name,
                mfd = parent_batch.mfd,
                exp = parent_batch.exp,
                tot_drugs = split.quantity_per_batch,
                current_owner = split.new_owner_id,
            )
            db.add(new_child)

            for _ in range(split.quantity_per_batch):
                if drug_index < len(all_drugs):
                    all_drugs[drug_index].batch_id = new_child_id
                    drug_index += 1

        parent_batch.tot_drugs -= total_needed
        
        split_log = BatchStatus(
            batch_id=split.batch_id,
            status="BATCH_SPLIT",
            location="Manufacturing Plant",
            timestamp=timestamp
        )

        db.add(split_log)
        db.commit()

        return {
            "status": "Success",
            "message": f"Batch {split.batch_id} split into {split.no_of_batches} batches.",
            "remaining_parent_qty": parent_batch.tot_drugs
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Split failed: {str(e)}")

@router.post("/ship-dist")
def Send_To_Dist(send_dist : SendBatch, db : Session = Depends(get_db)):
    exists = db.query(DrugBatch).filter(DrugBatch.batch_id == Split_Batch.batch_id).first()
    if not exists:
        raise HTTPException(status_code=500,detail="Batch to transfer not found!")
    try:
        recepit = blockchain.transfer_batch(send_dist.batch_id,send_dist.new_owner_address,send_dist.curr_owner_id)
        new_log = BatchStatus(
            batch_id = send_dist.batch_id,
            status = "DELIVERY TO DISTRIBUTOR",
            location = send_dist.new_owner_address,
            latitude = 1.213433,
            longitude = 2.345345,
            timestamp = datetime.now(timezone.utc)
        )

        db.add(new_log)
        db.commit()

        return{
            "status" : "Success",
            "message" : f"Transfer successfully initiated to{send_dist.new_owner_address}"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500,detail=f"Failed to transfer batch {e}")


@router.post("/receive-dist")
def Receive_Dist(receive_dist : ReceiveAtDist):
    pass

@router.post("/ship-pharma")
def Send_To_Pharma(send_pharma : SendtoPharma):
    pass

@router.post("/receive-pharma")
def Receive_Pharma(receive_pharma : ReceiveAtPharma):
    pass

@router.post("/drug-status")
def Drug_Stauts(drug_status : SellDrugs):
    pass

@router.post("/propose-company")
def Propose_Compnay():
    pass

@router.get("/batch-det/{batch_id}")
def Get_Batch_details(batch_id : int):
    pass

@router.get("/roles/{role_address}")
def Get_Role(role_address : str):
    pass

@router.get("/get-qr/{drug_id}")
async def get_drug_qr(drug_id: str):
    is_batch = "-D" not in drug_id
    qr_buffer = generate_qr_image(drug_id, is_batch=is_batch)
    
    return StreamingResponse(qr_buffer, media_type="image/png")



    
