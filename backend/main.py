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


@app.post("/auth/signup", response_model=UserPublic, status_code=201)
def signup(user_in: NewUser, db: Session = Depends(get_auth_db)):
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if db.query(User).filter(User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.private_key == user_in.private_key).first():
        raise HTTPException(status_code=400, detail="Private key already registered to another account")

    new_user = User(
        username = user_in.username,
        email = user_in.email,
        hashed_password = hashpass(user_in.password),
        role  = user_in.role.value,
        private_key = user_in.private_key,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

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

@app.post("/auth/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_auth_db)):
    user = db.query(User).filter(User.username == form_data.username).first()    
    if user:
        if not verifypass(form_data.password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")
            
        token = create_access_token({
            "sub": user.username,
            "role": user.role,
            "user_id": user.id,
        })
        return TokenResponse(
            access_token=token,
            role=user.role,
            username=user.username,
        )
    
    patient = db.query(Patient).filter(Patient.username == form_data.username).first()
    if patient:
        if not verifypass(form_data.password, patient.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")
            
        token = create_access_token({
            "sub": patient.username,
            "role": "PATIENT",
            "user_id": patient.id,
        })
        return TokenResponse(
            access_token=token,
            role="PATIENT",
            username=patient.username,
        )
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect username or password",
        headers={"WWW-Authenticate": "Bearer"},
    )


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