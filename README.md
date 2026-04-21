# RxBlock — Hybrid Blockchain Drug Traceability System

> *Eliminating counterfeit medications through immutable, cryptographically sealed supply chains.*

---

## Table of Contents

- [1. What the Project Is About & How It Helps Society](#1-what-the-project-is-about--how-it-helps-society)
- [2. Real-World Workflow (IRL PoV)](#2-real-world-workflow-irl-pov)
  - [Phase 1 — The Genesis (Manufacturer)](#phase-1--the-genesis-manufacturer)
  - [Phase 2 — The Handoff (Distributor)](#phase-2--the-handoff-distributor)
  - [Phase 3 — The Retail Level (Pharmacy)](#phase-3--the-retail-level-pharmacy)
  - [Phase 4 — The Consumer Verification (Patient)](#phase-4--the-consumer-verification-patient)
- [3. Technology Stack](#3-technology-stack)
- [4. Technical Flow of the Program](#4-technical-flow-of-the-program)
- [5. How to Run This on Your Own Machine](#5-how-to-run-this-on-your-own-machine)
  - [Prerequisites](#prerequisites)
  - [Step 1 — Setup the Database](#step-1--setup-the-database)
  - [Step 2 — Setup the Blockchain](#step-2--setup-the-blockchain)
  - [Step 3 — Environment Variables](#step-3--environment-variables)
  - [Step 4 — Install Dependencies](#step-4--install-dependencies)
  - [Step 5 — Run the Server](#step-5--run-the-server)
- [6. Contributors & License](#6-contributors--license)

---

## 1. What the Project Is About & How It Helps Society

### The Problem

Counterfeit medication is a **silent global epidemic**. According to the World Health Organization (WHO), falsified and substandard medicines account for an estimated **1 in 10 medical products** in low- and middle-income countries. The consequences are catastrophic:

- **Patient Deaths:** Patients unknowingly consume fake drugs with no active ingredient, wrong dosages, or toxic substitutes — often in life-threatening situations where the drug is their only recourse.
- **Economic Damage:** The global counterfeit drug market is valued at over **$200 billion annually**, siphoning revenue away from legitimate pharmaceutical manufacturers and healthcare systems.
- **Undermined Trust:** When counterfeit drugs cause harm or fail to work, public trust in healthcare and medicine collapses — especially in regions already dealing with weak health infrastructure.
- **No Reliable Verification:** Today, neither a patient nor even a pharmacist has a simple, trustworthy mechanism to confirm that a drug is authentic, unexpired, or untampered with. Holographic stickers and serial numbers are easily forged.

### The Solution

**RxBlock** is an **Enterprise-Grade Hybrid Blockchain Traceability System** built to solve this crisis from the ground up.

The core insight is architectural: the system does **not** try to store everything on the blockchain (which would be prohibitively expensive and slow). Instead, it uses a **Hybrid On-Chain / Off-Chain model** — combining the immutability and trustlessness of a public blockchain ledger with the speed and flexibility of a traditional relational database.

Here's what that means in practice:

| Layer | Technology | What It Stores | Why |
|---|---|---|---|
| **On-Chain (Blockchain)** | Solidity / Ethereum | Batch ID, cryptographic data hash, quantity | Immutable, tamper-proof "source of truth" |
| **Off-Chain (Database)** | MySQL | Drug name, dates, manufacturer, GPS logs, unit status | Fast queries, rich metadata, cost-efficient |
| **Decentralized Storage** | IPFS / Pinata | Manufacturer's medical license file | Permanent, censorship-resistant document proof |

The blockchain stores a **SHA-256 cryptographic seal** of the drug batch at the time of manufacture. Any tampering with the off-chain database — changing a date, a drug name, or a quantity — will cause the recalculated hash to **not match** the sealed hash on the blockchain. This mismatch is the tamper detection mechanism.

### The Social Impact

For society, this system means:

- **Guaranteed Patient Safety:** Any patient with a smartphone can scan a QR code on a single strip of medication and instantly verify its entire journey — from the manufacturer's production floor, through distributors, to the pharmacy shelf.
- **Manufacturer Accountability:** Every batch is cryptographically linked to a verified medical license stored on IPFS, making it impossible for unregistered parties to inject fake drugs into the supply chain.
- **Regulatory Transparency:** Regulators and auditors gain an immutable, timestamped audit trail of every transfer of ownership — without relying on any single company's internal records.
- **Strip-Level Granularity:** The system tracks medications down to **individual strip-level units**, not just batch-level. This means a single sold strip can be flagged, preventing re-scanning attacks (where a QR code is photocopied and placed on a fake strip).

---

## 2. Real-World Workflow (IRL PoV)

The system mirrors the physical pharmaceutical supply chain through four distinct phases. Each phase maps directly to a real-world actor and a combination of on-chain and off-chain operations.

```
[Manufacturer] ──→ [Distributor] ──→ [Pharmacy] ──→ [Patient]
    Genesis          Handoff        Retail Entry    Verification
  (Blockchain        (Ownership      (Ownership      (Hash Cross-
   Sealing)          Transfer)       Transfer)       Reference)
```

---

### Phase 1 — The Genesis (Manufacturer)

**Real-World Action:** A licensed pharmaceutical company has produced a new batch of drugs and wants to register it on the system.

**What Happens:**

1. The manufacturer logs into the **RxBlock portal** using their registered Ethereum wallet address.
2. They upload their official **Medical License** document. This file is immediately uploaded to **IPFS** (InterPlanetary File System) via the Pinata pinning service. IPFS returns a unique, permanent content hash (`CID`) — this hash is the immutable proof that this exact license document exists and has not been altered.
3. The manufacturer fills in batch details:
   - Drug Name (e.g., "Amoxicillin 500mg")
   - Manufacturing Date
   - Expiration Date
   - Quantity (number of strips)
4. The backend generates a **SHA-256 cryptographic hash** of all this data combined (including a precisely formatted UTC timestamp — see [Technical Flow](#4-technical-flow-of-the-program) for why timestamp precision matters).
5. A **Solidity smart contract** is called via Web3.py. The transaction writes to the Ethereum blockchain, permanently recording:
   - The Batch ID
   - The SHA-256 data hash
   - The quantity
6. The system generates:
   - One **Master QR code** for the entire shipping pallet.
   - One **unique QR code per individual strip**, each encoding the Batch ID and a unique Strip ID.

At the end of Phase 1, the batch exists on the blockchain. Its cryptographic fingerprint is permanently sealed.

---

### Phase 2 — The Handoff (Distributor)

**Real-World Action:** The physical shipment arrives at a regional distribution warehouse.

**What Happens:**

1. A warehouse employee at the distributor company scans the **Master QR code** on the pallet.
2. The system looks up the Batch ID on the blockchain to confirm it exists and that its current owner is the originating manufacturer's wallet.
3. The **smart contract executes an ownership transfer** — the batch's `currentOwner` field on-chain is updated to the **distributor's Ethereum wallet address**. This is a cryptographically signed transaction; it cannot be faked or reversed without the private key.
4. The **off-chain MySQL database** logs an event record containing:
   - Timestamp of the scan
   - GPS coordinates of the distribution center
   - The distributor's identity
5. The batch is now formally "owned" by the distributor on the immutable ledger.

---

### Phase 3 — The Retail Level (Pharmacy)

**Real-World Action:** The distributor ships smaller packages to local pharmacies. The delivery arrives.

**What Happens:**

1. The pharmacist or receiving staff scans the package QR code upon arrival.
2. The blockchain verifies the current owner is the distributor and executes another ownership transfer — the batch's `currentOwner` is updated to the **pharmacy's wallet address**.
3. The off-chain database logs the pharmacy's details, GPS location, and timestamp.
4. The batch is now locked at the pharmacy level. Any attempt to re-scan at a different pharmacy would fail, as the blockchain already records this batch as belonging to a specific pharmacy address.

---

### Phase 4 — The Consumer Verification (Patient)

**Real-World Action:** A customer purchases a strip of medication at the pharmacy counter. The patient wants to verify authenticity before consuming it.

**What Happens:**

1. The **pharmacist's Point-of-Sale (PoS) system** marks that specific strip's unique ID as `status: SOLD` in the MySQL database.
2. The patient scans the **QR code on the strip** using any smartphone camera.
3. The system performs a **cross-reference integrity check**:
   - It fetches the off-chain metadata from MySQL (drug name, manufacturer, dates, etc.).
   - It recalculates the SHA-256 hash from that off-chain data using the **exact original timestamp**.
   - It fetches the on-chain hash stored in the Ethereum smart contract.
   - It compares the two hashes **strictly**.
4. **Possible outcomes:**
   - **Verified Authentic:** Hashes match, strip status is `SOLD` and not previously claimed → Drug is genuine.
   - **Tampered / Counterfeit:** Hashes do not match → Off-chain data was altered; drug is flagged as compromised.
   - **Already Sold / Duplicate:** Strip ID has already been marked as sold and verified → Possible QR code duplication attack; alert triggered.

---

## 3. Technology Stack

### Backend & API

| Library | Role |
|---|---|
| **Python 3.9+** | Core programming language for all backend logic |
| **FastAPI** | High-performance async web framework; powers all REST API endpoints. Chosen for its native async support and automatic OpenAPI/Swagger documentation generation. |
| **Pydantic** | Data validation and serialization. All incoming request bodies are strictly validated against Pydantic models before any processing occurs, preventing malformed data from entering the system. |
| **Uvicorn** | ASGI server that runs the FastAPI application. Supports async operations natively, which is critical for non-blocking blockchain and database calls. |

### Database (Off-Chain Layer)

| Library | Role |
|---|---|
| **MySQL** | Relational database for storing all heavy metadata — drug details, manufacturer info, per-unit strip tracking rows, GPS logs, and ownership event history. |
| **SQLAlchemy** | Python ORM (Object-Relational Mapper) that abstracts raw SQL queries. Used for **bulk inserts** when generating thousands of strip records per batch, dramatically reducing round-trip time to the database. |

### Blockchain (On-Chain Layer)

| Tool | Role |
|---|---|
| **Solidity** | Language used to write the `DrugSupply.sol` smart contract. The contract defines the data structures and functions for registering batches, transferring ownership, and reading sealed hashes. |
| **Web3.py** | Python library for interacting with the Ethereum blockchain. Handles signing transactions with the private key, calling contract functions, and reading on-chain state. |
| **Ganache** | Local Ethereum testnet that simulates a real blockchain on your machine. Provides pre-funded wallet accounts and an RPC server for development and testing without spending real ETH. |

### Decentralized Storage

| Tool | Role |
|---|---|
| **IPFS** | InterPlanetary File System — a peer-to-peer distributed file system. Medical license documents are stored here so they are permanent, immutable, and not controlled by any single server. |
| **Pinata** | A pinning service that ensures your IPFS files remain accessible. Without a pinning service, files can be garbage-collected from IPFS nodes if no one is hosting them. |

### Utility Libraries

| Library | Role |
|---|---|
| **hashlib** | Python's built-in cryptographic library. Used to compute SHA-256 hashes of batch data for the cryptographic sealing mechanism. |
| **Pillow & qrcode** | Used together to generate QR code images — both the master pallet QR and individual strip QR codes. |
| **python-multipart** | Enables the FastAPI server to accept multipart form data, which is necessary for file uploads (the medical license). |
| **python-dotenv** | Loads environment variables from the `.env` file, keeping sensitive credentials (private keys, API keys) out of the codebase. |

---

## 4. Technical Flow of the Program

The system uses a **Hybrid On-Chain / Off-Chain architecture** to balance security with cost and performance. Storing everything on-chain would make the system extremely slow and prohibitively expensive (Ethereum gas fees scale with data size). Storing everything off-chain would make it vulnerable to tampering. The hybrid approach captures the best of both worlds.

Here is the complete technical lifecycle of a drug batch:

### 4.1 — Data Ingestion

A `POST /batch/register` request hits the FastAPI endpoint. The request body contains:
- Drug metadata fields (validated by Pydantic)
- The manufacturer's Medical License file (as multipart form data)

Pydantic validation rejects malformed requests immediately before any downstream processing.

### 4.2 — IPFS Upload

The Medical License file binary is sent to the **Pinata API**, which pins the file to IPFS. Pinata returns a permanent **CID (Content Identifier)** — a hash of the file's content. This CID is stored in the off-chain database as a reference link.

> **Why IPFS?** A URL pointing to a centralized server can be altered or taken down. An IPFS CID is derived from the content itself — if the file changes even by one byte, the CID changes. This makes it unforgeable proof of document existence.

### 4.3 — Cryptographic Sealing (The SHA-256 Hash)

The backend compiles a dictionary of all batch details:

```python
seal_data = {
    "batch_id": batch_id,
    "drug_name": drug_name,
    "manufacturer": manufacturer_name,
    "mfg_date": manufacturing_date,
    "exp_date": expiration_date,
    "quantity": quantity,
    "license_ipfs": ipfs_cid,
    "timestamp": utc_timestamp  # Microseconds stripped to prevent DB truncation
}
```

> **Why strip microseconds from the timestamp?** MySQL's `DATETIME` type has a precision of 1 second by default. If the original timestamp includes microseconds (e.g., `2024-01-15T10:30:45.123456`), and MySQL stores it as `2024-01-15T10:30:45`, then when the verification step reads the timestamp back from the database and recalculates the hash, the microseconds will be missing — causing the hash to differ from the sealed one even on authentic data. Stripping microseconds at generation time ensures the stored and recalculated values are always identical.

This dictionary is JSON-serialized and hashed using **SHA-256** via `hashlib`. The resulting 64-character hex string is the cryptographic seal.

### 4.4 — On-Chain Transaction

`Web3.py` calls the `registerBatch()` function on the deployed `DrugSupply.sol` contract. The transaction, signed with the manufacturer's private key, writes to the blockchain:

```
Batch ID      → String identifier
Data Hash     → SHA-256 hex string (the cryptographic seal)
Quantity      → Integer (number of strips)
Owner         → msg.sender (manufacturer's wallet address)
```

The transaction is mined into a block. From this point forward, this data is **immutable** — no person, company, or server can change it.

### 4.5 — Off-Chain Storage

After the blockchain transaction confirms, the backend performs **bulk inserts** into MySQL:
- A `batches` table row with all the rich metadata (drug name, dates, IPFS link, etc.)
- `N` rows in a `units` table — one per strip — each with a unique `strip_id` and `status: AVAILABLE`

SQLAlchemy's bulk insert is used here to insert potentially thousands of strip rows in a single database operation rather than one row at a time.

### 4.6 — Verification (GET Request / Patient Scan)

When a patient scans a strip QR code:

1. The `strip_id` is extracted from the QR code.
2. A `GET /verify/{strip_id}` request is made.
3. The backend fetches the strip's `batch_id` and the batch's full metadata from **MySQL**.
4. The backend fetches the `dataHash` from the **Ethereum smart contract** using the `batch_id`.
5. The backend **recomputes the SHA-256 hash** from the MySQL data using the exact same original timestamp.
6. The recomputed hash is compared against the on-chain hash.

```
Recomputed Hash == On-Chain Hash  → AUTHENTIC
Recomputed Hash != On-Chain Hash  → TAMPERED / COUNTERFEIT
Strip Status == "SOLD" (already)  → DUPLICATE QR ATTACK
```

This is the core security guarantee of the system. Tampering with **any single field** in the database will cause the hash comparison to fail.

---

## 5. How to Run This on Your Own Machine

### Prerequisites

Ensure the following are installed before proceeding:

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.9+ | Core runtime |
| MySQL Server | 8.0+ | For the off-chain database |
| Ganache | Latest GUI or CLI | Local Ethereum testnet |
| Node.js & npm | 16+ | Required if compiling the Solidity contract manually via Truffle |
| Remix IDE | (Browser-based) | Easiest way to compile and deploy `DrugSupply.sol` |
| Pinata Account | Free tier | For IPFS file pinning; sign up at [pinata.cloud](https://pinata.cloud) |

---

### Step 1 — Setup the Database

1. Open your MySQL client (MySQL Workbench, DBeaver, or the `mysql` CLI).
2. Create a new database for the project:
   ```sql
   CREATE DATABASE rx_block_db;
   ```
3. Note your MySQL **username**, **password**, and **host** (usually `localhost`). These will go into the `.env` file in Step 3.
4. The application uses **SQLAlchemy** to auto-create the required tables on first run — you do not need to create tables manually.

---

### Step 2 — Setup the Blockchain

1. **Open Ganache** and click **Quickstart (Ethereum)**. This spins up a local blockchain with 10 pre-funded accounts.
2. Note the **RPC Server URL** displayed at the top (typically `http://127.0.0.1:7545`).
3. Click on the key icon next to the **first account** and copy its **Private Key**.
4. **Deploy the Smart Contract:**
   - Open [Remix IDE](https://remix.ethereum.org) in your browser.
   - Create a new file named `DrugSupply.sol` and paste the contract code.
   - In the **Solidity Compiler** tab, select a version compatible with the contract and set the **EVM version to `paris`** (important — newer EVM versions may not be supported by Ganache's version of the EVM).
   - Compile the contract.
   - In the **Deploy & Run Transactions** tab, change the **Environment** to `Custom - External Http Provider` and enter your Ganache RPC URL.
   - Click **Deploy**.
5. After deployment, copy:
   - The **Contract Address** (shown in the Deployed Contracts panel at the bottom left).
   - The **Contract ABI** (click the copy icon in the Compilation Details panel).
6. Save the ABI as a file named `abi.json` in the root directory of the project.

---

### Step 3 — Environment Variables

Create a `.env` file in the root of the project directory. **Never commit this file to version control.**

```env
# Blockchain Configuration
RPC_URL=http://127.0.0.1:7545
PRIVATE_KEY=your_ganache_private_key_here
CONTRACT_ADDRESS=your_deployed_contract_address_here

# Database Configuration
DATABASE_URL=mysql+pymysql://your_mysql_username:your_mysql_password@localhost/rx_block_db

# IPFS / Pinata Configuration
PINATA_API_KEY=your_pinata_api_key_here
PINATA_SECRET_KEY=your_pinata_secret_api_key_here
```

> **Where to get Pinata keys:** Sign up at [pinata.cloud](https://pinata.cloud) → Go to **API Keys** → **New Key** → Enable `pinFileToIPFS` permission → Generate. Copy the **API Key** and **API Secret**.

---

### Step 4 — Install Dependencies

Navigate to the project root directory in your terminal and run:

```bash
pip install fastapi uvicorn sqlalchemy pymysql web3 pydantic python-multipart pillow qrcode python-dotenv
```

**What each package does:**

| Package | Purpose |
|---|---|
| `fastapi` | The web framework powering the API |
| `uvicorn` | The ASGI server that runs FastAPI |
| `sqlalchemy` | ORM for MySQL interactions |
| `pymysql` | MySQL driver used by SQLAlchemy |
| `web3` | Ethereum / blockchain interaction library |
| `pydantic` | Request body validation |
| `python-multipart` | File upload support in FastAPI |
| `pillow` | Image processing for QR code generation |
| `qrcode` | QR code generation library |
| `python-dotenv` | Loads variables from the `.env` file |

---

### Step 5 — Run the Server

Start the FastAPI server with hot-reload enabled (auto-restarts on code changes):

```bash
uvicorn main:app --reload
```

Once running, you will see output like:

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process using statreload
```

**Access the API:**

| Interface | URL |
|---|---|
| **Swagger UI** (Interactive docs) | [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) |
| **ReDoc** (Alternative docs) | [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc) |
| **Raw OpenAPI Schema** | [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json) |

Use the **Swagger UI** to test all endpoints interactively — register a batch, transfer ownership, and verify a strip — without needing a frontend or Postman.

---

## 6. Contributors & License

### Contributors

This project was developed as an **Enterprise Blockchain Traceability Initiative** — a research and engineering effort to demonstrate how hybrid blockchain architectures can be applied to solve real-world pharmaceutical supply chain integrity problems. checkout the contributors.md to view everyone who contributed.

### License

This project is licensed under the **MIT License**.

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.# RxBlock — Hybrid Blockchain Drug Traceability System

> *Eliminating counterfeit medications through immutable, cryptographically sealed supply chains.*

---

## Table of Contents

- [1. What the Project Is About & How It Helps Society](#1-what-the-project-is-about--how-it-helps-society)
- [2. Real-World Workflow (IRL PoV)](#2-real-world-workflow-irl-pov)
  - [Phase 1 — The Genesis (Manufacturer)](#phase-1--the-genesis-manufacturer)
  - [Phase 2 — The Handoff (Distributor)](#phase-2--the-handoff-distributor)
  - [Phase 3 — The Retail Level (Pharmacy)](#phase-3--the-retail-level-pharmacy)
  - [Phase 4 — The Consumer Verification (Patient)](#phase-4--the-consumer-verification-patient)
- [3. Technology Stack](#3-technology-stack)
- [4. Technical Flow of the Program](#4-technical-flow-of-the-program)
- [5. How to Run This on Your Own Machine](#5-how-to-run-this-on-your-own-machine)
  - [Prerequisites](#prerequisites)
  - [Step 1 — Setup the Database](#step-1--setup-the-database)
  - [Step 2 — Setup the Blockchain](#step-2--setup-the-blockchain)
  - [Step 3 — Environment Variables](#step-3--environment-variables)
  - [Step 4 — Install Dependencies](#step-4--install-dependencies)
  - [Step 5 — Run the Server](#step-5--run-the-server)
- [6. Contributors & License](#6-contributors--license)

---

## 1. What the Project Is About & How It Helps Society

### The Problem

Counterfeit medication is a **silent global epidemic**. According to the World Health Organization (WHO), falsified and substandard medicines account for an estimated **1 in 10 medical products** in low- and middle-income countries. The consequences are catastrophic:

- **Patient Deaths:** Patients unknowingly consume fake drugs with no active ingredient, wrong dosages, or toxic substitutes — often in life-threatening situations where the drug is their only recourse.
- **Economic Damage:** The global counterfeit drug market is valued at over **$200 billion annually**, siphoning revenue away from legitimate pharmaceutical manufacturers and healthcare systems.
- **Undermined Trust:** When counterfeit drugs cause harm or fail to work, public trust in healthcare and medicine collapses — especially in regions already dealing with weak health infrastructure.
- **No Reliable Verification:** Today, neither a patient nor even a pharmacist has a simple, trustworthy mechanism to confirm that a drug is authentic, unexpired, or untampered with. Holographic stickers and serial numbers are easily forged.

### The Solution

**RxBlock** is an **Enterprise-Grade Hybrid Blockchain Traceability System** built to solve this crisis from the ground up.

The core insight is architectural: the system does **not** try to store everything on the blockchain (which would be prohibitively expensive and slow). Instead, it uses a **Hybrid On-Chain / Off-Chain model** — combining the immutability and trustlessness of a public blockchain ledger with the speed and flexibility of a traditional relational database.

Here's what that means in practice:

| Layer | Technology | What It Stores | Why |
|---|---|---|---|
| **On-Chain (Blockchain)** | Solidity / Ethereum | Batch ID, cryptographic data hash, quantity | Immutable, tamper-proof "source of truth" |
| **Off-Chain (Database)** | MySQL | Drug name, dates, manufacturer, GPS logs, unit status | Fast queries, rich metadata, cost-efficient |
| **Decentralized Storage** | IPFS / Pinata | Manufacturer's medical license file | Permanent, censorship-resistant document proof |

The blockchain stores a **SHA-256 cryptographic seal** of the drug batch at the time of manufacture. Any tampering with the off-chain database — changing a date, a drug name, or a quantity — will cause the recalculated hash to **not match** the sealed hash on the blockchain. This mismatch is the tamper detection mechanism.

### The Social Impact

For society, this system means:

- **Guaranteed Patient Safety:** Any patient with a smartphone can scan a QR code on a single strip of medication and instantly verify its entire journey — from the manufacturer's production floor, through distributors, to the pharmacy shelf.
- **Manufacturer Accountability:** Every batch is cryptographically linked to a verified medical license stored on IPFS, making it impossible for unregistered parties to inject fake drugs into the supply chain.
- **Regulatory Transparency:** Regulators and auditors gain an immutable, timestamped audit trail of every transfer of ownership — without relying on any single company's internal records.
- **Strip-Level Granularity:** The system tracks medications down to **individual strip-level units**, not just batch-level. This means a single sold strip can be flagged, preventing re-scanning attacks (where a QR code is photocopied and placed on a fake strip).

---

## 2. Real-World Workflow (IRL PoV)

The system mirrors the physical pharmaceutical supply chain through four distinct phases. Each phase maps directly to a real-world actor and a combination of on-chain and off-chain operations.

```
[Manufacturer] ──→ [Distributor] ──→ [Pharmacy] ──→ [Patient]
    Genesis          Handoff        Retail Entry    Verification
  (Blockchain        (Ownership      (Ownership      (Hash Cross-
   Sealing)          Transfer)       Transfer)       Reference)
```

---

### Phase 1 — The Genesis (Manufacturer)

**Real-World Action:** A licensed pharmaceutical company has produced a new batch of drugs and wants to register it on the system.

**What Happens:**

1. The manufacturer logs into the **RxBlock portal** using their registered Ethereum wallet address.
2. They upload their official **Medical License** document. This file is immediately uploaded to **IPFS** (InterPlanetary File System) via the Pinata pinning service. IPFS returns a unique, permanent content hash (`CID`) — this hash is the immutable proof that this exact license document exists and has not been altered.
3. The manufacturer fills in batch details:
   - Drug Name (e.g., "Amoxicillin 500mg")
   - Manufacturing Date
   - Expiration Date
   - Quantity (number of strips)
4. The backend generates a **SHA-256 cryptographic hash** of all this data combined (including a precisely formatted UTC timestamp — see [Technical Flow](#4-technical-flow-of-the-program) for why timestamp precision matters).
5. A **Solidity smart contract** is called via Web3.py. The transaction writes to the Ethereum blockchain, permanently recording:
   - The Batch ID
   - The SHA-256 data hash
   - The quantity
6. The system generates:
   - One **Master QR code** for the entire shipping pallet.
   - One **unique QR code per individual strip**, each encoding the Batch ID and a unique Strip ID.

At the end of Phase 1, the batch exists on the blockchain. Its cryptographic fingerprint is permanently sealed.

---

### Phase 2 — The Handoff (Distributor)

**Real-World Action:** The physical shipment arrives at a regional distribution warehouse.

**What Happens:**

1. A warehouse employee at the distributor company scans the **Master QR code** on the pallet.
2. The system looks up the Batch ID on the blockchain to confirm it exists and that its current owner is the originating manufacturer's wallet.
3. The **smart contract executes an ownership transfer** — the batch's `currentOwner` field on-chain is updated to the **distributor's Ethereum wallet address**. This is a cryptographically signed transaction; it cannot be faked or reversed without the private key.
4. The **off-chain MySQL database** logs an event record containing:
   - Timestamp of the scan
   - GPS coordinates of the distribution center
   - The distributor's identity
5. The batch is now formally "owned" by the distributor on the immutable ledger.

---

### Phase 3 — The Retail Level (Pharmacy)

**Real-World Action:** The distributor ships smaller packages to local pharmacies. The delivery arrives.

**What Happens:**

1. The pharmacist or receiving staff scans the package QR code upon arrival.
2. The blockchain verifies the current owner is the distributor and executes another ownership transfer — the batch's `currentOwner` is updated to the **pharmacy's wallet address**.
3. The off-chain database logs the pharmacy's details, GPS location, and timestamp.
4. The batch is now locked at the pharmacy level. Any attempt to re-scan at a different pharmacy would fail, as the blockchain already records this batch as belonging to a specific pharmacy address.

---

### Phase 4 — The Consumer Verification (Patient)

**Real-World Action:** A customer purchases a strip of medication at the pharmacy counter. The patient wants to verify authenticity before consuming it.

**What Happens:**

1. The **pharmacist's Point-of-Sale (PoS) system** marks that specific strip's unique ID as `status: SOLD` in the MySQL database.
2. The patient scans the **QR code on the strip** using any smartphone camera.
3. The system performs a **cross-reference integrity check**:
   - It fetches the off-chain metadata from MySQL (drug name, manufacturer, dates, etc.).
   - It recalculates the SHA-256 hash from that off-chain data using the **exact original timestamp**.
   - It fetches the on-chain hash stored in the Ethereum smart contract.
   - It compares the two hashes **strictly**.
4. **Possible outcomes:**
   - **Verified Authentic:** Hashes match, strip status is `SOLD` and not previously claimed → Drug is genuine.
   - **Tampered / Counterfeit:** Hashes do not match → Off-chain data was altered; drug is flagged as compromised.
   - **Already Sold / Duplicate:** Strip ID has already been marked as sold and verified → Possible QR code duplication attack; alert triggered.

---

## 3. Technology Stack

### Backend & API

| Library | Role |
|---|---|
| **Python 3.9+** | Core programming language for all backend logic |
| **FastAPI** | High-performance async web framework; powers all REST API endpoints. Chosen for its native async support and automatic OpenAPI/Swagger documentation generation. |
| **Pydantic** | Data validation and serialization. All incoming request bodies are strictly validated against Pydantic models before any processing occurs, preventing malformed data from entering the system. |
| **Uvicorn** | ASGI server that runs the FastAPI application. Supports async operations natively, which is critical for non-blocking blockchain and database calls. |

### Database (Off-Chain Layer)

| Library | Role |
|---|---|
| **MySQL** | Relational database for storing all heavy metadata — drug details, manufacturer info, per-unit strip tracking rows, GPS logs, and ownership event history. |
| **SQLAlchemy** | Python ORM (Object-Relational Mapper) that abstracts raw SQL queries. Used for **bulk inserts** when generating thousands of strip records per batch, dramatically reducing round-trip time to the database. |

### Blockchain (On-Chain Layer)

| Tool | Role |
|---|---|
| **Solidity** | Language used to write the `DrugSupply.sol` smart contract. The contract defines the data structures and functions for registering batches, transferring ownership, and reading sealed hashes. |
| **Web3.py** | Python library for interacting with the Ethereum blockchain. Handles signing transactions with the private key, calling contract functions, and reading on-chain state. |
| **Ganache** | Local Ethereum testnet that simulates a real blockchain on your machine. Provides pre-funded wallet accounts and an RPC server for development and testing without spending real ETH. |

### Decentralized Storage

| Tool | Role |
|---|---|
| **IPFS** | InterPlanetary File System — a peer-to-peer distributed file system. Medical license documents are stored here so they are permanent, immutable, and not controlled by any single server. |
| **Pinata** | A pinning service that ensures your IPFS files remain accessible. Without a pinning service, files can be garbage-collected from IPFS nodes if no one is hosting them. |

### Utility Libraries

| Library | Role |
|---|---|
| **hashlib** | Python's built-in cryptographic library. Used to compute SHA-256 hashes of batch data for the cryptographic sealing mechanism. |
| **Pillow & qrcode** | Used together to generate QR code images — both the master pallet QR and individual strip QR codes. |
| **python-multipart** | Enables the FastAPI server to accept multipart form data, which is necessary for file uploads (the medical license). |
| **python-dotenv** | Loads environment variables from the `.env` file, keeping sensitive credentials (private keys, API keys) out of the codebase. |

---

## 4. Technical Flow of the Program

The system uses a **Hybrid On-Chain / Off-Chain architecture** to balance security with cost and performance. Storing everything on-chain would make the system extremely slow and prohibitively expensive (Ethereum gas fees scale with data size). Storing everything off-chain would make it vulnerable to tampering. The hybrid approach captures the best of both worlds.

Here is the complete technical lifecycle of a drug batch:

### 4.1 — Data Ingestion

A `POST /batch/register` request hits the FastAPI endpoint. The request body contains:
- Drug metadata fields (validated by Pydantic)
- The manufacturer's Medical License file (as multipart form data)

Pydantic validation rejects malformed requests immediately before any downstream processing.

### 4.2 — IPFS Upload

The Medical License file binary is sent to the **Pinata API**, which pins the file to IPFS. Pinata returns a permanent **CID (Content Identifier)** — a hash of the file's content. This CID is stored in the off-chain database as a reference link.

> **Why IPFS?** A URL pointing to a centralized server can be altered or taken down. An IPFS CID is derived from the content itself — if the file changes even by one byte, the CID changes. This makes it unforgeable proof of document existence.

### 4.3 — Cryptographic Sealing (The SHA-256 Hash)

The backend compiles a dictionary of all batch details:

```python
seal_data = {
    "batch_id": batch_id,
    "drug_name": drug_name,
    "manufacturer": manufacturer_name,
    "mfg_date": manufacturing_date,
    "exp_date": expiration_date,
    "quantity": quantity,
    "license_ipfs": ipfs_cid,
    "timestamp": utc_timestamp  # Microseconds stripped to prevent DB truncation
}
```

> **Why strip microseconds from the timestamp?** MySQL's `DATETIME` type has a precision of 1 second by default. If the original timestamp includes microseconds (e.g., `2024-01-15T10:30:45.123456`), and MySQL stores it as `2024-01-15T10:30:45`, then when the verification step reads the timestamp back from the database and recalculates the hash, the microseconds will be missing — causing the hash to differ from the sealed one even on authentic data. Stripping microseconds at generation time ensures the stored and recalculated values are always identical.

This dictionary is JSON-serialized and hashed using **SHA-256** via `hashlib`. The resulting 64-character hex string is the cryptographic seal.

### 4.4 — On-Chain Transaction

`Web3.py` calls the `registerBatch()` function on the deployed `DrugSupply.sol` contract. The transaction, signed with the manufacturer's private key, writes to the blockchain:

```
Batch ID      → String identifier
Data Hash     → SHA-256 hex string (the cryptographic seal)
Quantity      → Integer (number of strips)
Owner         → msg.sender (manufacturer's wallet address)
```

The transaction is mined into a block. From this point forward, this data is **immutable** — no person, company, or server can change it.

### 4.5 — Off-Chain Storage

After the blockchain transaction confirms, the backend performs **bulk inserts** into MySQL:
- A `batches` table row with all the rich metadata (drug name, dates, IPFS link, etc.)
- `N` rows in a `units` table — one per strip — each with a unique `strip_id` and `status: AVAILABLE`

SQLAlchemy's bulk insert is used here to insert potentially thousands of strip rows in a single database operation rather than one row at a time.

### 4.6 — Verification (GET Request / Patient Scan)

When a patient scans a strip QR code:

1. The `strip_id` is extracted from the QR code.
2. A `GET /verify/{strip_id}` request is made.
3. The backend fetches the strip's `batch_id` and the batch's full metadata from **MySQL**.
4. The backend fetches the `dataHash` from the **Ethereum smart contract** using the `batch_id`.
5. The backend **recomputes the SHA-256 hash** from the MySQL data using the exact same original timestamp.
6. The recomputed hash is compared against the on-chain hash.

```
Recomputed Hash == On-Chain Hash  → AUTHENTIC
Recomputed Hash != On-Chain Hash  → TAMPERED / COUNTERFEIT
Strip Status == "SOLD" (already)  → DUPLICATE QR ATTACK
```

This is the core security guarantee of the system. Tampering with **any single field** in the database will cause the hash comparison to fail.

---

## 5. How to Run This on Your Own Machine

### Prerequisites

Ensure the following are installed before proceeding:

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.9+ | Core runtime |
| MySQL Server | 8.0+ | For the off-chain database |
| Ganache | Latest GUI or CLI | Local Ethereum testnet |
| Node.js & npm | 16+ | Required if compiling the Solidity contract manually via Truffle |
| Remix IDE | (Browser-based) | Easiest way to compile and deploy `DrugSupply.sol` |
| Pinata Account | Free tier | For IPFS file pinning; sign up at [pinata.cloud](https://pinata.cloud) |

---

### Step 1 — Setup the Database

1. Open your MySQL client (MySQL Workbench, DBeaver, or the `mysql` CLI).
2. Create a new database for the project:
   ```sql
   CREATE DATABASE rx_block_db;
   ```
3. Note your MySQL **username**, **password**, and **host** (usually `localhost`). These will go into the `.env` file in Step 3.
4. The application uses **SQLAlchemy** to auto-create the required tables on first run — you do not need to create tables manually.

---

### Step 2 — Setup the Blockchain

1. **Open Ganache** and click **Quickstart (Ethereum)**. This spins up a local blockchain with 10 pre-funded accounts.
2. Note the **RPC Server URL** displayed at the top (typically `http://127.0.0.1:7545`).
3. Click on the key icon next to the **first account** and copy its **Private Key**.
4. **Deploy the Smart Contract:**
   - Open [Remix IDE](https://remix.ethereum.org) in your browser.
   - Create a new file named `DrugSupply.sol` and paste the contract code.
   - In the **Solidity Compiler** tab, select a version compatible with the contract and set the **EVM version to `paris`** (important — newer EVM versions may not be supported by Ganache's version of the EVM).
   - Compile the contract.
   - In the **Deploy & Run Transactions** tab, change the **Environment** to `Custom - External Http Provider` and enter your Ganache RPC URL.
   - Click **Deploy**.
5. After deployment, copy:
   - The **Contract Address** (shown in the Deployed Contracts panel at the bottom left).
   - The **Contract ABI** (click the copy icon in the Compilation Details panel).
6. Save the ABI as a file named `abi.json` in the root directory of the project.

---

### Step 3 — Environment Variables

Create a `.env` file in the root of the project directory. **Never commit this file to version control.**

```env
# Blockchain Configuration
RPC_URL=http://127.0.0.1:7545
PRIVATE_KEY=your_ganache_private_key_here
CONTRACT_ADDRESS=your_deployed_contract_address_here

# Database Configuration
DATABASE_URL=mysql+pymysql://your_mysql_username:your_mysql_password@localhost/rx_block_db

# IPFS / Pinata Configuration
PINATA_API_KEY=your_pinata_api_key_here
PINATA_SECRET_KEY=your_pinata_secret_api_key_here
```

> **Where to get Pinata keys:** Sign up at [pinata.cloud](https://pinata.cloud) → Go to **API Keys** → **New Key** → Enable `pinFileToIPFS` permission → Generate. Copy the **API Key** and **API Secret**.

---

### Step 4 — Install Dependencies

Navigate to the project root directory in your terminal and run:

```bash
pip install fastapi uvicorn sqlalchemy pymysql web3 pydantic python-multipart pillow qrcode python-dotenv
```

**What each package does:**

| Package | Purpose |
|---|---|
| `fastapi` | The web framework powering the API |
| `uvicorn` | The ASGI server that runs FastAPI |
| `sqlalchemy` | ORM for MySQL interactions |
| `pymysql` | MySQL driver used by SQLAlchemy |
| `web3` | Ethereum / blockchain interaction library |
| `pydantic` | Request body validation |
| `python-multipart` | File upload support in FastAPI |
| `pillow` | Image processing for QR code generation |
| `qrcode` | QR code generation library |
| `python-dotenv` | Loads variables from the `.env` file |

---

### Step 5 — Run the Server

Start the FastAPI server with hot-reload enabled (auto-restarts on code changes):

```bash
uvicorn main:app --reload
```

Once running, you will see output like:

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process using statreload
```

**Access the API:**

| Interface | URL |
|---|---|
| **Swagger UI** (Interactive docs) | [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) |
| **ReDoc** (Alternative docs) | [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc) |
| **Raw OpenAPI Schema** | [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json) |

Use the **Swagger UI** to test all endpoints interactively — register a batch, transfer ownership, and verify a strip — without needing a frontend or Postman.

---

## 6. Contributors & License

### Contributors

This project was developed as an **Enterprise Blockchain Traceability Initiative** — a research and engineering effort to demonstrate how hybrid blockchain architectures can be applied to solve real-world pharmaceutical supply chain integrity problems. checkout the contributors.md to view everyone who contributed.

### License

This project is licensed under the **MIT License**.

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

See the `LICENSE` file in the repository root for the full license text.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

See the `LICENSE` file in the repository root for the full license text.
