# MediaChain frontend

React + TypeScript + Vite dapp. Talks **directly to the Ethereum contract** —
register is a wallet-signed transaction via MetaMask, verify is a free
read-only call. No backend server involved in this demo path (your Express
API from Phase 2 still exists and still works independently).

## Setup (Windows / PowerShell, alongside `E:\My Projects\mediachain`)

1. Copy this whole `mediachain-frontend` folder next to your existing
   `mediachain` repo, e.g. `E:\My Projects\mediachain-frontend`.
2. `npm install`
3. Start your local chain and deploy, same as always:
   ```
   npx hardhat node
   npx hardhat run scripts/deploy.ts --network localhost
   ```
   Copy the deployed contract address it prints.
4. Copy `.env.example` to `.env.local` and paste the address into
   `VITE_CONTRACT_ADDRESS`.
5. `npm run dev` and open the printed `localhost` URL.
   (`src/contract-abi.json` already matches your `MediaRegistry.sol` exactly
   — nothing to copy or edit there.)
6. Install the MetaMask browser extension if you don't have it, and make
   sure one of Hardhat's default dev accounts has ETH — it does by default
   on `npx hardhat node`. Import one of the printed private keys into
   MetaMask so you have an account with test ETH to sign with.

## Notes

- `src/lib/hash.ts` hashes raw file bytes with `keccak256`, matching your
  backend's `hash.ts`.
- `src/contract-abi.json` is a hand-written ABI matching `MediaRegistry.sol`
  exactly (`registerMedia`, `verifyMedia`, `MediaRegistered`,
  `AlreadyRegistered`) — no compiled artifact needed.
- If MetaMask doesn't have the Hardhat network yet, `connectWallet()` adds it
  automatically (chain id 31337, RPC `http://127.0.0.1:8545` by default).
