# MediaChain – Build Plan (3-Day Implementation)

**Module:** EC8204 – Blockchain and Cyber Security
**Deadline:** 30 Sept 2026 (submission), 3-minute presentation
**Stack:** Solidity + Hardhat (local network) + Node.js/TypeScript/Express + ethers.js
**Scope:** Hash-based media provenance and tamper detection. No AI/ML component is built — deepfake detection via AI is stated as future work only.

---

## 0. Project Setup (do this first, ~30 min)

### 0.1 Prerequisites
- Node.js (v18+) and npm installed
- VS Code or any editor
- Git (optional but recommended for version control across teammates)

### 0.2 Folder structure
```
mediachain/
├── contracts/
│   └── MediaRegistry.sol
├── scripts/
│   └── deploy.ts
├── test/
│   └── MediaRegistry.test.ts
├── backend/
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   └── media.ts
│   │   ├── services/
│   │   │   ├── hash.ts
│   │   │   └── contract.ts
│   │   └── config.ts
│   ├── package.json
│   └── tsconfig.json
├── hardhat.config.ts
├── package.json
└── README.md
```

### 0.3 Initialize Hardhat project
```bash
mkdir mediachain && cd mediachain
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init
# Choose: "Create a TypeScript project"
```

### 0.4 Initialize backend (separate package, same repo)
```bash
mkdir backend && cd backend
npm init -y
npm install express ethers multer cors
npm install --save-dev typescript ts-node-dev @types/express @types/node @types/multer @types/cors
npx tsc --init
cd ..
```

### 0.5 Git setup (if working as a team)
```bash
git init
echo "node_modules/\ncache/\nartifacts/\n.env\ndist/" > .gitignore
git add .
git commit -m "Initial project scaffold"
```
Push to a shared GitHub repo so all group members can pull the same base.

**Checkpoint:** `npx hardhat compile` runs with no errors before moving to Phase 1.

---

## Phase 1 — Smart Contract Core (Day 1)

**Goal:** A working, tested Solidity contract that can register and verify media hashes, deployed to a local Hardhat network.

### 1.1 Write the contract
`contracts/MediaRegistry.sol`
- `struct MediaRecord { bytes32 hash; address publisher; string sourceName; uint256 timestamp; string editHistory; }`
- `mapping(bytes32 => MediaRecord) public records;`
- `function registerMedia(bytes32 hash, string calldata sourceName, string calldata editHistory) external`
  - Reverts if hash already registered (prevents overwrite — supports the "no single party can alter history" claim).
  - Stores `msg.sender` as publisher, `block.timestamp` as timestamp.
  - Emits `MediaRegistered(hash, publisher, timestamp)`.
- `function verifyMedia(bytes32 hash) external view returns (bool exists, address publisher, string memory sourceName, uint256 timestamp)`

### 1.2 Write unit tests
`test/MediaRegistry.test.ts` — using Hardhat + Chai:
- Register a hash → verify it returns correct publisher/timestamp.
- Attempt to register the same hash twice → expect revert.
- Query a hash that was never registered → expect `exists = false`.

Run:
```bash
npx hardhat test
```

### 1.3 Deploy locally
```bash
npx hardhat node          # keep this running in one terminal — local blockchain
npx hardhat run scripts/deploy.ts --network localhost   # in a second terminal
```
Save the deployed contract address printed in the console — you'll need it in Phase 2.

**Checkpoint (end of Day 1):** Contract compiles, all tests pass, contract is deployed to local Hardhat network, address noted down.

---

## Phase 2 — Backend Integration (Day 2)

**Goal:** An Express API that computes file hashes and talks to the deployed contract, so the "product" is usable through HTTP calls (or Postman), not just the Hardhat console.

### 2.1 Hashing service
`backend/src/services/hash.ts`
- Accepts an uploaded file buffer.
- Computes SHA-256 using Node's built-in `crypto` module.
- Returns hash as `0x`-prefixed hex string (bytes32-compatible for Solidity).

### 2.2 Contract service
`backend/src/services/contract.ts`
- Connects to local Hardhat node via `ethers.JsonRpcProvider("http://127.0.0.1:8545")`.
- Loads contract ABI (from `artifacts/contracts/MediaRegistry.sol/MediaRegistry.json`) and deployed address.
- Uses one of Hardhat's pre-funded test accounts as the signer (private keys are printed when `npx hardhat node` starts — safe to hardcode for local dev only, never for a real network).
- Exposes `registerOnChain(hash, sourceName, editHistory)` and `verifyOnChain(hash)`.

### 2.3 API routes
`backend/src/routes/media.ts`
- `POST /register` — multipart file upload + `sourceName` field. Hashes file, calls `registerOnChain`, returns tx hash + record.
- `POST /verify` — multipart file upload. Hashes file, calls `verifyOnChain`, returns match/no-match + original record if found.

### 2.4 Wire up server
`backend/src/index.ts` — Express app, CORS enabled, mount `/api/media` routes, `multer` for file uploads (memory storage is fine, no need to persist files to disk for the demo).

### 2.5 Test end-to-end with Postman or curl
```bash
curl -X POST http://localhost:3000/api/media/register \
  -F "file=@sample.jpg" -F "sourceName=Test Publisher"

curl -X POST http://localhost:3000/api/media/verify \
  -F "file=@sample.jpg"
# should return: exists=true, matches original

# now tamper the file (e.g. edit one pixel or re-save it), then:
curl -X POST http://localhost:3000/api/media/verify \
  -F "file=@sample_edited.jpg"
# should return: exists=false / hash mismatch → flagged as altered
```

**Checkpoint (end of Day 2):** You can register a file and verify both an untouched copy (matches) and a tampered copy (flagged as altered), entirely through the API — this is your core demo working.

---

## Phase 3 — Demo Polish, Deck, and Submission (Day 3)

### 3.1 Morning — demo packaging (2–3 hrs)
Pick ONE of these presentation formats (don't over-build — 3 minutes doesn't need a polished frontend):
- **Option A (fastest):** Postman collection with saved requests, screen-recorded live.
- **Option B (slightly more visual):** A minimal single-page HTML form (upload + register button, upload + verify button, shows JSON result) — a few dozen lines, no framework needed.

Prepare 2–3 sample files in advance:
- `original.jpg` — the "published" file.
- `original_edited.jpg` — same file, lightly edited (crop/recolor/re-encode) to simulate tampering.
- Optionally a totally unrelated `unregistered.jpg` to show the "not found" case.

### 3.2 Midday — slide deck (2–3 hrs)
Target ~7–8 slides for a 3-minute talk:
1. **Problem** — manipulated media and disinformation spreading unchecked online.
2. **Idea** — MediaChain: on-chain fingerprint + provenance record at publish time.
3. **Why blockchain (not a centralized database)** — no single publisher or platform can alter the shared record; compare briefly to Certificate Transparency logs as the nearest non-blockchain analog, and note blockchain removes trust in *any* single log operator.
4. **Architecture diagram** — Publisher → Backend (hash) → Smart Contract (Hardhat local net) ← Verifier.
5. **Live demo / screenshots** — register original, verify original (match), verify tampered copy (flagged).
6. **Scope and limitations** — catches tampering of *registered* content, including AI-manipulated real footage; cannot detect wholly synthetic deepfakes with no registered original (explicitly call this out — shows maturity, not a weakness to hide).
7. **Future work** — AI-based generative-content classifier layered on top; public testnet deployment; identity verification for publishers registering content.
8. **Conclusion / thank you.**

### 3.3 Evening — rehearse, record, submit
- Rehearse out loud at least twice with a timer — 3 minutes is tight; the live demo should take no more than ~45–60 seconds of it.
- Record the presentation video, upload it, and paste the link into the Google Sheet's "3 min Presentation video link" column.
- Export the deck as PowerPoint, name it exactly per the module convention: `GP_XX_MediaChain.ppt` (replace `XX` with your assigned group number).
- Submit before the deadline — remember only the last file submitted counts, so don't re-upload after final checks unless necessary.

**Checkpoint (end of Day 3):** Video recorded and linked, `.ppt` named correctly and submitted, sheet row fully filled in.

---

## Quick Reference — What NOT to build (out of scope, deliberately)
- ❌ No AI/ML deepfake detection model — stated as future work only.
- ❌ No mainnet deployment — local Hardhat network (or Sepolia testnet at most) only, zero cost.
- ❌ No user authentication/login system — not needed for the core demo.
- ❌ No storing actual media files on-chain — only hashes and metadata are stored on-chain; files themselves stay off-chain.
- ❌ No polished frontend required — Postman or a bare HTML form is enough for a 3-minute pitch.

## Team Task Split (if 3–4 members)
- **Person A:** Solidity contract + tests + deployment (Phase 1)
- **Person B:** Backend hashing + contract integration (Phase 2)
- **Person C:** API routes + demo packaging (Phase 2–3)
- **Person D (or shared):** Slide deck, script writing, rehearsal, video recording, sheet registration (Phase 3)
