# Architecture

RxBlock uses a **Hybrid On-Chain / Off-Chain architecture**. The blockchain stores a cryptographic seal (SHA-256 hash) of each drug batch, acting as an immutable source of truth, while a relational database stores the rich, queryable metadata. A mismatch between the recomputed off-chain hash and the sealed on-chain hash is the system's tamper-detection mechanism.

## System Architecture

```mermaid
flowchart TD
    subgraph Client Layer
        M[Manufacturer]
        DI[Distributor]
        PH[Pharmacy]
        PT[Patient]
    end

    subgraph API Layer
        API[FastAPI Backend]
    end

    subgraph Off-Chain
        DB[(MySQL Database)]
    end

    subgraph On-Chain
        SC[DrugSupply.sol Smart Contract]
        ETH[(Ethereum / Ganache)]
    end

    subgraph Decentralized Storage
        IPFS[IPFS via Pinata]
    end

    M -->|Register batch + license| API
    API -->|Pin medical license| IPFS
    IPFS -->|Returns CID| API
    API -->|Compute SHA-256 seal| API
    API -->|registerBatch: hash, quantity, owner| SC
    SC --> ETH
    API -->|Bulk insert batch + strip records| DB

    DI -->|Scan master QR: ownership transfer| API
    PH -->|Scan package QR: ownership transfer| API
    API -->|Update currentOwner| SC
    API -->|Log GPS + timestamp event| DB

    PT -->|Scan strip QR to verify| API
    API -->|Fetch metadata| DB
    API -->|Fetch sealed hash| SC
    API -->|Recompute hash & compare| API
    API -->|Authentic / Tampered / Duplicate result| PT

    style M fill:#4f46e5,color:#fff
    style DI fill:#4f46e5,color:#fff
    style PH fill:#4f46e5,color:#fff
    style PT fill:#4f46e5,color:#fff
    style API fill:#10b981,color:#fff
    style DB fill:#3b82f6,color:#fff
    style SC fill:#f59e0b,color:#000
    style ETH fill:#f59e0b,color:#000
    style IPFS fill:#000,color:#fff
```

## Supply Chain Lifecycle

```mermaid
flowchart LR
    A["Phase 1: Genesis\n(Manufacturer)\nBlockchain Sealing"] -->
    B["Phase 2: Handoff\n(Distributor)\nOwnership Transfer"] -->
    C["Phase 3: Retail Entry\n(Pharmacy)\nOwnership Transfer"] -->
    D["Phase 4: Verification\n(Patient)\nHash Cross-Reference"]

    style A fill:#4f46e5,color:#fff
    style B fill:#10b981,color:#fff
    style C fill:#f59e0b,color:#000
    style D fill:#3b82f6,color:#fff
```

## Verification Logic

```mermaid
flowchart TD
    Start([Patient scans strip QR]) --> Fetch[Fetch batch metadata from MySQL]
    Fetch --> Recompute[Recompute SHA-256 hash from metadata]
    Recompute --> FetchChain[Fetch sealed hash from smart contract]
    FetchChain --> Compare{Recomputed hash\nmatches on-chain hash?}
    Compare -->|No| Tampered[Result: TAMPERED / COUNTERFEIT]
    Compare -->|Yes| SoldCheck{Strip already\nmarked SOLD?}
    SoldCheck -->|Yes| Duplicate[Result: DUPLICATE QR ATTACK]
    SoldCheck -->|No| Authentic[Result: VERIFIED AUTHENTIC]

    style Tampered fill:#ef4444,color:#fff
    style Duplicate fill:#ef4444,color:#fff
    style Authentic fill:#10b981,color:#fff
```

## Layer Summary

| Layer | Technology | Responsibility |
|---|---|---|
| On-Chain | Solidity / Ethereum (via Ganache locally) | Immutable batch ID, cryptographic hash, quantity, and current owner |
| Off-Chain | MySQL (via SQLAlchemy) | Drug metadata, per-strip status, GPS logs, ownership event history |
| Decentralized Storage | IPFS / Pinata | Manufacturer's medical license document, referenced by CID |
| API | FastAPI, Pydantic, Web3.py | Validates requests, coordinates on-chain writes and off-chain storage, performs verification |
