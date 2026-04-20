from sqlalchemy import Column, Integer, VARCHAR, Date, DateTime, Boolean, ForeignKey, Float
from database.database import base
from datetime import datetime,timezone

class DrugBatch(base):
    __tablename__ = "batch_info"

    batch_id = Column(VARCHAR(255),primary_key=True)
    drug_name = Column(VARCHAR(255))
    manufacturer_name = Column(VARCHAR(255))
    mfd  = Column(Date)
    exp = Column(Date)
    created_at = Column(DateTime)
    tot_drugs = Column(Integer)
    ipfs_hash = Column(VARCHAR(255))
    parent_batch_id = Column(VARCHAR(255), nullable=True)
    is_active = Column(Boolean, default=True)

class DrugItem(base):
    __tablename__ = "drug_info"

    batch_id = Column(VARCHAR(255), ForeignKey("batch_info.batch_id"))
    drug_id = Column(VARCHAR(255),primary_key=True)
    is_sold = Column(Boolean)

class BatchStatus(base):
    __tablename__ = "batch_status"

    id = Column(Integer, primary_key=True, autoincrement=True) 
    batch_id = Column(VARCHAR(255), ForeignKey("batch_info.batch_id"))
    status = Column(VARCHAR(255))
    location = Column(VARCHAR(255))
    lat = Column(Float)
    lng = Column(Float)
    timestamp = Column(DateTime)