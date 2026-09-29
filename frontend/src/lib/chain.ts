import { BrowserProvider, JsonRpcProvider } from "ethers";

export const RPC_URL = import.meta.env.VITE_RPC_URL ?? "http://127.0.0.1:8545";
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 31337);
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? "";

// Hex chain id, as MetaMask's wallet_addEthereumChain / wallet_switchEthereumChain expect.
const CHAIN_ID_HEX = "0x" + CHAIN_ID.toString(16);

/**
 * A read-only provider that talks straight to the local Hardhat node's JSON-RPC
 * endpoint. Used for verifyMedia() lookups, which are free view calls — no wallet,
 * no signature, no gas, so anyone can run them without ever touching MetaMask.
 */
export function getReadProvider() {
  return new JsonRpcProvider(RPC_URL, CHAIN_ID);
}

/**
 * Connects to the browser wallet (MetaMask) and makes sure it's pointed at the
 * local Hardhat network, adding it if the user has never added it before.
 * Throws a descriptive Error if no wallet extension is present.
 */
export async function connectWallet(): Promise<{
  provider: BrowserProvider;
  address: string;
}> {
  const eth = (window as any).ethereum;
  if (!eth) {
    throw new Error(
      "No wallet extension found. Install MetaMask and reload the page."
    );
  }

  await eth.request({ method: "eth_requestAccounts" });
  await ensureLocalHardhatNetwork(eth);

  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, address };
}

async function ensureLocalHardhatNetwork(eth: any) {
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (err: any) {
    // 4902 = chain not added to MetaMask yet
    if (err?.code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: "Hardhat Local",
            rpcUrls: [RPC_URL],
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          },
        ],
      });
    } else {
      throw err;
    }
  }
}
