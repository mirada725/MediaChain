# MediaChain: Recent Works Feed (Implementation)

Adds a third tab, **Recent works**, that lists the latest 20 registrations, newest first.

- No contract changes. No new CSS. It reuses your existing `card`, `muted`, `mono`, `btn btn-ghost`, `version-list` and `dispute-pill` styles.
- Two files change: `frontend/src/lib/contract.ts` (one new function) and `frontend/src/App.tsx` (import, tab type, tab button, render line, one new component).
- The feed reads the `MediaRegistered` and `MediaVersionRegistered` events from the chain, then calls `verifyMedia` and `getDispute` for each hash.

Both events are already in your `contract-abi.json`, so the ABI needs no change.

---

## 1. `frontend/src/lib/contract.ts` (snippet)

Append at the very end of the file:

```ts
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
 * work's details. Local chain only: it scans from block 0, which is fine here.
 */
export async function getRecentWorks(
  contract: Contract,
  limit = 20
): Promise<RecentWork[]> {
  const [originals, versions] = await Promise.all([
    contract.queryFilter(contract.filters.MediaRegistered(), 0, "latest"),
    contract.queryFilter(contract.filters.MediaVersionRegistered(), 0, "latest"),
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
```

---

## 2. `frontend/src/App.tsx`

### 2a. Import block

Replace the `./lib/contract` import with this (two lines added: `getRecentWorks` and `type RecentWork`):

```tsx
import {
  getReadContract,
  getWriteContract,
  isConfigured,
  getVersionChain,
  getDisputeInfo,
  getRecentWorks,
  IFACE,
  ZERO_HASH,
  DISPUTE_LABELS,
  type VersionLink,
  type DisputeInfo,
  type RecentWork,
} from "./lib/contract";
```

### 2b. Tab type

Replace:

```tsx
type Tab = "verify" | "register";
```

with:

```tsx
type Tab = "verify" | "register" | "recent";
```

### 2c. Helper for shortening a fingerprint

Add this right below the existing `short` function:

```tsx
function shortHash(h: string) {
  return h.slice(0, 10) + "…" + h.slice(-6);
}
```

### 2d. Tab button

In the `<nav className="tabs">` block, add this third button after the "Register my work" button:

```tsx
        <button
          className={`tab ${tab === "recent" ? "active" : ""}`}
          onClick={() => setTab("recent")}
        >
          Recent works
        </button>
```

### 2e. Render the new tab

Replace the whole `<main className="panel">` block with:

```tsx
      <main className="panel">
        {tab === "verify" && (
          <VerifyPanel account={account} provider={provider} onNeedWallet={onConnect} />
        )}
        {tab === "register" && (
          <RegisterPanel account={account} provider={provider} onNeedWallet={onConnect} />
        )}
        {tab === "recent" && <RecentPanel />}
      </main>
```

### 2f. New component

Add this at the very end of `App.tsx`, after `RegisterPanel`:

```tsx
function RecentPanel() {
  const [works, setWorks] = useState<RecentWork[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const contract = getReadContract(getReadProvider());
      setWorks(await getRecentWorks(contract, 20));
    } catch (err: any) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="card">
      <h3>Recent works</h3>
      <p className="muted">
        The latest registrations, newest first. Only fingerprints are stored, so
        the files themselves are never shown here.
      </p>
      <button className="btn btn-ghost" onClick={load} disabled={loading}>
        {loading ? "Loading…" : "Refresh"}
      </button>

      {error && <div className="inline-error">{error}</div>}

      {works && works.length === 0 && !loading && (
        <p className="muted">No works have been registered yet.</p>
      )}

      {works && works.length > 0 && (
        <ol className="version-list">
          {works.map((w) => (
            <li key={w.hash}>
              <span className="version-label">
                {w.creator || "Unknown"}
                {w.isVersion ? " · New version" : ""}
              </span>
              <span className="version-note">{w.note || "—"}</span>
              <span className="version-date">{w.date}</span>
              <span className="mono">{shortHash(w.hash)}</span>
              {w.disputeStatus !== 0 && (
                <span
                  className={`dispute-pill dispute-${
                    ["none", "open", "upheld", "rejected"][w.disputeStatus]
                  }`}
                >
                  {DISPUTE_LABELS[w.disputeStatus]}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

---

## 3. Test

1. Save both files. Vite reloads the page.
2. Open **Recent works**. It should list every work you registered on the current chain, newest first, with the creator name, note, date and a shortened fingerprint.
3. Register a new file, switch back to **Recent works** and click **Refresh**. The new work appears at the top.
4. Register a new version of a work. Its row shows "· New version" after the creator name.
5. Raise a challenge on a work. Its row shows the challenge status pill.
6. Stop the Hardhat node and click **Refresh**. You should see the red "We couldn't reach the network" or "Something went wrong" message instead of a blank page.

If the list is empty right after a fresh deploy, that's correct: a new chain has no registrations.

## Notes

- **Not the artwork.** The chain holds fingerprints only, so the feed lists records, not previews.
- **Scans from block 0.** Fine for a local chain. On a public network, pass the deploy block number instead of `0` in the two `queryFilter` calls.
- **Newest first** means newest by block, then by position within the block.
- **A reset chain empties the feed.** Restarting the Hardhat node wipes all registrations, so register your test files again.

## Commit

```
feat(frontend): add recent works feed
```
