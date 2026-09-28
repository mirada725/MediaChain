import { ethers } from "ethers";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const artifactPath = join(__dirname, "../../../artifacts/contracts/MediaRegistry.sol/MediaRegistry.json");
const contractArtifact = JSON.parse(readFileSync(artifactPath, "utf-8"));

const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const signer = new ethers.Wallet(config.privateKey, provider);

const mediaRegistry = new ethers.Contract(
  config.contractAddress,
  contractArtifact.abi,
  signer
);

export interface RegisterResult {
  txHash: string;
  hash: string;
  sourceName: string;
  editHistory: string;
}

export interface VerifyResult {
  exists: boolean;
  publisher: string;
  sourceName: string;
  timestamp: number;
  editHistory: string;
}

export async function registerOnChain(
  hash: string,
  sourceName: string,
  editHistory: string
): Promise<RegisterResult> {
  const tx = await mediaRegistry.registerMedia(hash, sourceName, editHistory);
  const receipt = await tx.wait();

  return {
    txHash: receipt.hash,
    hash,
    sourceName,
    editHistory,
  };
}

export async function verifyOnChain(hash: string): Promise<VerifyResult> {
  const result = await mediaRegistry.verifyMedia(hash);

  return {
    exists: result[0],
    publisher: result[1],
    sourceName: result[2],
    timestamp: Number(result[3]),
    editHistory: result[4],
  };
}
