import { BrowserProvider, JsonRpcProvider } from "ethers";

export const RPC_URL = import.meta.env.VITE_RPC_URL ?? "http://127.0.0.1:8545";
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 31337);
export const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME ?? "Hardhat Local";
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? "";

// Block explorer base address, without a trailing slash. Empty on the local chain.
export const EXPLORER_URL = String(import.meta.env.VITE_EXPLORER_URL ?? "").replace(/\/$/, "");

// The block the contract was deployed in. Event searches start here, not at block 0.
export const DEPLOY_BLOCK = Number(import.meta.env.VITE_DEPLOY_BLOCK ?? 0);

// Hex chain id, as MetaMask's wallet_addEthereumChain / wallet_switchEthereumChain expect.
const CHAIN_ID_HEX = "0x" + CHAIN_ID.toString(16);

/** Link to a transaction on the block explorer, or null on a chain without one. */
export function txUrl(hash: string): string | null {
  return EXPLORER_URL ? `${EXPLORER_URL}/tx/${hash}` : null;
}

/** Link to an address on the block explorer, or null on a chain without one. */
export function addressUrl(address: string): string | null {
  return EXPLORER_URL ? `${EXPLORER_URL}/address/${address}` : null;
}

/**
 * A read-only provider that talks straight to the JSON-RPC endpoint. Used for
 * verifyMedia() lookups, which are free view calls: no wallet, no signature, no gas.
 * staticNetwork tells ethers the chain is fixed, so it does not ask the server
 * "which chain are you?" before every call. This saves many requests on a free RPC.
 */
export function getReadProvider() {
  return new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
}

/**
 * Connects to the browser wallet (MetaMask) and makes sure it is pointed at the
 * network set in the env file (local or Sepolia), adding it if it is missing.
 * Throws a descriptive Error if no wallet extension is present.
 */
export async function connectWallet(): Promise<{
  provider: BrowserProvider;
  address: string;
}> {
  const eth = (window as any).ethereum;
  if (!eth) {
    throw Object.assign(new Error("No wallet found"), { code: "NO_WALLET" });
  }

  await eth.request({ method: "eth_requestAccounts" });
  await ensureNetwork(eth);

  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, address };
}

async function ensureNetwork(eth: any) {
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (err: any) {
    // 4902 = chain not added to MetaMask yet
    if (err?.code === 4902) {
      const params: Record<string, unknown> = {
        chainId: CHAIN_ID_HEX,
        chainName: CHAIN_NAME,
        rpcUrls: [RPC_URL],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      };
      if (EXPLORER_URL) {
        params.blockExplorerUrls = [EXPLORER_URL];
      }
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [params],
      });
    } else {
      throw err;
    }
  }
}