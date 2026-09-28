// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MediaRegistry
/// @notice Anchors a cryptographic fingerprint (hash) of a piece of media on-chain,
/// along with publisher identity, timestamp, and edit history, so that anyone can
/// later verify whether a given file matches the originally registered version.

contract MediaRegistry {
    struct MediaRecord {
        bytes32 hash;
        address publisher;
        string sourceName;
        uint256 timestamp;
        string editHistory;
        bool exists;
    }

    /// @dev hash => record. A hash can only ever be registered once —
    /// this is what prevents any single party (including the publisher
    /// themselves) from quietly rewriting history after the fact.
    mapping(bytes32 => MediaRecord) private records;

    event MediaRegistered(
        bytes32 indexed hash,
        address indexed publisher,
        string sourceName,
        uint256 timestamp
    );

    error AlreadyRegistered(bytes32 hash);

    /// @notice Registers a new media fingerprint on-chain.
    /// @param hash The SHA-256 (or keccak256) fingerprint of the media file.
    /// @param sourceName Human-readable publisher/source name (e.g. "Reuters").
    /// @param editHistory Optional free-text note (e.g. "original upload", "v2 - cropped").
    
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
            exists: true
        });

        emit MediaRegistered(hash, msg.sender, sourceName, block.timestamp);
    }

    /// @notice Checks whether a given hash matches a registered, authentic record.
    /// @param hash The fingerprint to look up (computed from a file you want to verify).
    /// @return exists Whether this exact hash was ever registered.
    /// @return publisher The address that registered it (address(0) if not found).
    /// @return sourceName The publisher's declared name.
    /// @return timestamp When it was registered (0 if not found).
    /// @return editHistory The declared edit history string.
    
    function verifyMedia(bytes32 hash)
        external
        view
        returns (
            bool exists,
            address publisher,
            string memory sourceName,
            uint256 timestamp,
            string memory editHistory
        )
    {
        MediaRecord memory record = records[hash];
        return (
            record.exists,
            record.publisher,
            record.sourceName,
            record.timestamp,
            record.editHistory
        );
    }
}
