from sqlalchemy import Column, Integer, String
from database.database import Base

class DrugBatch(Base):
    __tablename__ = "drug_batches"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String, unique=True, index=True)
    expected_hash = Column(String)
    drug_name = Column(String)
    manufacturer = Column(String)
    manufacturing_date = Column(String)
    expiry_date = Column(String)
    current_owner = Column(String, default="Manufacturer")
    status = Column(String, default="Available")
    from sqlalchemy.types import JSON
    side_effects = Column(JSON)
    allergies = Column(JSON)