# Phase 1 — Smart Contract Core (Day 1)

**Goal:** A working, tested `MediaRegistry` Solidity contract that can register a media fingerprint once and verify it later, deployed to a local Hardhat network.

**You should already have from setup:**
- `mediachain/` initialized as a Hardhat TypeScript project (Mocha + Ethers.js)
- `backend/` initialized separately as a plain Node/Express project
- `.gitignore` working correctly, first commit made

---

## Step 1.1 — Write the contract

Create `contracts/MediaRegistry.sol` (delete the sample `Lock.sol` Hardhat generated — you don't need it):

```solidity
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
```

**Why it's written this way (for your viva/Q&A):**
- `records[hash].exists` gate in `registerMedia` is what makes the ledger tamper-evident — nobody, not even the original publisher, can overwrite an existing entry. That's your "why blockchain" justification made concrete in code.
- `bytes32` is used instead of `string` for the hash because it's far cheaper in gas and is the natural fit for a fixed-length SHA-256/keccak256 digest.
- The event (`MediaRegistered`) isn't strictly required for the logic to work, but emitting it means your backend (or anyone) can listen for new registrations without polling — worth mentioning if asked about scalability.

---

## Step 1.2 — Clean up the sample project

Hardhat's scaffold created sample files you don't need. Remove them so your project only contains what you're actually presenting:

```powershell
Remove-Item contracts\Lock.sol -ErrorAction SilentlyContinue
Remove-Item test\Lock.ts -ErrorAction SilentlyContinue
```

---

## Step 1.3 — Compile

```powershell
npx hardhat compile
```

Expect output like:
```
Compiled 1 Solidity file successfully
```

If you get a compiler version error, check that the `pragma solidity ^0.8.24;` line matches (or is compatible with) the `solidity` version set in `hardhat.config.ts`.

---

## Step 1.4 — Write unit tests

Create `test/MediaRegistry.test.ts`:

```typescript
import { expect } from "chai";
import { network } from "hardhat";

describe("MediaRegistry", function () {
  it("registers a new media hash successfully", async function () {
    const { ethers } = await network.connect();
    const [publisher] = await ethers.getSigners();

    const mediaRegistry = await ethers.deployContract("MediaRegistry");

    const hash = ethers.keccak256(ethers.toUtf8Bytes("sample-file-content"));
    await mediaRegistry.registerMedia(hash, "Test Publisher", "original upload");

    const record = await mediaRegistry.verifyMedia(hash);
    expect(record.exists).to.equal(true);
    expect(record.publisher).to.equal(publisher.address);
    expect(record.sourceName).to.equal("Test Publisher");
  });

  it("rejects registering the same hash twice", async function () {
    const { ethers } = await network.connect();
    const mediaRegistry = await ethers.deployContract("MediaRegistry");

    const hash = ethers.keccak256(ethers.toUtf8Bytes("duplicate-content"));
    await mediaRegistry.registerMedia(hash, "First Publisher", "original");

    await expect(
      mediaRegistry.registerMedia(hash, "Second Publisher", "attempted overwrite")
    ).to.be.revertedWithCustomError(mediaRegistry, "AlreadyRegistered");
  });

  it("returns exists = false for a hash that was never registered", async function () {
    const { ethers } = await network.connect();
    const mediaRegistry = await ethers.deployContract("MediaRegistry");

    const unknownHash = ethers.keccak256(ethers.toUtf8Bytes("never-registered"));
    const record = await mediaRegistry.verifyMedia(unknownHash);

    expect(record.exists).to.equal(false);
    expect(record.publisher).to.equal(ethers.ZeroAddress);
  });

  it("detects tampering: a modified file produces a different hash and is not found", async function () {
    const { ethers } = await network.connect();
    const mediaRegistry = await ethers.deployContract("MediaRegistry");

    const originalHash = ethers.keccak256(ethers.toUtf8Bytes("original-photo-bytes"));
    const tamperedHash = ethers.keccak256(ethers.toUtf8Bytes("original-photo-bytes-EDITED"));

    await mediaRegistry.registerMedia(originalHash, "News Org", "original upload");

    const originalRecord = await mediaRegistry.verifyMedia(originalHash);
    const tamperedRecord = await mediaRegistry.verifyMedia(tamperedHash);

    expect(originalRecord.exists).to.equal(true);
    expect(tamperedRecord.exists).to.equal(false);
  });
});
```

> Note: if `anyValue` import causes issues, you can simplify the first test by removing the `.withArgs(...)` chain and just checking `.to.emit(mediaRegistry, "MediaRegistered")` alone — the important assertions (record fields) still fully verify correctness.

Run the tests:
```powershell
npx hardhat test
```

Expect all 4 tests to pass. **This is your most important checkpoint of the day** — the 4th test (tamper detection) is literally the mechanism you'll demo live in Phase 3.

---

## Step 1.5 — Write the deploy script

Create `scripts/deploy.ts`:

```typescript
import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();
  const mediaRegistry = await ethers.deployContract("MediaRegistry");

  const address = await mediaRegistry.getAddress();
  console.log(`MediaRegistry deployed to: ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

---

## Step 1.6 — Run a local node and deploy

Open **two terminals** in the `mediachain` folder.

**Terminal 1** — start the local blockchain (leave this running):
```powershell
npx hardhat node
```
This prints 20 pre-funded test accounts with their addresses and private keys — you'll use one of these in Phase 2's backend `.env`. **Keep this terminal open for the rest of the project** — every time you close it, the chain resets and all registered data is wiped (fine for dev, just don't panic if your registered hash "disappears" after a restart).

**Terminal 2** — deploy the contract:
```powershell
npx hardhat run scripts/deploy.ts --network localhost
```

You'll see output like:
```
MediaRegistry deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa
```

**Copy this address somewhere safe** (a note, or straight into a `.env` file) — Phase 2's backend needs it to talk to the contract.

---

## Step 1.7 — Sanity-check manually in the Hardhat console (optional but reassuring)

With `npx hardhat node` still running in Terminal 1, in Terminal 2:
```powershell
npx hardhat console --network localhost
```
Then interactively:
```javascript
const MediaRegistry = await ethers.getContractFactory("MediaRegistry");
const contract = await MediaRegistry.attach("PASTE_YOUR_DEPLOYED_ADDRESS_HERE");
const hash = ethers.keccak256(ethers.toUtf8Bytes("hello world"));
await contract.registerMedia(hash, "Manual Test", "console test");
await contract.verifyMedia(hash);
```
You should see the record printed back with `exists: true`. Type `.exit` to leave the console.

---

## Step 1.8 — Commit your work

```powershell
git add contracts/MediaRegistry.sol test/MediaRegistry.test.ts scripts/deploy.ts
git commit -m "feat(contract): implement MediaRegistry with register and verify"
git add test/
git commit -m "test(contract): add unit tests for registration, duplicates, lookup, and tamper detection"
```

(You can combine these into one commit if you prefer — either is fine for a coursework project.)

---

## End-of-Day-1 Checklist

- [ ] `contracts/MediaRegistry.sol` written and compiles cleanly
- [ ] `npx hardhat test` — all 4 tests pass
- [ ] `npx hardhat node` runs without error
- [ ] Contract deployed to local network, address noted down
- [ ] Manual console check confirms register → verify works end to end
- [ ] Work committed with conventional commit messages

**If everything above is checked, you're exactly on schedule.** Tomorrow (Phase 2) the backend will call this exact contract via `ethers.js` — the address you saved is the one piece of information carried forward into Day 2.
