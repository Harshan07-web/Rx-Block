from web3 import Web3
import json

# 🔗 Connect to Ganache (change if needed)
GANACHE_URL = "http://127.0.0.1:7545"

w3 = Web3(Web3.HTTPProvider(GANACHE_URL))

if not w3.is_connected():
    raise Exception("❌ Blockchain not connected")

print("✅ Connected to Blockchain")

# 📄 Load ABI
with open("smart-contract/abi.json") as f:
    abi = json.load(f)

# 📍 Replace with your deployed contract address
CONTRACT_ADDRESS = "0x173cF93d6120A1F567B0d1F9Cc8882f32232bAC0"

contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=abi)

# 🧑 Default account (Ganache)
w3.eth.default_account = w3.eth.accounts[0]