import json
import base64
from fastapi import APIRouter, HTTPException, Depends, Header, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, date

from services.blockchain_service import blockchain 
from services.qr import generate_qr_image
from database.database import get_db, engine
from models.batch_model import DrugBatch, DrugItem, BatchStatus
from services.hash import generate_secure_hash 
from services.ipfs import upload_image_to_ipfs

router = APIRouter()


STATUS_MAP = ["NONE", "CREATED", "IN_DISTRIBUTION", "AT_DISTRIBUTOR", "AT_PHARMACY", "SOLD"]
ROLE_MAP = ["NONE", "TIER1_MANUFACTURER", "TIER2_MANUFACTURER", "DISTRIBUTOR", "PHARMACY", "VALIDATOR"]

class CreateBatchT1(BaseModel):
    batch_id : str
    drug_name : str
    manufacturer_name : str
    mfd : date
    exp : date
    batch_quantity : int
    image : str

class CreateBatchT2(BaseModel):
    batch_id : str 
    batch_quantity : int
    manufacturer_name : str
    drug_name : str
    mfd : date
    exp : date

class DrugMarking(BaseModel):
    drug_id : str 
    manufacturer_name : str
    mfd : date
    exp : date
    sold : bool

class SplitBatch(BaseModel):
    batch_id : str
    no_of_batches : int
    quantity_per_batch: int
    curr_owner_id : str 

class SendBatch(BaseModel):
    batch_id : str 
    curr_owner_id : str 
    new_owner_id : str
    new_owner_name : str
    new_owner_address : str

class ReceiveAtDist(BaseModel):
    batch_id : str 
    receiver_id : str 
    receiver_address : str

class SendtoPharma(BaseModel):
    batch_id : str
    current_owner_id : str 
    new_owner_id : str
    new_owner_name : str
    new_owner_address : str

class ReceiveAtPharma(BaseModel):
    batch_id : str
    receiver_id : str 
    receiver_address : str

class SellDrugs(BaseModel):
    batch_id : str
    drug_id : str 
    private_key : str 

@router.post("/create-drugs-t1")
async def Create_Batch_T1(create_batch_t1 : CreateBatchT1, db : Session = Depends(get_db)):
    exists = db.query(DrugBatch).filter(DrugBatch.batch_id == create_batch_t1.batch_id).first()
    if exists:
        raise HTTPException(status_code= status.HTTP_409_CONFLICT, detail="BatchId already exists in the chain")

    try:
        timestamp = datetime.now(timezone.utc).replace(microsecond=0)
        image_data = base64.b64decode(create_batch_t1.image)
        with open("temp_image.png","wb") as f:
            f.write(image_data)
        ipfs = upload_image_to_ipfs("temp_image.png") 

        unique_hash = generate_secure_hash({
            "id": create_batch_t1.batch_id,
            "name": create_batch_t1.drug_name,
            "mfg": str(create_batch_t1.mfd),
            "exp" : str(create_batch_t1.exp),
            "manu_name" : create_batch_t1.manufacturer_name,
            "ts": timestamp.isoformat()
        })

        receipt = blockchain.create_batch(create_batch_t1.batch_id, unique_hash, create_batch_t1.batch_quantity)
        
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
        db.flush()

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
        raise HTTPException(status_code=500, detail=f"Transaction failed: {str(e)}")

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
            new_child_id = f"{split.batch_id}-S{i+1}" 
            
            child_hash = generate_secure_hash({
                "id": new_child_id,                    
                "name": parent_batch.drug_name,        
                "mfg": str(parent_batch.mfd),               
                "exp": str(parent_batch.exp),               
                "manu_name": parent_batch.manufacturer_name, 
                "ts": timestamp.isoformat()            
            })

            receipt = blockchain.split_batch(split.batch_id, new_child_id, child_hash, split.quantity_per_batch, split.curr_owner_id)

            new_child = DrugBatch(
                batch_id = new_child_id,
                drug_name = parent_batch.drug_name,
                manufacturer_name = parent_batch.manufacturer_name,
                mfd = parent_batch.mfd,
                exp = parent_batch.exp,
                tot_drugs = split.quantity_per_batch,
            )
            db.add(new_child)

            for _ in range(split.quantity_per_batch):
                if drug_index < len(all_drugs):
                    all_drugs[drug_index].batch_id = new_child_id
                    drug_index += 1

        parent_batch.tot_drugs -= total_needed
        
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
async def Send_To_Dist(send_dist : SendBatch, db : Session = Depends(get_db)):
    batch = db.query(DrugBatch).filter(DrugBatch.batch_id == send_dist.batch_id).first()
    if not batch:
        raise HTTPException(status_code=500, detail="Batch to transfer not found!")
    try:
        receipt = blockchain.ship_to_distributor(send_dist.batch_id, send_dist.new_owner_address, send_dist.curr_owner_id)
        
        new_log = BatchStatus(
            batch_id = send_dist.batch_id,
            status = "DELIVERY TO DISTRIBUTOR",
            location = send_dist.new_owner_address,
            lat = 1.213433, 
            lng = 2.345345,
            timestamp = datetime.now(timezone.utc)
        )

        db.add(new_log)
        db.commit()

        return{
            "status" : "Success",
            "message" : f"Transfer successfully initiated to {send_dist.new_owner_address}"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to transfer batch {e}")


@router.post("/receive-dist")
async def Receive_Dist(receive_dist : ReceiveAtDist, db : Session = Depends(get_db)):
    batch = db.query(DrugBatch).filter(DrugBatch.batch_id == receive_dist.batch_id).first()

    if not batch:
        raise HTTPException(status_code=500, detail="Batch not found!!")
    
    try:
        blockchain.receive_at_distributor(receive_dist.batch_id, receive_dist.receiver_id)
        
        batch.current_owner = receive_dist.receiver_id 

        new_log = BatchStatus(
            batch_id = receive_dist.batch_id,
            status = "RECEIVED AT DISTRIBUTOR",
            location = receive_dist.receiver_address,
            lat = 1.78786439, 
            lng = 4.356432323,
            timestamp = datetime.now(timezone.utc)
        )

        db.add(new_log)
        db.commit()
        
        return {"status": "Success", "message": "Batch received"} 

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Couldn't accept batch {e}")

@router.post("/ship-pharma")
async def Send_To_Pharma(send_pharma : SendtoPharma , db : Session = Depends(get_db)):
    batch = db.query(DrugBatch).filter(DrugBatch.batch_id == send_pharma.batch_id).first()
    if not batch:
        raise HTTPException(status_code=500, detail="Batch to transfer not found!")
    try:
        receipt = blockchain.ship_to_pharmacy(send_pharma.batch_id, send_pharma.new_owner_address, send_pharma.current_owner_id)
        new_log = BatchStatus(
            batch_id = send_pharma.batch_id,
            status = "DELIVERY TO PHARMACY",
            location = send_pharma.new_owner_address,
            lat = 1.2187643,
            lng = 2.34523145,
            timestamp = datetime.now(timezone.utc)
        )

        db.add(new_log)
        db.commit()

        return{
            "status" : "Success",
            "message" : f"Transfer successfully initiated to {send_pharma.new_owner_address}"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to transfer batch {e}")

@router.post("/receive-pharma")
async def Receive_Pharma(receive_pharma : ReceiveAtPharma , db : Session = Depends(get_db)):
    batch = db.query(DrugBatch).filter(DrugBatch.batch_id == receive_pharma.batch_id).first()

    if not batch:
        raise HTTPException(status_code=500, detail="Batch not found!!")
    
    try:
        blockchain.receive_at_pharmacy(receive_pharma.batch_id, receive_pharma.receiver_id)
        
        batch.current_owner = receive_pharma.receiver_id 

        new_log = BatchStatus(
            batch_id = receive_pharma.batch_id,
            status = "RECEIVED AT PHARMACY", 
            location = receive_pharma.receiver_address,
            lat = 1.7853645659, 
            lng = 4.3564564323,
            timestamp = datetime.now(timezone.utc)
        )

        db.add(new_log)
        db.commit()
        
        return {"status": "Success", "message": "Batch received at pharmacy"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Couldn't accept batch {e}")

@router.post("/drug-status")
async def Drug_Status(drug_status : SellDrugs , db:Session = Depends(get_db)):
    drug = db.query(DrugItem).filter(DrugItem.drug_id == drug_status.drug_id).first()

    if not drug:
        raise HTTPException(status_code=500, detail="Drug not found in the batch")
    if drug.is_sold == True:
        raise HTTPException(status_code=500, detail="Drug already sold")

    try:
        blockchain.sell_item(drug_status.batch_id, drug_status.drug_id, drug_status.private_key)

        drug.is_sold = True
        
        db.commit()

        return {
            "Unit_sold" : f"{drug_status.drug_id} is sold",
            "status" : "Success"
        }
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Cannot sell particular unit: {e}")

@router.get("/batch-det/{batch_id}")
def Get_Batch_details(batch_id : str, db : Session = Depends(get_db)): 
    exists = db.query(DrugBatch).filter(DrugBatch.batch_id == batch_id).first()
    if not exists:
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "batch_id" : exists.batch_id,
        "manu_name" : exists.manufacturer_name,
        "drug_name" : exists.drug_name,
        "created_time" : exists.created_at,
        "mfd_date" : exists.mfd,
        "exp_date" : exists.exp,
        "quantity" : exists.tot_drugs
    }

@router.get("/get-qr/{drug_id}")
async def get_drug_qr(drug_id: str):
    is_batch = "-D" not in drug_id
    qr_buffer = generate_qr_image(drug_id, is_batch=is_batch)
    
    return StreamingResponse(qr_buffer, media_type="image/png")

@router.get("/verify/{batch_id}")
async def verify_the_batch(batch_id:str,db:Session = Depends(get_db)):
    batch = db.query(DrugBatch).filter(DrugBatch.batch_id==batch_id).first()

    if not batch:
        raise HTTPException(status_code=500,detail="Batch not found")
    
    try:
        if isinstance(batch.created_at,str):
            ts_str = batch.created_at
            if "00:00" not in ts_str:
                ts_str+="+00:00"

        else:
            ts_str = batch.created_at.strftime("%Y-%m-%dT%H:%M:%S+00:00")

        new_hash = generate_secure_hash({
                "id": batch.batch_id,
                "name": batch.drug_name,
                "mfg": str(batch.mfd),
                "exp" : str(batch.exp),
                "manu_name" : batch.manufacturer_name,
                "ts": ts_str
        })

        chain = blockchain.get_batch_data(batch_id)
        chain_hash = chain[2]

        if new_hash==chain_hash:
            return {
                    "status": "VERIFIED",
                    "message": "Cryptographic seal matches. Data is authentic",
                    "data": {
                        "drug": batch.drug_name,
                        "manufacturer": batch.manufacturer_name,
                        "mfg_date": batch.mfd,
                        "exp_date": batch.exp
                    }
                }
        else:
            return {
                "status": "TAMPERED",
                "message": "WARNING: The database information does not match the blockchain seal!",
                "mismatched_hashes": {
                    "database_hash": new_hash,
                    "blockchain_hash": chain_hash
                }
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")



    