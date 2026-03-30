import os
import json
from web3 import Web3
from dotenv import load_dotenv

# 1. Load the variables from your .env file
load_dotenv()

RPC_URL = os.getenv("RPC_URL")
PRIVATE_KEY = os.getenv("PRIVATE_KEY")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")

# 2. Connect to Ganache
w3 = Web3(Web3.HTTPProvider(RPC_URL))

# 3. Load your Contract ABI 
# (Make sure the path matches where you saved abi.json from Remix)
with open("../smart-contract/abi.json", "r") as file:
    contract_abi = json.load(file)

# 4. Set up the contract and account instances
contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=contract_abi)
account = w3.eth.account.from_key(PRIVATE_KEY)

# ==========================================
# 🚀 BLOCKCHAIN FUNCTIONS
# ==========================================

def create_batch(batch_id: str, mfg_date: str, exp_date: str, ipfs_hash: str, quantity: int) -> str:
    """Sends a transaction to the blockchain to create a new batch."""
    
    # 1. Get the nonce (transaction count) for your account to prevent double-spending
    nonce = w3.eth.get_transaction_count(account.address)

    # 2. Build the transaction
    tx = contract.functions.createBatch(
        batch_id,
        mfg_date,
        exp_date,
        ipfs_hash,
        quantity
    ).build_transaction({
        'chainId': 1337, # 1337 is the default chain ID for Ganache
        'gas': 2000000,
        'maxFeePerGas': w3.eth.gas_price,
        'maxPriorityFeePerGas': w3.eth.max_priority_fee,
        'nonce': nonce,
    })

    # 3. Sign the transaction with your Private Key
    signed_tx = w3.eth.account.sign_transaction(tx, private_key=PRIVATE_KEY)

    # 4. Send it to Ganache!
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)

    # Return the transaction hash as a hex string
    return tx_hash.hex()


# --- Other functions (stubs for now so your API doesn't break) ---

def split_batch(parent_id, new_id, to_address, quantity):
    pass # Add similar build/sign/send logic here later

def transfer_batch(batch_id, to_address):
    pass

def accept_batch(batch_id):
    pass

def sell_units(batch_id, quantity):
    pass

def get_batch(batch_id):
    """Reads data from the blockchain (No gas fee, no signing required!)"""
    return contract.functions.getBatch(batch_id).call()