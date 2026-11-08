'use client';

/**
 * Tamper-evident audit log viewer. "Verify audit chain" re-computes every
 * SHA-256 link in the browser (see lib/ir/audit-chain.ts) and reports the
 * first broken entry. A checkpoint (seq + hash) is kept in this browser so a
 * later full rewrite of the log is also detected.
 */
import { FlaskConical, ScrollText, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useIrRows } from '@/lib/ir/client';
import { verifyAuditChain, type ChainVerdict } from '@/lib/ir/audit-chain';
import { sha256Hex } from '@/lib/ir/sha256';
import { useCt } from './context';
import { formatDateTime, formatUtc, tsMs } from './format';
import { Button, cx, EmptyState, SectionTitle } from './ui';

const ANCHOR_KEY = 'arrow-ir-audit-anchor';

interface Anchor {
  seq: string;
  hash: string;
  at: number;
}

interface Result {
  simulation: boolean;
  verdict: ChainVerdict;
  note: string;
}

function readAnchor(): Anchor | null {
  try {
    const raw = localStorage.getItem(ANCHOR_KEY);
    return raw ? (JSON.parse(raw) as Anchor) : null;
  } catch {
    return null;
  }
}

function writeAnchor(anchor: Anchor) {
  try {
    localStorage.setItem(ANCHOR_KEY, JSON.stringify(anchor));
  } catch {
    /* storage unavailable: no checkpoint */
  }
}

export function AuditPanel() {
  const { setAuditVerified } = useCt();
  const rows = useIrRows('irAudit');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const sorted = [...rows].sort((a, b) => (a.seq > b.seq ? -1 : 1));

  async function verify() {
    setBusy(true);
    const snapshot = [...rows];
    let verdict = await verifyAuditChain(snapshot, sha256Hex);
    let note = '';
    if (verdict.ok) {
      const anchor = readAnchor();
      const anchored = anchor ? snapshot.find((r) => String(r.seq) === anchor.seq) : undefined;
      if (anchor && anchored && anchored.hash !== anchor.hash) {
        verdict = {
          ok: false,
          count: snapshot.length,
          brokenSeq: BigInt(anchor.seq),
          reason: `Entry #${anchor.seq} differs from the checkpoint this browser saved on ${formatDateTime(anchor.at)}: the log was rewritten`,
        };
      } else {
        note =
          anchor && anchored
            ? `Also matches this browser’s checkpoint at entry #${anchor.seq}.`
            : 'Checkpoint saved in this browser for future checks.';
        writeAnchor({ seq: String(verdict.headSeq), hash: verdict.headHash, at: Date.now() });
      }
    }
    setResult({ simulation: false, verdict, note });
    setAuditVerified(verdict.ok);
    setBusy(false);
  }

  async function simulate() {
    if (rows.length < 3) return;
    const ordered = [...rows].sort((a, b) => (a.seq < b.seq ? -1 : 1));
    const target = ordered[Math.floor(ordered.length / 2)];
    const tampered = ordered.map((r) => (r.seq === target.seq ? { ...r, payload: r.payload.replace(/}$/, ',"edited":true}') } : r));
    const verdict = await verifyAuditChain(tampered, sha256Hex);
    setResult({
      simulation: true,
      verdict,
      note: `Simulation on a local copy: entry #${target.seq} (${target.action}) was edited in memory. Server data is unchanged.`,
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-wide text-fg uppercase">Audit log</h1>
          <p className="max-w-2xl text-sm text-muted">
            Every action in the Control Tower appends an entry whose SHA-256 hash covers the previous entry’s hash. Editing, deleting or
            re-attributing any entry breaks the chain.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" icon={FlaskConical} onClick={simulate} disabled={rows.length < 3}>
            Simulate tampering
          </Button>
          <Button variant="primary" icon={ShieldCheck} busy={busy} onClick={verify} disabled={rows.length === 0}>
            Verify audit chain
          </Button>
        </div>
      </div>

      {result && (
        <div
          role={result.verdict.ok ? 'status' : 'alert'}
          className={cx(
            'flex items-start gap-3 rounded-xl border p-4',
            result.verdict.ok ? 'border-success/40 bg-success-soft' : 'border-danger/40 bg-danger-soft'
          )}
        >
          {result.verdict.ok ? (
            <ShieldCheck className="size-6 shrink-0 text-success" aria-hidden />
          ) : (
            <ShieldAlert className="size-6 shrink-0 text-danger" aria-hidden />
          )}
          <div className="min-w-0">
            <p className={cx('font-bold', result.verdict.ok ? 'text-success' : 'text-danger')}>
              {result.simulation ? 'Simulation: ' : ''}
              {result.verdict.ok
                ? `Chain intact — ${result.verdict.count} entries verified`
                : `Chain broken at entry #${result.verdict.brokenSeq}`}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {result.verdict.ok ? (
                <>
                  Head{' '}
                  <span className="font-mono text-fg">
                    #{String(result.verdict.headSeq)} {result.verdict.headHash.slice(0, 24)}…
                  </span>
                </>
              ) : (
                result.verdict.reason
              )}
            </p>
            {result.note && <p className="mt-1 text-xs text-faint">{result.note}</p>}
          </div>
        </div>
      )}

      <section>
        <SectionTitle icon={ScrollText}>Entries ({rows.length})</SectionTitle>
        {sorted.length === 0 ? (
          <EmptyState icon={ScrollText} title="No audit entries">
            Entries appear as soon as anyone acts in the Control Tower.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[900px] text-xs">
              <thead className="bg-panel-2 text-left text-[11px] font-bold tracking-wider text-muted uppercase">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Time (UTC)</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Details</th>
                  <th className="px-3 py-2">Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line font-mono">
                {sorted.slice(0, 500).map((r) => {
                  const broken = result && !result.verdict.ok && result.verdict.brokenSeq === r.seq;
                  return (
                    <tr key={String(r.seq)} className={cx('align-top', broken && 'bg-danger-soft')}>
                      <td className="px-3 py-2 text-faint">{String(r.seq)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted">{formatUtc(tsMs(r.ts)).replace(' UTC', '')}</td>
                      <td className="px-3 py-2 font-sans text-fg">{r.actorName}</td>
                      <td className={cx('px-3 py-2 whitespace-nowrap', r.action.endsWith('.failed') ? 'text-danger' : 'text-accent')}>
                        {r.action}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-muted" title={r.target}>
                        {r.target}
                      </td>
                      <td className="max-w-[320px] truncate px-3 py-2 text-muted" title={r.payload}>
                        {r.payload}
                      </td>
                      <td className="px-3 py-2 text-faint" title={`prev ${r.prevHash}\nhash ${r.hash}`}>
                        {r.hash.slice(0, 12)}…
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
