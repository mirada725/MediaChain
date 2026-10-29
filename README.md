# MediaChain

MediaChain is a media provenance demo built around a Solidity contract that anchors media hashes on-chain, tracks version lineage, and supports arbiter-resolved disputes.

## Repository layout

- `contracts/MediaRegistry.sol` - core smart contract
- `test/MediaRegistry.test.ts` - Hardhat + ethers contract tests
- `scripts/deploy.ts` - deployment script for local and Sepolia networks
- `backend/` - Express API for file upload, hashing, and on-chain register/verify calls
- `frontend/` - React + Vite dapp for direct wallet-based interaction

## Prerequisites

- Node.js 20+ (recommended)
- npm

## Smart contract workflow

From repository root:

```bash
npm install
npx hardhat test
```

Start a local chain:

```bash
npx hardhat node
```

Deploy `MediaRegistry` (in a second terminal):

```bash
npx hardhat run scripts/deploy.ts --network localhost
```

Deploy to Sepolia:

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat run scripts/deploy.ts --network sepolia
```

## Backend (optional API path)

The backend exposes:

- `POST /api/media/register` (multipart file + metadata)
- `POST /api/media/verify` (multipart file)
- `GET /health`

Setup:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Set `.env` values for `RPC_URL`, `CONTRACT_ADDRESS`, `PRIVATE_KEY`, and `PORT`.

## Frontend

The frontend can call the contract directly with MetaMask.

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Configure `.env.local` with your deployed contract address and target network values.
