import { Contract, type Signer, type Provider } from "ethers";
import artifact from "../contract-abi.json";
import { CONTRACT_ADDRESS } from "./chain";

// Matches your MediaRegistry.sol exactly (registerMedia, verifyMedia,
// MediaRegistered event, AlreadyRegistered error). Human-readable ABI
// strings — no need to copy a compiled artifact JSON.
const ABI = artifact.abi;

if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
  // Not thrown at import time on purpose — lets the UI render a clear setup
  // notice instead of a blank white screen.
  console.warn(
    "[MediaChain] VITE_CONTRACT_ADDRESS is not set. Copy .env.example to .env.local and fill it in."
  );
}

export function isConfigured(): boolean {
  return Boolean(CONTRACT_ADDRESS) &&
    CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000" &&
    Array.isArray(ABI) &&
    ABI.length > 0;
}

/** Contract instance for a wallet-signed write (registerMedia). */
export function getWriteContract(signer: Signer) {
  return new Contract(CONTRACT_ADDRESS, ABI, signer);
}

/** Contract instance for a free, read-only call (verifyMedia) — no wallet needed. */
export function getReadContract(provider: Provider) {
  return new Contract(CONTRACT_ADDRESS, ABI, provider);
}
