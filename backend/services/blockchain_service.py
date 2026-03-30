from config.blockchain import contract, w3

# 🟢 CREATE BATCH
def create_batch(id, mfg, exp, ipfs, qty):
    tx = contract.functions.createBatch(
        id, mfg, exp, ipfs, qty
    ).transact()

    receipt = w3.eth.wait_for_transaction_receipt(tx)
    return receipt.transactionHash.hex()


# 🟡 SPLIT BATCH
def split_batch(parent_id, new_id, to, qty):
    tx = contract.functions.splitBatch(
        parent_id, new_id, to, qty
    ).transact()

    return w3.eth.wait_for_transaction_receipt(tx)


# 🔵 TRANSFER BATCH
def transfer_batch(batch_id, to):
    tx = contract.functions.transferBatch(batch_id, to).transact()
    return w3.eth.wait_for_transaction_receipt(tx)


# 🟣 ACCEPT BATCH
def accept_batch(batch_id):
    tx = contract.functions.acceptBatch(batch_id).transact()
    return w3.eth.wait_for_transaction_receipt(tx)


# 🟤 SELL UNITS
def sell_units(batch_id, qty):
    tx = contract.functions.sellUnits(batch_id, qty).transact()
    return w3.eth.wait_for_transaction_receipt(tx)


# ⚪ GET BATCH (READ ONLY)
def get_batch(batch_id):
    return contract.functions.getBatch(batch_id).call()