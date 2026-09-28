import { createHash } from "crypto";
import { keccak256, toUtf8Bytes } from "ethers";

/**
 * Computes a keccak256 hash of the file's raw bytes, matching the format
 * the smart contract expects (bytes32). We hash the actual file content,
 * not a filename or metadata, so any single-byte change in the file
 * produces a completely different hash.
 */
export function hashFileBuffer(buffer: Buffer): string {
  return keccak256(buffer);
}

/**
 * Optional: SHA-256 hex digest, useful if you want a human-readable
 * fingerprint to display in the UI/demo alongside the on-chain keccak256 hash.
 */
export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
