'use client';

import clsx from 'clsx';
import { Activity, AlertTriangle, Database, Gauge, History, Loader2, Radar, ShieldAlert, TrendingUp, type LucideIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatClock, formatHours, formatInt, timeAgo, tsToMs } from '@/lib/format';
import { useOpsRows, useOrgSelection, useCurrentOrg } from '@/lib/ops/client';
import { useNetwork, useRiskSeries } from '@/lib/ops/hooks';
import { ROUTE_STATUS } from '@/lib/ops/status';
import { useWorker, type WorkerState } from '@/lib/use-worker';
import { TopBarTitle } from '@/components/shell/TopBarSlots';
import { EmptyState, Panel, SectionLabel, StatusChip } from '@/components/ui/primitives';
import { RISK_ALERT_THRESHOLD } from '@/components/silk-road/BottomStrip';

const RANGES = [
  { label: '6 h', hours: 6 },
  { label: '24 h', hours: 24 },
  { label: '7 d', hours: 168 },
];

interface RiskPoint {
  t: number;
  avgRisk: number;
  maxRisk: number;
  avgDelay: number;
}
interface SecurityPoint {
  t: number;
  total: number;
  high: number;
}
interface TopRoute {
  routeId: number;
  avgRisk: number;
  peakRisk: number;
  avgDelay: number;
}
interface Anomaly {
  routeId: number;
  routeLabel: string;
  recentRisk: number;
  baselineMean: number;
  baselineSd: number;
  z: number;
  detectedAt: string;
  reported: boolean;
}

const tooltipStyle = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 };
const axisTick = { fontSize: 10, fill: 'var(--faint)' };

export function AnalyticsView() {
  const { orgId } = useOrgSelection();
  const org = useCurrentOrg();
  const [hours, setHours] = useState(24);
  const risk = useWorker<{ series: RiskPoint[] }>(`/analytics/risk?orgId=${orgId}&hours=${hours}`);
  const security = useWorker<{ series: SecurityPoint[] }>(`/analytics/security?orgId=${orgId}&minutes=60`, 10_000);
  const top = useWorker<{ routes: TopRoute[] }>(`/analytics/top-routes?orgId=${orgId}&hours=${hours}`);
  const summary = useWorker<{ samples: number; since: string | null }>(`/analytics/summary?orgId=${orgId}`, 60_000);
  const anomalies = useWorker<{ anomalies: Anomaly[] }>(`/analytics/anomalies?orgId=${orgId}`, 10_000);
  const tigerMissing = risk.status === 'tiger_not_configured';
  const workerDown = risk.status === 'error';

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <TopBarTitle>
        <div className="min-w-0">
          <p className="text-[15px] leading-tight font-extrabold text-accent">Analytics</p>
          <p className="truncate text-[11.5px] text-muted">Tiger Data time-series history · {org?.name ?? '…'}</p>
        </div>
      </TopBarTitle>

      <div className="mx-auto max-w-[1600px] space-y-4 p-5">
        {(tigerMissing || workerDown) && (
          <div
            className={clsx(
              'flex items-start gap-3 rounded-xl border p-4',
              workerDown ? 'border-danger/40 bg-danger-soft' : 'border-warning/40 bg-warning-soft'
            )}
          >
            <Database className={clsx('mt-0.5 size-5 shrink-0', workerDown ? 'text-danger' : 'text-warning')} aria-hidden />
            <div className="text-sm">
              <p className={clsx('font-bold', workerDown ? 'text-danger' : 'text-warning')}>
                {workerDown ? 'Analytics worker offline' : 'Tiger Data not connected'}
              </p>
              <p className="mt-0.5 text-muted">
                {workerDown
                  ? risk.message
                  : 'Historical charts and anomaly detection need Tiger Data. Add TIGER_DATABASE_URL to worker/.env, run `npm run tiger:setup` in worker/, then restart the worker. Live SpacetimeDB panels below keep working.'}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-3">
          <SummaryCard
            icon={History}
            label="History in Tiger"
            value={summary.status === 'ok' ? formatInt(summary.data.samples) : '—'}
            sub={
              summary.status === 'ok' && summary.data.since
                ? `samples since ${new Date(summary.data.since).toLocaleDateString()}`
                : 'route_metrics hypertable'
            }
          />
          <SummaryCard
            icon={Gauge}
            label={`Avg risk (${RANGES.find((r) => r.hours === hours)?.label})`}
            value={risk.status === 'ok' && risk.data.series.length ? avg(risk.data.series.map((p) => p.avgRisk)).toFixed(1) : '—'}
            sub="route_risk_5m continuous aggregate"
          />
          <SummaryCard
            icon={TrendingUp}
            label="Peak lane risk"
            value={risk.status === 'ok' && risk.data.series.length ? Math.max(...risk.data.series.map((p) => p.maxRisk)).toFixed(1) : '—'}
            sub={`Alert threshold ${RISK_ALERT_THRESHOLD}`}
          />
          <SummaryCard
            icon={Radar}
            label="Anomalies detected"
            value={anomalies.status === 'ok' ? String(anomalies.data.anomalies.length) : '—'}
            sub="z-score vs 24 h baseline (SQL)"
          />
        </div>

        <Panel className="p-4">
          <SectionLabel
            icon={Activity}
            right={
              <div className="flex rounded-lg border border-line bg-panel-2 p-0.5" role="group" aria-label="Time range">
                {RANGES.map((r) => (
                  <button
                    key={r.hours}
                    type="button"
                    aria-pressed={hours === r.hours}
                    onClick={() => setHours(r.hours)}
                    className={clsx(
                      'rounded-md px-2.5 py-1 text-[11px] font-bold',
                      hours === r.hours ? 'bg-accent text-white' : 'text-muted hover:text-fg'
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            }
          >
            Route risk index over time · Tiger Data
          </SectionLabel>
          <ChartFrame state={risk} height={280} empty={(d) => d.series.length === 0}>
            {(d) => (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d.series} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}>
                  <defs>
                    <linearGradient id="tigerRisk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(t) => timeLabel(t, hours)}
                    tick={axisTick}
                    stroke="var(--line)"
                    minTickGap={50}
                  />
                  <YAxis domain={[0, 100]} tick={axisTick} stroke="var(--line)" />
                  <ReferenceLine
                    y={RISK_ALERT_THRESHOLD}
                    stroke="var(--danger)"
                    strokeDasharray="4 4"
                    label={{ value: 'Alert threshold', position: 'insideTopRight', fontSize: 10, fill: 'var(--danger)' }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
                    formatter={(v, n) => [Number(v).toFixed(1), n === 'avgRisk' ? 'Average lane risk' : 'Peak lane risk']}
                  />
                  <Legend formatter={(v) => (v === 'avgRisk' ? 'Average lane risk' : 'Peak lane risk')} wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    type="monotone"
                    dataKey="avgRisk"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    fill="url(#tigerRisk)"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="maxRisk"
                    stroke="var(--danger)"
                    strokeWidth={1.2}
                    fill="none"
                    strokeOpacity={0.7}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartFrame>
        </Panel>

        <div className="grid grid-cols-5 gap-4">
          <Panel className="col-span-3 p-4">
            <SectionLabel icon={ShieldAlert}>Security events per minute · Tiger Data (last 60 min)</SectionLabel>
            <ChartFrame state={security} height={220} empty={(d) => d.series.length === 0}>
              {(d) => (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={d.series.map((p) => ({ ...p, other: p.total - p.high }))}
                    margin={{ top: 10, right: 8, bottom: 0, left: -18 }}
                  >
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="t"
                      type="category"
                      tickFormatter={(t) => formatClock(new Date(Number(t)))}
                      tick={axisTick}
                      stroke="var(--line)"
                      minTickGap={30}
                    />
                    <YAxis allowDecimals={false} tick={axisTick} stroke="var(--line)" />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={(t) => formatClock(new Date(Number(t)))} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="high" name="High / critical" stackId="s" fill="var(--danger)" isAnimationActive={false} />
                    <Bar
                      dataKey="other"
                      name="Low / medium"
                      stackId="s"
                      fill="var(--accent)"
                      fillOpacity={0.55}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartFrame>
          </Panel>
          <TopRoutesPanel state={top} hours={hours} />
        </div>

        <div className="grid grid-cols-5 gap-4">
          <AnomalyPanel state={anomalies} />
          <LiveLanesPanel />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub: string }) {
  return (
    <Panel className="p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
        <Icon className="size-3.5 text-accent" aria-hidden />
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold text-fg tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-faint">{sub}</p>
    </Panel>
  );
}

function ChartFrame<T>({
  state,
  height,
  empty,
  children,
}: {
  state: WorkerState<T>;
  height: number;
  empty(d: T): boolean;
  children(d: T): ReactNode;
}) {
  return (
    <div className="mt-3" style={{ height }}>
      {state.status === 'loading' ? (
        <div className="grid h-full place-items-center text-xs text-muted">
          <Loader2 className="size-4 animate-spin" aria-label="Loading" />
        </div>
      ) : state.status === 'ok' ? (
        empty(state.data) ? (
          <EmptyState icon={Database} title="No data in this window yet">
            Run <code className="font-mono">npm run tiger:setup</code> to backfill history.
          </EmptyState>
        ) : (
          children(state.data)
        )
      ) : (
        <EmptyState icon={Database} title={state.status === 'tiger_not_configured' ? 'Tiger Data not connected' : 'Analytics unavailable'}>
          {state.status === 'error' ? state.message : 'This chart is powered by a live Tiger Data query.'}
        </EmptyState>
      )}
    </div>
  );
}

function TopRoutesPanel({ state, hours }: { state: WorkerState<{ routes: TopRoute[] }>; hours: number }) {
  const network = useNetwork();
  return (
    <Panel className="col-span-2 p-4">
      <SectionLabel icon={AlertTriangle}>Riskiest lanes · {RANGES.find((r) => r.hours === hours)?.label}</SectionLabel>
      <ChartFrame state={state} height={220} empty={(d) => d.routes.length === 0}>
        {(d) => (
          <table className="w-full text-left text-[12px]">
            <thead className="text-[10px] tracking-wide text-faint uppercase">
              <tr>
                <th className="pb-1.5 font-semibold">Lane</th>
                <th className="pb-1.5 text-right font-semibold">Avg</th>
                <th className="pb-1.5 text-right font-semibold">Peak</th>
                <th className="pb-1.5 text-right font-semibold">Delay</th>
              </tr>
            </thead>
            <tbody>
              {d.routes.map((r) => {
                const route = network.routesById.get(r.routeId);
                return (
                  <tr key={r.routeId} className="border-t border-line">
                    <td className="py-1.5 pr-2">
                      <span className="block truncate font-semibold text-fg">{route?.label ?? `Lane ${r.routeId}`}</span>
                      <span className="text-[10.5px] text-faint">{route?.lane}</span>
                    </td>
                    <td className="py-1.5 text-right text-muted tabular-nums">{r.avgRisk.toFixed(1)}</td>
                    <td
                      className={clsx(
                        'py-1.5 text-right font-bold tabular-nums',
                        r.peakRisk >= RISK_ALERT_THRESHOLD ? 'text-danger' : 'text-fg'
                      )}
                    >
                      {r.peakRisk.toFixed(1)}
                    </td>
                    <td className="py-1.5 text-right text-muted tabular-nums">{formatHours(r.avgDelay ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </ChartFrame>
    </Panel>
  );
}

function AnomalyPanel({ state }: { state: WorkerState<{ anomalies: Anomaly[] }> }) {
  return (
    <Panel className="col-span-2 p-4">
      <SectionLabel icon={Radar}>Anomaly detections · SQL z-score</SectionLabel>
      <p className="mt-1 text-[11px] text-faint">
        Latest minute of route_metrics vs the 24 h route_risk_5m baseline; z &gt; 3 opens a disruption and wakes the agents.
      </p>
      <div className="mt-2">
        {state.status !== 'ok' || state.data.anomalies.length === 0 ? (
          <EmptyState icon={Radar} title="No anomalies yet">
            Use &ldquo;Simulate congestion&rdquo; in Crisis Scenarios: no disruption is declared, so Tiger has to detect it.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {state.data.anomalies.map((a) => (
              <li key={`${a.routeId}-${a.detectedAt}`} className="rounded-lg border border-line bg-panel-2 p-2.5 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-fg">{a.routeLabel}</span>
                  <span className="rounded bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger">z = {a.z}</span>
                </div>
                <p className="mt-0.5 text-muted">
                  Risk {a.recentRisk} vs baseline {a.baselineMean} ± {a.baselineSd} · {timeAgo(new Date(a.detectedAt))}
                  {a.reported ? ' · disruption opened' : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/** Live view straight from SpacetimeDB (works even without Tiger). */
function LiveLanesPanel() {
  const network = useNetwork();
  const telemetry = useOpsRows('telemetry');
  const series = useRiskSeries();
  const { orgId } = useOrgSelection();

  const lanes = useMemo(() => {
    const latest = new Map<number, { risk: number; delay: number; ts: number }>();
    for (const t of telemetry) {
      if (t.orgId !== orgId) continue;
      const ts = tsToMs(t.ts);
      const prev = latest.get(t.routeId);
      if (!prev || ts > prev.ts) latest.set(t.routeId, { risk: t.riskIndex, delay: t.delayHours, ts });
    }
    return network.routes
      .filter((r) => r.status !== 'standby')
      .map((r) => ({ route: r, ...(latest.get(r.id) ?? { risk: r.risk * 100, delay: 0, ts: 0 }) }))
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 8);
  }, [telemetry, network.routes, orgId]);

  return (
    <Panel className="col-span-3 p-4">
      <SectionLabel icon={Activity} right={<span className="text-[11px] text-faint">{series.length} live samples</span>}>
        Live lane telemetry · SpacetimeDB
      </SectionLabel>
      <table className="mt-2 w-full text-left text-[12px]">
        <thead className="text-[10px] tracking-wide text-faint uppercase">
          <tr>
            <th className="pb-1.5 font-semibold">Lane</th>
            <th className="pb-1.5 font-semibold">Status</th>
            <th className="pb-1.5 font-semibold">Risk</th>
            <th className="pb-1.5 text-right font-semibold">Delay</th>
          </tr>
        </thead>
        <tbody>
          {lanes.map(({ route, risk, delay }) => (
            <tr key={route.id} className="border-t border-line">
              <td className="py-1.5 pr-2">
                <span className="font-semibold text-fg">{route.label}</span> <span className="text-[10.5px] text-faint">{route.mode}</span>
              </td>
              <td className="py-1.5">
                <StatusChip meta={ROUTE_STATUS[route.status] ?? ROUTE_STATUS.healthy} />
              </td>
              <td className="py-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-28 overflow-hidden rounded-full bg-panel-2">
                    <div
                      className={clsx(
                        'h-full rounded-full',
                        risk >= RISK_ALERT_THRESHOLD ? 'bg-danger' : risk >= 26 ? 'bg-warning' : 'bg-success'
                      )}
                      style={{ width: `${Math.min(100, risk)}%` }}
                    />
                  </div>
                  <span className="text-muted tabular-nums">{risk.toFixed(0)}</span>
                </div>
              </td>
              <td className="py-1.5 text-right text-muted tabular-nums">{formatHours(delay)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function avg(values: number[]) {
  return values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
}

function timeLabel(t: number, hours: number) {
  const d = new Date(t);
  return hours > 48 ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : formatClock(d);
}
