import os
from datetime import datetime, timedelta, timezone
from typing import List

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt
from sqlalchemy.orm import Session

from services.blockchain_service import blockchain
from api.batch1 import router as batch_router
from auth.auth_database import base as auth_base, engine as auth_engine, get_db as get_auth_db
from auth.auth_utils import hashpass, verifypass
from database.database import base as batch_base, engine as batch_engine
from auth.dependencies import get_current_user
from auth.auth_models import User, Patient
from auth.schemas import NewUser, TokenResponse, UserPublic , New_Patient

load_dotenv()

SECRET_KEY = os.getenv("SUPER_SECRET_KEY", "change-me-in-production")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = 60

auth_base.metadata.create_all(bind=auth_engine)
batch_base.metadata.create_all(bind=batch_engine)

app = FastAPI(
    title="Rx-Block · Pharma Supply Chain",
    description="Blockchain-backed drug traceability API with JWT role auth",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

@app.post("/auth/patient/signup")
def public_signup(user_in:New_Patient , db:Session = Depends(get_auth_db)):
    if db.query(Patient).filter(Patient.username == user_in.username).first():
        raise HTTPException(status_code=400,detail="Username already exists")
    if db.query(Patient).filter(Patient.email == user_in.email).first():
        raise HTTPException(status_code=400,detail="this email has already been registered")
    
    new_public_user = Patient(
        username = user_in.username,
        email = user_in.email,
        hashed_password = hashpass(user_in.password)
    )

    db.add(new_public_user)
    db.commit()
    db.refresh(new_public_user)
    return new_public_user

@app.post("/auth/member/login", response_model=TokenResponse)
def member_login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_auth_db)):
    user = db.query(User).filter(User.username == form_data.username).first()    
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Enterprise account not found")

    if not verifypass(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")
        
    try:
        chain_role = blockchain.contract.functions.roles(user.wallet_address).call()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Blockchain connection failed: {e}")

    if chain_role == 0: 
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Account pending. Your wallet has not been approved by the Validators yet."
        )

    role_map = {1: "MANUFACTURER", 2: "DISTRIBUTOR", 3: "PHARMACY", 4: "VALIDATOR"}
    actual_role = role_map.get(chain_role, "UNKNOWN")

    token = create_access_token({
        "sub": user.username,
        "role": actual_role,
        "user_id": user.id,
    })
    
    return TokenResponse(access_token=token, role=actual_role, username=user.username)


@app.post("/auth/patient/login", response_model=TokenResponse)
def patient_login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_auth_db)):
    patient = db.query(Patient).filter(Patient.username == form_data.username).first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Patient account not found")

    if not verifypass(form_data.password, patient.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")
        
    token = create_access_token({
        "sub": patient.username,
        "role": "PATIENT",
        "user_id": patient.id,
    })
    
    return TokenResponse(access_token=token, role="PATIENT", username=patient.username)


@app.get("/auth/me", response_model=UserPublic)
def get_me(current_user: dict  = Depends(get_current_user),db: Session = Depends(get_auth_db),):
    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

app.include_router(batch_router, prefix="/batch", tags=["Supply Chain"])
@app.get("/api")
def health():
    return {"status": "ok", "message": "Rx-Block API is running"}

app.mount("/",StaticFiles(directory=r"D:\Rx-block\web-frontend",html=True),name="Frontend")