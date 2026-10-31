import { Contract, Interface, type Signer, type Provider } from "ethers";
import artifact from "../contract-abi.json";
import {
  CONTRACT_ADDRESS,
  DEPLOY_BLOCK,
  LOGS_RPC_URL,
  RPC_URL,
  getLogsProvider,
  getReadProvider,
} from "./chain";


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
 * Event searches are split into pieces of this many blocks, because servers
 * often refuse one search that covers too many blocks.
 */
const LOG_CHUNK = 5000;

/**
 * The newest blocks are also searched on the normal RPC. The indexing service
 * can be a little behind the chain, so this makes a brand new registration
 * show up in the lists straight away.
 */
const RECENT_WINDOW = 1000;

/** Thrown when the event history cannot be read from the logs server. */
export class LogsUnavailableError extends Error {
  code = "LOGS_UNAVAILABLE";
  constructor() {
    super("Event history is unavailable.");
  }
}

async function searchRange(
  contract: Contract,
  eventName: string,
  from: number,
  to: number
): Promise<any[]> {
  const logs: any[] = [];
  for (let start = from; start <= to; start += LOG_CHUNK) {
    const end = Math.min(start + LOG_CHUNK - 1, to);
    logs.push(...(await contract.queryFilter(eventName, start, end)));
  }
  return logs;
}

/**
 * Finds every log of one event, from the deployment block to the latest block.
 * The full history comes from the logs server (VITE_LOGS_RPC_URL). The newest
 * blocks are added from the normal RPC when the two servers are different.
 */
async function findEvents(eventName: string): Promise<any[]> {
  const latest = await getReadProvider().getBlockNumber();

  const history = new Contract(CONTRACT_ADDRESS, ABI, getLogsProvider());
  let logs: any[];
  try {
    logs = await searchRange(history, eventName, DEPLOY_BLOCK, latest);
  } catch (err) {
    console.error(err); // technical details stay in the browser console
    throw new LogsUnavailableError();
  }

  if (LOGS_RPC_URL !== RPC_URL) {
    try {
      const recent = new Contract(CONTRACT_ADDRESS, ABI, getReadProvider());
      const from = Math.max(DEPLOY_BLOCK, latest - RECENT_WINDOW);
      const extra = await searchRange(recent, eventName, from, latest);
      const seen = new Set(logs.map((l) => `${l.transactionHash}-${l.index}`));
      for (const log of extra) {
        const key = `${log.transactionHash}-${log.index}`;
        if (!seen.has(key)) {
          seen.add(key);
          logs.push(log);
        }
      }
    } catch {
      // Best effort only. The history above is already complete up to what the
      // logs server has indexed.
    }
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
 * work's details. The event history comes from the logs server, starting at
 * the deployment block (VITE_DEPLOY_BLOCK).
 */
export async function getRecentWorks(
  contract: Contract,
  limit = 20
): Promise<RecentWork[]> {
  const [originals, versions] = await Promise.all([
    findEvents("MediaRegistered"),
    findEvents("MediaVersionRegistered"),
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
 */
export async function getOpenDisputes(contract: Contract): Promise<OpenDispute[]> {
  const logs = await findEvents("DisputeRaised");
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