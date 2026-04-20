import hashlib
import json
from datetime import datetime,timezone

def generate_secure_hash(data_dict : dict) -> str:
    try:
        processed_data = {}
        for key,val in data_dict.items():
            if isinstance(val,datetime):
                processed_data[key] = val.isoformat()
            else:
                processed_data[key] = val

        json_string = json.dumps(processed_data, sort_keys=True, separators=(',',':'))
        print(f"\n\n{json_string}\n\n")
        sha256 = hashlib.sha256()
        sha256.update(json_string.encode('utf-8'))

        return "0x" + sha256.hexdigest()
    
    except Exception as e:
        print(f"hashing error {e}")
        return None