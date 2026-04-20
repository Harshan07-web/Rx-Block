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
    // GOVERNANCE (Simplified for Demo)
    // -----------------------------
    function assignRole(address _account, Role _role) external {
        require(isValidator[msg.sender], "Only validators can assign roles");
        roles[_account] = _role;
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
}