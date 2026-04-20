from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.batch1 import router as batch_router
from database.database import engine, base
from fastapi.staticfiles import StaticFiles


base.metadata.create_all(bind=engine)

app = FastAPI(title="Pharma Supply Chain")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True, 
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(batch_router, prefix="/batch")

@app.get("/")
def root():
    return {"message": "Blockchain & DB Backend Running"}