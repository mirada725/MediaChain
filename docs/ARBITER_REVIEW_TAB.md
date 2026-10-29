# MediaChain: Arbiter-Only "Disputes to Review" Tab (Implementation)

A fourth tab, **Disputes to review**, that appears only when the connected wallet is the contract's arbiter.

- Lists every dispute that is still open, oldest first, so the longest-waiting case is on top.
- Each row shows the creator, who challenged, their reason, when it was raised, the evidence fingerprint (if any) and an **Open** button. **Open** loads the work in the Check tab, where the Accept and Decline buttons are.
- Reads the `DisputeRaised` events, then keeps only works whose current status is still open. Decided disputes drop out, and a re-raised dispute after a decline shows up again.
- No contract changes, no new CSS. Two files change: `frontend/src/lib/contract.ts` and `frontend/src/App.tsx`.

Assumes the last two stages (Recent works and the shareable link) are in place. This tab uses `openWork`, `short` and `shortHash` from them.

---

## 1. `frontend/src/lib/contract.ts` (snippet)

Append at the end of the file:

```ts
export type OpenDispute = {
  hash: string;
  creator: string;
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
 * Local chain only: it scans from block 0.
 */
export async function getOpenDisputes(contract: Contract): Promise<OpenDispute[]> {
  const logs = await contract.queryFilter(contract.filters.DisputeRaised(), 0, "latest");
  const hashes = Array.from(new Set(logs.map((l) => (l as any).args[0] as string)));

  const items = await Promise.all(
    hashes.map(async (hash) => {
      const [status, challenger, evidenceHash, evidenceNote, raisedAt] =
        await contract.getDispute(hash);
      if (Number(status) !== 1) return null; // not open any more

      const [, , sourceName, timestamp] = await contract.verifyMedia(hash);
      const item: OpenDispute = {
        hash,
        creator: sourceName,
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
```

---

## 2. `frontend/src/App.tsx`

### 2a. Import block

Replace the `./lib/contract` import with this (adds `getOpenDisputes` and `type OpenDispute`):

```tsx
import {
  getReadContract,
  getWriteContract,
  isConfigured,
  getVersionChain,
  getDisputeInfo,
  getRecentWorks,
  getOpenDisputes,
  IFACE,
  ZERO_HASH,
  DISPUTE_LABELS,
  type VersionLink,
  type DisputeInfo,
  type RecentWork,
  type OpenDispute,
} from "./lib/contract";
```

### 2b. Tab type

Replace:

```tsx
type Tab = "verify" | "register" | "recent";
```

with:

```tsx
type Tab = "verify" | "register" | "recent" | "review";
```

### 2c. Arbiter detection in `App()`

Add this block in `App()`, right after the `openWork` function:

```tsx
  const [arbiterAddr, setArbiterAddr] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured()) return;
    getReadContract(getReadProvider())
      .arbiter()
      .then((a: string) => setArbiterAddr(a))
      .catch(() => {});
  }, []);

  const isArbiter =
    !!account && !!arbiterAddr && account.toLowerCase() === arbiterAddr.toLowerCase();

  // If the wallet switches away from the arbiter account, leave the review tab.
  useEffect(() => {
    if (tab === "review" && !isArbiter) setTab("verify");
  }, [tab, isArbiter]);
```

### 2d. Tab button

In the `<nav className="tabs">` block, add this after the "Recent works" button:

```tsx
        {isArbiter && (
          <button
            className={`tab ${tab === "review" ? "active" : ""}`}
            onClick={() => setTab("review")}
          >
            Disputes to review
          </button>
        )}
```

### 2e. Render the new tab

Replace the whole `<main className="panel">` block with:

```tsx
      <main className="panel">
        {tab === "verify" && (
          <VerifyPanel
            account={account}
            provider={provider}
            onNeedWallet={onConnect}
            linkHash={linkHash}
          />
        )}
        {tab === "register" && (
          <RegisterPanel account={account} provider={provider} onNeedWallet={onConnect} />
        )}
        {tab === "recent" && <RecentPanel onOpen={openWork} />}
        {tab === "review" && isArbiter && <ReviewPanel onOpen={openWork} />}
      </main>
```

### 2f. New component

Add at the very end of `App.tsx`:

```tsx
function ReviewPanel({ onOpen }: { onOpen: (hash: string) => void }) {
  const [items, setItems] = useState<OpenDispute[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const contract = getReadContract(getReadProvider());
      setItems(await getOpenDisputes(contract));
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
      <h3>Disputes to review</h3>
      <p className="muted">
        Open disputes, oldest first. Choose <b>Open</b> to see the work and make your
        decision. After deciding, come back and refresh.
      </p>
      <button className="btn btn-ghost" onClick={load} disabled={loading}>
        {loading ? "Loading…" : "Refresh"}
      </button>

      {error && <div className="inline-error">{error}</div>}

      {items && items.length === 0 && !loading && (
        <p className="muted">No disputes are waiting for review.</p>
      )}

      {items && items.length > 0 && (
        <ol className="version-list">
          {items.map((d) => (
            <li key={d.hash}>
              <span className="version-label">{d.creator || "Unknown"}</span>
              <span className="version-note">Reason: {d.reason || "—"}</span>
              <span className="version-date">Raised {d.raisedAt}</span>
              <span className="muted">
                Challenged by <span className="mono">{short(d.challenger)}</span>
              </span>
              <span className="mono">{shortHash(d.hash)}</span>
              {d.evidenceHash !== ZERO_HASH && (
                <span className="muted">
                  Evidence fingerprint: <span className="mono">{shortHash(d.evidenceHash)}</span>
                </span>
              )}
              <button className="btn btn-ghost" onClick={() => onOpen(d.hash)}>
                Open
              </button>
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

You need three accounts connected to `localhost`: Publisher (#0), Challenger (#1) and Reviewer (#2, the arbiter).

1. Save. Vite reloads.
2. **As the Reviewer (#2):** the address at the top right reads `0x3C44…93BC` and a fourth tab, **Disputes to review**, appears. With no open disputes it says "No disputes are waiting for review."
3. **As the Publisher (#0) or Challenger (#1):** the tab is not there.
4. **Create a dispute.** Register `a.png` as Publisher, then challenge it as Challenger with a reason and an earlier file.
5. **As the Reviewer**, open **Disputes to review** and click **Refresh**. A row appears with the creator, reason, challenger, raise time and the evidence fingerprint.
6. Click **Open**. The Check tab loads that work with **Reviewer decision** and both buttons.
7. Decide (accept or decline), return to **Disputes to review** and click **Refresh**. The row is gone.
8. Decline a dispute, then re-raise it as the Challenger. It appears again in the list.
9. Raise two disputes on two files. The one raised first is on top.
10. Switch MetaMask from the Reviewer to another account while on the review tab. The page returns to the Check tab.

## Notes

- **Hiding the tab is a convenience, not security.** The contract itself refuses anyone but the arbiter (`NotArbiter`). The dispute events are public, so anyone could read the queue from the chain.
- **The evidence file is not in the list.** Files never leave a person's device. To check it, the challenger sends the file, the reviewer chooses it in the Check tab, and its fingerprint should equal the one in the row.
- **No notification.** A blockchain can't push messages, so the arbiter has to open the tab or click Refresh.
- **Restarting the Hardhat node** empties the list, because the chain is wiped.
- **Old deployments.** If your contract was deployed from account #0, then #0 is the arbiter and sees the tab. Check with `arbiter()` in the Hardhat console.

## Commit

```
feat(frontend): add arbiter-only tab listing disputes to review
```
