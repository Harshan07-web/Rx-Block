from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from database.database import get_db
from models.batch_model import DrugBatch

router = APIRouter()

# -----------------------------
# GET SIDE EFFECTS + ALLERGIES
# -----------------------------
@router.get("/info/{batch_id}")
def get_medicine_info(batch_id: str, db: Session = Depends(get_db)):
    batch = db.query(DrugBatch).filter(DrugBatch.batch_id == batch_id).first()

    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    return {
        "batch_id": batch.batch_id,
        "drug_name": batch.drug_name,
        "side_effects": batch.side_effects,
        "allergies": batch.allergies
    }