'use client';

/**
 * Live supply chain risk monitor, drawn tall and narrow for the side of the Live Feed so it never crowds the feed
 * text in the middle. Time runs down the panel (newest at the top); the risk index runs across it, with the alert
 * threshold as a dashed line.
 */
import { Activity } from 'lucide-react';
import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatClock, formatPct, formatUsd, tsToMs } from '@/lib/format';
import { useRiskSeries } from '@/lib/ops/hooks';
import { riskLevel } from '@/lib/ops/status';
import { SectionLabel, StatusChip } from '@/components/ui/primitives';
import { RISK_ALERT_THRESHOLD } from '@/components/silk-road/BottomStrip';

export function RiskColumn() {
  const series = useRiskSeries();
  const data = useMemo(() => series.map((s) => ({ t: tsToMs(s.ts), risk: s.riskIndex, onTime: s.onTimePct })), [series]);
  const latest = series.at(-1);
  const level = riskLevel(latest?.riskIndex ?? 0);

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel p-3 shadow-panel"
      aria-label="Live supply chain risk monitor"
    >
      <SectionLabel icon={Activity}>Live: supply chain risk</SectionLabel>

      <div className="mt-2 rounded-lg border border-line bg-panel-2 p-2.5">
        <p className="text-[10.5px] font-semibold tracking-wide text-muted uppercase">Risk index</p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="text-2xl font-extrabold text-fg tabular-nums">{latest ? latest.riskIndex.toFixed(1) : '—'}</span>
          {latest && <StatusChip meta={level.meta} label={level.label} />}
        </div>
        {latest && (
          <dl className="mt-1.5 grid grid-cols-2 gap-1 text-[11px]">
            <div>
              <dt className="text-muted">On-time</dt>
              <dd className="font-bold text-fg tabular-nums">{formatPct(latest.onTimePct)}</dd>
            </div>
            <div>
              <dt className="text-muted">Value at risk</dt>
              <dd className="font-bold text-fg tabular-nums">{formatUsd(latest.valueAtRiskUsd)}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="relative mt-2 min-h-0 flex-1">
        {data.length < 2 ? (
          <p className="grid h-full place-items-center text-xs text-muted">Collecting live samples…</p>
        ) : (
          <div className="absolute inset-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} layout="vertical" margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="riskFillVertical" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0} />
                    <stop offset="45%" stopColor="var(--accent)" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="var(--danger)" stopOpacity={0.35} />
                  </linearGradient>
                  <linearGradient id="riskStrokeVertical" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--accent)" />
                    <stop offset="50%" stopColor="var(--violet)" />
                    <stop offset="100%" stopColor="var(--danger)" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  dataKey="risk"
                  domain={[0, 100]}
                  ticks={[0, 50, 100]}
                  tick={{ fontSize: 10, fill: 'var(--faint)' }}
                  stroke="var(--line)"
                />
                <YAxis
                  type="number"
                  dataKey="t"
                  domain={['dataMin', 'dataMax']}
                  reversed
                  tickFormatter={(t: number) => formatClock(new Date(t))}
                  tick={{ fontSize: 10, fill: 'var(--faint)' }}
                  stroke="var(--line)"
                  width={44}
                  minTickGap={28}
                />
                <ReferenceLine x={RISK_ALERT_THRESHOLD} stroke="var(--danger)" strokeDasharray="4 4" />
                <Tooltip
                  contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(t) => formatClock(new Date(Number(t)))}
                  formatter={(v) => [Number(v).toFixed(1), 'Risk index']}
                />
                <Area
                  type="monotone"
                  dataKey="risk"
                  stroke="url(#riskStrokeVertical)"
                  strokeWidth={2.2}
                  fill="url(#riskFillVertical)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-muted">
        <span className="w-4 border-t-2 border-dashed border-danger" aria-hidden />
        Alert threshold {RISK_ALERT_THRESHOLD} · newest at the top
      </p>
    </section>
  );
}
