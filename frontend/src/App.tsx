import { useState, useCallback, useEffect } from "react";
import type { BrowserProvider } from "ethers";
import { connectWallet, getReadProvider } from "./lib/chain";
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

import { hashFile } from "./lib/hash";
import { checkFile, ACCEPT, SUPPORTED_NOTE } from "./lib/fileTypes";
import "./App.css";

type Tab = "verify" | "register" | "recent";


type VerifyResult = {
  exists: boolean;
  publisher?: string;
  source?: string;
  timestamp?: string;
  editHistory?: string;
  hash: string;
  parentHash?: string;
  chain?: VersionLink[];
  dispute?: DisputeInfo;
  arbiter?: string;
};

function short(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function shortHash(h: string) {
  return h.slice(0, 10) + "…" + h.slice(-6);
}

function formatError(err: any): string {
  console.error(err); // technical details stay in the browser console

  const code = err?.code;
  if (code === "ACTION_REJECTED" || code === 4001)
    return "You cancelled the request. Nothing was registered.";
  if (code === "NO_WALLET")
    return "Connect the MetaMask wallet to register work.";
  if (code === -32002)
    return "A request is already waiting in MetaMask. Please open MetaMask to continue.";
  if (code === "INSUFFICIENT_FUNDS")
    return "Your wallet doesn't have enough funds to pay the network fee.";
  if (code === "NETWORK_ERROR")
    return "We couldn't reach the network. Please check your connection and try again.";

  const data = err?.data ?? err?.info?.error?.data ?? err?.error?.data;
  if (typeof data === "string" && data.startsWith("0x")) {
    try {
      const parsed = IFACE.parseError(data);
      const messages: Record<string, string> = {
        AlreadyRegistered: "This file has already been registered.",
        ParentNotFound: "We couldn't find the earlier version. Please register it first.",
        NotParentPublisher:
          "Only the person who registered the earlier version can add a new one to it.",
        MediaNotFound: "This work hasn't been registered, so it can't be disputed.",
        CannotDisputeOwnWork: "You registered this work, so you can't dispute it.",
        DisputeAlreadyOpen: "A dispute on this work is already waiting for review.",
        DisputeAlreadyUpheld:
          "A dispute on this work was already accepted, and that decision is final.",
        NotArbiter: "Only the assigned reviewer can decide on disputes.",
        NoOpenDispute: "There is no open dispute to decide on for this work.",
      };
      if (parsed && messages[parsed.name]) return messages[parsed.name];
    } catch {
      /* fall through */
    }
  }

  return "Something went wrong. Please try again. If this keeps happening, refresh the page.";
}

export default function App() {
  const [tab, setTab] = useState<Tab>("verify");
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectIsInfo, setConnectIsInfo] = useState(false);

  const onConnect = useCallback(async () => {
    setConnecting(true);
    setConnectError(null);
    setConnectIsInfo(false);
    try {
      const { provider, address } = await connectWallet();
      setProvider(provider);
      setAccount(address);
    } catch (err: any) {
      setConnectIsInfo(err?.code === "NO_WALLET");
      setConnectError(formatError(err));
    } finally {
      setConnecting(false);
    }
  }, []);

  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth?.on) return;
    const handler = (accounts: string[]) => {
      if (accounts.length > 0) {
        onConnect();
      } else {
        setAccount(null);
        setProvider(null);
      }
    };
    eth.on("accountsChanged", handler);
    return () => eth.removeListener("accountsChanged", handler);
  }, [onConnect]);

    useEffect(() => {
    (window as any).ethereum
      ?.request({ method: "eth_accounts" })
      .then((accts: string[]) => {
        if (accts.length > 0) onConnect();
      })
      .catch(() => {});
  }, [onConnect]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <div className="brand-text">
            <span className="brand-name">MediaChain</span>
            <span className="brand-tagline">Undeniable proof of prior art, anchored on Ethereum</span>
          </div>
        </div>
        <div className="wallet">
          {account ? (
            <span className="wallet-pill connected">● {short(account)}</span>
          ) : (
            <button className="btn btn-ghost" onClick={onConnect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
          )}
        </div>
      </header>

      {!isConfigured() && (
        <div className="banner banner-warn">
          Not configured yet — copy <code>.env.example</code> to{" "}
          <code>.env.local</code>, set <code>VITE_CONTRACT_ADDRESS</code>, and
          replace <code>src/contract-abi.json</code> with your deployed
          artifact.
        </div>
      )}
      {connectError && (
        <div className={`banner ${connectIsInfo ? "banner-info" : "banner-error"}`}>
          {connectError}
        </div>
      )}

      <nav className="tabs">
        <button
          className={`tab ${tab === "verify" ? "active" : ""}`}
          onClick={() => setTab("verify")}
        >
          Check a work
        </button>
        <button
          className={`tab ${tab === "register" ? "active" : ""}`}
          onClick={() => setTab("register")}
        >
          Register my work
        </button>
                <button
          className={`tab ${tab === "recent" ? "active" : ""}`}
          onClick={() => setTab("recent")}
        >
          Recent works
        </button>

      </nav>

      <main className="panel">
        {tab === "verify" && (
          <VerifyPanel account={account} provider={provider} onNeedWallet={onConnect} />
        )}
        {tab === "register" && (
          <RegisterPanel account={account} provider={provider} onNeedWallet={onConnect} />
        )}
        {tab === "recent" && <RecentPanel />}
      </main>

    </div>
  );
}

function VerifyPanel({
  account,
  provider,
  onNeedWallet,
}: {
  account: string | null;
  provider: BrowserProvider | null;
  onNeedWallet: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const onPick = (f: File | null) => {
    setResult(null);
    setError(null);
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

  const onVerify = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const hash = await hashFile(file);
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
    } catch (err: any) {
      setError(formatError(err));
    } finally {
      setLoading(false);
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
        {!result && <p className="muted">Check a file to see its proof-of-authorship record here.</p>}
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

function DisputeSection({
  hash,
  publisher,
  arbiter,
  dispute,
  account,
  provider,
  onNeedWallet,
  onChanged,
}: {
  hash: string;
  publisher: string;
  arbiter?: string;
  dispute: DisputeInfo;
  account: string | null;
  provider: BrowserProvider | null;
  onNeedWallet: () => void;
  onChanged: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [ruling, setRuling] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const same = (a?: string | null, b?: string | null) =>
    !!a && !!b && a.toLowerCase() === b.toLowerCase();
  const isPublisher = same(account, publisher);
  const isArbiter = same(account, arbiter);
  const status = dispute.status;
  const canChallenge = status === 0 || status === 3;

  const run = async (
    fn: (c: ReturnType<typeof getWriteContract>) => Promise<any>,
    successMsg: string
  ) => {
    if (!provider) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const signer = await provider.getSigner();
      const contract = getWriteContract(signer);
      const tx = await fn(contract);
      await tx.wait();
      setDone(successMsg);
      setNote("");
      setRuling("");
      setEvidenceFile(null);
      await onChanged();
    } catch (err: any) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const onRaise = () =>
    run(async (c) => {
      const evidenceHash = evidenceFile ? await hashFile(evidenceFile) : ZERO_HASH;
      return c.raiseDispute(hash, evidenceHash, note || "No note provided");
    }, "Dispute raised. Awaiting the Reviewer's decision.");

  const onResolve = (upheld: boolean) =>
    run(
      (c) => c.resolveDispute(hash, upheld, ruling || (upheld ? "Upheld" : "Rejected")),
      upheld ? "Dispute upheld." : "Dispute rejected."
    );

  return (
    <div className="dispute-section">
      <h4>Prior-art dispute</h4>
      <span className={`dispute-pill dispute-${["none", "open", "upheld", "rejected"][status]}`}>
        {DISPUTE_LABELS[status]}
      </span>

      {status !== 0 && (
        <dl className="record">
          <dt>Challenger</dt>
          <dd className="mono">{dispute.challenger}</dd>
          <dt>Evidence note</dt>
          <dd>{dispute.evidenceNote || "—"}</dd>
          {dispute.evidenceHash !== ZERO_HASH && (
            <>
              <dt>Evidence fingerprint</dt>
              <dd className="mono">{dispute.evidenceHash}</dd>
            </>
          )}
          <dt>Raised</dt>
          <dd>{dispute.raisedAt || "—"}</dd>
          {(status === 2 || status === 3) && (
            <>
              <dt>Reviewer's ruling</dt>
              <dd>{dispute.ruling || "—"}</dd>
              <dt>Resolved</dt>
              <dd>{dispute.resolvedAt || "—"}</dd>
            </>
          )}
        </dl>
      )}

      {canChallenge && !account && (
        <button className="btn btn-ghost" onClick={onNeedWallet}>
          Connect Wallet to open a dispute
        </button>
      )}
      {canChallenge && account && isPublisher && (
        <p className="muted">You registered this work, so you cannot open a dispute for this work.</p>
      )}
      {canChallenge && account && !isPublisher && (
        <div className="dispute-form">
          <h5>Challenge this registration</h5>
          <label className="field">
            <span>Why is this not the original? (evidence note)</span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="field">
            <span>Your earlier file, if you have one (it stays on your device)</span>
            <input
              type="file"
              className="file-input"
              accept={ACCEPT}
              onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <p className="muted">{SUPPORTED_NOTE}</p>
          <button className="btn btn-primary" onClick={onRaise} disabled={busy}>
            {busy ? "Signing & confirming…" : "Raise dispute"}
          </button>
        </div>
      )}

      {status === 1 && account && isArbiter && (
        <div className="dispute-form">
          <h5>Reviewer decision</h5>
          <label className="field">
            <span>Reason for your decision</span>
            <input type="text" value={ruling} onChange={(e) => setRuling(e.target.value)} />
          </label>
            <p className="muted">This decision will be attached to the original record.</p>
            <div className="dispute-actions">
            <button className="btn btn-primary" onClick={() => onResolve(true)} disabled={busy}>
              Accept 
            </button>
            <button
              className="btn btn-primary"
              style={{ background: "#dc2626", borderColor: "#dc2626", color: "#fff" }}
              onClick={() => onResolve(false)}
              disabled={busy}
            >
              Decline 
            </button>
          </div>
        </div>
      )}
      {status === 1 && !isArbiter && (
        <p className="muted">Waiting for the reviewer's decision.</p>
      )}
      {status === 2 && (
        <p className="muted">
          The original record is unchanged on-chain; this ruling is permanent and attached to it.
        </p>
      )}

      {done && <div className="inline-ok">{done}</div>}
      {error && <div className="inline-error">{error}</div>}
    </div>
  );
}

function RegisterPanel({
  account,
  provider,
  onNeedWallet,
}: {
  account: string | null;
  provider: BrowserProvider | null;
  onNeedWallet: () => void;
}) {
  const [mode, setMode] = useState<"original" | "version">("original");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [parentFile, setParentFile] = useState<File | null>(null);
  const [source, setSource] = useState("");
  const [note, setNote] = useState("Original work");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const onPick = (f: File | null) => {
    setTxHash(null);
    setError(null);
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

  const onModeChange = (m: "original" | "version") => {
    setMode(m);
    setNote(m === "original" ? "Original work" : "");
    setParentFile(null);
    setTxHash(null);
    setError(null);
  };

  const onRegister = async () => {
    if (!file || !provider) return;
    if (mode === "version" && !parentFile) {
      setError("Choose the previous version's file so its fingerprint can be computed.");
      return;
    }
    setLoading(true);
    setError(null);
    setTxHash(null);
    try {
      const hash = await hashFile(file);
      const signer = await provider.getSigner();
      const contract = getWriteContract(signer);

      let tx;
      if (mode === "version") {
        const parentHash = await hashFile(parentFile!);
        tx = await contract.registerVersion(parentHash, hash, source || "Unknown", note);
      } else {
        tx = await contract.registerMedia(hash, source || "Unknown", note);
      }
      const receipt = await tx.wait();
      setTxHash(receipt?.hash ?? tx.hash);
    } catch (err: any) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid">
      <div className="card upload-card">
        <div className="mode-toggle">
          <button
            className={`mode-btn ${mode === "original" ? "active" : ""}`}
            onClick={() => onModeChange("original")}
          >
            New original work
          </button>
          <button
            className={`mode-btn ${mode === "version" ? "active" : ""}`}
            onClick={() => onModeChange("version")}
          >
            New version of my work
          </button>
        </div>

        <label className="dropzone">
          <input type="file" accept={ACCEPT} onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          {previewUrl ? (
            file?.type.startsWith("image/") ? (
              <img src={previewUrl} alt="preview" className="preview-img" />
            ) : (
              <div className="preview-file">{file?.name}</div>
            )
          ) : (
            <div className="dropzone-empty">
              <span>Drop the image, audio file or PDF to register</span>
            </div>
          )}
        </label>

        <p className="muted">{SUPPORTED_NOTE}</p>

        {mode === "version" && (
          <label className="field">
            <span>Previous version's file (to link this one to it)</span>
            <input
              type="file"
              className="file-input"
              accept={ACCEPT}
              onChange={(e) => setParentFile(e.target.files?.[0] ?? null)}
            />
            {parentFile && <span className="hint">{parentFile.name}</span>}
          </label>
          
        )}
        
        <label className="field">
          <span>Creator name</span>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. Your name or studio"
          />
        </label>
        <label className="field">
          <span>{mode === "version" ? "What changed in this version" : "Notes"}</span>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {!account ? (
          <button className="btn btn-primary" onClick={onNeedWallet}>
            Connect Wallet to Register
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onRegister} disabled={!file || loading}>
            {loading ? "Signing & confirming…" : "Register"}
          </button>
        )}
        {error && <div className="inline-error">{error}</div>}
      </div>

      <div className="card details-card">
        <h3>Transaction</h3>
        {!txHash && (
          <p className="muted">
            Registration is signed with your own connected wallet.
            {mode === "version" && " Only the wallet that registered the previous version can link a new one to it."}
          </p>
        )}
        {txHash && (
          <dl className="record">
            <dt>Status</dt>
            <dd>Your work is registered</dd>
            <dt>Transaction hash</dt>
            <dd className="mono">{txHash}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}

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
        The latest registrations, newest first.
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
