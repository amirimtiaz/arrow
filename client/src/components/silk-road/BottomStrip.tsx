'use client';

import clsx from 'clsx';
import { Activity, ScrollText } from 'lucide-react';
import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatClock, formatPct, tsToDate, tsToMs } from '@/lib/format';
import { useFeed, useRiskSeries } from '@/lib/ops/hooks';
import { FEED_SEVERITY, riskLevel } from '@/lib/ops/status';
import { EmptyState, SectionLabel, StatusChip } from '@/components/ui/primitives';
import { useSilkRoad } from './SilkRoadState';

export const RISK_ALERT_THRESHOLD = 40;

export function BottomStrip() {
  return (
    <div className="grid h-[200px] shrink-0 grid-cols-2 gap-3 border-t border-line bg-elevated p-3">
      <RiskMonitor />
      <EventLog />
    </div>
  );
}

function RiskMonitor() {
  const series = useRiskSeries();
  const data = useMemo(() => series.map((s) => ({ t: tsToMs(s.ts), risk: s.riskIndex, onTime: s.onTimePct })), [series]);
  const latest = series.at(-1);
  const level = riskLevel(latest?.riskIndex ?? 0);

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel p-3"
      aria-label="Live supply chain risk monitor"
    >
      <SectionLabel
        icon={Activity}
        right={
          latest && (
            <span className="flex items-center gap-2 text-[11px] text-muted">
              Risk index <b className="text-fg tabular-nums">{latest.riskIndex.toFixed(1)}</b>
              <StatusChip meta={level.meta} label={level.label} />
            </span>
          )
        }
      >
        Live: supply chain risk monitor
      </SectionLabel>
      <div className="relative mt-2 min-h-0 flex-1">
        {data.length < 2 ? (
          <p className="grid h-full place-items-center text-xs text-muted">Collecting live samples…</p>
        ) : (
          <div className="absolute inset-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.35} />
                    <stop offset="55%" stopColor="var(--accent)" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="riskStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--danger)" />
                    <stop offset="50%" stopColor="var(--violet)" />
                    <stop offset="100%" stopColor="var(--accent)" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(t: number) => formatClock(new Date(t))}
                  tick={{ fontSize: 10, fill: 'var(--faint)' }}
                  stroke="var(--line)"
                  minTickGap={40}
                />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 10, fill: 'var(--faint)' }} stroke="var(--line)" />
                <ReferenceLine
                  y={RISK_ALERT_THRESHOLD}
                  stroke="var(--danger)"
                  strokeDasharray="4 4"
                  label={{ value: 'Alert threshold', position: 'insideTopRight', fontSize: 10, fill: 'var(--danger)' }}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(t) => formatClock(new Date(Number(t)))}
                  formatter={(v, name) => [
                    name === 'risk' ? Number(v).toFixed(1) : formatPct(Number(v)),
                    name === 'risk' ? 'Risk index' : 'On-time',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="risk"
                  stroke="url(#riskStroke)"
                  strokeWidth={2.2}
                  fill="url(#riskFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}

function EventLog() {
  const feed = useFeed();
  const { setFocusId } = useSilkRoad();
  const items = feed.slice(0, 40);

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel p-3"
      aria-label="System event log"
    >
      <SectionLabel icon={ScrollText} right={<span className="text-[11px] text-faint">{feed.length} events</span>}>
        System event log
      </SectionLabel>
      <ol className="scroll-thin mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {items.length === 0 && <EmptyState icon={ScrollText} title="No events yet" />}
        {items.map((item) => {
          const meta = FEED_SEVERITY[item.severity] ?? FEED_SEVERITY.info;
          const Icon = meta.icon;
          const disruptionId = item.link.startsWith('disruption:') ? BigInt(item.link.slice(11)) : null;
          return (
            <li key={String(item.id)}>
              <button
                type="button"
                disabled={disruptionId === null}
                onClick={() => disruptionId !== null && setFocusId(disruptionId)}
                className={clsx(
                  'flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-[12px] leading-snug',
                  disruptionId !== null ? 'hover:bg-panel-hover' : 'cursor-default'
                )}
              >
                <span className="shrink-0 pt-px font-mono text-[10px] text-faint">{formatClock(tsToDate(item.ts), 'UTC')} UTC</span>
                <Icon className={clsx('mt-px size-3.5 shrink-0', meta.text)} aria-label={meta.label} />
                <span className="min-w-0 text-fg/90">{item.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
