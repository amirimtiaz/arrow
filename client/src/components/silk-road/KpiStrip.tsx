'use client';

import clsx from 'clsx';
import { AlertOctagon, CircleDollarSign, Clock4, Package, ShieldAlert, type LucideIcon } from 'lucide-react';
import { formatInt, formatPct, formatUsd } from '@/lib/format';
import { useKpis } from '@/lib/ops/hooks';

/** Top-center KPI strip: on-time %, in transit, value at risk, disruptions, cyber. */
export function KpiStrip() {
  const k = useKpis();
  return (
    <div className="pointer-events-auto flex items-stretch divide-x divide-line overflow-hidden rounded-xl border border-line bg-panel/95 shadow-panel backdrop-blur">
      <Kpi
        icon={Clock4}
        label="On-time"
        value={formatPct(k.onTimePct)}
        tone={k.onTimePct >= 95 ? 'success' : k.onTimePct >= 85 ? 'warning' : 'danger'}
      />
      <Kpi icon={Package} label="In transit" value={formatInt(k.inTransit)} sub={formatUsd(k.valueInTransitUsd)} />
      <Kpi
        icon={CircleDollarSign}
        label="Value at risk"
        value={formatUsd(k.valueAtRiskUsd)}
        tone={k.valueAtRiskUsd > 0 ? 'warning' : 'success'}
      />
      <Kpi
        icon={AlertOctagon}
        label="Open disruptions"
        value={String(k.openDisruptions)}
        tone={k.openDisruptions > 0 ? 'danger' : 'success'}
      />
      <Kpi icon={ShieldAlert} label="Cyber alerts" value={String(k.cyberAlerts)} tone={k.cyberAlerts > 0 ? 'danger' : 'success'} />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: 'success' | 'warning' | 'danger';
}) {
  const toneClass = tone ? { success: 'text-success', warning: 'text-warning', danger: 'text-danger' }[tone] : 'text-fg';
  return (
    <div className="flex min-w-[118px] flex-col justify-center px-3.5 py-2">
      <span className="flex items-center gap-1 text-[10px] font-bold tracking-wide text-muted uppercase">
        <Icon className="size-3" aria-hidden />
        {label}
      </span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span className={clsx('text-lg leading-none font-extrabold tabular-nums', toneClass)}>{value}</span>
        {sub && <span className="text-[11px] text-faint tabular-nums">{sub}</span>}
      </span>
    </div>
  );
}
