// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MediaRegistry
/// @notice Anchors a cryptographic fingerprint (hash) of a piece of media on-chain,
/// along with publisher identity, timestamp, and edit history, so that anyone can
/// later verify whether a given file matches the originally registered version.
/// Also supports registering a new version of an existing work, linked back to its
/// parent hash, so a creator can build a real, verifiable version history over time.

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

    mapping(bytes32 => MediaRecord) private records;

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

    error AlreadyRegistered(bytes32 hash);
    error ParentNotFound(bytes32 parentHash);
    error NotParentPublisher(bytes32 parentHash, address caller);

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