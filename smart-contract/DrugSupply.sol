// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract DrugSupply {

    // -----------------------------
    // ENUMS
    // -----------------------------

    enum Role {
        NONE,
        TIER1_MANUFACTURER,
        TIER2_MANUFACTURER,
        DISTRIBUTOR,
        PHARMACY,
        VALIDATOR
    }

    enum Status {
        NONE,
        CREATED,
        IN_DISTRIBUTION,
        AT_DISTRIBUTOR, // Added: To track when it physically sits at the warehouse
        AT_PHARMACY,
        SOLD
    }

    // -----------------------------
    // STRUCTS
    // -----------------------------

    struct Batch {
        string id;
        string parentId;
        string mfgDate;
        string expDate;
        string ipfsHash;

        uint256 totalQuantity;
        uint256 soldQuantity;

        address currentOwner;
        address pendingOwner;

        Status status;
        bool exists;
    }

    struct Proposal {
        address candidate;
        Role role;
        uint256 votes;
        bool approved;
    }

    // -----------------------------
    // STORAGE
    // -----------------------------

    mapping(string => Batch) public batches;
    mapping(address => Role) public roles;

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public voted;

    uint256 public proposalCount;
    uint256 public validatorCount;

    uint256 public constant VOTE_THRESHOLD = 3;

    address public owner;

    // -----------------------------
    // EVENTS (Added for Backend/DB Syncing)
    // -----------------------------
    
    event RoleProposed(uint256 indexed proposalId, address indexed candidate, Role role);
    event RoleApproved(address indexed candidate, Role role);
    event BatchCreated(string indexed id, address indexed manufacturer, uint256 quantity);
    event BatchSplit(string indexed parentId, string indexed newId, address indexed to, uint256 quantity);
    event TransferInitiated(string indexed id, address indexed from, address indexed to);
    event BatchAccepted(string indexed id, address indexed newOwner, Status newStatus);
    event UnitsSold(string indexed id, address indexed pharmacy, uint256 quantitySold, uint256 remainingQuantity);

    // -----------------------------
    // MODIFIERS
    // -----------------------------

    modifier onlyValidator() {
        require(roles[msg.sender] == Role.VALIDATOR, "Not validator");
        _;
    }

    // -----------------------------
    // CONSTRUCTOR (BOOTSTRAP)
    // -----------------------------

    constructor() {
        owner = msg.sender;
        roles[msg.sender] = Role.VALIDATOR;
        validatorCount = 1;
    }

    // -----------------------------
    // GOVERNANCE
    // -----------------------------

    function proposeCompany(address _candidate, Role _role) external onlyValidator {
        // Bootstrap first 3 validators
        if (_role == Role.VALIDATOR && validatorCount < 3) {
            roles[_candidate] = Role.VALIDATOR;
            validatorCount++;
            emit RoleApproved(_candidate, _role);
            return;
        }

        proposalCount++;

        proposals[proposalCount] = Proposal({
            candidate: _candidate,
            role: _role,
            votes: 0,
            approved: false
        });

        emit RoleProposed(proposalCount, _candidate, _role);
    }

    function vote(uint256 _proposalId) external onlyValidator {
        Proposal storage p = proposals[_proposalId];

        require(!p.approved, "Already approved");
        require(!voted[_proposalId][msg.sender], "Already voted");

        voted[_proposalId][msg.sender] = true;
        p.votes++;

        if (p.votes >= VOTE_THRESHOLD) {
            roles[p.candidate] = p.role;

            if (p.role == Role.VALIDATOR) {
                validatorCount++;
            }

            p.approved = true;
            emit RoleApproved(p.candidate, p.role);
        }
    }

    // -----------------------------
    // CREATE BATCH
    // -----------------------------

    function createBatch(
        string memory _id,
        string memory _mfgDate,
        string memory _expDate,
        string memory _ipfsHash,
        uint256 _quantity
    ) external {
        require(roles[msg.sender] == Role.TIER1_MANUFACTURER || roles[msg.sender] == Role.TIER2_MANUFACTURER, "Not manufacturer");
        require(!batches[_id].exists, "Batch exists");

        batches[_id] = Batch({
            id: _id,
            parentId: "",
            mfgDate: _mfgDate,
            expDate: _expDate,
            ipfsHash: _ipfsHash,
            totalQuantity: _quantity,
            soldQuantity: 0,
            currentOwner: msg.sender,
            pendingOwner: address(0),
            status: Status.CREATED,
            exists: true
        });

        emit BatchCreated(_id, msg.sender, _quantity);
    }

    // -----------------------------
    // SPLIT BATCH (OPTIONAL)
    // -----------------------------

    function splitBatch(
        string memory _parentId,
        string memory _newId,
        address _to,
        uint256 _quantity
    ) external {
        Batch storage parent = batches[_parentId];

        require(parent.exists, "Parent not found");
        require(parent.currentOwner == msg.sender, "Not owner");
        require(parent.totalQuantity >= _quantity, "Insufficient qty");
        require(!batches[_newId].exists, "Already exists");
        require(roles[_to] == Role.DISTRIBUTOR || roles[_to] == Role.PHARMACY, "Invalid recipient role");

        batches[_newId] = Batch({
            id: _newId,
            parentId: _parentId,
            mfgDate: parent.mfgDate,
            expDate: parent.expDate,
            ipfsHash: parent.ipfsHash,
            totalQuantity: _quantity,
            soldQuantity: 0,
            currentOwner: msg.sender,
            pendingOwner: _to,
            status: Status.IN_DISTRIBUTION,
            exists: true
        });

        parent.totalQuantity -= _quantity;

        emit BatchSplit(_parentId, _newId, _to, _quantity);
    }

    // -----------------------------
    // TRANSFER FULL BATCH (NO SPLIT)
    // -----------------------------

    function transferBatch(
        string memory _id,
        address _to
    ) external {
        Batch storage b = batches[_id];

        require(b.exists, "Not found");
        require(b.currentOwner == msg.sender, "Not owner");

        b.pendingOwner = _to;
        b.status = Status.IN_DISTRIBUTION;

        emit TransferInitiated(_id, msg.sender, _to);
    }

    // -----------------------------
    // ACCEPT OWNERSHIP
    // -----------------------------

    function acceptBatch(string memory _id) external {
        Batch storage b = batches[_id];

        require(b.exists, "Not found");
        require(b.pendingOwner == msg.sender, "Not authorized");

        b.currentOwner = msg.sender;
        b.pendingOwner = address(0);

        // Update status based on who is accepting it
        if (roles[msg.sender] == Role.DISTRIBUTOR) {
            b.status = Status.AT_DISTRIBUTOR;
        } else {
            b.status = Status.IN_DISTRIBUTION;
        }

        emit BatchAccepted(_id, msg.sender, b.status);
    }

    // -----------------------------
    // TRANSFER TO PHARMACY
    // -----------------------------

    function transferToPharmacy(
        string memory _id,
        address _pharmacy
    ) external {
        Batch storage b = batches[_id];

        require(b.exists, "Not found");
        require(b.currentOwner == msg.sender, "Not owner");
        require(roles[_pharmacy] == Role.PHARMACY, "Invalid pharmacy");

        b.pendingOwner = _pharmacy;
        b.status = Status.IN_DISTRIBUTION;

        emit TransferInitiated(_id, msg.sender, _pharmacy);
    }

    // -----------------------------
    // FINAL ACCEPT (PHARMACY)
    // -----------------------------

    function acceptAtPharmacy(string memory _id) external {
        Batch storage b = batches[_id];

        require(b.pendingOwner == msg.sender, "Not authorized");
        require(roles[msg.sender] == Role.PHARMACY, "Only pharmacy can call");

        b.currentOwner = msg.sender;
        b.pendingOwner = address(0);
        b.status = Status.AT_PHARMACY;

        emit BatchAccepted(_id, msg.sender, b.status);
    }

    // -----------------------------
    // SELL UNITS
    // -----------------------------

    function sellUnits(string memory _id, uint256 _quantity) external {
        Batch storage b = batches[_id];

        require(b.exists, "Not found");
        require(roles[msg.sender] == Role.PHARMACY, "Not pharmacy");
        require(b.currentOwner == msg.sender, "Not owner");
        require(b.status == Status.AT_PHARMACY, "Not at pharmacy");

        require(b.soldQuantity + _quantity <= b.totalQuantity, "Exceeds quantity");

        b.soldQuantity += _quantity;

        if (b.soldQuantity == b.totalQuantity) {
            b.status = Status.SOLD;
        }

        uint256 remaining = b.totalQuantity - b.soldQuantity;
        emit UnitsSold(_id, msg.sender, _quantity, remaining);
    }

    // -----------------------------
    // VIEW
    // -----------------------------

    function getBatch(string memory _id) external view returns (Batch memory) {
        require(batches[_id].exists, "Not found");
        return batches[_id];
    }
}