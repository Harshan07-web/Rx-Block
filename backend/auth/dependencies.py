import os
from typing import Annotated, List
 
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from auth.auth_database import local_session
 
load_dotenv()
 
SECRET_KEY = os.getenv("SUPER_SECRET_KEY")
ALGORITHM  = os.getenv("ALGORITHM")
 
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
 
 
def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]) -> dict:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload  = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str     = payload.get("role")
        user_id: int  = payload.get("user_id")
 
        if username is None or role is None or user_id is None:
            raise credentials_exc
 
        return {"username": username, "role": role, "user_id": user_id}
 
    except JWTError:
        raise credentials_exc
 
def require_role(*allowed_roles: str):
    def _checker(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access denied. Required role(s): {', '.join(allowed_roles)}. "
                    f"Your role: {current_user['role']}"
                ),
            )
        return current_user
 
    return _checker
 
 
def get_authed_user(*allowed_roles: str):
    def _checker(
        current_user: dict = Depends(require_role(*allowed_roles)),
        auth_db: Session    = Depends(_get_auth_db),
    ):
        from models import User  # local import avoids circular deps
        user = auth_db.query(User).filter(User.id == current_user["user_id"]).first()
        if not user:
            raise HTTPException(status_code=404, detail="Authenticated user record not found")
        return user, current_user
 
    return _checker
 
 
def _get_auth_db():
    db = local_session()
    try:
        yield db
    finally:
        db.close()