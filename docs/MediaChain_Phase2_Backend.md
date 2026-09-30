# Phase 2 — Backend Integration (Day 2)

**Goal:** An Express API that hashes uploaded files and talks to your deployed `MediaRegistry` contract, so registering/verifying media works over HTTP, not just the Hardhat console.

**Prerequisite:** Phase 1 complete — contract compiles, tests pass, and you've manually confirmed register/verify works in the Hardhat console.

**Important:** the backend is a **plain Node/Express project**, separate from Hardhat. It does **not** use `network.connect()` (that's a Hardhat-only API) — it connects to your already-running local chain the normal way, with a plain `ethers.JsonRpcProvider`. This sidesteps the Hardhat 3 quirks you hit in Phase 1 entirely.

---

## Step 2.0 — Keep your local chain running

In one terminal (call it **Terminal 1**), from `mediachain/`, this should still be running from Phase 1:
```powershell
npx hardhat node
```
Leave it running for the rest of this phase. Note the **first account's private key** it printed — you'll need it below. It looks like:
```
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

In a **second terminal**, make sure the contract is deployed and you have its address (re-run if your node was restarted, since local state resets):
```powershell
npx hardhat run scripts/deploy.ts --network localhost
```
Copy the printed `MediaRegistry deployed to: 0x...` address.

---

## Step 2.1 — Set up environment variables

Create `backend/.env` (copy from `backend/.env.example` if you made one earlier, or create fresh) with your real values:

```env
RPC_URL=http://127.0.0.1:8545
CONTRACT_ADDRESS=0xPASTE_YOUR_DEPLOYED_ADDRESS_HERE
PRIVATE_KEY=0xPASTE_ACCOUNT_0_PRIVATE_KEY_FROM_HARDHAT_NODE_HERE
PORT=3000
```

This file is already covered by your `.gitignore`, so it stays local to your machine.

---

## Step 2.2 — Config loader

Create `backend/src/config.ts`:

```typescript
import dotenv from "dotenv";
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  rpcUrl: requireEnv("RPC_URL"),
  contractAddress: requireEnv("CONTRACT_ADDRESS"),
  privateKey: requireEnv("PRIVATE_KEY"),
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
};
```

You'll need the `dotenv` package — install it:
```powershell
cd backend
npm install dotenv
cd ..
```

---

## Step 2.3 — Hashing service

Create `backend/src/services/hash.ts`:

```typescript
import { createHash } from "crypto";
import { keccak256, toUtf8Bytes } from "ethers";

/**
 * Computes a keccak256 hash of the file's raw bytes, matching the format
 * the smart contract expects (bytes32). We hash the actual file content,
 * not a filename or metadata, so any single-byte change in the file
 * produces a completely different hash.
 */
export function hashFileBuffer(buffer: Buffer): string {
  return keccak256(buffer);
}

/**
 * Optional: SHA-256 hex digest, useful if you want a human-readable
 * fingerprint to display in the UI/demo alongside the on-chain keccak256 hash.
 */
export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
```

> **Why keccak256, not SHA-256, for the on-chain hash:** the contract stores `bytes32`, and `ethers.keccak256` is the natural, gas-efficient match for that — it's also what your Phase 1 tests already use (`ethers.keccak256(ethers.toUtf8Bytes(...))`), so the backend needs to compute hashes the same way for `verifyMedia` lookups to actually match. `sha256Hex` above is just a bonus for display purposes if you want it; it doesn't touch the contract at all.

---

## Step 2.4 — Contract service

Create `backend/src/services/contract.ts`:

```typescript
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const artifactPath = join(__dirname, "../../../artifacts/contracts/MediaRegistry.sol/MediaRegistry.json");
const contractArtifact = JSON.parse(readFileSync(artifactPath, "utf-8"));

const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const signer = new ethers.Wallet(config.privateKey, provider);

const mediaRegistry = new ethers.Contract(
  config.contractAddress,
  contractArtifact.abi,
  signer
);

export interface RegisterResult {
  txHash: string;
  hash: string;
  sourceName: string;
  editHistory: string;
}

export interface VerifyResult {
  exists: boolean;
  publisher: string;
  sourceName: string;
  timestamp: number;
  editHistory: string;
}

export async function registerOnChain(
  hash: string,
  sourceName: string,
  editHistory: string
): Promise<RegisterResult> {
  const tx = await mediaRegistry.registerMedia(hash, sourceName, editHistory);
  const receipt = await tx.wait();

  return {
    txHash: receipt.hash,
    hash,
    sourceName,
    editHistory,
  };
}

export async function verifyOnChain(hash: string): Promise<VerifyResult> {
  const result = await mediaRegistry.verifyMedia(hash);

  return {
    exists: result[0],
    publisher: result[1],
    sourceName: result[2],
    timestamp: Number(result[3]),
    editHistory: result[4],
  };
}
```

**Two things to check before this will compile:**
1. Your `backend/tsconfig.json` needs `"resolveJsonModule": true` and `"esModuleInterop": true` in `compilerOptions` for the artifact JSON import to work — add those if missing.
2. The relative path `../../../artifacts/...` assumes `backend/` sits directly inside `mediachain/` (one level below the Hardhat project root, matching your existing folder structure). If you get a "module not found" error, double check you've run `npx hardhat compile` at least once from the root — that's what generates the `artifacts/` folder this import reads from.

---

## Step 2.5 — API routes

Create `backend/src/routes/media.ts`:

```typescript
import { Router } from "express";
import multer from "multer";
import { hashFileBuffer } from "../services/hash";
import { registerOnChain, verifyOnChain } from "../services/contract";

const upload = multer({ storage: multer.memoryStorage() });
export const mediaRouter = Router();

mediaRouter.post("/register", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const sourceName = req.body.sourceName || "Unknown Publisher";
    const editHistory = req.body.editHistory || "original upload";

    const hash = hashFileBuffer(req.file.buffer);
    const result = await registerOnChain(hash, sourceName, editHistory);

    res.json({ success: true, ...result });
  } catch (error: any) {
    if (error.reason === "AlreadyRegistered" || error.message?.includes("AlreadyRegistered")) {
      return res.status(409).json({ error: "This exact file is already registered" });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to register media", details: error.message });
  }
});

mediaRouter.post("/verify", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const hash = hashFileBuffer(req.file.buffer);
    const result = await verifyOnChain(hash);

    res.json({ hash, ...result });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: "Failed to verify media", details: error.message });
  }
});
```

---

## Step 2.6 — Wire up the server

Create `backend/src/index.ts`:

```typescript
import express from "express";
import cors from "cors";
import { mediaRouter } from "./routes/media";
import { config } from "./config";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/media", mediaRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(config.port, () => {
  console.log(`MediaChain backend listening on http://localhost:${config.port}`);
});
```

Add a `dev` script to `backend/package.json` (inside `"scripts"`):
```json
"scripts": {
  "dev": "ts-node-dev --respawn src/index.ts"
}
```

Start it:
```powershell
cd backend
npm run dev
```

You should see:
```
MediaChain backend listening on http://localhost:3000
```

---

## Step 2.7 — Test end-to-end

With **Terminal 1** (`hardhat node`) and **Terminal 3** (backend `npm run dev`) both running, open a fourth terminal or use Postman.

**Register a file:**
```powershell
curl -X POST http://localhost:3000/api/media/register `
  -F "file=@sample.jpg" `
  -F "sourceName=Test Publisher"
```
Expect a JSON response with `"success": true` and a `txHash`.

**Verify the same, untouched file:**
```powershell
curl -X POST http://localhost:3000/api/media/verify -F "file=@sample.jpg"
```
Expect `"exists": true` with your publisher info echoed back.

**Now tamper the file** (open it and change literally anything — crop it, resave it, add a pixel — then save as `sample_edited.jpg`) and verify again:
```powershell
curl -X POST http://localhost:3000/api/media/verify -F "file=@sample_edited.jpg"
```
Expect `"exists": false` — this is your core tamper-detection proof, now running through the real API instead of just the console.

**Try registering the same file twice:**
```powershell
curl -X POST http://localhost:3000/api/media/register -F "file=@sample.jpg" -F "sourceName=Someone Else"
```
Expect a `409` response with `"error": "This exact file is already registered"` — proving the duplicate-prevention logic is enforced through the API too.

> PowerShell note: if backtick line continuation gives you trouble, just put the whole `curl` command on one line instead.

---

## Commit checkpoints

| When | Commit message |
|---|---|
| After `config.ts`, `.env` working, `dotenv` installed | `chore(backend): add environment config loader` |
| After `hash.ts` written | `feat(backend): add file hashing service` |
| After `contract.ts` written and compiles | `feat(backend): add ethers.js contract service for register/verify` |
| After `routes/media.ts` and `index.ts` written, server starts | `feat(backend): add register and verify API routes` |
| After the full curl test sequence above passes (register, verify match, verify tamper, duplicate rejection) | `test(backend): verify register/verify/tamper-detection flow end to end` |

---

## End-of-Day-2 Checklist

- [ ] `backend/.env` created with real RPC URL, contract address, private key
- [ ] Backend starts cleanly with `npm run dev`
- [ ] `POST /api/media/register` returns success with a real `txHash`
- [ ] `POST /api/media/verify` on the same file returns `exists: true`
- [ ] `POST /api/media/verify` on a tampered copy returns `exists: false`
- [ ] Re-registering the same file returns a `409` "already registered" error
- [ ] Work committed with conventional commit messages

**If everything's checked, this is your full working demo** — Phase 3 is just packaging it for the 3-minute presentation, not building anything new.
