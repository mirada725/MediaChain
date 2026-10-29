# MediaChain: Inline Dispute Review in the Arbiter Tab (Implementation)

The arbiter reviews and decides without leaving the **Disputes to review** tab.

- Each open dispute has a **Review** button. Clicking it opens a review panel at the top of the tab, under the Refresh button, with the work's details, the challenger's reason and evidence, and the **Reason for your decision** field with **Accept dispute** and **Decline dispute**. It reuses the existing `DisputeSection` component, so the buttons and their styling are exactly the ones you already have.
- After a decision, the panel closes, the list refreshes by itself, the dispute disappears, and a confirmation message appears.
- No contract changes and no new CSS. Two files change: `frontend/src/lib/contract.ts` and `frontend/src/App.tsx`.

This **replaces** the earlier `ReviewPanel` and `getOpenDisputes` from `ARBITER_REVIEW_TAB.md`. It no longer needs `openWork` for the review tab (the Recent works tab still uses it).

---

## 1. `frontend/src/lib/contract.ts`

Replace the earlier `OpenDispute` type and `getOpenDisputes` function with these. The differences are two new fields, `publisher` and `note`.

```ts
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
```

---

## 2. `frontend/src/App.tsx`

### 2a. Render line

In the `<main className="panel">` block, replace the review line:

```tsx
        {tab === "review" && isArbiter && <ReviewPanel onOpen={openWork} />}
```

with:

```tsx
        {tab === "review" && isArbiter && (
          <ReviewPanel
            account={account}
            provider={provider}
            arbiter={arbiterAddr}
            onNeedWallet={onConnect}
          />
        )}
```

### 2b. Replace the whole `ReviewPanel` function

```tsx
function ReviewPanel({
  account,
  provider,
  arbiter,
  onNeedWallet,
}: {
  account: string | null;
  provider: BrowserProvider | null;
  arbiter: string | null;
  onNeedWallet: () => void;
}) {
  const [items, setItems] = useState<OpenDispute[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<DisputeInfo | null>(null);

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

  // Opens or closes the review panel for one dispute.
  const toggle = async (hash: string) => {
    setNotice(null);
    setError(null);
    if (selected === hash) {
      setSelected(null);
      setDetail(null);
      return;
    }
    setSelected(hash);
    setDetail(null);
    try {
      const contract = getReadContract(getReadProvider());
      setDetail(await getDisputeInfo(contract, hash));
    } catch (err: any) {
      setError(formatError(err));
    }
  };

  // Runs after the arbiter's decision is confirmed.
  const onDecided = async () => {
    setSelected(null);
    setDetail(null);
    await load();
    setNotice("Your decision was recorded. This dispute is no longer in the list.");
  };

  const sel = items?.find((i) => i.hash === selected);

  return (
    <div className="card">
      <h3>Disputes to review</h3>
      <p className="muted">
        Open disputes, oldest first. Choose <b>Review</b> to see the details and make
        your decision here.
      </p>
      <button className="btn btn-ghost" onClick={load} disabled={loading}>
        {loading ? "Loading…" : "Refresh"}
      </button>

      {error && <div className="inline-error">{error}</div>}
      {notice && <div className="inline-ok">{notice}</div>}

      {sel && (
        <div>
          <h4>Reviewing: {sel.creator || "Unknown"}</h4>
          <dl className="record">
            <dt>Digital fingerprint</dt>
            <dd className="mono">{sel.hash}</dd>
            <dt>Creator</dt>
            <dd>{sel.creator || "—"}</dd>
            <dt>Registered</dt>
            <dd>{sel.registered}</dd>
            <dt>Notes</dt>
            <dd>{sel.note || "—"}</dd>
            <dt>Registered by</dt>
            <dd className="mono">{sel.publisher}</dd>
          </dl>
          {detail ? (
            <DisputeSection
              key={sel.hash}
              hash={sel.hash}
              publisher={sel.publisher}
              arbiter={arbiter ?? undefined}
              dispute={detail}
              account={account}
              provider={provider}
              onNeedWallet={onNeedWallet}
              onChanged={onDecided}
            />
          ) : (
            <p className="muted">Loading the dispute…</p>
          )}
        </div>
      )}

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
              <button className="btn btn-primary" onClick={() => toggle(d.hash)}>
                {selected === d.hash ? "Close" : "Review"}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

`DisputeSection` and everything else stay unchanged.

---

## 3. Test

You need Publisher (#0), Challenger (#1) and Reviewer (#2, the arbiter), all connected to `localhost`.

1. Save. Vite reloads.
2. Set up two disputes: register `a.png` and `b.png` as Publisher, then challenge both as Challenger, with different reasons.
3. **As the Reviewer**, open **Disputes to review**. Two rows appear, the one raised first on top, each with a **Review** button.
4. Click **Review** on the first row. A panel opens under the Refresh button with the fingerprint, creator, date, notes, the challenger's reason and the **Reason for your decision** field with **Accept dispute** and **Decline dispute**.
5. Click **Review** on the second row. The panel switches to that work. Click **Close** on it, and the panel closes.
6. Open the first row again, type a reason and click **Decline dispute**. Confirm in MetaMask. The panel closes, the row disappears, and the green message "Your decision was recorded…" appears.
7. Accept the second dispute the same way. The list then says "No disputes are waiting for review."
8. Check the declined work as the Challenger. It shows "Dispute rejected", and the challenger can submit again. The re-raised dispute appears in the Reviewer's list.
9. As the Publisher or Challenger, the **Disputes to review** tab isn't there.
10. Reject the MetaMask prompt on a decision. The panel stays open and shows "You cancelled the request. Nothing was registered."

## Notes

- **The panel is at the top of the tab**, above the list. I placed it there so it's visible without scrolling on a long list.
- **No version history in the panel.** It shows the work's own record. If the arbiter needs the full version chain, the Check tab still shows it: choose the file, or use the share link.
- **The evidence file isn't shown.** Files never leave a person's device. The challenger sends the file, the reviewer chooses it in the Check tab, and its fingerprint should match the one in the row.
- **Two arbiters or two tabs.** If another decision is made elsewhere, the list is stale until you click Refresh. The contract rejects a second decision with "There is no open dispute to decide on for this work."

## Commit

```
feat(frontend): review disputes inline in the arbiter tab
```
