// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract DrugSupply {

    // -----------------------------
    // ENUMS
    // -----------------------------
    enum Role {
        NONE,
        MANUFACTURER,
        DISTRIBUTOR,
        PHARMACY,
        VALIDATOR
    }

    enum Status {
        NONE,
        CREATED,
        IN_TRANSIT_TO_DIST,
        AT_DISTRIBUTOR,
        IN_TRANSIT_TO_PHARM,
        AT_PHARMACY,
        DEPLETED // Used when all units in a batch are sold or split
    }

    // -----------------------------
    // STRUCTS
    // -----------------------------
    struct Batch {
        string id;
        string parentId; // Empty for main batches, populated for splits
        string dataHash; // The SHA-256 seal from your Python backend!
        
        uint256 totalQuantity;
        
        address currentOwner;
        address pendingOwner;
        Status status;
        bool exists;
    }

    // -----------------------------
    // STORAGE
    // -----------------------------
    mapping(string => Batch) public batches;
    mapping(address => Role) public roles;
    
    // NEW: Unit-Level Traceability
    // Maps a specific drug ID (e.g., "101-D15") to its sold status
    mapping(string => bool) public isItemSold; 

    // Governance
    mapping(address => bool) public isValidator;
    address public owner;
    uint256 public validatorCount = 1;

    // -----------------------------
    // EVENTS
    // -----------------------------
    event BatchCreated(string indexed id, address indexed manufacturer, string dataHash);
    event BatchSplit(string indexed parentId, string indexed newId, uint256 quantity);
    
    event ShippedToDistributor(string indexed id, address indexed from, address indexed to);
    event ReceivedAtDistributor(string indexed id, address indexed distributor);
    
    event ShippedToPharmacy(string indexed id, address indexed from, address indexed to);
    event ReceivedAtPharmacy(string indexed id, address indexed pharmacy);
    
    event ItemSold(string indexed batchId, string indexed itemId, address indexed pharmacy);

    // -----------------------------
    // MODIFIERS
    // -----------------------------
    modifier onlyRole(Role _role) {
        require(roles[msg.sender] == _role, "Unauthorized role");
        _;
    }

    modifier onlyBatchOwner(string memory _id) {
        require(batches[_id].exists, "Batch does not exist");
        require(batches[_id].currentOwner == msg.sender, "Not the current owner");
        _;
    }

    // -----------------------------
    // CONSTRUCTOR
    // -----------------------------
    constructor() {
        owner = msg.sender;
        roles[msg.sender] = Role.VALIDATOR;
        isValidator[msg.sender] = true;
    }

    // -----------------------------
    // 1. CREATION & SPLITTING
    // -----------------------------
    function createBatch(
        string memory _id,
        string memory _dataHash,
        uint256 _quantity
    ) external onlyRole(Role.MANUFACTURER) {
        require(!batches[_id].exists, "Batch ID already exists");

        batches[_id] = Batch({
            id: _id,
            parentId: "",
            dataHash: _dataHash,
            totalQuantity: _quantity,
            currentOwner: msg.sender,
            pendingOwner: address(0),
            status: Status.CREATED,
            exists: true
        });

        emit BatchCreated(_id, msg.sender, _dataHash);
    }

    function splitBatch(
        string memory _parentId,
        string memory _newId,
        string memory _childHash,
        uint256 _quantity
    ) external onlyBatchOwner(_parentId) {
        Batch storage parent = batches[_parentId];
        
        require(!batches[_newId].exists, "New Batch ID already exists");
        require(parent.totalQuantity >= _quantity, "Insufficient quantity in parent");
        
        // Create the child batch
        batches[_newId] = Batch({
            id: _newId,
            parentId: _parentId,
            dataHash: _childHash,
            totalQuantity: _quantity,
            currentOwner: msg.sender,
            pendingOwner: address(0),
            status: parent.status, // Inherit current status
            exists: true
        });

        // Deduct from parent
        parent.totalQuantity -= _quantity;
        if (parent.totalQuantity == 0) {
            parent.status = Status.DEPLETED;
        }

        emit BatchSplit(_parentId, _newId, _quantity);
    }

    // -----------------------------
    // 2. MANUFACTURER -> DISTRIBUTOR
    // -----------------------------
    function shipToDistributor(string memory _id, address _distributor) 
        external 
        onlyBatchOwner(_id) 
        onlyRole(Role.MANUFACTURER) 
    {
        require(roles[_distributor] == Role.DISTRIBUTOR, "Recipient is not a distributor");
        
        Batch storage b = batches[_id];
        b.pendingOwner = _distributor;
        b.status = Status.IN_TRANSIT_TO_DIST;

        emit ShippedToDistributor(_id, msg.sender, _distributor);
    }

    function receiveAtDistributor(string memory _id) 
        external 
        onlyRole(Role.DISTRIBUTOR) 
    {
        Batch storage b = batches[_id];
        require(b.pendingOwner == msg.sender, "You are not the pending owner");
        require(b.status == Status.IN_TRANSIT_TO_DIST, "Batch not in transit to distributor");

        b.currentOwner = msg.sender;
        b.pendingOwner = address(0);
        b.status = Status.AT_DISTRIBUTOR;

        emit ReceivedAtDistributor(_id, msg.sender);
    }

    // -----------------------------
    // 3. DISTRIBUTOR -> PHARMACY
    // -----------------------------
    function shipToPharmacy(string memory _id, address _pharmacy) 
        external 
        onlyBatchOwner(_id) 
        onlyRole(Role.DISTRIBUTOR) 
    {
        require(roles[_pharmacy] == Role.PHARMACY, "Recipient is not a pharmacy");
        
        Batch storage b = batches[_id];
        b.pendingOwner = _pharmacy;
        b.status = Status.IN_TRANSIT_TO_PHARM;

        emit ShippedToPharmacy(_id, msg.sender, _pharmacy);
    }

    function receiveAtPharmacy(string memory _id) 
        external 
        onlyRole(Role.PHARMACY) 
    {
        Batch storage b = batches[_id];
        require(b.pendingOwner == msg.sender, "You are not the pending owner");
        require(b.status == Status.IN_TRANSIT_TO_PHARM, "Batch not in transit to pharmacy");

        b.currentOwner = msg.sender;
        b.pendingOwner = address(0);
        b.status = Status.AT_PHARMACY;

        emit ReceivedAtPharmacy(_id, msg.sender);
    }

    // -----------------------------
    // 4. UNIT-LEVEL SALE (PHARMACY ONLY)
    // -----------------------------
    function sellItem(string memory _batchId, string memory _itemId) 
        external 
        onlyBatchOwner(_batchId) 
        onlyRole(Role.PHARMACY) 
    {
        Batch storage b = batches[_batchId];
        require(b.status == Status.AT_PHARMACY, "Batch is not at pharmacy");
        require(!isItemSold[_itemId], "This specific unit is already sold!");

        // Mark the individual strip as sold
        isItemSold[_itemId] = true;

        // Deduct from the batch tracking
        b.totalQuantity -= 1;
        if (b.totalQuantity == 0) {
            b.status = Status.DEPLETED;
        }

        emit ItemSold(_batchId, _itemId, msg.sender);
    }

    // -----------------------------
    // VIEW FUNCTIONS
    // -----------------------------
    function getBatchData(string memory _id) external view returns (Batch memory) {
        require(batches[_id].exists, "Batch not found");
        return batches[_id];
    }
    
    function verifyItem(string memory _itemId) external view returns (bool) {
        return isItemSold[_itemId];
    }

    // =============================================================
    // 5. DECENTRALIZED GOVERNANCE (PROPOSE & VOTE)
    // =============================================================

    /**
     * @dev BOOTSTRAP FUNCTION: Allows the deployer to add the founding 
     * Validators. This function completely disables itself permanently 
     * once 4 Validators exist, handing full control to the DAO!
     */
    function addGenesisValidator(address _account) external {
        require(msg.sender == owner, "Only the original deployer can add founding members");
        require(validatorCount < 4, "Genesis phase is over! The DAO is now fully decentralized.");
        require(roles[_account] == Role.NONE, "Account already has a role");

        roles[_account] = Role.VALIDATOR;
        isValidator[_account] = true;
        validatorCount++;
    }

    struct Proposal {
        uint256 id;
        address targetAccount;
        Role proposedRole;
        uint256 voteCount;
        bool executed;
    }

    /**
     * @dev EMERGENCY DEBUG: "Deletes" all proposals by marking them executed.
     * Only the original deployer (Admin) can call this.
     */
    function clearAllProposals() external {
        require(msg.sender == owner, "Only the admin can clear the board");
        
        for (uint256 i = 1; i <= proposalCount; i++) {
            // By marking it executed, it permanently hides it from the Python UI
            // without resetting the ID counter and causing hasVoted collisions!
            proposals[i].executed = true; 
        }
    }

    uint256 public proposalCount = 0;
    mapping(uint256 => Proposal) public proposals;
    
    // Tracks if a specific validator has already voted on a specific proposal
    // Mapping: ProposalID => (Validator Address => HasVoted)
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    // Governance Events
    event ProposalCreated(uint256 indexed proposalId, address indexed targetAccount, Role proposedRole, address proposer);
    event Voted(uint256 indexed proposalId, address indexed voter, uint256 currentVoteCount);
    event ProposalExecuted(uint256 indexed proposalId, address indexed targetAccount, Role assignedRole);

    /**
     * @dev Step 1: A Validator proposes a new company to join the network.
     */
    function proposeCompany(address _account, Role _role) external onlyRole(Role.VALIDATOR) {
        require(roles[_account] == Role.NONE, "Account already has a role in the network");
        require(_role == Role.MANUFACTURER || _role == Role.DISTRIBUTOR || _role == Role.PHARMACY, "Can only propose supply chain roles");

        proposalCount++;
        
        proposals[proposalCount] = Proposal({
            id: proposalCount,
            targetAccount: _account,
            proposedRole: _role,
            voteCount: 0,
            executed: false
        });

        emit ProposalCreated(proposalCount, _account, _role, msg.sender);
    }

    /**
     * @dev Step 2: Other Validators vote. If votes > 3 (meaning 4 total), it auto-executes.
     */
    function voteOnProposal(uint256 _proposalId) external onlyRole(Role.VALIDATOR) {
        Proposal storage p = proposals[_proposalId];
        
        require(p.id != 0, "Proposal does not exist");
        require(!p.executed, "Proposal has already been approved and executed");
        require(!hasVoted[_proposalId][msg.sender], "You have already voted on this proposal");

        // Record the vote
        hasVoted[_proposalId][msg.sender] = true;
        p.voteCount++;

        emit Voted(_proposalId, msg.sender, p.voteCount);

        // Auto-Execute if it hits the threshold (> 3 means 4 or more votes)
        if (p.voteCount > 3) {
            p.executed = true;
            roles[p.targetAccount] = p.proposedRole;
            
            emit ProposalExecuted(_proposalId, p.targetAccount, p.proposedRole);
        }
    }
}