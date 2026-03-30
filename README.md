# Rx-Block: Blockchain-Based Pharmaceutical Supply Chain

Rx-Block is a decentralized transparency layer for the pharmaceutical supply chain. It leverages **Ethereum Smart Contracts** (via Ganache) and a **FastAPI** backend to ensure that every unit of medicine is tracked from the manufacturer to the patient, preventing counterfeit drugs from entering the market.

---

## 🏗️ System Architecture

The project operates on a "Consortium Blockchain" model. It consists of three primary layers:
1.  **Blockchain Layer (Solidity):** The source of truth. Handles ownership, batch splitting, and role-based access control.
2.  **Backend API (FastAPI):** The bridge. Manages cryptographic QR generation, SQLite metadata storage, and Web3 provider communication.
3.  **Local Node (Ganache):** A local Ethereum instance for instant transaction finality.



---

## 🛡️ Smart Contract Features

The `DrugSupply.sol` contract is the core engine of the project. Key mechanisms include:

* **Governance & Voting:** New companies (Manufacturers, Distributors, Pharmacies) cannot simply join; they must be proposed by an existing Validator and receive at least **3 votes** to be authorized.
* **Batch Splitting:** Enables a Distributor to take a parent batch (e.g., 10,000 units) and split it into multiple child batches (e.g., 1,000 units) for different pharmacies while maintaining a cryptographic link to the original.
* **Two-Step Transfer:** Ownership does not change automatically. A sender initiates a transfer, and the receiver must physically verify the goods and "Accept" the transaction to complete the change of custody.

---

## 🚀 Backend API Flow

The FastAPI backend exposes the following lifecycle endpoints:

### 1. Manufacturer Flow
* **`POST /batch/create-with-qr`**: 
    * Generates a unique cryptographic hash based on batch metadata.
    * Commits the batch to the Blockchain.
    * Saves a record in the local SQLite DB.
    * Returns a **Secure QR Code** as a PNG stream.

### 2. Supply Chain Flow
* **`POST /batch/transfer`**: Moves a batch into a "Pending" state for a new address.
* **`POST /batch/accept`**: The receiver signs a transaction to take full legal/digital ownership.
* **`POST /batch/split`**: Generates a new Child Batch ID and reduces the parent stock.
* **`POST /batch/sell`**: Used by Pharmacies to decrement stock as units are sold to consumers.

### 3. Public Verification (Layman View)
* **`GET /batch/{batch_id}`**: 
    * Querying this endpoint (via QR scan) returns the real-time status from the blockchain.
    * Shows: Manufacturing date, Current Owner, and Status (e.g., `AT_PHARMACY` or `SOLD`).

---

## 🛠️ Setup & Installation

### Prerequisites
* **Python 3.10+**
* **Ganache** (UI or CLI)
* **Node.js** (for Truffle/Hardhat if redeploying)

### Backend Setup
1.  **Environment Variables:** Create a `.env` file in the `/backend` folder:
    ```env
    RPC_URL=http://127.0.0.1:7545
    CONTRACT_ADDRESS=0xYourContractAddress
    PRIVATE_KEY=0xYourAdminPrivateKey
    ```
2.  **Install Dependencies:**
    ```bash
    pip install fastapi uvicorn web3 sqlalchemy python-dotenv qrcode
    ```
3.  **Run the Server:**
    ```bash
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    ```

---

## 📊 Database Schema

While the Blockchain stores the ownership and status, the **SQLite** database stores the metadata for fast retrieval:

| Column | Type | Description |
| :--- | :--- | :--- |
| `batch_id` | String | Unique Identifier (Primary Key) |
| `expected_hash` | String | Cryptographic signature of the batch |
| `drug_name` | String | Name of the medicine |
| `manufacturer` | String | Originating Company |
| `status` | String | Cached status from Blockchain |



---

## ⚖️ Governance Workflow (Demo)

To authorize a new participant in the network:
1.  **Propose:** A Validator calls `/batch/propose` with the candidate's wallet address.
2.  **Vote:** Three different Validators must call `/batch/vote/{id}`.
3.  **Activate:** Once the `VOTE_THRESHOLD` is hit, the candidate's address is assigned a `Role` in the mapping, allowing them to call `createBatch` or `acceptBatch`.

---

## 📜 License
This project is licensed under the MIT License. Reference the `SPDX-License-Identifier` in the smart contract for details.