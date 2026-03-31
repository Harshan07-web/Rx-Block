import os
import json
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

class BlockchainService:
    def __init__(self):
        # Connect to Ganache
        self.w3 = Web3(Web3.HTTPProvider(os.getenv("RPC_URL", "http://127.0.0.1:7545")))
        
        # Load the compiled Smart Contract ABI
        abi_path = os.path.join(os.path.dirname(__file__), "../smart-contract/abi.json")
        with open(abi_path, "r") as file:
            contract_abi = json.load(file)
            
        self.contract = self.w3.eth.contract(
            address=os.getenv("CONTRACT_ADDRESS"), 
            abi=contract_abi
        )
        
        # The master Manufacturer/Admin key for creating brand new batches
        self.admin_private_key = os.getenv("PRIVATE_KEY")

    def _send_transaction(self, func_call, private_key, gas_limit=2000000):
        """Helper to handle the signing and sending of transactions to Ganache"""
        account = self.w3.eth.account.from_key(private_key)
        nonce = self.w3.eth.get_transaction_count(account.address)
        
        tx = func_call.build_transaction({
            'from': account.address,
            'nonce': nonce,
            'gas': gas_limit,
            'gasPrice': self.w3.to_wei('20', 'gwei'),
            'chainId': 1337  # Default Chain ID for Ganache
        })
        
        signed_tx = self.w3.eth.account.sign_transaction(tx, private_key=private_key)
        tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        return self.w3.eth.wait_for_transaction_receipt(tx_hash)

    def create_batch(self, batch_id, mfg_date, exp_date, ipfs_hash, quantity):
        func = self.contract.functions.createBatch(batch_id, mfg_date, exp_date, ipfs_hash, quantity)
        return self._send_transaction(func, self.admin_private_key)

    def transfer_batch(self, batch_id, to_address, private_key):
        func = self.contract.functions.transferBatch(batch_id, to_address)
        return self._send_transaction(func, private_key)

    def accept_batch(self, batch_id, private_key):
        func = self.contract.functions.acceptBatch(batch_id)
        return self._send_transaction(func, private_key, gas_limit=500000)

    def split_batch(self, parent_id, new_id, to_address, quantity, private_key):
        func = self.contract.functions.splitBatch(parent_id, new_id, to_address, quantity)
        return self._send_transaction(func, private_key)


    def transfer_to_pharmacy(self, batch_id, pharmacy_address, private_key):
        func = self.contract.functions.transferToPharmacy(batch_id, pharmacy_address)
        return self._send_transaction(func, private_key)

    def accept_at_pharmacy(self, batch_id, private_key):
        func = self.contract.functions.acceptAtPharmacy(batch_id)
        return self._send_transaction(func, private_key, gas_limit=500000)

    def sell_units(self, batch_id, quantity, private_key):
        func = self.contract.functions.sellUnits(batch_id, quantity)
        return self._send_transaction(func, private_key, gas_limit=300000)


    def propose_company(self, candidate_address, role_index, private_key):
        func = self.contract.functions.proposeCompany(candidate_address, role_index)
        return self._send_transaction(func, private_key)

    def vote_proposal(self, proposal_id, private_key):
        func = self.contract.functions.vote(proposal_id)
        return self._send_transaction(func, private_key)


    def get_batch(self, batch_id):
        """Reads a medicine batch's current status and history"""
        return self.contract.functions.getBatch(batch_id).call()

    def get_role(self, address):
        """Checks the role level of a specific wallet address"""
        return self.contract.functions.roles(address).call()

# Create a single instance that FastAPI will import and use
blockchain = BlockchainService()