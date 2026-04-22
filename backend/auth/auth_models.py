from sqlalchemy import Column, Integer, VARCHAR, Enum as SAEnum
from auth_database import base
from schemas import ChainRole


class User(base):
    __tablename__ = "users"

    id= Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(VARCHAR(255), unique=True, index=True, nullable=False)
    email = Column(VARCHAR(255), unique=True, index=True, nullable=False)
    hashed_password = Column(VARCHAR(255), nullable=False)
    role = Column(
        SAEnum("MANUFACTURER", "DISTRIBUTOR", "PHARMACY", "VALIDATOR", name="chain_role"),
        nullable=False)
    private_key= Column(VARCHAR(255), unique=True, nullable=False)