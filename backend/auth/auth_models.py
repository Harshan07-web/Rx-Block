from sqlalchemy import Column, Integer, VARCHAR, Enum as SAEnum
from auth.auth_database import base
from auth.schemas import ChainRole


class User(base):
    __tablename__ = "chain_users"

    id= Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(VARCHAR(255), unique=True, index=True, nullable=False)
    email = Column(VARCHAR(255), unique=True, index=True, nullable=False)
    hashed_password = Column(VARCHAR(255), nullable=False)
    role = Column(
        SAEnum("MANUFACTURER", "DISTRIBUTOR", "PHARMACY", "VALIDATOR", "PATIENT", name="chain_role"),
        nullable=False)
    private_key= Column(VARCHAR(255), unique=True, nullable=False)

class Patient(base):
    __tablename__ = "public_users"

    id = Column(Integer,primary_key=True,index=True,autoincrement=True)
    username = Column(VARCHAR(255),unique=True,index=True,nullable=False)
    email = Column(VARCHAR(255),unique=True,index=True,nullable=False)
    hashed_password = Column(VARCHAR(255),nullable=False)
    