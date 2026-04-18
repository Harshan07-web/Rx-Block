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

class CreateBatchT1(BaseModel):
    batch_id : int
    batch_quantity : int
    manufacturer_name : str
    drug_name : str
    mfd : str
    exp : str
    batch_drugs : List[str]

class CreateBatchT2(BaseModel):
    batch_id : int
    batch_quantity : int
    manufacturer_name : str
    drug_name : str
    mfd : str
    exp : str
    batch_drugs : List[str]

class DrugMarking(BaseModel):
    drug_id : int
    manufacturer_name : str
    mfd : str
    exp : str
    sold : bool

class SplitBatch(BaseModel):
    no_of_batches : int
    quantity_per_batch: int
    curr_owner_id : str
    new_owner_id : str
    new_batch_owner : str

class SendBatch(BaseModel):
    batch_id : int
    curr_owner_id : str
    new_owner_id : str
    del_out_time : str
    new_owner_name : str
    new_owner_address : str
    batch_drugs : List[str]

class ReceiveAtDist(BaseModel):
    batch_id : int
    receiver_id : str
    receiving_time : str
    batch_drugs : List[str]

class SendtoPharma(BaseModel):
    batch_id : int
    current_owner_id : str
    new_owner_id : str
    del_out_time : str
    new_owner_name : str
    new_owner_address : str
    batch_drugs : List[str]

class ReceiveAtPharma(BaseModel):
    batch_id : int
    receiver_id : str
    receiving_time : str
    batch_drugs : List[str]

class SellDrugs(BaseModel):
    drug_id : int
    sold : bool

@router.post("/create-drugs-t1")
def Create_Batch_T1(create_batch_t1 : CreateBatchT1):
    pass

@router.post("/create-drugs-t2")
def Create_Batch_T2(create_batch_t2 : CreateBatchT2):
    pass

@router.post("/split-batch")
def Split_Batch(split : SplitBatch):
    pass

@router.post("/ship-dist")
def Send_To_Dist(send_dist : SendBatch):
    pass

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




    
