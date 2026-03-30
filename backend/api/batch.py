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