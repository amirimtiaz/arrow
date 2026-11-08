'use client';

/**
 * Direct line to the five Nemotron agents. Pick who should answer; the question becomes an Ask Arrow run with a
 * "[[agents:…]]" prefix, and the worker runs each chosen agent in turn over live tools and logs every reply as a
 * step. Nothing here is generated in the browser: each bubble is a row the worker wrote to SpacetimeDB.
 */
import clsx from 'clsx';
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  Loader2,
  MessagesSquare,
  MinusCircle,
  Send,
  Sparkles,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { AgentRun, AgentStep } from '@/module_bindings/ops/types';
import { safeJson, timeAgo, tsToDate } from '@/lib/format';
import { useAgentService, type AgentServiceState } from '@/lib/ops/agent';
import { useCurrentOrg, useMyProfile, useOps } from '@/lib/ops/client';
import { useAskRuns, useRunSteps } from '@/lib/ops/hooks';
import { RichText } from '@/components/ui/RichText';
import { SectionLabel } from '@/components/ui/primitives';
import { errorMessage, useToast } from '@/components/ui/toast';
import { AGENT_KEYS, AGENT_PROFILES, AgentAvatar, type AgentKey, type AgentProfile, type AvatarTone } from './agent-avatars';

const PREFIX_RE = /^\[\[agents:([a-z,\s]*)\]\]\s?([\s\S]*)$/;
const MAX_PROMPT = 1000;
const MAX_PENDING = 3;
const prefixFor = (keys: readonly AgentKey[]) => `[[agents:${keys.join(',')}]] `;
/** Room left for the question once the longest prefix (all five agents) is added. */
const MAX_QUESTION = MAX_PROMPT - prefixFor(AGENT_KEYS).length;

const PROFILE_BY_KEY = new Map(AGENT_PROFILES.map((p) => [p.key, p]));

const SUGGESTIONS = [
  'What is our biggest risk right now?',
  'Which lanes should we protect first?',
  'Are we exposed to a cyber incident?',
];

const SERVICE_CHIP: Record<AgentServiceState, { label: string; icon: LucideIcon; className: string }> = {
  online: { label: 'Online', icon: CheckCircle2, className: 'text-success bg-success-soft' },
  not_configured: { label: 'Needs API key', icon: CircleAlert, className: 'text-warning bg-warning-soft' },
  error: { label: 'Error', icon: XCircle, className: 'text-danger bg-danger-soft' },
  offline: { label: 'Offline', icon: XCircle, className: 'text-danger bg-danger-soft' },
  unknown: { label: 'Not started', icon: Clock, className: 'text-muted bg-panel-2' },
};

interface Thread {
  run: AgentRun;
  agents: AgentProfile[];
  question: string;
}

function parseThread(run: AgentRun): Thread | null {
  const match = run.prompt.match(PREFIX_RE);
  if (!match) return null;
  const wanted = new Set(match[1].split(',').map((s) => s.trim()));
  const agents = AGENT_PROFILES.filter((p) => wanted.has(p.key));
  return agents.length > 0 ? { run, agents, question: match[2].trim() } : null;
}

export function AgentChat() {
  const org = useCurrentOrg();
  const profile = useMyProfile();
  const service = useAgentService();
  const { conn } = useOps();
  const toast = useToast();
  const askRuns = useAskRuns();
  const threads = useMemo(() => askRuns.map(parseThread).filter((t): t is Thread => t !== null), [askRuns]);
  const pending = askRuns.filter((r) => r.status === 'queued' || r.status === 'running').length;

  const [selected, setSelected] = useState<AgentKey[]>([...AGENT_KEYS]);
  const [previous, setPrevious] = useState<AgentKey[] | null>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const allSelected = selected.length === AGENT_KEYS.length;

  const threadRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    // Replies and per-agent status lines arrive as rows over time; follow them unless the reader scrolled up.
    const observer = new MutationObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const toggle = (key: AgentKey) =>
    setSelected((cur) => {
      if (cur.includes(key)) return cur.length === 1 ? cur : cur.filter((k) => k !== key);
      return AGENT_KEYS.filter((k) => k === key || cur.includes(k));
    });
  const toggleAll = () => {
    if (allSelected) {
      setSelected(previous ?? ['analyst']);
      setPrevious(null);
    } else {
      setPrevious(selected);
      setSelected([...AGENT_KEYS]);
    }
  };

  const blocked = !conn || !org
    ? 'Connecting to Arrow…'
    : !profile
      ? 'Join the workspace to message the agents.'
      : pending >= MAX_PENDING
        ? `${MAX_PENDING} questions are already in progress. Send again when one finishes.`
        : null;

  const send = async (text: string, e?: FormEvent) => {
    e?.preventDefault();
    const q = text.trim().slice(0, MAX_QUESTION);
    if (!q || blocked || busy || !conn || !org) return;
    setBusy(true);
    stickToBottom.current = true;
    try {
      await conn.reducers.askArrow({ orgId: org.id, prompt: prefixFor(selected) + q });
      setQuestion('');
    } catch (err) {
      toast({ title: 'Could not message the agents', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const chip = SERVICE_CHIP[service.state];
  const ChipIcon = chip.icon;
  const audience = allSelected ? 'all five agents' : selected.map((k) => PROFILE_BY_KEY.get(k)?.name).join(', ');

  return (
    <section aria-label="Talk to the agents" className="flex min-h-0 flex-1 flex-col">
      <SectionLabel
        icon={MessagesSquare}
        right={
          <span
            className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase', chip.className)}
            title={service.message}
          >
            <ChipIcon className="size-3" aria-hidden />
            {chip.label}
          </span>
        }
      >
        Talk to the agents
      </SectionLabel>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted">
          {allSelected ? 'All five answer, in pipeline order' : `${selected.length} of 5 will answer, in order`}
        </p>
        <button
          type="button"
          onClick={toggleAll}
          aria-pressed={allSelected}
          title={allSelected ? (previous ? 'Back to your previous selection' : 'Ask only the Disruption Analyst') : 'Ask all five agents'}
          className={clsx(
            'inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold',
            allSelected ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line bg-panel text-muted hover:bg-panel-hover hover:text-fg'
          )}
        >
          <Users className="size-3" aria-hidden />
          All 5
        </button>
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1" role="group" aria-label="Agents to ask">
        {AGENT_PROFILES.map((agent) => {
          const on = selected.includes(agent.key);
          const last = on && selected.length === 1;
          return (
            <button
              key={agent.key}
              type="button"
              onClick={() => toggle(agent.key)}
              aria-pressed={on}
              title={last ? `${agent.name}: at least one agent must stay selected` : `${agent.name}: ${agent.role}`}
              className={clsx(
                'relative flex flex-col items-center gap-1 rounded-lg border px-0.5 pt-1.5 pb-1 transition-colors',
                on ? 'border-accent/60 bg-accent-soft' : 'border-line bg-panel hover:bg-panel-hover',
                last && 'cursor-default'
              )}
            >
              <AgentAvatar agent={agent} size={24} tone={on ? 'selected' : 'muted'} />
              <span className={clsx('text-[10px] leading-none font-semibold', on ? 'text-fg' : 'text-faint')}>{agent.short}</span>
              {on && <CheckCircle2 className="absolute top-1 right-1 size-3 text-accent" aria-hidden />}
            </button>
          );
        })}
      </div>

      {service.state !== 'online' && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-warning/40 bg-warning-soft p-2 text-[11px] text-warning">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            {service.message} Questions wait in the queue until the agent worker is back.
          </span>
        </p>
      )}

      <div
        ref={threadRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="scroll-thin mt-2 min-h-[200px] flex-1 space-y-3 overflow-y-auto rounded-lg border border-line bg-panel p-2.5"
        aria-live="polite"
      >
        {threads.length === 0 ? (
          <EmptyChat orgName={org?.name} disabled={!!blocked || busy} onPick={(s) => void send(s)} />
        ) : (
          threads.map((t) => <Exchange key={String(t.run.id)} thread={t} />)
        )}
      </div>

      <form onSubmit={(e) => void send(question, e)} className="mt-2">
        <div className="flex items-end gap-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value.slice(0, MAX_QUESTION))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(question);
              }
            }}
            rows={2}
            maxLength={MAX_QUESTION}
            disabled={!profile}
            aria-label={`Message to ${audience}`}
            placeholder={profile ? `Ask ${audience}…` : 'Join the workspace to message the agents'}
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-line bg-panel px-2.5 py-2 text-[12.5px] text-fg outline-none placeholder:text-faint focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!question.trim() || !!blocked || busy}
            className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Send to ${audience}`}
            title={blocked ?? `Send to ${audience}`}
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          </button>
        </div>
        <div className="mt-1 flex items-start justify-between gap-2 text-[10.5px]">
          <span className={blocked && conn && org ? 'text-warning' : 'text-faint'}>
            {blocked ?? 'Enter to send · Shift+Enter for a new line'}
          </span>
          <span className={clsx('shrink-0 tabular-nums', question.length > MAX_QUESTION * 0.9 ? 'text-warning' : 'text-faint')}>
            {question.length}/{MAX_QUESTION}
          </span>
        </div>
      </form>
    </section>
  );
}

function EmptyChat({ orgName, disabled, onPick }: { orgName?: string; disabled: boolean; onPick(s: string): void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-2 text-center">
      <div className="flex -space-x-2">
        {AGENT_PROFILES.map((agent) => (
          <AgentAvatar key={agent.key} agent={agent} size={22} />
        ))}
      </div>
      <p className="text-[12.5px] font-semibold text-fg">Ask the agents directly</p>
      <p className="max-w-[290px] text-[11px] leading-snug text-muted">
        Each selected agent answers in turn with live tools over {orgName ?? 'your workspace'}. Changes still need a
        manager’s approval.
      </p>
      <div className="mt-1 flex w-full flex-col gap-1">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="flex items-start gap-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-1 text-left text-[11.5px] leading-snug text-muted hover:border-accent hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="mt-px size-3 shrink-0 text-accent" aria-hidden />
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

type ReplyState =
  | { kind: 'answered'; text: string; tools: string[] }
  | { kind: 'working'; label: string }
  | { kind: 'waiting'; label: string }
  | { kind: 'failed'; label: string }
  | { kind: 'none'; label: string };

const REPLY_PILL: Record<ReplyState['kind'], { label: string; icon: LucideIcon; className: string; tone: AvatarTone }> = {
  answered: { label: 'Replied', icon: CheckCircle2, className: 'text-success bg-success-soft', tone: 'success' },
  working: { label: 'Working', icon: Loader2, className: 'text-accent bg-accent-soft', tone: 'working' },
  waiting: { label: 'Waiting', icon: Clock, className: 'text-muted bg-panel', tone: 'idle' },
  failed: { label: 'Failed', icon: XCircle, className: 'text-danger bg-danger-soft', tone: 'danger' },
  none: { label: 'No reply', icon: MinusCircle, className: 'text-faint bg-panel', tone: 'muted' },
};

/** What an agent is doing right now, from its latest logged step. */
function describeStep(name: string, step: AgentStep | undefined): string {
  if (!step) return `${name} is starting…`;
  switch (step.kind) {
    case 'tool_call':
      return `${name} is calling ${step.tool || 'a tool'}…`;
    case 'thinking':
      return `${name} is thinking…`;
    case 'plan':
      return `${name} is planning…`;
    case 'observation':
      return `${name} is reading ${step.tool ? `${step.tool} results` : 'the results'}…`;
    default:
      return step.title ? `${name}: ${step.title}` : `${name} is working…`;
  }
}

function replyText(step: AgentStep): string {
  const parsed = safeJson<unknown>(step.outputJson, null);
  if (parsed && typeof parsed === 'object' && typeof (parsed as { text?: unknown }).text === 'string') {
    return (parsed as { text: string }).text;
  }
  return typeof parsed === 'string' ? parsed : step.outputJson;
}

function replyState(agent: AgentProfile, index: number, run: AgentRun, mine: AgentStep[], activeName: string | undefined): ReplyState {
  const message = mine.findLast((s) => s.kind === 'message');
  if (message) {
    const tools = [...new Set(mine.filter((s) => s.kind === 'tool_call' && s.tool).map((s) => s.tool))];
    return { kind: 'answered', text: replyText(message), tools };
  }
  if (run.status === 'queued') {
    return { kind: 'waiting', label: index === 0 ? 'Queued for the agent worker…' : 'Waiting for its turn' };
  }
  const isActive = activeName ? activeName === agent.name : mine.length > 0;
  if (run.status === 'running') {
    return isActive ? { kind: 'working', label: describeStep(agent.name, mine.at(-1)) } : { kind: 'waiting', label: 'Waiting for its turn' };
  }
  if (run.status === 'failed') {
    return isActive || mine.length > 0
      ? { kind: 'failed', label: run.error || 'The agent stopped before replying.' }
      : { kind: 'none', label: 'Did not run: the request stopped early.' };
  }
  if (run.status === 'completed') return { kind: 'none', label: 'Finished without a written reply.' };
  return { kind: 'waiting', label: 'Waiting for its turn' };
}

function Exchange({ thread }: { thread: Thread }) {
  const { run, agents, question } = thread;
  const steps = useRunSteps(run.id);
  const stepsByAgent = useMemo(() => {
    const map = new Map<string, AgentStep[]>();
    for (const s of steps) {
      const list = map.get(s.agent) ?? [];
      list.push(s);
      map.set(s.agent, list);
    }
    return map;
  }, [steps]);
  const activeName = run.status === 'running' ? run.activeAgent || steps.at(-1)?.agent || undefined : undefined;
  const anyReply = steps.some((s) => s.kind === 'message');
  // A worker without per-agent support answers the whole question in run.answer; show that rather than nothing.
  const combined = !anyReply && run.status === 'completed' && run.answer ? run.answer : '';

  return (
    <div className="space-y-2">
      <div className="ml-6 rounded-xl rounded-tr-sm bg-accent px-3 py-2 text-[12.5px] text-white">
        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold opacity-85">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{run.requestedByName || 'You'}</span>
            <span aria-hidden>→</span>
            <span className="flex -space-x-1.5" aria-label={agents.map((a) => a.name).join(', ')}>
              {agents.map((a) => (
                <AgentAvatar key={a.key} agent={a} size={14} tone="inverse" />
              ))}
            </span>
          </span>
          <span className="shrink-0">{timeAgo(tsToDate(run.startedAt))}</span>
        </div>
        <p className="break-words whitespace-pre-wrap">{question}</p>
      </div>

      {combined ? (
        <div className="mr-2 flex gap-2">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <Sparkles className="size-3.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-line bg-panel-2 px-2.5 py-2">
            <p className="text-[11px] font-bold text-fg">Arrow agents</p>
            <RichText text={combined} className="mt-1 text-[12.5px] leading-relaxed text-fg" />
          </div>
        </div>
      ) : (
        agents.map((agent, i) => (
          <Reply key={agent.key} agent={agent} state={replyState(agent, i, run, stepsByAgent.get(agent.name) ?? [], activeName)} />
        ))
      )}

      {run.status === 'failed' && (
        <p className="mr-2 flex items-start gap-1.5 rounded-lg border border-danger/40 bg-danger-soft p-2 text-[11.5px] text-danger">
          <XCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>The agents could not finish: {run.error || 'unknown error'}.</span>
        </p>
      )}
    </div>
  );
}

function Reply({ agent, state }: { agent: AgentProfile; state: ReplyState }) {
  const pill = REPLY_PILL[state.kind];
  const PillIcon = pill.icon;
  return (
    <div className="mr-2 flex gap-2">
      <AgentAvatar agent={agent} size={24} tone={pill.tone} className="mt-0.5" />
      <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-line bg-panel-2 px-2.5 py-2">
        <p className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-bold text-fg">{agent.name}</span>
          <span className={clsx('inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[9.5px] font-bold uppercase', pill.className)}>
            <PillIcon className={clsx('size-3', state.kind === 'working' && 'animate-spin')} aria-hidden />
            {pill.label}
          </span>
        </p>
        {state.kind === 'answered' ? (
          <>
            <RichText text={state.text} className="mt-1 text-[12.5px] leading-relaxed text-fg" />
            {state.tools.length > 0 && (
              <p className="mt-1.5 text-[10.5px] text-faint">
                Used <span className="font-mono text-muted">{state.tools.join(', ')}</span>
              </p>
            )}
          </>
        ) : (
          <p
            className={clsx(
              'mt-1 flex items-center gap-1.5 text-[11.5px]',
              state.kind === 'working' ? 'text-accent' : state.kind === 'failed' ? 'text-danger' : 'text-muted'
            )}
          >
            {state.kind === 'working' && <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />}
            {state.label}
          </p>
        )}
      </div>
    </div>
  );
}
