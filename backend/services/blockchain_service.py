import os
import json
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

class BlockchainService:
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(os.getenv("RPC_URL")))
        abi_path = os.path.join(os.path.dirname(__file__), "../smart-contract/abi.json")
        with open(abi_path, "r") as file:
            contract_abi = json.load(file)
            
        self.contract = self.w3.eth.contract(
            address=os.getenv("CONTRACT_ADDRESS"), 
            abi=contract_abi
        )
        self.admin_private_key = os.getenv("PRIVATE_KEY")

    def _send_transaction(self, func_call, private_key, gas_limit=2000000):
        account = self.w3.eth.account.from_key(private_key)
        tx = func_call.build_transaction({
            'from': account.address,
            'nonce': self.w3.eth.get_transaction_count(account.address),
            'gas': gas_limit,
            'gasPrice': self.w3.to_wei('20', 'gwei'),
            'chainId': 1337 
        })
        signed_tx = self.w3.eth.account.sign_transaction(tx, private_key=private_key)
        tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        return self.w3.eth.wait_for_transaction_receipt(tx_hash)

    # --- BATCH LIFECYCLE ---
    def create_batch(self, b_id, mfg, exp, ipfs, qty):
        func = self.contract.functions.createBatch(b_id, mfg, exp, ipfs, qty)
        return self._send_transaction(func, self.admin_private_key)

    def split_batch(self, p_id, n_id, to, qty, p_key):
        func = self.contract.functions.splitBatch(p_id, n_id, to, qty)
        return self._send_transaction(func, p_key)

    def transfer_batch(self, b_id, to, p_key):
        func = self.contract.functions.transferBatch(b_id, to)
        return self._send_transaction(func, p_key)

    def accept_batch(self, b_id, p_key):
        func = self.contract.functions.acceptBatch(b_id)
        return self._send_transaction(func, p_key, gas_limit=500000)

    def transfer_to_pharmacy(self, b_id, phar_addr, p_key):
        func = self.contract.functions.transferToPharmacy(b_id, phar_addr)
        return self._send_transaction(func, p_key)

    def accept_at_pharmacy(self, b_id, p_key):
        func = self.contract.functions.acceptAtPharmacy(b_id)
        return self._send_transaction(func, p_key)

    def sell_units(self, b_id, qty, p_key):
        func = self.contract.functions.sellUnits(b_id, qty)
        return self._send_transaction(func, p_key, gas_limit=300000)

    # --- GOVERNANCE ---
    def propose_company(self, cand_addr, role_idx, p_key):
        func = self.contract.functions.proposeCompany(cand_addr, role_idx)
        return self._send_transaction(func, p_key)

    def vote_proposal(self, prop_id, p_key):
        func = self.contract.functions.vote(prop_id)
        return self._send_transaction(func, p_key)

    # --- READ ONLY ---
    def get_batch(self, b_id):
        return self.contract.functions.getBatch(b_id).call()

    def get_role(self, addr):
        return self.contract.functions.roles(addr).call()

blockchain = BlockchainService()