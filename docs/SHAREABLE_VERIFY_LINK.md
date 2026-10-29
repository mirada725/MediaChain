# MediaChain: Shareable Verify Link (Implementation)

A registered work gets a link like `http://localhost:5173/?hash=0x…`.

- Opening the link loads the registration record straight from the chain. No file and no wallet are needed, and a reload restores the result.
- After you check a file, a **Copy share link** button appears and the address bar updates to the same link.
- Each row in **Recent works** gets an **Open** button that loads that work in the Check tab.
- No contract changes, no new CSS, no router library. Only `frontend/src/App.tsx` changes.

Assumes the Recent works feed from the last stage is already in place. If it isn't, apply that first.

---

## 1. `frontend/src/App.tsx`

### 1a. State and opening helper in `App()`

Add these two lines right after the `connectIsInfo` state line:

```tsx
  const [linkHash, setLinkHash] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("hash")
  );

  const openWork = (hash: string) => {
    setLinkHash(hash);
    setTab("verify");
  };
```

### 1b. Render lines in `App()`

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
      </main>
```

### 1c. Replace the whole `VerifyPanel` function

Keep your own wording where it differs from mine. The parts that matter are the new prop, `loadRecord`, the link effect, `copyLink`, and the three marked additions in the JSX.

```tsx
function VerifyPanel({
  account,
  provider,
  onNeedWallet,
  linkHash,
}: {
  account: string | null;
  provider: BrowserProvider | null;
  onNeedWallet: () => void;
  linkHash: string | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [copied, setCopied] = useState(false);

  const clearLink = () =>
    window.history.replaceState(null, "", window.location.pathname);

  const onPick = (f: File | null) => {
    setResult(null);
    setError(null);
    setCopied(false);
    clearLink();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const problem = f ? checkFile(f) : null;
    if (!f || problem) {
      setFile(null);
      setPreviewUrl(null);
      if (problem) setError(problem);
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  // Loads a record by its fingerprint. Shared by the file check and share links.
  const loadRecord = useCallback(async (hash: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const contract = getReadContract(getReadProvider());
      const [exists, publisher, source, timestamp, editHistory, parentHash] =
        await contract.verifyMedia(hash);

      let chain: VersionLink[] | undefined;
      if (exists && parentHash !== ZERO_HASH) {
        chain = await getVersionChain(contract, parentHash);
      }

      let dispute: DisputeInfo | undefined;
      let arbiter: string | undefined;
      if (exists) {
        dispute = await getDisputeInfo(contract, hash);
        arbiter = await contract.arbiter();
      }

      setResult({
        exists,
        publisher,
        source,
        timestamp: exists ? new Date(Number(timestamp) * 1000).toLocaleString() : undefined,
        editHistory,
        hash,
        parentHash,
        chain,
        dispute,
        arbiter,
      });

      // Put the share link in the address bar for registered works.
      if (exists) window.history.replaceState(null, "", `?hash=${hash}`);
    } catch (err: any) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const onVerify = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const hash = await hashFile(file);
      await loadRecord(hash);
    } catch (err: any) {
      setError(formatError(err));
      setLoading(false);
    }
  };

  // Opened from a share link or from the Recent works list.
  useEffect(() => {
    if (!linkHash) return;
    if (!/^0x[0-9a-fA-F]{64}$/.test(linkHash)) {
      setError("This link doesn't look right. Please check it and try again.");
      return;
    }
    loadRecord(linkHash.toLowerCase());
  }, [linkHash, loadRecord]);

  const copyLink = async () => {
    if (!result) return;
    const url = `${window.location.origin}${window.location.pathname}?hash=${result.hash}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("We couldn't copy the link. You can copy it from the address bar instead.");
    }
  };

  const refreshDispute = async () => {
    if (!result) return;
    const contract = getReadContract(getReadProvider());
    const dispute = await getDisputeInfo(contract, result.hash);
    setResult({ ...result, dispute });
  };

  const upheld = result?.dispute?.status === 2;

  return (
    <div className="grid">
      <div className="card upload-card">
        <label className="dropzone">
          <input type="file" accept={ACCEPT} onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          {previewUrl ? (
            <div className="preview-wrap">
              {file?.type.startsWith("image/") ? (
                <img src={previewUrl} alt="preview" className="preview-img" />
              ) : (
                <div className="preview-file">{file?.name}</div>
              )}
              {result && (
                <div className={`badge ${result.exists && !upheld ? "badge-ok" : "badge-bad"}`}>
                  {!result.exists
                    ? "⚠ No matching registration found"
                    : upheld
                    ? "⚠ Registered, but an earlier owner was recognised"
                    : "✓ Registered: Proof of Authorship"}
                </div>
              )}
            </div>
          ) : (
            <div className="dropzone-empty">
              <span>Drop a design, photo, audio file, or PDF to check</span>
            </div>
          )}
        </label>
        <p className="muted">{SUPPORTED_NOTE}</p>
        <button className="btn btn-primary" onClick={onVerify} disabled={!file || loading}>
          {loading ? "Checking on-chain…" : "Check Authenticity"}
        </button>
        {error && <div className="inline-error">{error}</div>}
      </div>

      <div className="card details-card">
        <h3>On-chain record</h3>
        {!result && !loading && (
          <p className="muted">Check a file to see its proof-of-authorship record here.</p>
        )}
        {loading && !result && <p className="muted">Loading the record…</p>}

        {/* ADDITION 1: status message when there is no file preview (link mode) */}
        {result && !file && (
          <div className={result.exists && !upheld ? "inline-ok" : "inline-error"}>
            {!result.exists
              ? "No matching registration found"
              : upheld
              ? "Registered, but an earlier owner was recognised"
              : "Registered: proof of ownership"}
          </div>
        )}

        {result && (
          <>
            <dl className="record">
              <dt>Digital fingerprint</dt>
              <dd className="mono">{result.hash}</dd>
              <dt>Status</dt>
              <dd>{result.exists ? "Match found" : "No match on-chain"}</dd>
              {result.exists && (
                <>
                  <dt>Creator</dt>
                  <dd>{result.source || "—"}</dd>
                  <dt>Registered</dt>
                  <dd>{result.timestamp || "—"}</dd>
                  <dt>Notes</dt>
                  <dd>{result.editHistory || "—"}</dd>
                  <dt>Registered by</dt>
                  <dd className="mono">{result.publisher}</dd>
                </>
              )}
            </dl>

            {/* ADDITION 2: share link button and link-mode hint */}
            {result.exists && (
              <>
                <button className="btn btn-ghost" onClick={copyLink}>
                  {copied ? "Link copied" : "Copy share link"}
                </button>
                {!file && (
                  <p className="muted">
                    Opened from a link. To confirm that a file matches, choose it on
                    the left and check it.
                  </p>
                )}
              </>
            )}

            {result.exists && result.chain && result.chain.length > 0 && (
              <div className="version-history">
                <h4>Version history</h4>
                <ol className="version-list">
                  {result.chain.map((v, i) => (
                    <li key={v.hash}>
                      <span className="version-label">
                        {i === result.chain!.length - 1 ? "Original" : `Version ${result.chain!.length - i}`}
                      </span>
                      <span className="version-note">{v.editHistory || "—"}</span>
                      <span className="version-date">{v.timestamp}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {result.exists && result.dispute && result.publisher && (
              <DisputeSection
                hash={result.hash}
                publisher={result.publisher}
                arbiter={result.arbiter}
                dispute={result.dispute}
                account={account}
                provider={provider}
                onNeedWallet={onNeedWallet}
                onChanged={refreshDispute}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

`ADDITION 3` is the `linkHash` prop and the effect above. Nothing else in `DisputeSection` or `RegisterPanel` changes.

### 1d. `RecentPanel`: add the Open button

Change the function signature from `function RecentPanel() {` to:

```tsx
function RecentPanel({ onOpen }: { onOpen: (hash: string) => void }) {
```

Then, inside each `<li key={w.hash}>`, add this button as the last child (after the challenge pill block):

```tsx
              <button className="btn btn-ghost" onClick={() => onOpen(w.hash)}>
                Open
              </button>
```

---

## 2. Test

1. Save. Vite reloads.
2. **Check a file** that is registered. The address bar changes to `…/?hash=0x…`, and a **Copy share link** button appears under the record.
3. Click **Copy share link**, open a new tab, and paste it. The record loads with no file chosen and no wallet connected. You see the "Registered: proof of ownership" message, the record and the version history.
4. Reload that tab. The record loads again.
5. Open **Recent works** and click **Open** on a row. The Check tab shows that work's record.
6. Edit the link to a broken value, for example `?hash=0x123`. You should see "This link doesn't look right."
7. Use a well-formed hash that was never registered, for example `?hash=0x` followed by 64 zeros. You should see "No matching registration found" and no share button.
8. Choose a file after opening a link. The result is replaced by that file's check, and the address bar returns to the plain address until you check it.

## Notes

- **The link only works on the same chain.** Right now that is your local Hardhat node, so links work on your machine only. They become truly shareable after a public-network deployment.
- **Restarting the node breaks old links.** A reset chain has no records, so an old link shows "No matching registration found".
- **Going back to a tab.** Switching to Register and back to Check reloads the last opened link, because the app remembers it. Choosing a file clears the link from the address bar.
- **The link points to a record, it doesn't prove a file.** To confirm that a file matches, choose it and check it, which recomputes its fingerprint and looks it up.

## Commit

```
feat(frontend): add shareable verify links and open from recent works
```
