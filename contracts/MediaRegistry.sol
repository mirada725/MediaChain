// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MediaRegistry
/// @notice Anchors a cryptographic fingerprint (hash) of a piece of media on-chain,
/// along with publisher identity, timestamp, and edit history, so that anyone can
/// later verify whether a given file matches the originally registered version.
/// Also supports registering a new version of an existing work, linked back to its
/// parent hash, so a creator can build a real, verifiable version history over time.
/// Finally, any third party can challenge a registration with prior-art evidence;
/// a designated arbiter rules on the dispute. Records are never deleted or
/// modified by a dispute, only annotated.

contract MediaRegistry {
    struct MediaRecord {
        bytes32 hash;
        address publisher;
        string sourceName;
        uint256 timestamp;
        string editHistory;
        bytes32 parentHash; // 0x0 for an original/first registration
        bool exists;
    }

    // --- Feature B ---
    enum DisputeStatus {
        None,     // 0: never disputed
        Open,     // 1: challenge raised, awaiting arbiter
        Upheld,   // 2: arbiter accepted the challenge (final)
        Rejected  // 3: arbiter rejected the challenge (may be re-raised with new evidence)
    }

    struct Dispute {
        DisputeStatus status;
        address challenger;
        bytes32 evidenceHash; // fingerprint of the challenger's prior-art file (0x0 if none)
        string evidenceNote;
        uint256 raisedAt;
        string ruling;
        uint256 resolvedAt;
    }

    /// @notice The account allowed to resolve disputes. Set once, at deployment.
    address public immutable arbiter;
    // -----------------

    mapping(bytes32 => MediaRecord) private records;
    mapping(bytes32 => Dispute) private disputes; // Feature B

    event MediaRegistered(
        bytes32 indexed hash,
        address indexed publisher,
        string sourceName,
        uint256 timestamp
    );

    event MediaVersionRegistered(
        bytes32 indexed hash,
        bytes32 indexed parentHash,
        address indexed publisher,
        uint256 timestamp
    );

    // --- Feature B ---
    event DisputeRaised(
        bytes32 indexed hash,
        address indexed challenger,
        bytes32 evidenceHash,
        uint256 timestamp
    );

    event DisputeResolved(
        bytes32 indexed hash,
        address indexed arbiter,
        bool upheld,
        uint256 timestamp
    );
    // -----------------

    error AlreadyRegistered(bytes32 hash);
    error ParentNotFound(bytes32 parentHash);
    error NotParentPublisher(bytes32 parentHash, address caller);

    // --- Feature B ---
    error MediaNotFound(bytes32 hash);
    error CannotDisputeOwnWork(bytes32 hash);
    error DisputeAlreadyOpen(bytes32 hash);
    error DisputeAlreadyUpheld(bytes32 hash);
    error NotArbiter(address caller);
    error NoOpenDispute(bytes32 hash);
    // -----------------

    /// @dev The deployer becomes the arbiter. Deploy from a dedicated account
    /// if you want the arbiter to be a third party.
    constructor() {
        arbiter = msg.sender;
    }

    function registerMedia(
        bytes32 hash,
        string calldata sourceName,
        string calldata editHistory
    ) external {
        if (records[hash].exists) {
            revert AlreadyRegistered(hash);
        }

        records[hash] = MediaRecord({
            hash: hash,
            publisher: msg.sender,
            sourceName: sourceName,
            timestamp: block.timestamp,
            editHistory: editHistory,
            parentHash: bytes32(0),
            exists: true
        });

        emit MediaRegistered(hash, msg.sender, sourceName, block.timestamp);
    }

    /// @notice Registers a new version of an existing, already-registered work.
    /// Only the original work's publisher may add a new version to it.
    function registerVersion(
        bytes32 parentHash,
        bytes32 newHash,
        string calldata sourceName,
        string calldata versionNote
    ) external {
        if (!records[parentHash].exists) {
            revert ParentNotFound(parentHash);
        }
        if (records[parentHash].publisher != msg.sender) {
            revert NotParentPublisher(parentHash, msg.sender);
        }
        if (records[newHash].exists) {
            revert AlreadyRegistered(newHash);
        }

        records[newHash] = MediaRecord({
            hash: newHash,
            publisher: msg.sender,
            sourceName: sourceName,
            timestamp: block.timestamp,
            editHistory: versionNote,
            parentHash: parentHash,
            exists: true
        });

        emit MediaVersionRegistered(newHash, parentHash, msg.sender, block.timestamp);
    }

    // --- Feature B ---

    /// @notice Challenge a registered work by claiming prior art.
    /// Anyone except the work's own publisher may raise a dispute. A rejected
    /// dispute can be raised again with new evidence; an upheld one is final.
    /// The original record is never altered.
    function raiseDispute(
        bytes32 hash,
        bytes32 evidenceHash,
        string calldata evidenceNote
    ) external {
        MediaRecord storage record = records[hash];
        if (!record.exists) {
            revert MediaNotFound(hash);
        }
        if (record.publisher == msg.sender) {
            revert CannotDisputeOwnWork(hash);
        }

        DisputeStatus current = disputes[hash].status;
        if (current == DisputeStatus.Open) {
            revert DisputeAlreadyOpen(hash);
        }
        if (current == DisputeStatus.Upheld) {
            revert DisputeAlreadyUpheld(hash);
        }

        disputes[hash] = Dispute({
            status: DisputeStatus.Open,
            challenger: msg.sender,
            evidenceHash: evidenceHash,
            evidenceNote: evidenceNote,
            raisedAt: block.timestamp,
            ruling: "",
            resolvedAt: 0
        });

        emit DisputeRaised(hash, msg.sender, evidenceHash, block.timestamp);
    }

    /// @notice Arbiter-only. Rules on an open dispute.
    /// @param upheld true = the challenge is accepted (prior art recognised),
    /// false = the challenge is rejected.
    function resolveDispute(
        bytes32 hash,
        bool upheld,
        string calldata ruling
    ) external {
        if (msg.sender != arbiter) {
            revert NotArbiter(msg.sender);
        }
        Dispute storage d = disputes[hash];
        if (d.status != DisputeStatus.Open) {
            revert NoOpenDispute(hash);
        }

        d.status = upheld ? DisputeStatus.Upheld : DisputeStatus.Rejected;
        d.ruling = ruling;
        d.resolvedAt = block.timestamp;

        emit DisputeResolved(hash, msg.sender, upheld, block.timestamp);
    }

    /// @notice Read the dispute state of a work. `status` is the DisputeStatus
    /// enum as a number: 0 None, 1 Open, 2 Upheld, 3 Rejected.
    function getDispute(bytes32 hash)
        external
        view
        returns (
            uint8 status,
            address challenger,
            bytes32 evidenceHash,
            string memory evidenceNote,
            uint256 raisedAt,
            string memory ruling,
            uint256 resolvedAt
        )
    {
        Dispute memory d = disputes[hash];
        return (
            uint8(d.status),
            d.challenger,
            d.evidenceHash,
            d.evidenceNote,
            d.raisedAt,
            d.ruling,
            d.resolvedAt
        );
    }

    // -----------------

    function verifyMedia(bytes32 hash)
        external
        view
        returns (
            bool exists,
            address publisher,
            string memory sourceName,
            uint256 timestamp,
            string memory editHistory,
            bytes32 parentHash
        )
    {
        MediaRecord memory record = records[hash];
        return (
            record.exists,
            record.publisher,
            record.sourceName,
            record.timestamp,
            record.editHistory,
            record.parentHash
        );
    }
}