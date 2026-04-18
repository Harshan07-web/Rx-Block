from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.batch1 import router as batch_router
from database.database import engine, Base
from fastapi.staticfiles import StaticFiles

# Change the directory string to point to your new folder

# Create database tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Pharma Supply Chain")

#app.mount("/", StaticFiles(directory=r"D:\Rx-block\web-frontend", html=True), name="frontend")
# Enable CORS so the HTML frontend can connect
"""app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,  # <--- THIS MUST BE FALSE!
    allow_methods=["*"],
    allow_headers=["*"],
)"""

# Include the batch routes
app.include_router(batch_router, prefix="/batch")

@app.get("/")
def root():
    return {"message": "Blockchain & DB Backend Running"}