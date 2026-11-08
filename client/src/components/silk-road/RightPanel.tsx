'use client';

import clsx from 'clsx';
import { Bot, CircleAlert, Cpu, Eye, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import type { AgentRun, Disruption } from '@/module_bindings/ops/types';
import { formatPct, formatUsd, timeAgo, tsToDate } from '@/lib/format';
import { AGENTS, prettyModel, useAgentService } from '@/lib/ops/agent';
import { useKpis, useRunForDisruption, useRunSteps } from '@/lib/ops/hooks';
import { DISRUPTION_KIND, riskLevel, SEVERITY } from '@/lib/ops/status';
import { ProgressBar, SectionLabel, StatusChip } from '@/components/ui/primitives';
import { AgentTrace } from './AgentTrace';
import { useFocusedDisruption } from './SilkRoadState';

export function RightPanel() {
  const disruption = useFocusedDisruption();
  const run = useRunForDisruption(disruption?.id);
  return (
    <aside
      className="flex w-[384px] shrink-0 flex-col gap-4 overflow-hidden border-l border-line bg-elevated p-4"
      aria-label="Risk and agent panel"
    >
      <RiskAssessment disruption={disruption} />
      <AgentRoster run={run} disruption={disruption} />
      <AgentTrace run={run} disruption={disruption} />
    </aside>
  );
}

function RiskAssessment({ disruption }: { disruption: Disruption | undefined }) {
  const k = useKpis();
  const level = riskLevel(k.riskIndex);
  const active = disruption && disruption.status !== 'resolved';
  const severity = disruption ? (SEVERITY[disruption.severity] ?? SEVERITY.moderate) : SEVERITY.low;
  const KindIcon = disruption ? (DISRUPTION_KIND[disruption.kind]?.icon ?? TriangleAlert) : ShieldCheck;

  return (
    <section aria-label="Risk assessment">
      <SectionLabel icon={Eye} right={<StatusChip meta={level.meta} label={level.label} />}>
        Risk assessment
      </SectionLabel>
      <div
        className={clsx(
          'mt-2 rounded-xl border-l-4 border-y border-r p-3',
          active
            ? disruption.status === 'mitigating'
              ? 'border-warning border-y-line border-r-line bg-warning-soft'
              : 'border-danger border-y-line border-r-line bg-danger-soft'
            : 'border-success border-y-line border-r-line bg-panel'
        )}
      >
        <div className="flex items-start gap-2.5">
          <KindIcon className={clsx('mt-0.5 size-5 shrink-0', active ? severity.text : 'text-success')} aria-hidden />
          <div className="min-w-0">
            <p className="text-[15px] leading-tight font-extrabold text-fg">{active ? disruption.title : 'NONE'}</p>
            <p className="mt-1 line-clamp-3 text-[12px] leading-snug text-muted">
              {active ? disruption.summary : 'No active disruptions. All monitored lanes are operating normally.'}
            </p>
            {active && (
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-faint">
                <StatusChip meta={severity} />
                <span>{DISRUPTION_KIND[disruption.kind]?.label}</span>·<span>{disruption.affectedRouteIds.length} lanes</span>·
                <span>{disruption.status === 'mitigating' ? 'Mitigating' : 'Active'}</span>·
                <span>{timeAgo(tsToDate(disruption.createdAt))}</span>
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Gauge
          label="Risk index"
          value={k.riskIndex}
          display={k.riskIndex.toFixed(0)}
          tone={k.riskIndex >= 38 ? 'danger' : k.riskIndex >= 26 ? 'warning' : 'success'}
        />
        <Gauge
          label="On-time"
          value={k.onTimePct}
          display={formatPct(k.onTimePct, 0)}
          tone={k.onTimePct >= 95 ? 'success' : k.onTimePct >= 85 ? 'warning' : 'danger'}
        />
      </div>
      {k.valueAtRiskUsd > 0 && (
        <p className="mt-1.5 text-[11px] text-muted">
          Value at risk: <b className="text-warning">{formatUsd(k.valueAtRiskUsd)}</b>
        </p>
      )}
    </section>
  );
}

function Gauge({ label, value, display, tone }: { label: string; value: number; display: string; tone: 'success' | 'warning' | 'danger' }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10.5px] text-muted">{label}</span>
        <span className="text-[13px] font-bold text-fg tabular-nums">{display}</span>
      </div>
      <div className="mt-1.5">
        <ProgressBar value={value} tone={tone} />
      </div>
    </div>
  );
}

function AgentRoster({ run, disruption }: { run: AgentRun | undefined; disruption: Disruption | undefined }) {
  const service = useAgentService();
  const steps = useRunSteps(run?.id);

  const roster = useMemo(
    () =>
      AGENTS.map((agent) => {
        const mine = steps.filter((s) => s.agent === agent.name);
        const last = mine.at(-1);
        const cyberOnly = agent.name === 'Cyber Triage' && disruption?.kind !== 'cyber';
        let status: { label: string; className: string } = { label: 'Idle', className: 'text-muted bg-panel-2' };
        if (cyberOnly) status = { label: 'Not needed', className: 'text-faint bg-panel-2' };
        else if (run?.status === 'failed' && run.activeAgent === agent.name)
          status = { label: 'Failed', className: 'text-danger bg-danger-soft' };
        else if (run?.status === 'running' && run.activeAgent === agent.name)
          status = { label: 'Processing', className: 'text-accent bg-accent-soft' };
        else if (mine.length > 0) status = { label: 'Done', className: 'text-success bg-success-soft' };
        const progress = cyberOnly
          ? 0
          : status.label === 'Done'
            ? 100
            : status.label === 'Processing'
              ? Math.min(90, 20 + mine.length * 15)
              : 0;
        return { ...agent, status, progress, detail: cyberOnly ? 'Only engaged for cyber disruptions' : (last?.title ?? agent.role) };
      }),
    [steps, run, disruption]
  );

  const serviceChip = {
    online: { label: 'Online', className: 'text-success bg-success-soft' },
    not_configured: { label: 'Needs API key', className: 'text-warning bg-warning-soft' },
    error: { label: 'Error', className: 'text-danger bg-danger-soft' },
    offline: { label: 'Offline', className: 'text-danger bg-danger-soft' },
    unknown: { label: 'Not started', className: 'text-muted bg-panel-2' },
  }[service.state];

  return (
    <section aria-label="Nemotron agents">
      <SectionLabel
        icon={Bot}
        right={
          <span className={clsx('rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase', serviceChip.className)} title={service.message}>
            {serviceChip.label}
          </span>
        }
      >
        Nemotron agents
      </SectionLabel>
      {service.state !== 'online' && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-warning/40 bg-warning-soft p-2 text-[11.5px] text-warning">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {service.message}
        </p>
      )}
      <ul className="mt-2 space-y-1.5">
        {roster.map((agent) => (
          <li key={agent.name} className="rounded-lg border border-line bg-panel p-2.5">
            <div className="flex items-center gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
                <Cpu className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-bold text-fg">{agent.name}</p>
                <p className="truncate text-[11px] text-muted" title={agent.detail}>
                  {agent.detail}
                </p>
              </div>
              <span className={clsx('rounded-md px-1.5 py-0.5 text-[9.5px] font-bold uppercase', agent.status.className)}>
                {agent.status.label}
              </span>
            </div>
            {agent.progress > 0 && (
              <div className="mt-2">
                <ProgressBar value={agent.progress} tone={agent.status.label === 'Done' ? 'success' : 'accent'} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {service.model && <p className="mt-1.5 text-[10.5px] text-faint">Model: {prettyModel(service.model)} via build.nvidia.com</p>}
    </section>
  );
}
