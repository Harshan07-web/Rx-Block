import os
from pinatapy import PinataPy


PINATA_API_KEY = "your_api_key"
PINATA_SECRET_API_KEY = "your_secret_key"

pinata = PinataPy(PINATA_API_KEY, PINATA_SECRET_API_KEY)

def upload_image_to_ipfs(file_path: str):
    result = pinata.pin_file_to_ipfs(file_path)
    return result.get("IpfsHash")