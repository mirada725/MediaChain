import { keccak256 } from "ethers";

/**
 * Hashes raw file bytes with keccak256 — confirmed as the function your
 * backend/services/hash.ts uses (per your project summary: corrected from an
 * earlier "SHA-256" draft). The contract itself never hashes anything on
 * chain — it just stores whatever bytes32 the caller passes in — so this
 * must match your backend's hash.ts exactly. If your backend hashes
 * anything other than the raw file bytes (e.g. wraps them in JSON first),
 * tell me and this is the one function to change.
 */
export async function hashFile(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return keccak256(buf); // returns "0x"-prefixed bytes32 hex string
}
