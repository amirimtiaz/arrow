'use client';

import clsx from 'clsx';
import {
  Activity,
  ArrowRightLeft,
  Brain,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Gavel,
  ListChecks,
  MessageSquareText,
  Radio,
  Rocket,
  Scale,
  ShieldCheck,
  Timer,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ActionProposal, AgentRun, AgentStep, Disruption, RouteOption } from '@/module_bindings/ops/types';
import { formatHours, formatUsd, safeJson, timeAgo, tsToDate } from '@/lib/format';
import { prettyModel } from '@/lib/ops/agent';
import { useMyProfile, useOps } from '@/lib/ops/client';
import { useOptions, useProposals, useRunSteps } from '@/lib/ops/hooks';
import { Button, EmptyState, ProgressBar, SectionLabel } from '@/components/ui/primitives';
import { RichText } from '@/components/ui/RichText';
import { errorMessage, useToast } from '@/components/ui/toast';
import { useSilkRoad, type TraceTab } from './SilkRoadState';

const STEP_META: Record<string, { icon: LucideIcon; label: string; className: string }> = {
  plan: { icon: ListChecks, label: 'Plan', className: 'text-violet bg-violet-soft' },
  tool_call: { icon: Wrench, label: 'Tool call', className: 'text-accent bg-accent-soft' },
  observation: { icon: Brain, label: 'Reasoning', className: 'text-cyan bg-cyan-soft' },
  handoff: { icon: ArrowRightLeft, label: 'Handoff', className: 'text-warning bg-warning-soft' },
  decision: { icon: Gavel, label: 'Decision', className: 'text-success bg-success-soft' },
  message: { icon: MessageSquareText, label: 'Answer', className: 'text-success bg-success-soft' },
  error: { icon: CircleAlert, label: 'Error', className: 'text-danger bg-danger-soft' },
};

export function AgentTrace({ run, disruption }: { run: AgentRun | undefined; disruption: Disruption | undefined }) {
  const { traceTab, setTraceTab } = useSilkRoad();
  const steps = useRunSteps(run?.id);
  const options = useOptions(disruption?.id);
  const proposals = useProposals(run?.id);
  const pending = proposals.find((p) => p.status === 'pending' && p.requiresApproval);

  // Follow the live trace by scrolling only this panel (scrollIntoView would also scroll the app shell).
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && traceTab === 'reasoning') el.scrollTop = el.scrollHeight;
  }, [steps.length, traceTab]);

  // Jump to the Decision tab once when a new proposal needs approval.
  const lastPending = useRef<bigint | null>(null);
  useEffect(() => {
    if (pending && pending.id !== lastPending.current) {
      lastPending.current = pending.id;
      setTraceTab('decision');
    }
  }, [pending, setTraceTab]);

  const tabs: { id: TraceTab; label: string; icon: LucideIcon; count?: number }[] = [
    { id: 'reasoning', label: 'Reasoning', icon: Brain, count: steps.length },
    { id: 'options', label: 'Options', icon: ClipboardList, count: options.length || undefined },
    { id: 'decision', label: 'Decision', icon: Gavel, count: pending ? 1 : undefined },
    { id: 'execution', label: 'Execution', icon: Rocket },
  ];
  const live = run?.status === 'running' || run?.status === 'queued';

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Agent trace">
      <SectionLabel
        icon={Radio}
        right={
          run && (
            <span
              className={clsx(
                'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase',
                live ? 'bg-accent-soft text-accent' : 'bg-panel-2 text-muted'
              )}
            >
              <span className={clsx('size-1.5 rounded-full', live ? 'animate-soft-pulse bg-accent' : 'bg-faint')} />
              {live ? 'Live' : run.status.replace('_', ' ')}
            </span>
          )
        }
      >
        Agent trace
      </SectionLabel>

      <div role="tablist" className="mt-2 flex gap-1 border-b border-line">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={traceTab === tab.id}
            onClick={() => setTraceTab(tab.id)}
            className={clsx(
              '-mb-px flex items-center gap-1 border-b-2 px-2 py-1.5 text-[12px] font-semibold',
              traceTab === tab.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-fg'
            )}
          >
            <tab.icon className="size-3.5" aria-hidden />
            {tab.label}
            {tab.count !== undefined && <span className="rounded bg-panel-2 px-1 text-[10px] text-muted tabular-nums">{tab.count}</span>}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="scroll-thin mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {!run ? (
          <EmptyState icon={Brain} title="No agent run yet">
            Trigger a scenario. The Nemotron agents start on their own when a disruption appears, with no prompt needed.
          </EmptyState>
        ) : traceTab === 'reasoning' ? (
          <ReasoningTab run={run} steps={steps} />
        ) : traceTab === 'options' ? (
          <OptionsTab options={options} proposals={proposals} />
        ) : traceTab === 'decision' ? (
          <DecisionTab run={run} proposals={proposals} options={options} steps={steps} />
        ) : (
          <ExecutionTab run={run} proposals={proposals} options={options} disruption={disruption} steps={steps} />
        )}
      </div>
    </section>
  );
}

function ReasoningTab({ run, steps }: { run: AgentRun; steps: AgentStep[] }) {
  return (
    <ol className="space-y-2">
      <li className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span className="rounded-md bg-panel-2 px-1.5 py-0.5 font-mono">run #{String(run.id)}</span>
        {run.model && <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-semibold text-accent">{prettyModel(run.model)}</span>}
        <span>{run.trigger === 'event' ? 'Started automatically by the disruption event' : `Asked by ${run.requestedByName}`}</span>
      </li>
      {steps.map((step) => (
        <StepCard key={String(step.id)} step={step} />
      ))}
      {run.status === 'running' && (
        <li className="flex items-center gap-2 px-1 text-[12px] text-muted">
          <span className="flex gap-0.5">
            <span className="size-1.5 animate-soft-pulse rounded-full bg-accent" />
            <span className="size-1.5 animate-soft-pulse rounded-full bg-accent [animation-delay:200ms]" />
            <span className="size-1.5 animate-soft-pulse rounded-full bg-accent [animation-delay:400ms]" />
          </span>
          {run.activeAgent || 'Agent'} is working…
        </li>
      )}
      {run.status === 'failed' && (
        <li className="rounded-lg border border-danger/40 bg-danger-soft p-2.5 text-[12px] text-danger">
          <b>Run failed.</b> {run.error || 'Unknown error.'} No output was faked; trigger the scenario again once the agent service is
          healthy.
        </li>
      )}
    </ol>
  );
}

function StepCard({ step }: { step: AgentStep }) {
  const [open, setOpen] = useState(false);
  const meta = STEP_META[step.kind] ?? STEP_META.observation;
  const Icon = meta.icon;
  const output = safeJson<Record<string, unknown> | null>(step.outputJson, null);
  const text = typeof output?.text === 'string' ? output.text : typeof output?.summary === 'string' ? output.summary : '';
  const planSteps = step.kind === 'plan' && Array.isArray(output?.steps) ? (output.steps as unknown[]).map(String) : [];
  const hasDetails = step.inputJson.length > 2 || (step.outputJson.length > 2 && step.kind === 'tool_call');

  return (
    <li className="rounded-lg border border-line bg-panel-2 p-2.5">
      <div className="flex items-start gap-2">
        <span className={clsx('mt-0.5 grid size-5 shrink-0 place-items-center rounded-md', meta.className)}>
          <Icon className="size-3" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted">
            <span className="font-bold tracking-wide uppercase">{meta.label}</span>
            <span>{step.agent}</span>
            {step.tool && <span className="rounded bg-accent-soft px-1 font-mono text-accent">{step.tool}</span>}
            {step.latencyMs > 0 && (
              <span className="flex items-center gap-0.5 tabular-nums">
                <Timer className="size-3" aria-hidden />
                {step.latencyMs} ms
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12.5px] leading-snug font-medium text-fg">{step.title}</p>
          {planSteps.length > 0 && (
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-[12px] text-muted">
              {planSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
          {text && step.kind !== 'tool_call' && <RichText text={text} className="mt-1 text-[12px] leading-relaxed text-muted" />}
          {hasDetails && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="mt-1 flex items-center gap-0.5 text-[11px] font-semibold text-accent"
            >
              <ChevronRight className={clsx('size-3 transition-transform', open && 'rotate-90')} aria-hidden />
              {open ? 'Hide' : 'Show'} arguments & result
            </button>
          )}
          {open && (
            <div className="mt-1.5 space-y-1.5">
              <JsonBlock label="Arguments" json={step.inputJson} />
              <JsonBlock label="Result" json={step.outputJson} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function JsonBlock({ label, json }: { label: string; json: string }) {
  const pretty = useMemo(() => {
    const parsed = safeJson<unknown>(json, json);
    return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
  }, [json]);
  return (
    <div>
      <p className="text-[10px] font-bold tracking-wide text-faint uppercase">{label}</p>
      <pre className="scroll-thin mt-0.5 max-h-48 overflow-auto rounded-md bg-bg p-2 font-mono text-[10.5px] leading-relaxed text-muted">
        {pretty}
      </pre>
    </div>
  );
}

function OptionsTab({ options, proposals }: { options: RouteOption[]; proposals: ActionProposal[] }) {
  const chosen = new Set(proposals.filter((p) => p.optionId !== 0n).map((p) => p.optionId));
  if (options.length === 0) {
    return (
      <EmptyState icon={ClipboardList} title="No options scored yet">
        The Recovery Planner calls <code className="font-mono">evaluate_route_alternatives</code>; SpacetimeDB computes cost, delay and
        risk.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted">
        Computed by the <span className="font-mono text-fg">evaluate_alternatives</span> reducer from live shipments. Score = 100 × best
        expected impact ÷ this option&apos;s.
      </p>
      {options.map((o) => {
        const impact = safeJson<{ expectedImpactUsd?: number }>(o.actionsJson, {}).expectedImpactUsd ?? 0;
        const recommended = chosen.has(o.id);
        return (
          <div
            key={String(o.id)}
            className={clsx('rounded-lg border p-2.5', recommended ? 'border-accent bg-accent-soft' : 'border-line bg-panel-2')}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12.5px] font-semibold text-fg">
                <span className="mr-1 text-muted">#{o.rank}</span>
                {o.label}
              </p>
              {recommended && (
                <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">Proposed</span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5 text-[11px]">
              <Metric label="Added cost" value={formatUsd(o.addedCostUsd)} />
              <Metric label="Avg delay" value={formatHours(o.avgDelayHours)} />
              <Metric label="Risk" value={`${Math.round(o.risk * 100)}%`} />
              <Metric label="Impact" value={formatUsd(impact)} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <ProgressBar value={o.score} tone={o.rank === 1 ? 'success' : o.score > 60 ? 'accent' : 'warning'} />
              <span className="w-12 text-right text-[11px] font-bold text-fg tabular-nums">{o.score.toFixed(0)}</span>
            </div>
            <p className="mt-1 text-[10.5px] text-faint">
              {o.shipmentsMoved} moved · {o.shipmentsHeld} held · {o.shipmentsAffected} shipments
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-bg/60 px-1.5 py-1">
      <p className="text-[9.5px] text-faint uppercase">{label}</p>
      <p className="font-bold text-fg tabular-nums">{value}</p>
    </div>
  );
}

/** The Risk Auditor's independent verdict on the proposal (proposer/critic debate). */
function AuditCard({ steps }: { steps: AgentStep[] }) {
  const review = steps.find((s) => s.agent === 'Risk Auditor' && s.tool === 'review_proposal');
  if (!review) return null;
  const audit = safeJson<{ verdict?: string; assessment?: string; concerns?: string[] }>(review.inputJson, {});
  const kept = steps.find((s) => s.tool === 'keep_proposal');
  const revised = steps.some((s) => s.agent === 'Recovery Planner' && s.tool === 'propose_action' && s.seq > review.seq);
  const challenged = audit.verdict === 'challenge';
  return (
    <div className={clsx('rounded-lg border p-3', challenged ? 'border-warning/40 bg-warning-soft' : 'border-success/40 bg-success-soft')}>
      <p className={clsx('flex items-center gap-1.5 text-[12px] font-bold', challenged ? 'text-warning' : 'text-success')}>
        <Scale className="size-3.5" aria-hidden />
        Risk Auditor {challenged ? 'challenged the plan' : 'concurs'}
      </p>
      {audit.assessment && <p className="mt-1 text-[12px] leading-relaxed text-muted">{audit.assessment}</p>}
      {challenged && (audit.concerns?.length ?? 0) > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11.5px] text-muted">
          {audit.concerns!.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
      {challenged && (revised || kept) && (
        <p className="mt-1.5 text-[11.5px] font-semibold text-fg">
          Planner response: {revised ? 'revised the proposal (earlier one superseded).' : 'kept the proposal with a justification.'}
        </p>
      )}
    </div>
  );
}

function DecisionTab({
  run,
  proposals,
  options,
  steps,
}: {
  run: AgentRun;
  proposals: ActionProposal[];
  options: RouteOption[];
  steps: AgentStep[];
}) {
  const profile = useMyProfile();
  const { conn } = useOps();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const isManager = profile?.role === 'manager';
  // Pending first; superseded drafts sink to the bottom.
  const relevant = proposals
    .filter((p) => p.kind !== 'notify')
    .sort((a, b) => Number(a.status === 'superseded') - Number(b.status === 'superseded'));

  if (relevant.length === 0) {
    return (
      <EmptyState icon={Gavel} title={run.status === 'running' ? 'The agent is still deciding' : 'No action proposed'}>
        State-changing actions always need an operations manager&apos;s approval before they run.
      </EmptyState>
    );
  }

  const decide = async (p: ActionProposal, approve: boolean) => {
    if (!conn) return;
    setBusy(`${p.id}-${approve}`);
    try {
      if (approve) await conn.reducers.approveAction({ proposalId: p.id, note });
      else await conn.reducers.rejectAction({ proposalId: p.id, note });
      toast({
        title: approve ? 'Approved and executed' : 'Proposal rejected',
        description: approve ? 'Routes and shipments updated for everyone.' : undefined,
        tone: approve ? 'success' : 'info',
      });
      setNote('');
    } catch (err) {
      toast({ title: 'Decision failed', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2.5">
      <AuditCard steps={steps} />
      {relevant.map((p) => {
        const option = options.find((o) => o.id === p.optionId);
        const awaiting = p.status === 'pending' && p.requiresApproval;
        return (
          <article
            key={String(p.id)}
            className={clsx('rounded-lg border p-3', awaiting ? 'border-warning/50 bg-warning-soft' : 'border-line bg-panel-2')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold tracking-wide text-muted uppercase">
                {p.kind === 'ir_draft' ? 'Incident draft' : `Proposed ${p.kind.replace('_', ' ')}`}
              </span>
              <ProposalStatus p={p} />
            </div>
            <h3 className="mt-1 text-[13.5px] font-bold text-fg">{p.title}</h3>
            <RichText text={p.rationale} className="mt-1 text-[12px] leading-relaxed text-muted" />
            {option && (
              <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
                <Metric label="Added cost" value={formatUsd(option.addedCostUsd)} />
                <Metric label="Avg delay" value={formatHours(option.avgDelayHours)} />
                <Metric label="Score" value={option.score.toFixed(0)} />
              </div>
            )}
            {p.kind === 'ir_draft' && (
              <p className="mt-2 text-[12px] text-muted">
                Ops never touches incident-response data. An authenticated Control Tower member reviews this draft and opens the incident.{' '}
                <Link href="/app/control-tower" className="font-semibold text-accent hover:underline">
                  Open Control Tower →
                </Link>
              </p>
            )}
            {awaiting &&
              (isManager ? (
                <div className="mt-3 space-y-2">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                    placeholder="Optional note for the audit trail"
                    className="h-9 w-full rounded-lg border border-line bg-panel px-2.5 text-[12px] text-fg outline-none placeholder:text-faint focus:border-accent"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="success"
                      icon={CheckCircle2}
                      className="flex-1"
                      loading={busy === `${p.id}-true`}
                      disabled={busy !== null}
                      onClick={() => decide(p, true)}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      icon={XCircle}
                      className="flex-1"
                      loading={busy === `${p.id}-false`}
                      disabled={busy !== null}
                      onClick={() => decide(p, false)}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-warning">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  Waiting for an operations manager to approve.
                </p>
              ))}
            {p.decidedByName && (
              <p className="mt-2 text-[11px] text-faint">
                {p.decidedByName}
                {p.decidedAt ? ` · ${timeAgo(tsToDate(p.decidedAt))}` : ''}
                {p.decisionNote ? ` · “${p.decisionNote}”` : ''}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ProposalStatus({ p }: { p: ActionProposal }) {
  const map: Record<string, { label: string; className: string; icon: LucideIcon }> = {
    pending: { label: p.requiresApproval ? 'Needs approval' : 'Pending review', className: 'text-warning bg-warning-soft', icon: Gavel },
    executed: { label: 'Executed', className: 'text-success bg-success-soft', icon: CheckCircle2 },
    rejected: { label: 'Rejected', className: 'text-muted bg-panel', icon: XCircle },
    superseded: { label: 'Superseded', className: 'text-muted bg-panel', icon: XCircle },
    approved: { label: 'Approved', className: 'text-success bg-success-soft', icon: CheckCircle2 },
  };
  const m = map[p.status] ?? map.pending;
  return (
    <span className={clsx('flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase', m.className)}>
      <m.icon className="size-3" aria-hidden />
      {m.label}
    </span>
  );
}

interface RecoveryMetric {
  metric: string;
  at_approval: number;
  now: number;
  improved: boolean;
}

/** The Recovery Monitor's measured before/after (deterministic numbers from measure_recovery). */
function VerifiedOutcome({ steps }: { steps: AgentStep[] }) {
  const measured = [...steps].reverse().find((s) => s.agent === 'Recovery Monitor' && s.tool === 'measure_recovery');
  if (!measured) return null;
  const data = safeJson<{
    metrics?: RecoveryMetric[];
    affected_shipments?: { rerouted_moving: number; held: number; still_delayed: number };
  }>(measured.outputJson, {});
  const label: Record<string, string> = { on_time_pct: 'On-time', value_at_risk_usd: 'Value at risk', risk_index: 'Risk index' };
  const fmt = (m: RecoveryMetric, v: number) =>
    m.metric === 'value_at_risk_usd' ? formatUsd(v) : m.metric === 'on_time_pct' ? `${v}%` : String(v);
  return (
    <div className="rounded-lg border border-accent/40 bg-accent-soft p-3">
      <p className="flex items-center gap-1.5 text-[12px] font-bold text-accent">
        <Activity className="size-3.5" aria-hidden />
        Verified outcome · Recovery Monitor
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
        {(data.metrics ?? []).map((m) => (
          <div key={m.metric} className="rounded-md bg-bg/60 px-1.5 py-1">
            <p className="text-[9.5px] text-faint uppercase">{label[m.metric] ?? m.metric}</p>
            <p className={clsx('font-bold tabular-nums', m.improved ? 'text-success' : 'text-fg')}>
              {fmt(m, m.at_approval)} → {fmt(m, m.now)}
            </p>
          </div>
        ))}
      </div>
      {data.affected_shipments && (
        <p className="mt-1.5 text-[11px] text-muted">
          {data.affected_shipments.rerouted_moving} re-planned shipments moving · {data.affected_shipments.held} held ·{' '}
          {data.affected_shipments.still_delayed} still delayed
        </p>
      )}
    </div>
  );
}

function ExecutionTab({
  run,
  proposals,
  options,
  disruption,
  steps,
}: {
  run: AgentRun;
  proposals: ActionProposal[];
  options: RouteOption[];
  disruption: Disruption | undefined;
  steps: AgentStep[];
}) {
  const executed = proposals.filter((p) => p.status === 'executed');
  const profile = useMyProfile();
  const { conn } = useOps();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const resolve = async () => {
    if (!conn || !disruption) return;
    setBusy(true);
    try {
      await conn.reducers.resolveDisruption({ disruptionId: disruption.id });
      toast({ title: 'Disruption resolved', description: 'Lanes restored to normal operations.', tone: 'success' });
    } catch (err) {
      toast({ title: 'Could not resolve', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      {executed.length === 0 && (
        <EmptyState icon={Rocket} title="Nothing executed yet">
          Approved actions run through a SpacetimeDB reducer and redraw the globe for every viewer.
        </EmptyState>
      )}
      {executed.map((p) => {
        const option = options.find((o) => o.id === p.optionId);
        return (
          <div key={String(p.id)} className="rounded-lg border border-success/40 bg-success-soft p-3">
            <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-success">
              <CheckCircle2 className="size-4" aria-hidden />
              {p.kind === 'notify' ? 'Briefing posted' : p.kind === 'ir_draft' ? 'Incident opened in Control Tower' : 'Executed'}
            </p>
            <p className="mt-1 text-[13px] font-semibold text-fg">{p.title}</p>
            {option && (
              <p className="mt-1 text-[12px] text-muted">
                {option.shipmentsMoved} shipments re-planned, {option.shipmentsHeld} held · {formatUsd(option.addedCostUsd)} added cost ·
                lanes shown in cyan on the globe.
              </p>
            )}
            <p className="mt-1 text-[11px] text-faint">
              {p.decidedByName}
              {p.decidedAt ? ` · ${timeAgo(tsToDate(p.decidedAt))}` : ''}
              {p.decisionNote ? ` · ${p.decisionNote}` : ''}
            </p>
          </div>
        );
      })}
      <VerifiedOutcome steps={steps} />
      {run.summary && (
        <div className="rounded-lg border border-line bg-panel-2 p-3">
          <p className="text-[10px] font-bold tracking-wide text-muted uppercase">Run summary</p>
          <RichText text={run.summary} className="mt-1 text-[12px] leading-relaxed text-muted" />
        </div>
      )}
      {disruption && disruption.status !== 'resolved' && profile?.role === 'manager' && (
        <Button variant="secondary" icon={CheckCircle2} className="w-full" loading={busy} onClick={resolve}>
          Mark disruption resolved
        </Button>
      )}
      {disruption?.status === 'resolved' && <p className="text-center text-[12px] text-success">This disruption is resolved.</p>}
    </div>
  );
}
