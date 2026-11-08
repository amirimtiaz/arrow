'use client';

/**
 * One Live Feed entry: a representative photo, the update itself, and three response options. Each option is a call
 * to action that spells out what it does (steps), roughly how long it takes and how important it is, and each one
 * really does something: open the agent trace or the Control Tower, post to every branch in Communications,
 * escalate to executives through SpacetimeDB, or copy the update for a report. Time estimates are guidance only.
 */
import clsx from 'clsx';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Briefcase,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Globe2,
  Loader2,
  Megaphone,
  Send,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { timeAgo, tsToDate } from '@/lib/format';
import { useMyProfile, useOps } from '@/lib/ops/client';
import { ALL_BRANCHES, useComms } from '@/lib/ops/comms';
import { disruptionPhoto } from '@/lib/ops/event-photos';
import { FEED_SEVERITY } from '@/lib/ops/status';
import type { Disruption, FeedItem } from '@/module_bindings/ops/types';
import { Panel, StatusChip } from '@/components/ui/primitives';
import { errorMessage, useToast } from '@/components/ui/toast';

const CATEGORY_LABEL: Record<string, string> = {
  system: 'System',
  scenario: 'Disruption',
  agent: 'Agent',
  action: 'Action',
  cyber: 'Cyber',
  briefing: 'Briefing',
  news: 'Live news',
};

type Importance = 'critical' | 'high' | 'medium' | 'low';
const IMPORTANCE: Record<Importance, { label: string; icon: LucideIcon; className: string }> = {
  critical: { label: 'Critical', icon: ShieldAlert, className: 'text-danger bg-danger-soft border-danger/40' },
  high: { label: 'High', icon: AlertOctagon, className: 'text-warning bg-warning-soft border-warning/40' },
  medium: { label: 'Medium', icon: AlertTriangle, className: 'text-accent bg-accent-soft border-accent/40' },
  low: { label: 'Low', icon: CheckCircle2, className: 'text-success bg-success-soft border-success/40' },
};
const LEVELS: Importance[] = ['critical', 'high', 'medium', 'low'];
const BASE: Record<string, Importance> = { critical: 'critical', warning: 'high', info: 'medium', success: 'low' };
/** One step less urgent than the item itself (e.g. a follow-up action on a critical alert is still high). */
const lower = (i: Importance): Importance => LEVELS[Math.min(LEVELS.indexOf(i) + 1, LEVELS.length - 1)];

interface ResponseOption {
  key: string;
  title: string;
  icon: LucideIcon;
  steps: string[];
  eta: string;
  importance: Importance;
  /** Why the option can't run right now, if it can't. */
  blocked?: string;
  run(): Promise<string | void> | string | void;
}

function photoFor(item: FeedItem, disruption: Disruption | undefined): string {
  if (disruption) return disruptionPhoto({ kind: disruption.kind, title: disruption.title });
  if (item.category === 'system') return '/images/app/events/control-1.jpg';
  return disruptionPhoto({ kind: item.category, title: item.text });
}

export function FeedRow({ item, disruption }: { item: FeedItem; disruption: Disruption | undefined }) {
  const meta = FEED_SEVERITY[item.severity] ?? FEED_SEVERITY.info;
  const profile = useMyProfile();
  const { conn } = useOps();
  const comms = useComms();
  const router = useRouter();
  const toast = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const base = BASE[item.severity] ?? 'medium';
  const focus = item.link.startsWith('disruption:') ? item.link : null;
  const cyber = item.category === 'cyber' || disruption?.kind === 'cyber';
  const escalated = item.escalated || item.audience === 'executive';
  const hq = comms.branches.find((b) => b.isHq);

  const options: ResponseOption[] = [];
  if (cyber) {
    options.push({
      key: 'ir',
      title: 'Open the Control Tower',
      icon: ShieldAlert,
      steps: ['Sign in to the isolated Control Tower', 'Turn the agent’s IR draft into an incident', 'Invite responders with a one-time code'],
      eta: '~5 min',
      importance: 'critical',
      run: () => router.push('/app/control-tower'),
    });
  } else if (focus) {
    options.push({
      key: 'agents',
      title: 'Review the agents’ plan',
      icon: Bot,
      steps: ['Open the live agent trace', 'Compare the scored reroute options', 'Approve or reject the recommendation'],
      eta: '~3 min',
      importance: base,
      run: () => router.push(`/app/agents?focus=${focus}`),
    });
  } else {
    options.push({
      key: 'map',
      title: 'See it on Silk Road',
      icon: Globe2,
      steps: ['Open the live globe', 'Check the lanes and hubs involved', 'Click a vehicle to track it'],
      eta: '~1 min',
      importance: lower(base),
      run: () => router.push('/app'),
    });
  }

  options.push({
    key: 'branches',
    title: 'Alert every branch',
    icon: Send,
    steps: [`Post this update from ${hq?.department ?? 'management'} to all branches`, 'Each branch sees it live in Communications'],
    eta: '~1 min',
    importance: base === 'low' ? 'low' : lower(base),
    blocked: comms.blockedReason ?? (!hq ? 'No branches to message yet' : undefined),
    run: async () => {
      if (!hq) return;
      await comms.sendMessage({
        fromBranchId: hq.id,
        toBranchId: ALL_BRANCHES,
        kind: 'message',
        subject: `${CATEGORY_LABEL[item.category] ?? 'Update'}: action may be needed`,
        body: item.text.slice(0, 2000),
      });
      return 'Sent to all branches';
    },
  });

  if (!escalated) {
    options.push({
      key: 'escalate',
      title: 'Escalate to executives',
      icon: ArrowUpRight,
      steps: ['Flag this update for leadership', 'It appears under the Executive view for everyone'],
      eta: 'Instant',
      importance: base === 'critical' ? 'critical' : base,
      blocked: !profile ? 'Join the workspace first' : !conn ? 'Not connected' : undefined,
      run: async () => {
        await conn!.reducers.escalateFeedItem({ feedItemId: item.id });
        return 'Escalated to executives';
      },
    });
  } else {
    options.push({
      key: 'copy',
      title: 'Copy for a report',
      icon: ClipboardCopy,
      steps: ['Copy the update with its time and author', 'Paste it into a report or hand-off note'],
      eta: 'Instant',
      importance: 'low',
      run: async () => {
        await navigator.clipboard.writeText(`[${tsToDate(item.ts).toISOString()}] ${item.author}: ${item.text}`);
        return 'Copied to clipboard';
      },
    });
  }

  const choose = async (option: ResponseOption) => {
    setRunning(option.key);
    try {
      const message = await option.run();
      if (message) {
        setDone((d) => ({ ...d, [option.key]: message }));
        toast({ title: message, tone: 'success' });
      }
    } catch (err) {
      toast({ title: `Could not ${option.title.toLowerCase()}`, description: errorMessage(err), tone: 'error' });
    } finally {
      setRunning(null);
    }
  };

  return (
    <li>
      <Panel className="flex gap-3.5 p-3.5">
        <div className="relative h-[92px] w-[124px] shrink-0 overflow-hidden rounded-lg bg-panel-2">
          <Image src={photoFor(item, disruption)} alt="" fill sizes="124px" className="object-cover" />
          <span className={clsx('absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-md shadow', meta.soft, meta.text)}>
            <meta.icon className="size-3.5" aria-hidden />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            <StatusChip meta={meta} />
            <span className="rounded-md bg-panel-2 px-1.5 py-0.5 font-semibold">{CATEGORY_LABEL[item.category] ?? item.category}</span>
            {escalated && (
              <span className="flex items-center gap-1 rounded-md bg-violet-soft px-1.5 py-0.5 font-semibold text-violet">
                <Briefcase className="size-3" aria-hidden />
                Executive
              </span>
            )}
            <span>{item.author}</span>·<time dateTime={tsToDate(item.ts).toISOString()}>{timeAgo(tsToDate(item.ts))}</time>
            {item.category === 'briefing' && (
              <span className="flex items-center gap-1 text-faint">
                · <Megaphone className="size-3" aria-hidden /> Shared with all employees
              </span>
            )}
          </div>
          <p className="mt-1 text-[13.5px] leading-relaxed text-fg">{item.text}</p>

          <p className="mt-2.5 text-[10.5px] font-bold tracking-wide text-faint uppercase">Respond · 3 options</p>
          <ul className="mt-1 grid gap-2 sm:grid-cols-3">
            {options.map((option, i) => {
              const imp = IMPORTANCE[option.importance];
              const disabled = !!option.blocked || running !== null || !!done[option.key];
              return (
                <li key={option.key}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => choose(option)}
                    title={option.blocked}
                    className={clsx(
                      'group flex h-full w-full flex-col rounded-lg border p-2.5 text-left transition-colors',
                      i === 0 ? 'border-accent/50 bg-accent-soft hover:bg-accent/15' : 'border-line bg-panel-2 hover:bg-panel-hover',
                      'disabled:cursor-not-allowed disabled:opacity-60'
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-fg">
                      {running === option.key ? (
                        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                      ) : done[option.key] ? (
                        <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden />
                      ) : (
                        <option.icon className={clsx('size-3.5 shrink-0', i === 0 ? 'text-accent' : 'text-muted')} aria-hidden />
                      )}
                      <span className="min-w-0 truncate">{done[option.key] ?? option.title}</span>
                    </span>
                    <ol className="mt-1 flex-1 list-decimal space-y-0.5 pl-4 text-[11px] leading-snug text-muted">
                      {option.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                      <span className="flex items-center gap-1 rounded-md border border-line bg-panel px-1.5 py-0.5 font-semibold text-fg">
                        <Clock className="size-3" aria-hidden />
                        {option.eta}
                      </span>
                      <span className={clsx('flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold', imp.className)}>
                        <imp.icon className="size-3" aria-hidden />
                        {imp.label}
                      </span>
                    </span>
                    {option.blocked && <span className="mt-1 text-[10px] text-faint">{option.blocked}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Panel>
    </li>
  );
}
