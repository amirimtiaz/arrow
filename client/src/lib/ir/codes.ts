/**
 * One-time access codes. Generated in the browser with Web Crypto
 * (`crypto.getRandomValues`); only the SHA-256 hash of the normalised code is
 * ever sent to the server. The code itself is shown once and shared
 * out-of-band (in person or by phone).
 */
import { sha256Hex } from './sha256';

/** Crockford base32: no I, L, O or U, so codes survive being read aloud. */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 12 symbols × 5 bits = 60 bits of entropy, formatted XXXX-XXXX-XXXX. */
export function generateCode(groups = 3, groupLength = 4): string {
  const bytes = new Uint8Array(groups * groupLength);
  globalThis.crypto.getRandomValues(bytes);
  // 256 is a multiple of 32, so masking the low 5 bits is unbiased.
  const symbols = Array.from(bytes, (b) => CODE_ALPHABET[b & 31]);
  const parts: string[] = [];
  for (let i = 0; i < groups; i++) parts.push(symbols.slice(i * groupLength, (i + 1) * groupLength).join(''));
  return parts.join('-');
}

/** Must match `normalizeCode` in spacetime/ir/src/core.ts exactly. */
export function normalizeCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export async function hashCode(code: string): Promise<string> {
  return sha256Hex(normalizeCode(code));
}
