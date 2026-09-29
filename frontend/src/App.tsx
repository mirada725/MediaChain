import { useState, useCallback } from "react";
import type { BrowserProvider } from "ethers";
import { connectWallet, getReadProvider } from "./lib/chain";
import { getReadContract, getWriteContract, isConfigured } from "./lib/contract";
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
};

function short(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function formatError(err: any): string {
  // ethers v6 surfaces a decoded custom-error name/args when the ABI has it
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
          <span className="brand-name">MediaChain</span>
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
          Verify a file
        </button>
        <button
          className={`tab ${tab === "register" ? "active" : ""}`}
          onClick={() => setTab("register")}
        >
          Register (Publisher)
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
      // Free, read-only call — straight to the chain, no wallet needed.
      const contract = getReadContract(getReadProvider());
      const [exists, publisher, source, timestamp, editHistory] =
        await contract.verifyMedia(hash);
      setResult({
        exists,
        publisher,
        source,
        timestamp: exists ? new Date(Number(timestamp) * 1000).toLocaleString() : undefined,
        editHistory,
        hash,
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
          <input
            type="file"
            accept="image/*,video/*"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          {previewUrl ? (
            <div className="preview-wrap">
              <img src={previewUrl} alt="preview" className="preview-img" />
              {result && (
                <div className={`badge ${result.exists ? "badge-ok" : "badge-bad"}`}>
                  {result.exists ? "✓ Verified & Unaltered" : "⚠ Not Found / Altered"}
                </div>
              )}
            </div>
          ) : (
            <div className="dropzone-empty">
              <span>Drop a photo or video here, or click to choose a file</span>
            </div>
          )}
        </label>
        <button className="btn btn-primary" onClick={onVerify} disabled={!file || loading}>
          {loading ? "Checking on-chain…" : "Verify Authenticity"}
        </button>
        {error && <div className="inline-error">{error}</div>}
      </div>

      <div className="card details-card">
        <h3>On-chain record</h3>
        {!result && <p className="muted">Verify a file to see its provenance record here.</p>}
        {result && (
          <dl className="record">
            <dt>Fingerprint</dt>
            <dd className="mono">{result.hash}</dd>
            <dt>Status</dt>
            <dd>{result.exists ? "Match found" : "No match on-chain"}</dd>
            {result.exists && (
              <>
                <dt>Source</dt>
                <dd>{result.source || "—"}</dd>
                <dt>Registered</dt>
                <dd>{result.timestamp || "—"}</dd>
                <dt>Edit history</dt>
                <dd>{result.editHistory || "—"}</dd>
                <dt>Registered by</dt>
                <dd className="mono">{result.publisher}</dd>
              </>
            )}
          </dl>
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
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [editHistory, setEditHistory] = useState("Original upload");
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

  const onRegister = async () => {
    if (!file || !provider) return;
    setLoading(true);
    setError(null);
    setTxHash(null);
    try {
      const hash = await hashFile(file);
      const signer = await provider.getSigner();
      const contract = getWriteContract(signer);
      const tx = await contract.registerMedia(hash, source || "Unknown", editHistory);
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
        <label className="dropzone">
          <input
            type="file"
            accept="image/*,video/*"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          {previewUrl ? (
            <img src={previewUrl} alt="preview" className="preview-img" />
          ) : (
            <div className="dropzone-empty">
              <span>Drop the original photo or video to publish</span>
            </div>
          )}
        </label>

        <label className="field">
          <span>Source / publisher name</span>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. Daily Times Newsroom"
          />
        </label>
        <label className="field">
          <span>Edit history</span>
          <input
            type="text"
            value={editHistory}
            onChange={(e) => setEditHistory(e.target.value)}
          />
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
        {!txHash && <p className="muted">Registration is signed with your own connected wallet — the app never holds a key.</p>}
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
