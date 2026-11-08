/**
 * Client-side verification of the arrow-ir hash-chained audit log.
 *
 * Canonical format (must match `auditCanonical` in spacetime/ir/src/core.ts):
 *   canonical = JSON.stringify([prevHash, String(seq), String(tsMicros),
 *                               actorHex, actorName, action, target, payload])
 *   hash      = hex(SHA-256(UTF-8(canonical)))
 * seq starts at 1 with no gaps; the first row's prevHash is 64 zeros.
 *
 * Kept free of React and path aliases so Node scripts can import it too.
 */

export const GENESIS_HASH = '0'.repeat(64);

export interface AuditRowLike {
  seq: bigint;
  ts: { microsSinceUnixEpoch: bigint };
  actorHex: string;
  actorName: string;
  action: string;
  target: string;
  payload: string;
  prevHash: string;
  hash: string;
}

export function auditCanonical(row: AuditRowLike): string {
  return JSON.stringify([
    row.prevHash,
    row.seq.toString(),
    row.ts.microsSinceUnixEpoch.toString(),
    row.actorHex,
    row.actorName,
    row.action,
    row.target,
    row.payload,
  ]);
}

export type ChainVerdict =
  { ok: true; count: number; headSeq: bigint; headHash: string } | { ok: false; count: number; brokenSeq: bigint; reason: string };

/** Re-computes every hash and link. Reports the first broken sequence number. */
export async function verifyAuditChain(rows: readonly AuditRowLike[], hash: (text: string) => Promise<string>): Promise<ChainVerdict> {
  const sorted = [...rows].sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0));
  let prev = GENESIS_HASH;
  let expectedSeq = 1n;
  for (const row of sorted) {
    if (row.seq !== expectedSeq) {
      return {
        ok: false,
        count: sorted.length,
        brokenSeq: expectedSeq,
        reason: row.seq > expectedSeq ? `Entry #${expectedSeq} is missing (deleted?)` : `Duplicate entry #${row.seq}`,
      };
    }
    if (row.prevHash !== prev) {
      return { ok: false, count: sorted.length, brokenSeq: row.seq, reason: 'Link to the previous entry does not match' };
    }
    const computed = await hash(auditCanonical(row));
    if (computed !== row.hash) {
      return { ok: false, count: sorted.length, brokenSeq: row.seq, reason: 'Entry content does not match its hash (edited?)' };
    }
    prev = row.hash;
    expectedSeq += 1n;
  }
  const head = sorted[sorted.length - 1];
  return { ok: true, count: sorted.length, headSeq: head ? head.seq : 0n, headHash: head ? head.hash : GENESIS_HASH };
}
