'use client';

/**
 * Live supply chain risk monitor as a draggable card on the Silk Road map (Settings › Map › Risk monitor). The same
 * live risk samples drive the tall monitor beside the Live Feed.
 */
import { Activity } from 'lucide-react';
import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatClock, formatPct, formatUsd, tsToMs } from '@/lib/format';
import { useRiskSeries } from '@/lib/ops/hooks';
import { riskLevel } from '@/lib/ops/status';
import { useSettings } from '@/lib/settings';
import { StatusChip } from '@/components/ui/primitives';
import { RISK_ALERT_THRESHOLD } from './BottomStrip';
import { MapCard } from './MapCard';

export function RiskCard() {
  const { updateMap } = useSettings();
  const series = useRiskSeries();
  const data = useMemo(() => series.map((s) => ({ t: tsToMs(s.ts), risk: s.riskIndex })), [series]);
  const latest = series.at(-1);
  const level = riskLevel(latest?.riskIndex ?? 0);

  return (
    <MapCard
      id="risk"
      title="Live: supply chain risk"
      icon={Activity}
      width={380}
      anchor={{ left: 16, bottom: 16 }}
      badge={latest && <StatusChip meta={level.meta} label={level.label} className="shrink-0" />}
      onClose={() => updateMap({ showRisk: false })}
      closeTitle="Hide the risk monitor (turn it back on in Settings › Map)"
    >
      <div className="px-3 pt-2 pb-2.5">
        <div className="flex items-baseline gap-4 text-[11px] text-muted">
          <span>
            Risk index <b className="text-sm text-fg tabular-nums">{latest ? latest.riskIndex.toFixed(1) : '—'}</b>
          </span>
          {latest && (
            <>
              <span>
                On-time <b className="text-fg tabular-nums">{formatPct(latest.onTimePct)}</b>
              </span>
              <span>
                At risk <b className="text-fg tabular-nums">{formatUsd(latest.valueAtRiskUsd)}</b>
              </span>
            </>
          )}
        </div>
        <div className="relative mt-1.5 h-[120px]">
          {data.length < 2 ? (
            <p className="grid h-full place-items-center text-xs text-muted">Collecting live samples…</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="riskCardFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.35} />
                    <stop offset="55%" stopColor="var(--accent)" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="riskCardStroke" x1="0" y1="0" x2="0" y2="1">
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
                <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 10, fill: 'var(--faint)' }} stroke="var(--line)" />
                <ReferenceLine y={RISK_ALERT_THRESHOLD} stroke="var(--danger)" strokeDasharray="4 4" />
                <Tooltip
                  contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(t) => formatClock(new Date(Number(t)))}
                  formatter={(v) => [Number(v).toFixed(1), 'Risk index']}
                />
                <Area
                  type="monotone"
                  dataKey="risk"
                  stroke="url(#riskCardStroke)"
                  strokeWidth={2}
                  fill="url(#riskCardFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </MapCard>
  );
}
