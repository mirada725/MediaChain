# MediaChain — Project Summary & Handoff

**Module:** EC8204 – Blockchain and Cyber Security (University of Sydney affiliate module)
**Deadline:** 30 Sept 2026 submission, 3-minute presentation
**Repo:** `E:\My Projects\mediachain` (Windows, PowerShell)

---

## 1. What this project is

**MediaChain** is a blockchain-based media provenance system. When a photo/video is published, its cryptographic fingerprint and publication record (publisher identity, timestamp, edit history) are anchored on an Ethereum smart contract. Anyone can later check a copy of that media against the on-chain record to see if it's unaltered — including cases where AI has been used to manipulate previously-registered footage.

**Final Application description (for the Google Sheet / slide deck):**

> A blockchain-based system for verifying the authenticity of published media. Each photo or video's digital fingerprint and publication record — source, timestamp, edit history — are stored on an Ethereum smart contract at publication. Later copies are checked against this record to confirm whether they remain unaltered, including cases where AI has been used to manipulate the original. Viewers can verify authenticity directly from the smart contract, without relying on the hosting platform.

**Scope, deliberately narrow for a 3-day build:**
- ✅ Built: hash-based tamper detection, on-chain provenance ledger, duplicate-registration prevention
- ❌ Not built (explicitly future work): AI/ML deepfake detection of wholly synthetic media with no registered original — only *manipulated-real-footage* is caught, via hash mismatch

**"Why blockchain" justification (for the pitch/Q&A):** No single publisher or platform operator can alter the shared record once written — removes the need to trust any one authority. The nearest real-world non-blockchain analog is Certificate Transparency (CT) logs; blockchain's added value over CT is removing the need to trust *any* log operator at all, not just distributing that trust across several.

---

## 2. Tech stack

- **Smart contract:** Solidity ^0.8.24, Hardhat 3 (TypeScript, Mocha + Ethers.js template)
- **Local chain:** Hardhat's built-in local network (`npx hardhat node`) — zero cost, resets on restart
- **Backend:** Node.js + Express + TypeScript, **pure ESM** (`"type": "module"`, `NodeNext` module resolution), running via `tsx watch`
- **Blockchain client (backend side):** `ethers.js` v6, plain `JsonRpcProvider` (no Hardhat-specific APIs — backend is a separate project from the Hardhat one)
- **File uploads:** `multer` (memory storage)
- **Env config:** `dotenv`

---

## 3. Repo structure

```
mediachain/
├── contracts/
│   └── MediaRegistry.sol          ✅ done
├── scripts/
│   └── deploy.ts                  ✅ done
├── test/
│   └── MediaRegistry.test.ts      ✅ done (4 passing tests)
├── test-media/
│   ├── sample.jpg                 (test image, downloaded via curl from Lorem Picsum)
│   └── sample_edited.jpg          (manually edited copy, used for tamper-detection test)
├── backend/
│   ├── src/
│   │   ├── index.ts               ✅ done
│   │   ├── config.ts              ✅ done
│   │   ├── routes/
│   │   │   └── media.ts           ✅ done
│   │   └── services/
│   │       ├── hash.ts            ✅ done
│   │       └── contract.ts        ✅ done
│   ├── .env                       (gitignored — RPC_URL, CONTRACT_ADDRESS, PRIVATE_KEY, PORT)
│   ├── package.json               ("type": "module")
│   └── tsconfig.json              (module: NodeNext)
├── .gitignore
├── hardhat.config.ts
└── package.json                   ("type": "module", Hardhat 3 requirement)
```

---

## 4. What's been completed

### Phase 1 — Smart Contract (done)
- `MediaRegistry.sol`: `registerMedia(hash, sourceName, editHistory)` and `verifyMedia(hash)`, with a custom `AlreadyRegistered` error preventing any record from being overwritten once set.
- 4 passing unit tests: registration, duplicate rejection, unknown-hash lookup, tamper detection (different content → different hash → not found).
- Deployed successfully to local Hardhat network; manually verified end-to-end in the Hardhat console.

### Phase 2 — Backend Integration (done)
- Hashing service using `keccak256` (matches Solidity's native hash, and what the contract/tests use — **not** SHA-256, despite an earlier draft description saying so; that was corrected).
- Contract service using `ethers.js`, reading the compiled ABI from `artifacts/contracts/MediaRegistry.sol/MediaRegistry.json` via `fs.readFileSync` (avoids ESM JSON-import complications).
- Two REST endpoints: `POST /api/media/register`, `POST /api/media/verify`.
- **All 4 core behaviors verified working end-to-end through the real HTTP API:**
  - Register a new file → success with real `txHash`
  - Verify the same file → `exists: true` with correct metadata
  - Re-register the same file → clean `409 "This exact file is already registered"`
  - Verify a tampered/different file → `exists: false`

### Not yet started
- **Phase 3** — demo packaging (Postman collection or minimal HTML form), slide deck (~7–8 slides for 3 minutes), rehearsal, video recording, `.ppt` export and submission, Google Sheet registration with real group member index numbers.

---

## 5. Key gotchas hit during the build (useful context for continuing)

These cost real debugging time — worth knowing so they aren't repeated:

1. **Hardhat 3 changed its API significantly from Hardhat 2** (which most tutorials/AI knowledge assumes): `ethers` is no longer a static export of `"hardhat"`. You must do `const { ethers } = await network.connect();` in tests, scripts, and the console. Use `ethers.deployContract("ContractName")` as a shortcut instead of `getContractFactory().deploy()`.
2. **Hardhat 3 projects are pure ESM** — root `package.json` needs `"type": "module"`, and relative imports need explicit `.js` extensions even in `.ts` source files.
3. **The backend is a deliberately separate project** from the Hardhat root (own `package.json`, own `tsconfig.json`) — originally set up as CommonJS, later migrated to ESM too (to match the modern stack and avoid `moduleResolution` deprecation warnings). Both projects are now ESM, but they don't share config — each has its own `tsconfig.json`.
4. **`ts-node-dev` is broken/incompatible** with current TypeScript versions (crashes with a `configuration.js` internal error). Replaced with `tsx watch` — works cleanly with ESM+TS, no config issues.
5. **PowerShell aliases `curl` to `Invoke-WebRequest`**, which doesn't understand real curl flags (`-X`, `-F`). Always use `curl.exe` explicitly on Windows to get the real curl binary.
6. **A classic try/catch nesting bug**: when decoding a custom Solidity revert error, don't `throw` your friendly replacement error *inside* the same `try` block whose `catch` you're using for decode-failure handling — it'll swallow its own throw. Decode first, throw after, in separate steps.
7. **The Application description originally said "SHA-256"** but the actual implementation uses `keccak256` — this was corrected in both the description and confirmed consistent with the code, so don't reintroduce "SHA-256" wording anywhere (sheet, deck, or report) without also changing the hash function.

---

## 6. Improvements worth considering (if time allows before the deadline)

Roughly ordered by effort vs. payoff:

**Low effort, worth doing:**
- Add a `.env.example` to the repo (documented shape without real secrets) so teammates can set up their own `backend/.env` quickly.
- Add a root-level `README.md` with setup instructions for teammates (clone → `npm install` in both root and `backend/` → `npx hardhat node` → deploy → `npm run dev`).
- Double-check final Google Sheet registration uses the corrected Application description (no "SHA-256" wording) and real group member index numbers.

**Medium effort, nice for demo polish:**
- A minimal single-page HTML form (upload + register, upload + verify, shows JSON result) instead of doing the live demo purely through curl/Postman — reads better on camera for the 3-minute video.
- Emit and listen for the `MediaRegistered` event from the backend, to show near-real-time confirmation rather than just the HTTP response.
- Add a few more automated tests for the backend routes themselves (currently only the contract has unit tests; the API layer was only verified manually via curl).

**Higher effort, optional / post-deadline:**
- Deploy to a public testnet (Sepolia) with a free Alchemy/Infura RPC endpoint, so the demo can show a real Etherscan transaction — purely cosmetic, not required, adds testnet-faucet dependency risk right before a deadline.
- A real AI-based tamper/deepfake classifier layer — explicitly out of scope for this submission, stated as future work in the pitch. Do not attempt this before the deadline; it was deliberately descoped as not credibly buildable in the timeframe.
- Publisher identity verification (currently anyone with access to a signer key can register as any `sourceName` string — there's no check that the caller is actually who they claim to be). Worth mentioning as a known limitation if asked in Q&A.

---

## 7. Prompt to continue this project in a new chat

If starting a fresh conversation to continue this work, paste the following:

```
I'm building "MediaChain" — a blockchain-based media provenance system for my
EC8204 Blockchain and Cyber Security university module (deadline 30 Sept 2026,
3-minute presentation). I've completed Phase 1 (Solidity smart contract,
MediaRegistry.sol, with tests) and Phase 2 (Express/TypeScript backend with
ethers.js, register/verify API routes) — both fully working and verified
end-to-end via curl.

Stack: Hardhat 3 (TypeScript, Mocha+Ethers template) for the contract, a
separate Node/Express/TypeScript backend (pure ESM, using tsx to run), ethers.js
v6, all running on a local Hardhat network (no testnet/mainnet). Repo is at
E:\My Projects\mediachain on Windows, using PowerShell (note: curl needs
curl.exe explicitly since PowerShell aliases plain `curl` to Invoke-WebRequest).

I need help with Phase 3: packaging this into a 3-minute demo (I have
test-media/sample.jpg and test-media/sample_edited.jpg ready for the live
tamper-detection demo), building a slide deck (~7-8 slides), and preparing
for submission (Google Sheet registration, .ppt export named per module
convention).

I'm attaching my full project summary doc for context — please read it first
before we continue.
```

...and attach this summary `.md` file to that new conversation.
