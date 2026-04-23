from pydantic import BaseModel, EmailStr, field_validator
from enum import Enum

class ChainRole(str, Enum):
    MANUFACTURER = "MANUFACTURER"
    DISTRIBUTOR = "DISTRIBUTOR"
    PHARMACY = "PHARMACY"
    VALIDATOR = "VALIDATOR"
    PATIENT = "PATIENT"

class NewUser(BaseModel):
    username: str
    email: EmailStr
    password: str
    role:ChainRole
    private_key:str           
    @field_validator("username")
    @classmethod
    def username_no_spaces(cls, v: str) -> str:
        if " " in v:
            raise ValueError("Username must not contain spaces")
        return v.strip()

    @field_validator("private_key")
    @classmethod
    def key_starts_with_0x(cls, v: str) -> str:
        if not v.startswith("0x") or len(v) != 66:
            raise ValueError("private_key must be a 0x-prefixed 32-byte hex string (66 chars)")
        return v


class UserLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username:str


class UserPublic(BaseModel):
    id:  int
    username: str
    email:str
    role: str

    class Config:
        from_attributes = True

class New_Patient(BaseModel):
    username: str
    email : EmailStr
    password : str