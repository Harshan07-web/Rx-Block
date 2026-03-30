from fastapi import Security, HTTPException
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(name="X-API-Key")

AUTHORIZED_MANUFACTURER_KEYS = {
    "0xbd083781ad5b0c5393dca538c4a9b66710c9b4b19ee204e4d5e8f1717b4097e1": "PharmaCorp Global",
    "secret_pharma_key_456": "BioMeds Inc"
}

def verify_manufacturer_role(api_key: str = Security(api_key_header)):
    if api_key not in AUTHORIZED_MANUFACTURER_KEYS:
        raise HTTPException(
            status_code=403, 
            detail="Forbidden: You do not have Manufacturer privileges"
        )
    return AUTHORIZED_MANUFACTURER_KEYS[api_key]