'use client';

/**
 * Branch reports on the Analytics tab. Reports sent from the Communications tab appear here the moment they are
 * sent (live SpacetimeDB rows, or the browser preview): totals, the latest figures per branch, and the newest reports.
 */
import { Building2, FileBarChart, ListChecks, Timer, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { timeAgo } from '@/lib/format';
import { useComms } from '@/lib/ops/comms';
import { MetricChips } from '@/components/communications/CommunicationsView';
import { EmptyState, Panel, SectionLabel } from '@/components/ui/primitives';

const tooltipStyle = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 };

export function BranchReports() {
  const { mode, branches, messages } = useComms();

  const { reports, latest, avgOnTime, openIssues } = useMemo(() => {
    const byId = new Map(branches.map((b) => [b.id, b]));
    const reports = messages.filter((m) => m.kind === 'report').sort((a, b) => b.sentAt - a.sentAt);
    // The newest report from each branch is that branch's current picture.
    const latestByBranch = new Map<string, (typeof reports)[number]>();
    for (const r of reports) if (!latestByBranch.has(r.fromBranchId)) latestByBranch.set(r.fromBranchId, r);
    const latest = [...latestByBranch.values()].map((r) => ({
      branch: byId.get(r.fromBranchId)?.name ?? 'Unknown branch',
      onTimePct: r.metrics.onTimePct,
      inventoryDays: r.metrics.inventoryDays,
      openIssues: r.metrics.openIssues,
    }));
    const onTimes = latest.map((l) => l.onTimePct).filter((v): v is number => v !== undefined);
    return {
      reports: reports.map((r) => ({
        ...r,
        from: byId.get(r.fromBranchId)?.name ?? 'Unknown branch',
        to: byId.get(r.toBranchId)?.name ?? 'All branches',
      })),
      latest,
      avgOnTime: onTimes.length ? onTimes.reduce((a, b) => a + b, 0) / onTimes.length : null,
      openIssues: latest.reduce((sum, l) => sum + (l.openIssues ?? 0), 0),
    };
  }, [branches, messages]);

  const chart = latest.filter((l) => l.onTimePct !== undefined);

  return (
    <Panel id="branch-reports" className="scroll-mt-4 p-4">
      <SectionLabel
        icon={FileBarChart}
        right={
          <span className="text-[11px] text-faint">
            {mode === 'live' ? 'Live from SpacetimeDB' : mode === 'preview' ? 'Preview (this browser)' : 'Not connected'} ·{' '}
            <Link href="/app/communications" className="font-semibold text-accent hover:underline">
              Communications
            </Link>
          </span>
        }
      >
        Branch reports
      </SectionLabel>

      {reports.length === 0 ? (
        <EmptyState icon={FileBarChart} title="No branch reports yet">
          Send a report from the Communications tab and it shows up here straight away.
        </EmptyState>
      ) : (
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1.1fr_1.2fr]">
          <div className="grid grid-cols-2 content-start gap-2">
            <Stat icon={FileBarChart} label="Reports received" value={String(reports.length)} />
            <Stat icon={Building2} label="Branches reporting" value={String(latest.length)} />
            <Stat icon={Timer} label="Avg on-time (latest)" value={avgOnTime === null ? '—' : `${avgOnTime.toFixed(1)}%`} />
            <Stat icon={ListChecks} label="Open issues (latest)" value={String(openIssues)} />
          </div>

          <div className="min-h-[180px]">
            <p className="text-[11px] text-muted">On-time delivery by branch (latest report)</p>
            {chart.length === 0 ? (
              <p className="grid h-[160px] place-items-center text-xs text-muted">No on-time figures reported yet.</p>
            ) : (
              <div className="mt-1 h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[80, 100]}
                      tick={{ fontSize: 10, fill: 'var(--faint)' }}
                      stroke="var(--line)"
                      allowDataOverflow
                    />
                    <YAxis
                      type="category"
                      dataKey="branch"
                      width={150}
                      tick={{ fontSize: 10, fill: 'var(--muted)' }}
                      stroke="var(--line)"
                    />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)}%`, 'On-time']} />
                    <Bar dataKey="onTimePct" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                      {chart.map((c) => (
                        <Cell
                          key={c.branch}
                          fill={(c.onTimePct ?? 0) >= 95 ? 'var(--success)' : (c.onTimePct ?? 0) >= 90 ? 'var(--warning)' : 'var(--danger)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <ul className="scroll-thin max-h-[200px] space-y-2 overflow-y-auto pr-1">
            {reports.slice(0, 8).map((r) => (
              <li key={r.id} className="rounded-lg border border-line bg-panel-2 p-2.5">
                <p className="truncate text-[11px] text-muted">
                  {r.from} → {r.to} · {timeAgo(new Date(r.sentAt))}
                </p>
                <p className="text-[13px] font-semibold text-fg">{r.subject}</p>
                <MetricChips metrics={r.metrics} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Warehouse; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2 p-2.5">
      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        <Icon className="size-3.5 text-accent" aria-hidden />
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-fg tabular-nums">{value}</p>
    </div>
  );
}
