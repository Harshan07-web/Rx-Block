"""from fastapi import FastAPI
from api.batch import router as batch_router

app = FastAPI()

app.include_router(batch_router, prefix="/batch")

@app.get("/")
def root():
    return {"message": "Blockchain Backend Running 🚀"}"""
from fastapi import FastAPI
from api.batch import router as batch_router

# Import Database tools
from database.database import engine, Base

# This line creates the 'rx_block.db' file and tables if they don't exist
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Pharma Supply Chain")

app.include_router(batch_router, prefix="/batch")

@app.get("/")
def root():
    return {"message": "Blockchain & DB Backend Running 🚀"}