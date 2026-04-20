import os
import json
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

class BlockchainService:
    def __init__(self):
        # 1. Connect to node
        self.w3 = Web3(Web3.HTTPProvider(os.getenv("RPC_URL", "http://127.0.0.1:7545")))
        
        # 2. Load ABI
        abi_path = os.path.join(os.path.dirname(__file__), "../smart-contract/abi.json")
        with open(abi_path, "r") as file:
            contract_abi = json.load(file)
            
        self.contract = self.w3.eth.contract(
            address=os.getenv("CONTRACT_ADDRESS"), 
            abi=contract_abi
        )
        
        # Admin key (Usually the deployer/validator)
        self.admin_private_key = os.getenv("PRIVATE_KEY")

    def _send_transaction(self, func_call, private_key, gas_limit=2000000):
        account = self.w3.eth.account.from_key(private_key)
        nonce = self.w3.eth.get_transaction_count(account.address)
        
        # Pro-Tip: Ganache chainId is usually 1337. 
        # If using a testnet later, change this or fetch dynamically: self.w3.eth.chain_id
        tx = func_call.build_transaction({
            'from': account.address,
            'nonce': nonce,
            'gas': gas_limit,
            'gasPrice': self.w3.eth.gas_price, # Better to fetch current gas price
            'chainId': 1337  
        })
        
        signed_tx = self.w3.eth.account.sign_transaction(tx, private_key=private_key)
        tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        return self.w3.eth.wait_for_transaction_receipt(tx_hash)

    # -----------------------------
    # 1. CREATION & SPLITTING
    # -----------------------------
    def create_batch(self, batch_id, data_hash, quantity, private_key=None):
        """Replaced mfg/exp/ipfs with a single secure data_hash"""
        pk = private_key if private_key else self.admin_private_key
        func = self.contract.functions.createBatch(batch_id, data_hash, quantity)
        return self._send_transaction(func, pk)

    def split_batch(self, parent_id, new_id, child_hash, quantity, private_key):
        """Updated to include the child_hash and removed the 'to' address (handled in shipping)"""
        func = self.contract.functions.splitBatch(parent_id, new_id, child_hash, quantity)
        return self._send_transaction(func, private_key)

    # -----------------------------
    # 2. MANUFACTURER -> DISTRIBUTOR
    # -----------------------------
    def ship_to_distributor(self, batch_id, distributor_address, private_key):
        func = self.contract.functions.shipToDistributor(batch_id, distributor_address)
        return self._send_transaction(func, private_key)

    def receive_at_distributor(self, batch_id, private_key):
        func = self.contract.functions.receiveAtDistributor(batch_id)
        return self._send_transaction(func, private_key, gas_limit=500000)

    # -----------------------------
    # 3. DISTRIBUTOR -> PHARMACY
    # -----------------------------
    def ship_to_pharmacy(self, batch_id, pharmacy_address, private_key):
        func = self.contract.functions.shipToPharmacy(batch_id, pharmacy_address)
        return self._send_transaction(func, private_key)

    def receive_at_pharmacy(self, batch_id, private_key):
        func = self.contract.functions.receiveAtPharmacy(batch_id)
        return self._send_transaction(func, private_key, gas_limit=500000)

    # -----------------------------
    # 4. UNIT-LEVEL SALE (PHARMACY)
    # -----------------------------
    def sell_item(self, batch_id, item_id, private_key):
        """Resume-Worthy: Sells an individual strip (e.g., '101-D15') instead of a bulk quantity"""
        func = self.contract.functions.sellItem(batch_id, item_id)
        return self._send_transaction(func, private_key, gas_limit=300000)

    # -----------------------------
    # 5. GOVERNANCE
    # -----------------------------
    def assign_role(self, account_address, role_index, private_key=None):
        """Simplified role assignment from the voting mechanism"""
        pk = private_key if private_key else self.admin_private_key
        func = self.contract.functions.assignRole(account_address, role_index)
        return self._send_transaction(func, pk)

    # -----------------------------
    # 6. VIEW/READ FUNCTIONS (No gas required)
    # -----------------------------
    def get_batch_data(self, batch_id):
        return self.contract.functions.getBatchData(batch_id).call()
        
    def verify_item(self, item_id):
        """Checks if a specific drug strip has been sold"""
        return self.contract.functions.verifyItem(item_id).call()

    def get_role(self, address):
        return self.contract.functions.roles(address).call()

blockchain = BlockchainService()