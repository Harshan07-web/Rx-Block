from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Creates a local file named 'rx_block.db' automatically
SQLALCHEMY_DATABASE_URL = "sqlite:///./rx_block.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Dependency to use in our API routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()