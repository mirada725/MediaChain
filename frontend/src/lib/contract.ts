import { Contract, Interface, type Signer, type Provider } from "ethers";
import artifact from "../contract-abi.json";
import { CONTRACT_ADDRESS } from "./chain";

// Matches your MediaRegistry.sol exactly (registerMedia, verifyMedia,
// MediaRegistered event, AlreadyRegistered error). Human-readable ABI
// strings — no need to copy a compiled artifact JSON.
const ABI = artifact.abi;
export const IFACE = new Interface(ABI);

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

export const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000".slice(0, 66);

export type VersionLink = {
  hash: string;
  sourceName: string;
  timestamp: string;
  editHistory: string;
};

/**
 * Walks the parentHash chain backwards from a hash's own parent, oldest last.
 * Client-side, not on-chain — each hop is one free verifyMedia() read call.
 * Capped at 20 hops as a sanity bound; a real version chain should never get
 * near that in a class demo.
 */
export async function getVersionChain(
  contract: Contract,
  startParentHash: string,
  maxHops = 20
): Promise<VersionLink[]> {
  const chain: VersionLink[] = [];
  let current = startParentHash;
  let hops = 0;

  while (current !== ZERO_HASH && hops < maxHops) {
    const [exists, , sourceName, timestamp, editHistory, parentHash] =
      await contract.verifyMedia(current);
    if (!exists) break;
    chain.push({
      hash: current,
      sourceName,
      timestamp: new Date(Number(timestamp) * 1000).toLocaleString(),
      editHistory,
    });
    current = parentHash;
    hops++;
  }

  return chain;
}