'use client';

/**
 * "Get Nemotron deal memo": asks the live agent worker (through the askArrow reducer) to evaluate this listing.
 * The prompt carries only code-computed facts; the Deal Evaluator explains them and suggests what to negotiate.
 * The memo is never pre-written: it is whatever the run in SpacetimeDB returns, with loading, failure and offline states.
 */
import clsx from 'clsx';
import { Brain, CheckCircle2, ChevronRight, CircleDashed, ListChecks, Loader2, MessageSquare, Sparkles, Wrench, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { safeJson, timeAgo, tsToDate } from '@/lib/format';
import { prettyModel, useAgentService } from '@/lib/ops/agent';
import { useMyProfile, useOps } from '@/lib/ops/client';
import { useAskRuns, useRunSteps } from '@/lib/ops/hooks';
import { dealPrompt, promptFacts } from '@/lib/conquest/model';
import type { Market, Site } from '@/lib/conquest/types';
import { RichText } from '@/components/ui/RichText';
import { Button } from '@/components/ui/primitives';
import { errorMessage, useToast } from '@/components/ui/toast';

const STEP_ICON: Record<string, typeof Brain> = {
  plan: ListChecks,
  tool_call: Wrench,
  message: MessageSquare,
  error: XCircle,
  thinking: Brain,
  reasoning: Brain,
};

export function DealMemo({ market, site, orgId, orgName }: { market: Market; site: Site; orgId: number | undefined; orgName: string }) {
  const { conn } = useOps();
  const profile = useMyProfile();
  const service = useAgentService();
  const toast = useToast();
  const runs = useAskRuns();
  const [busy, setBusy] = useState(false);
  const [showFacts, setShowFacts] = useState(false);

  const prompt = useMemo(() => dealPrompt(market, site, orgName), [market, site, orgName]);
  // The prompt is deterministic for a listing, so the newest run with the same prompt is this site's memo.
  const run = useMemo(() => [...runs].reverse().find((r) => r.prompt === prompt), [runs, prompt]);
  const steps = useRunSteps(run?.id);
  const working = run?.status === 'queued' || run?.status === 'running';
  const answer = useMemo(() => {
    if (run?.answer) return run.answer;
    const step = [...steps].reverse().find((s) => s.kind === 'message' && s.agent === 'Deal Evaluator');
    return step ? safeJson<{ text?: string }>(step.outputJson, {}).text ?? '' : '';
  }, [run, steps]);

  const reason = !orgId
    ? 'The workspace is still connecting.'
    : !profile
      ? 'Join the workspace (top bar) to ask Nemotron.'
      : service.state !== 'online'
        ? `Agent worker unavailable: ${service.message}`
        : working
          ? 'Nemotron is writing this memo.'
          : null;

  const ask = async () => {
    if (!conn || !orgId) return;
    setBusy(true);
    try {
      await conn.reducers.askArrow({ orgId, prompt });
    } catch (err) {
      toast({ title: 'Could not request a deal memo', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const visibleSteps = steps.filter((s) => s.kind !== 'message').slice(-5);

  return (
    <div className="rounded-xl border border-accent/30 bg-panel p-3">
      <div className="flex items-start gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-fg">Nemotron deal memo</p>
          <p className="text-[11px] leading-snug text-muted">
            The Deal Evaluator agent explains the score above and suggests what to negotiate. It only sees the facts computed here.
          </p>
        </div>
        <ServiceDot state={service.state} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          icon={Sparkles}
          loading={busy || working}
          disabled={!!reason}
          onClick={ask}
          title={reason ?? 'Send this listing’s facts to the Nemotron Deal Evaluator'}
        >
          {run && !working ? 'Run memo again' : 'Get Nemotron deal memo'}
        </Button>
        <button
          type="button"
          onClick={() => setShowFacts((v) => !v)}
          aria-expanded={showFacts}
          className="flex items-center gap-0.5 text-[11px] font-semibold text-accent hover:underline"
        >
          <ChevronRight className={clsx('size-3 transition-transform', showFacts && 'rotate-90')} aria-hidden />
          Facts sent ({prompt.length} chars)
        </button>
      </div>
      {reason && !working && <p className="mt-1.5 text-[11px] text-warning">{reason}</p>}
      {showFacts && (
        <pre className="scroll-thin mt-2 max-h-40 overflow-auto rounded-lg border border-line bg-panel-2 p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-muted">
          {JSON.stringify(safeJson(promptFacts(prompt), {}), null, 1)}
        </pre>
      )}

      {run && (
        <div className="mt-3 border-t border-line pt-2.5">
          <div className="flex items-center justify-between gap-2 text-[10.5px] text-faint">
            <RunStatus status={run.status} />
            <span className="truncate">
              {run.model ? prettyModel(run.model) : 'Nemotron'} · asked by {run.requestedByName} · {timeAgo(tsToDate(run.startedAt))}
            </span>
          </div>
          {visibleSteps.length > 0 && (
            <ul className="mt-2 space-y-1">
              {visibleSteps.map((s) => {
                const Icon = STEP_ICON[s.kind] ?? CircleDashed;
                return (
                  <li key={String(s.id)} className="flex items-center gap-1.5 text-[11px] text-muted">
                    <Icon className={clsx('size-3 shrink-0', s.kind === 'error' ? 'text-danger' : 'text-accent')} aria-hidden />
                    <span className="font-semibold text-fg">{s.agent || 'Agent'}</span>
                    <span className="truncate">· {s.title}</span>
                    {s.latencyMs > 0 && <span className="ml-auto shrink-0 tabular-nums">{s.latencyMs} ms</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {working && !answer && (
            <p className="mt-2 flex items-center gap-2 text-[12px] text-muted">
              <Loader2 className="size-3.5 animate-spin text-accent" aria-hidden />
              {run.status === 'queued' ? 'Queued for the Deal Evaluator…' : 'Deal Evaluator is reading the facts…'}
            </p>
          )}
          {run.status === 'failed' && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-danger-soft px-2.5 py-2 text-[12px] text-danger">
              <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              The agent could not finish this memo: {run.error || 'unknown error'}.
            </p>
          )}
          {answer && (
            <div className="mt-2 rounded-lg bg-panel-2 px-3 py-2.5 text-[12.5px] text-fg">
              <p className="mb-1 flex items-center gap-1 text-[10px] font-bold tracking-wide text-accent uppercase">
                <Sparkles className="size-3" aria-hidden /> Deal Evaluator · AI-written
              </p>
              <RichText text={answer} className="leading-relaxed" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RunStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; icon: typeof Brain; cls: string; spin?: boolean }> = {
    queued: { label: 'Queued', icon: CircleDashed, cls: 'text-muted' },
    running: { label: 'Running', icon: Loader2, cls: 'text-accent', spin: true },
    completed: { label: 'Completed', icon: CheckCircle2, cls: 'text-success' },
    failed: { label: 'Failed', icon: XCircle, cls: 'text-danger' },
  };
  const m = map[status] ?? { label: status, icon: CircleDashed, cls: 'text-muted' };
  const Icon = m.icon;
  return (
    <span className={clsx('inline-flex shrink-0 items-center gap-1 font-bold tracking-wide uppercase', m.cls)}>
      <Icon className={clsx('size-3', m.spin && 'animate-spin')} aria-hidden />
      {m.label}
    </span>
  );
}

function ServiceDot({ state }: { state: string }) {
  const online = state === 'online';
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase',
        online ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'
      )}
    >
      {online ? <CheckCircle2 className="size-3" aria-hidden /> : <XCircle className="size-3" aria-hidden />}
      {online ? 'Agent online' : 'Agent offline'}
    </span>
  );
}
