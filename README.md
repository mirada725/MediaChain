# MediaChain

MediaChain is a decentralized timestamping system for digital work (images, audio and PDF files). A creator registers a file's fingerprint on the Ethereum Sepolia test network. Later, anyone can check a file against the chain and see who registered it first and when. If someone disagrees, they can open a dispute that a reviewer decides.

Course project for EC8204 Blockchain and Cyber Security, University of Ruhuna.

- **Live app:** https://mirada725.github.io/MediaChain/
- **Network:** Ethereum Sepolia (test network, the ETH has no real value)
- **Contract:** [`0xDEB1308Bf95FCE551AA6235a7aEb41AC3a23053e`](https://sepolia.etherscan.io/address/0xDEB1308Bf95FCE551AA6235a7aEb41AC3a23053e)

## What it does

- **Register a work.** The file is hashed in your browser. Only the hash, a creator name and a note go on the chain. The file itself never leaves your device.
- **Check a work.** Choose a file and the app looks up its hash. If it is registered, you see the owner, the time and the notes.
- **Add a new version.** The person who registered an earlier version can link a new version to it. The app shows the version history.
- **Open a dispute.** Another person can challenge a registration with a reason and, optionally, the fingerprint of their earlier file.
- **Review disputes.** One reviewer account accepts or declines each dispute. The original record is never changed or deleted. The ruling is attached to it.
- **Share a link.** A registered work has a link such as `/?hash=0x...` that opens its record directly.

Supported files: images (JPG, PNG, WebP, GIF), audio (MP3, WAV, M4A, FLAC) and PDF.

## What it proves, and what it does not

A registration proves that someone held a file with exactly this fingerprint at the time of the block. It does not prove who created the file. A different or edited file has a different fingerprint and does not match. The dispute process exists because anyone can register someone else's file first.

## How it works

```
Browser (React + ethers)
  |-- hashes the file locally
  |-- writes through MetaMask ---------> Sepolia (MediaRegistry contract)
  |-- reads current records ------------> public RPC (PublicNode)
  '-- reads event history --------------> Blockscout (full history) + browser cache
```

- **Contract:** `contracts/MediaRegistry.sol` (Solidity, Hardhat).
- **Frontend:** `frontend/` (React, TypeScript, Vite, ethers v6).
- **Writes** go through the user's wallet (MetaMask). **Reads** use a read-only provider, so checking a work needs no wallet.
- **Lists** (recent works, disputes to review) are built from contract events. Free public RPC servers delete old event logs, so the app reads the history from a separate service (Blockscout), adds the newest blocks from the normal RPC, and keeps what it found in the browser cache.

### Contract summary

| Function | Who can call it | What it does |
|---|---|---|
| `registerMedia` | anyone | Registers a new file hash once |
| `registerVersion` | owner of the earlier version | Registers a new version linked to a parent hash |
| `verifyMedia` | anyone (read) | Returns the record for a hash |
| `raiseDispute` | anyone except the work's owner | Opens a dispute with a reason and optional evidence hash |
| `resolveDispute` | the reviewer only | Accepts or declines an open dispute and records the ruling |
| `getDispute` | anyone (read) | Returns the dispute state for a hash |

Rules: each file hash can be registered only once, records are never deleted, and the reviewer address is fixed when the contract is deployed (it is `immutable`). Dispute states are None, Open, Upheld and Rejected. An upheld decision is final. A rejected dispute can be raised again.

The contract uses custom errors, events and an enum for dispute states. It has 19 passing tests (Hardhat 3, Mocha, Chai).

## Deployment on Sepolia

| Item | Value |
|---|---|
| Contract | `0xDEB1308Bf95FCE551AA6235a7aEb41AC3a23053e` |
| Deployment block | `12020002` |
| Deployment transaction | `0x810eb298e92bdb29eab5cf90987a9af89326b9fee4d6fdcaf1ca6d2058564188` |
| Reviewer (deployer) | `0x386036d762884b30534bF6F31e185a4e1Fcaf87B` |

## Run it locally

You need Node.js 22 and MetaMask. Run each command from the project root unless it says otherwise.

1. Install packages in the root folder and in `frontend`: `npm install`
2. Start a local chain and leave it running: `npx hardhat node`
3. In a second terminal, deploy: `npx hardhat run scripts/deploy.ts --network localhost`. It prints the reviewer and the contract address.
4. Create `frontend/.env.local`:
   ```
   VITE_CONTRACT_ADDRESS=0xYourDeployedAddress
   VITE_RPC_URL=http://127.0.0.1:8545
   VITE_CHAIN_ID=31337
   VITE_CHAIN_NAME=Hardhat Local
   VITE_DEPLOY_BLOCK=0
   ```
5. In a third terminal, in `frontend`, run `npm run dev` and open `http://localhost:5173/`.
6. Run the tests with `npx hardhat test`.

In MetaMask, add the network "Hardhat Local" (RPC `http://127.0.0.1:8545`, chain ID `31337`) and import the first three accounts that `npx hardhat node` prints. Account #0 is a publisher, #1 a challenger and #2 the reviewer. These keys are public. Use them only on the local chain, never on Sepolia or any public network.

The local chain is wiped every time the node stops. After a restart, redeploy, update `.env.local` and restart `npm run dev`.

## Deploy to Sepolia

The deploy key is never stored in a file. It is kept in the encrypted Hardhat keystore.

1. Create a new wallet account for deployment and get free test ETH from a Sepolia faucet. Never use the local Hardhat accounts.
2. Store the settings. Hardhat asks for a keystore password the first time:
   ```
   npx hardhat keystore set SEPOLIA_RPC_URL
   npx hardhat keystore set SEPOLIA_PRIVATE_KEY
   ```
3. Deploy: `npx hardhat run scripts/deploy.ts --network sepolia`. The script prints the contract address and the deployment block.
4. Put those values in the frontend settings below.

The account that deploys becomes the only reviewer. If its key is lost, the reviewer role is lost.

## Frontend settings

The frontend reads these `VITE_` values when it is built. They are public values and appear in the built website, so never put a secret in them.

| Name | Meaning |
|---|---|
| `VITE_CONTRACT_ADDRESS` | Address of the deployed contract |
| `VITE_RPC_URL` | Server used to read current records |
| `VITE_LOGS_RPC_URL` | Server used to read event history (optional locally) |
| `VITE_CHAIN_ID` | `11155111` for Sepolia, `31337` for the local chain |
| `VITE_CHAIN_NAME` | Name shown when MetaMask adds the network |
| `VITE_EXPLORER_URL` | Block explorer address, empty on the local chain |
| `VITE_DEPLOY_BLOCK` | Block of the deployment, where event searches start |
| `VITE_BASE_PATH` | Site path, set by the workflow for GitHub Pages |

Sepolia values:

```
VITE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
VITE_LOGS_RPC_URL=https://eth-sepolia.blockscout.com/api/eth-rpc
VITE_CHAIN_ID=11155111
VITE_CHAIN_NAME=Sepolia
VITE_EXPLORER_URL=https://sepolia.etherscan.io
VITE_DEPLOY_BLOCK=12020002
```

## Continuous deployment

`.github/workflows/deploy.yml` builds the frontend and publishes it to GitHub Pages on every push to `main`. The `VITE_` values come from repository variables (Settings, Secrets and variables, Actions, Variables). A change to a variable only reaches the site after the workflow runs again.

## Project structure

```
contracts/      MediaRegistry.sol
test/           contract tests
scripts/        deploy.ts (chooses the deployer by network)
frontend/
  src/lib/      chain.ts (network and wallet), contract.ts (contract calls and events)
  src/App.tsx   the app
.github/workflows/deploy.yml
hardhat.config.ts
```

## Known limits

- **Test network only.** The contract is not audited and cannot be upgraded. It is not meant for real money.
- **Single reviewer.** One fixed address decides every dispute.
- **Public data.** The hash, creator name, notes and dispute texts are stored on a public chain and cannot be removed. Do not put private information in them.
- **Exact match only.** A re-encoded or edited copy of a file has a different fingerprint.
- **Free services.** The app depends on a free public RPC and a free history service, which can be slow or rate-limited. If the history service is down, the lists show a message, and checking a work still works.
- **Network lifetime.** Sepolia has a planned retirement date that has been under discussion. If it is shut down, the contract must be redeployed on the successor network and the settings above changed.

## Future work

- A reviewer panel with several reviewers and a vote, instead of one fixed address.
- An automatic prior-art check that flags a dispute when the challenger's evidence hash was registered earlier.
- A proof certificate (PDF or page) with the hash, owner, time, transaction and version history.
- Saving the event history as a file during the build, so the lists do not depend on a live history service.
- Publishing the contract source on Etherscan.