import { Contract, Interface, type Signer, type Provider } from "ethers";
import artifact from "../contract-abi.json";
import { CONTRACT_ADDRESS, DEPLOY_BLOCK } from "./chain";


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

/**
 * Free public RPC servers often refuse a log search that covers too many blocks.
 * So we search in small pieces, from the deployment block up to the latest block.
 */
const LOG_CHUNK = 5000;

async function queryInChunks(contract: Contract, filter: any): Promise<any[]> {
  const provider = contract.runner?.provider;
  if (!provider) {
    throw new Error("No provider available to read events.");
  }
  const latest = await provider.getBlockNumber();
  const logs: any[] = [];
  for (let from = DEPLOY_BLOCK; from <= latest; from += LOG_CHUNK) {
    const to = Math.min(from + LOG_CHUNK - 1, latest);
    const part = await contract.queryFilter(filter, from, to);
    logs.push(...part);
  }
  return logs;
}

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

export type DisputeInfo = {
  status: number; // 0 None, 1 Open, 2 Upheld, 3 Rejected
  challenger: string;
  evidenceHash: string;
  evidenceNote: string;
  raisedAt?: string;
  ruling: string;
  resolvedAt?: string;
};

export const DISPUTE_LABELS = [
  "No challenge",
  "Challenge open: waiting for review",
  "Challenge accepted: earlier ownership recognised",
  "Dispute rejected",
];

export async function getDisputeInfo(contract: Contract, hash: string): Promise<DisputeInfo> {
  const [status, challenger, evidenceHash, evidenceNote, raisedAt, ruling, resolvedAt] =
    await contract.getDispute(hash);
  const fmt = (t: bigint) => (t > 0n ? new Date(Number(t) * 1000).toLocaleString() : undefined);
  return {
    status: Number(status),
    challenger,
    evidenceHash,
    evidenceNote,
    raisedAt: fmt(raisedAt),
    ruling,
    resolvedAt: fmt(resolvedAt),
  };
}

export type RecentWork = {
  hash: string;
  creator: string;
  note: string;
  date: string;
  isVersion: boolean;
  disputeStatus: number; // 0 none, 1 open, 2 accepted, 3 declined
};

/**
 * Reads registration events from the chain, newest first, and fills in each
 * work's details. The search starts at the deployment block (VITE_DEPLOY_BLOCK)
 * and runs in small pieces, so it also works on a free public RPC.
 */
export async function getRecentWorks(
  contract: Contract,
  limit = 20
): Promise<RecentWork[]> {
  const [originals, versions] = await Promise.all([
    queryInChunks(contract, contract.filters.MediaRegistered()),
    queryInChunks(contract, contract.filters.MediaVersionRegistered()),
  ]);

  const entries = [
    ...originals.map((log) => ({ log: log as any, isVersion: false })),
    ...versions.map((log) => ({ log: log as any, isVersion: true })),
  ]
    .sort(
      (a, b) =>
        b.log.blockNumber - a.log.blockNumber || b.log.index - a.log.index
    )
    .slice(0, limit);

  return Promise.all(
    entries.map(async ({ log, isVersion }) => {
      const hash: string = log.args[0];
      const [, , sourceName, timestamp, editHistory] =
        await contract.verifyMedia(hash);
      const [status] = await contract.getDispute(hash);
      return {
        hash,
        creator: sourceName,
        note: editHistory,
        date: new Date(Number(timestamp) * 1000).toLocaleString(),
        isVersion,
        disputeStatus: Number(status),
      };
    })
  );
}

export type OpenDispute = {
  hash: string;
  creator: string;
  publisher: string;
  note: string;
  registered: string;
  challenger: string;
  reason: string;
  evidenceHash: string;
  raisedAt: string;
  raisedAtRaw: number;
};

/**
 * Finds every work whose dispute is still open, oldest first.
 * Reads DisputeRaised events, then checks each work's current status.
 * The search starts at the deployment block and runs in small pieces.
 */
export async function getOpenDisputes(contract: Contract): Promise<OpenDispute[]> {
  const logs = await queryInChunks(contract, contract.filters.DisputeRaised());
  const hashes = Array.from(new Set(logs.map((l) => (l as any).args[0] as string)));

  const items = await Promise.all(
    hashes.map(async (hash) => {
      const [status, challenger, evidenceHash, evidenceNote, raisedAt] =
        await contract.getDispute(hash);
      if (Number(status) !== 1) return null; // not open any more

      const [, publisher, sourceName, timestamp, editHistory] =
        await contract.verifyMedia(hash);
      const item: OpenDispute = {
        hash,
        creator: sourceName,
        publisher,
        note: editHistory,
        registered: new Date(Number(timestamp) * 1000).toLocaleString(),
        challenger,
        reason: evidenceNote,
        evidenceHash,
        raisedAt: new Date(Number(raisedAt) * 1000).toLocaleString(),
        raisedAtRaw: Number(raisedAt),
      };
      return item;
    })
  );

  return items
    .filter((x): x is OpenDispute => x !== null)
    .sort((a, b) => a.raisedAtRaw - b.raisedAtRaw);
}