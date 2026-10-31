import { Contract, Interface, type Signer, type Provider } from "ethers";
import artifact from "../contract-abi.json";
import {
  CHAIN_ID,
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

// ---------------------------------------------------------------------------
// Reading the event history
// ---------------------------------------------------------------------------

/**
 * The newest blocks are also read from the normal RPC. The history service can
 * be a little behind the chain, so this makes a brand new registration show up
 * straight away.
 */
const RECENT_WINDOW = 1000;

/**
 * The cache never trusts the newest blocks. It remembers events only up to
 * (latest block - this number), so events the history service has not indexed
 * yet are searched again next time.
 */
const CACHE_SAFETY = 100;

/** Minimum time between two real searches. Calls inside this time share the last answer. */
const REUSE_MS = 3000;

/** One event found on the chain, reduced to what the app needs. */
type ChainEvent = {
  name: string; // e.g. "MediaRegistered"
  hash: string; // the file fingerprint (first argument of every event)
  blockNumber: number;
  index: number;
  tx: string;
};

/** Thrown when the event history cannot be read. */
export class LogsUnavailableError extends Error {
  code: string;
  constructor(busy: boolean) {
    super(busy ? "The history service is busy." : "Event history is unavailable.");
    this.code = busy ? "LOGS_BUSY" : "LOGS_UNAVAILABLE";
  }
}

function isRateLimited(err: any): boolean {
  let text = String(err?.message ?? "");
  try {
    text += JSON.stringify(err?.info ?? {});
  } catch {
    /* ignore */
  }
  return /429|too many/i.test(text);
}

/**
 * Reads all events of the contract between two blocks in ONE request and
 * turns them into simple objects. If the server fails for a reason other than
 * rate limiting, the range is split in two and tried again (at most twice).
 */
async function fetchRange(
  provider: Provider,
  from: number,
  to: number,
  depth = 0
): Promise<ChainEvent[]> {
  if (from > to) return [];
  try {
    const logs = await provider.getLogs({
      address: CONTRACT_ADDRESS,
      fromBlock: from,
      toBlock: to,
    });
    const events: ChainEvent[] = [];
    for (const log of logs) {
      let parsed;
      try {
        parsed = IFACE.parseLog({ topics: [...log.topics], data: log.data });
      } catch {
        continue; // not an event from our ABI
      }
      if (!parsed) continue;
      events.push({
        name: parsed.name,
        hash: String(parsed.args[0]),
        blockNumber: log.blockNumber,
        index: log.index,
        tx: log.transactionHash,
      });
    }
    return events;
  } catch (err) {
    if (isRateLimited(err) || depth >= 2 || to - from < 2) throw err;
    const mid = Math.floor((from + to) / 2);
    const left = await fetchRange(provider, from, mid, depth + 1);
    const right = await fetchRange(provider, mid + 1, to, depth + 1);
    return [...left, ...right];
  }
}

// --- browser cache (not used on the local Hardhat chain, which resets often) ---

type EventCache = { scannedTo: number; events: ChainEvent[] };

const USE_CACHE = CHAIN_ID !== 31337;
const CACHE_KEY = `mediachain:events:${CHAIN_ID}:${CONTRACT_ADDRESS.toLowerCase()}:${DEPLOY_BLOCK}`;

function readCache(): EventCache | null {
  if (!USE_CACHE) return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.scannedTo !== "number" || !Array.isArray(parsed?.events)) return null;
    return parsed as EventCache;
  } catch {
    return null; // storage blocked or data damaged: just search again
  }
}

function writeCache(cache: EventCache) {
  if (!USE_CACHE) return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or blocked: the page still works without a cache */
  }
}

// --- loading with shared requests ---

let inflight: Promise<ChainEvent[]> | null = null;
let lastLoad: { at: number; events: ChainEvent[] } | null = null;

async function doLoad(): Promise<ChainEvent[]> {
  const latest = await getReadProvider().getBlockNumber();

  let cache = readCache();
  if (cache && cache.scannedTo > latest) cache = null; // data from another chain: ignore
  const from = cache ? Math.max(DEPLOY_BLOCK, cache.scannedTo) : DEPLOY_BLOCK;

  // 1. History from the logs service: ONE request for the whole missing range.
  let fresh: ChainEvent[] = [];
  let failure: unknown = null;
  try {
    fresh = await fetchRange(getLogsProvider(), from, latest);
  } catch (err) {
    console.error(err); // technical details stay in the browser console
    failure = err;
  }
  // Without any saved history, a failure cannot be hidden.
  if (failure && !cache) throw new LogsUnavailableError(isRateLimited(failure));

  // 2. Merge saved events, fresh events, and the newest blocks from the normal RPC.
  const merged = new Map<string, ChainEvent>();
  const add = (list: ChainEvent[]) => {
    for (const e of list) merged.set(`${e.tx}-${e.index}`, e);
  };
  if (cache) add(cache.events);
  add(fresh);
  if (LOGS_RPC_URL !== RPC_URL) {
    try {
      add(await fetchRange(getReadProvider(), Math.max(DEPLOY_BLOCK, latest - RECENT_WINDOW), latest));
    } catch {
      /* best effort only */
    }
  }
  const events = Array.from(merged.values());

  // 3. Save for the next visit, only after a fully successful search.
  if (!failure) {
    writeCache({ scannedTo: Math.max(DEPLOY_BLOCK, latest - CACHE_SAFETY), events });
  }
  return events;
}

/** All events of the contract. Two callers at the same moment share one search. */
function loadAllEvents(): Promise<ChainEvent[]> {
  if (inflight) return inflight;
  if (lastLoad && Date.now() - lastLoad.at < REUSE_MS) {
    return Promise.resolve(lastLoad.events);
  }
  inflight = doLoad()
    .then((events) => {
      lastLoad = { at: Date.now(), events };
      return events;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function findEvents(eventName: string): Promise<ChainEvent[]> {
  const all = await loadAllEvents();
  return all.filter((e) => e.name === eventName);
}

// ---------------------------------------------------------------------------

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
 * work's details from the contract.
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
    ...originals.map((event) => ({ event, isVersion: false })),
    ...versions.map((event) => ({ event, isVersion: true })),
  ]
    .sort(
      (a, b) =>
        b.event.blockNumber - a.event.blockNumber || b.event.index - a.event.index
    )
    .slice(0, limit);

  return Promise.all(
    entries.map(async ({ event, isVersion }) => {
      const hash = event.hash;
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
  const events = await findEvents("DisputeRaised");
  const hashes = Array.from(new Set(events.map((e) => e.hash)));

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