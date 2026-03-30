from fastapi import FastAPI
from api.batch import router as batch_router

app = FastAPI()

app.include_router(batch_router, prefix="/batch")

@app.get("/")
def root():
    return {"message": "Blockchain Backend Running 🚀"}
from fastapi import FastAPI
from api.batch import router as batch_router

# --- NEW IMPORTS FOR SQLITE ---
from database.database import engine, Base

# --- CREATE SQLITE TABLES ---
Base.metadata.create_all(bind=engine)

# ==========================================
# 🛑 EXISTING CODE (UNCHANGED)
# ==========================================
app = FastAPI()

app.include_router(batch_router, prefix="/batch")

@app.get("/")
def root():
    return {"message": "Blockchain Backend Running 🚀"}