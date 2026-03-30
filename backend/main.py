from fastapi import FastAPI
from api.batch import router as batch_router

app = FastAPI()

app.include_router(batch_router, prefix="/batch")

@app.get("/")
def root():
    return {"message": "Blockchain Backend Running 🚀"}