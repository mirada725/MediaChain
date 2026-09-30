import { useState, useCallback } from "react";
import type { BrowserProvider } from "ethers";
import { connectWallet, getReadProvider } from "./lib/chain";
import {
  getReadContract,
  getWriteContract,
  isConfigured,
  getVersionChain,
  ZERO_HASH,
  IFACE,
  type VersionLink,
} from "./lib/contract";

import { hashFile } from "./lib/hash";
import "./App.css";

type Tab = "verify" | "register";

type VerifyResult = {
  exists: boolean;
  publisher?: string;
  source?: string;
  timestamp?: string;
  editHistory?: string;
  hash: string;
  parentHash?: string;
  chain?: VersionLink[];
};

function short(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function formatError(err: any): string {
  const data = err?.data ?? err?.info?.error?.data ?? err?.error?.data;
  if (typeof data === "string" && data.startsWith("0x")) {
    try {
      const parsed = IFACE.parseError(data);
      if (parsed) {
        if (parsed.name === "NotParentPublisher")
          return "NotParentPublisher: only the wallet that registered the previous version can add a new version to it.";
        if (parsed.name === "ParentNotFound")
          return "ParentNotFound: the previous version's file has not been registered on-chain.";
        if (parsed.name === "AlreadyRegistered")
          return "AlreadyRegistered: this file's fingerprint is already registered.";
        return parsed.name;
      }
    } catch {
      /* fall through to generic handling */
    }
  }
  if (err?.revert?.name) {
    const args = err.revert.args ? Object.values(err.revert.args).join(", ") : "";
    return `${err.revert.name}${args ? `(${args})` : ""}`;
  }
  if (err?.shortMessage) return err.shortMessage;
  if (err?.reason) return err.reason;
  if (err?.message) return err.message;
  return String(err);
}

export default function App() {
  const [tab, setTab] = useState<Tab>("verify");
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const onConnect = useCallback(async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const { provider, address } = await connectWallet();
      setProvider(provider);
      setAccount(address);
    } catch (err: any) {
      setConnectError(formatError(err));
    } finally {
      setConnecting(false);
    }
  }, []);

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
      {connectError && <div className="banner banner-error">{connectError}</div>}

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
          Register (Creator)
        </button>
      </nav>

      <main className="panel">
        {tab === "verify" ? <VerifyPanel /> : <RegisterPanel account={account} provider={provider} onNeedWallet={onConnect} />}
      </main>
    </div>
  );
}

function VerifyPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const onPick = (f: File | null) => {
    setFile(f);
    setResult(null);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
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

      setResult({
        exists,
        publisher,
        source,
        timestamp: exists ? new Date(Number(timestamp) * 1000).toLocaleString() : undefined,
        editHistory,
        hash,
        parentHash,
        chain,
      });
    } catch (err: any) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid">
      <div className="card upload-card">
        <label className="dropzone">
          <input type="file" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          {previewUrl ? (
            <div className="preview-wrap">
              {file?.type.startsWith("image/") ? (
                <img src={previewUrl} alt="preview" className="preview-img" />
              ) : (
                <div className="preview-file">{file?.name}</div>
              )}
              {result && (
                <div className={`badge ${result.exists ? "badge-ok" : "badge-bad"}`}>
                  {result.exists ? "✓ Registered — Proof of Authorship" : "⚠ Not Registered / Altered"}
                </div>
              )}
            </div>
          ) : (
            <div className="dropzone-empty">
              <span>Drop a design, photo, audio file, or code file to check</span>
            </div>
          )}
        </label>
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
              <dt>Fingerprint</dt>
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
          </>
        )}
      </div>
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
    setFile(f);
    setTxHash(null);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  const onModeChange = (m: "original" | "version") => {
    setMode(m);
    setNote(m === "original" ? "Original work" : "");
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
          <input type="file" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          {previewUrl ? (
            file?.type.startsWith("image/") ? (
              <img src={previewUrl} alt="preview" className="preview-img" />
            ) : (
              <div className="preview-file">{file?.name}</div>
            )
          ) : (
            <div className="dropzone-empty">
              <span>Drop the design, code, audio, or media file to register</span>
            </div>
          )}
        </label>

        {mode === "version" && (
          <label className="field">
            <span>Previous version's file (to link this one to it)</span>
            <input
              type="file"
              className="file-input"
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
            {loading ? "Signing & confirming…" : "Register on Ethereum"}
          </button>
        )}
        {error && <div className="inline-error">{error}</div>}
      </div>

      <div className="card details-card">
        <h3>Transaction</h3>
        {!txHash && (
          <p className="muted">
            Registration is signed with your own connected wallet — the app never holds a key.
            {mode === "version" && " Only the wallet that registered the previous version can link a new one to it."}
          </p>
        )}
        {txHash && (
          <dl className="record">
            <dt>Status</dt>
            <dd>Confirmed on-chain</dd>
            <dt>Transaction hash</dt>
            <dd className="mono">{txHash}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}