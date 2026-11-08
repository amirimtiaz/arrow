'use client';

/**
 * "Ask Arrow": not a plain chatbot. Each question becomes an agent run in
 * SpacetimeDB; the Nemotron worker answers with tool calls over live data
 * and can propose (never execute) state changes.
 */
import clsx from 'clsx';
import { Bot, ChevronRight, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AgentRun } from '@/module_bindings/ops/types';
import { useAgentService } from '@/lib/ops/agent';
import { useMyProfile, useOps, useCurrentOrg } from '@/lib/ops/client';
import { useAskRuns, useRunSteps } from '@/lib/ops/hooks';
import { RichText } from '@/components/ui/RichText';
import { errorMessage, useToast } from '@/components/ui/toast';
import { DashboardArtifact, parseDashboard, type DashboardData } from './DashboardArtifact';
import { useSilkRoad } from './SilkRoadState';

const SUGGESTIONS: Record<string, string[]> = {
  gold: [
    'Build me a dashboard of value at risk by lane, mode and status',
    'Which lanes carry the most value at risk right now?',
    'Brief executives on today’s disruptions',
    'How exposed are we to the Suez Canal?',
  ],
  silver: ['Build a dashboard of shipments by status and destination', 'Which stores depend on the Texas DC?', 'How exposed are our cold-chain vaccine lanes?', 'Summarize vendor risk for executives'],
  bronze: ['Make a dashboard of deliveries by status and supplier', 'What deliveries are due today?', 'Which suppliers are our biggest risk?', 'What should I do if produce is late?'],
};

export function AskArrow() {
  const { askOpen, setAskOpen } = useSilkRoad();
  // Direct agent chat and Conquest GIS deal memos ("[[agents:…]]") have their own UIs.
  const runs = useAskRuns().filter((r) => !r.prompt.startsWith('[[agents:'));
  const org = useCurrentOrg();
  const profile = useMyProfile();
  const service = useAgentService();
  const { conn } = useOps();
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (askOpen) inputRef.current?.focus();
  }, [askOpen]);
  const lastStatus = runs.at(-1)?.status;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [runs.length, lastStatus, askOpen]);

  if (!askOpen) return null;

  const submit = async (text: string, e?: FormEvent) => {
    e?.preventDefault();
    if (!conn || !org || !text.trim()) return;
    setBusy(true);
    try {
      await conn.reducers.askArrow({ orgId: org.id, prompt: text.trim() });
      setPrompt('');
    } catch (err) {
      toast({ title: 'Could not ask Arrow', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="absolute inset-y-0 right-0 z-30 flex w-[384px] flex-col border-l border-line bg-elevated shadow-panel"
      role="dialog"
      aria-label="Ask Arrow"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-fg">Ask Arrow</h2>
          <p className="text-[11px] text-muted">Nemotron agent with live tools · answers cite tool outputs</p>
        </div>
        <button
          type="button"
          onClick={() => setAskOpen(false)}
          className="rounded-md p-1 text-muted hover:bg-panel-hover hover:text-fg"
          aria-label="Close Ask Arrow"
        >
          <X className="size-4" />
        </button>
      </header>

      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {runs.length === 0 && (
          <div className="rounded-xl border border-line bg-panel p-3 text-[12.5px] text-muted">
            Ask about lanes, shipments, vendors or risk in <b className="text-fg">{org?.name}</b>. Arrow plans, calls tools over live
            SpacetimeDB data and proposes actions for a manager to approve; it never changes state on its own.
          </div>
        )}
        {runs.map((run) => (
          <Exchange key={String(run.id)} run={run} />
        ))}
      </div>

      <div className="border-t border-line p-3">
        {service.state !== 'online' && <p className="mb-2 text-[11px] text-warning">Agent service: {service.message}</p>}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(SUGGESTIONS[org?.plan ?? 'gold'] ?? SUGGESTIONS.gold).map((s) => (
            <button
              key={s}
              type="button"
              disabled={!profile || busy}
              onClick={() => submit(s)}
              className="rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] text-muted hover:border-accent hover:text-fg disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => submit(prompt, e)} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) void submit(prompt, e);
            }}
            rows={2}
            maxLength={1000}
            disabled={!profile}
            placeholder={profile ? 'Ask a question about your supply chain…' : 'Join the workspace to ask questions'}
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-line bg-panel px-3 py-2 text-[13px] text-fg outline-none placeholder:text-faint focus:border-accent"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || busy || !profile}
            className="grid size-10 place-items-center rounded-lg bg-accent text-white hover:bg-accent-strong disabled:opacity-40"
            aria-label="Send question"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}

function Exchange({ run }: { run: AgentRun }) {
  const steps = useRunSteps(run.id);
  const [open, setOpen] = useState(false);
  const toolSteps = steps.filter((s) => s.kind === 'tool_call');
  const working = run.status === 'queued' || run.status === 'running';
  // Dashboards the agent built with build_dashboard (numbers computed by the tool, not the model).
  const dashboards = toolSteps
    .filter((s) => s.tool === 'build_dashboard' && s.outputJson)
    .map((s) => ({ id: String(s.id), data: parseDashboard(s.outputJson) }))
    .filter((d): d is { id: string; data: DashboardData } => d.data !== null);

  return (
    <div className="space-y-2">
      <div className="ml-8 rounded-xl rounded-tr-sm bg-accent px-3 py-2 text-[13px] text-white">
        <p className="text-[10px] font-semibold opacity-75">{run.requestedByName}</p>
        {run.prompt}
      </div>
      <div className="mr-4 flex gap-2">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
          <Bot className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-line bg-panel px-3 py-2 text-[13px] text-fg">
          {working && (
            <p className="flex items-center gap-2 text-muted">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {run.status === 'queued' ? 'Queued for the agent…' : (steps.at(-1)?.title ?? 'Planning…')}
            </p>
          )}
          {run.status === 'failed' && <p className="text-danger">The agent could not answer: {run.error || 'unknown error'}.</p>}
          {run.answer && <RichText text={run.answer} className="leading-relaxed" />}
          {dashboards.map((d) => (
            <DashboardArtifact key={d.id} data={d.data} />
          ))}
          {toolSteps.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="mt-1.5 flex items-center gap-0.5 text-[11px] font-semibold text-accent"
            >
              <ChevronRight className={clsx('size-3 transition-transform', open && 'rotate-90')} aria-hidden />
              {toolSteps.length} tool call{toolSteps.length === 1 ? '' : 's'}
            </button>
          )}
          {open && (
            <ul className="mt-1 space-y-1 border-t border-line pt-1.5">
              {toolSteps.map((s) => (
                <li key={String(s.id)} className="text-[11px] text-muted">
                  <span className="font-mono text-accent">{s.tool}</span> · {s.title} · {s.latencyMs} ms
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
