'use client';

/**
 * Communications tab: a company's branches (department at a location) and the messages and reports they send each
 * other. Left: branch directory by country and state. Centre: the selected branch's channel and a composer.
 * Right: reports sent up to upper management, which also land on the Analytics tab straight away.
 * Blank until the browser is connected to a workspace.
 */
import clsx from 'clsx';
import {
  ArrowRight,
  Building2,
  Crown,
  FileBarChart,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  Radio,
  Send,
  Users,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { timeAgo } from '@/lib/format';
import { useCurrentOrg } from '@/lib/ops/client';
import { ALL_BRANCHES, useComms, type BranchView, type MessageKind, type MessageView, type ReportMetrics } from '@/lib/ops/comms';
import { COUNTRIES, DEPARTMENTS, LOCATIONS } from '@/lib/locations';
import { TopBarTitle } from '@/components/shell/TopBarSlots';
import { Button, Dialog, EmptyState, SectionLabel } from '@/components/ui/primitives';
import { errorMessage, useToast } from '@/components/ui/toast';

export function CommunicationsView() {
  const { mode, branches, messages, blockedReason } = useComms();
  const org = useCurrentOrg();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const hq = branches.find((b) => b.isHq);
  const selected = branches.find((b) => b.id === selectedId) ?? hq ?? branches[0];

  const title = (
    <TopBarTitle>
      <div className="min-w-0">
        <p className="text-[15px] leading-tight font-extrabold text-accent">Communications</p>
        <p className="truncate text-[11.5px] text-muted">
          {org && mode !== 'offline'
            ? `${org.name} · ${branches.length} branches · messages and reports between branches`
            : 'Not connected'}
        </p>
      </div>
    </TopBarTitle>
  );

  if (mode === 'offline' || mode === 'loading') {
    return (
      <div className="grid h-full place-items-center">
        {title}
        {mode === 'offline' ? (
          <EmptyState icon={WifiOff} title="Not connected to a workspace">
            Branches and their messages appear here once Arrow is connected to a workspace.
          </EmptyState>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading branches…
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {title}
      <div className="flex items-center gap-3 border-b border-line bg-elevated px-4 py-2.5">
        <ModeBadge mode={mode} />
        <p className="min-w-0 truncate text-[12px] text-muted">
          {mode === 'live'
            ? 'Every branch sees new messages instantly over SpacetimeDB.'
            : 'Preview in this browser only. Publish the updated ops module to share branches between people.'}
        </p>
        <Button
          variant="primary"
          icon={Plus}
          className="ml-auto"
          disabled={!!blockedReason}
          title={blockedReason ?? 'Add a branch to this company'}
          onClick={() => setAdding(true)}
        >
          Insert new branch
        </Button>
      </div>

      {branches.length === 0 ? (
        <div className="grid flex-1 place-items-center">
          <EmptyState icon={Building2} title="No branches yet">
            {mode === 'live' ? 'Adding the sample branches for this workspace…' : 'Use “Insert new branch” to add the first one.'}
          </EmptyState>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 p-3">
          <BranchDirectory branches={branches} messages={messages} selectedId={selected?.id} onSelect={setSelectedId} />
          {selected && <BranchChannel branch={selected} branches={branches} messages={messages} />}
          <LeadershipReports branches={branches} messages={messages} hq={hq} />
        </div>
      )}

      <AddBranchDialog open={adding} onClose={() => setAdding(false)} onAdded={() => setAdding(false)} />
    </div>
  );
}

function ModeBadge({ mode }: { mode: 'live' | 'preview' }) {
  return (
    <span
      className={clsx(
        'flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-bold tracking-wide uppercase',
        mode === 'live' ? 'border-success/40 bg-success-soft text-success' : 'border-warning/40 bg-warning-soft text-warning'
      )}
    >
      <Radio className="size-3.5" aria-hidden />
      {mode === 'live' ? 'Live' : 'Preview'}
    </span>
  );
}

/* ─────────────────────────── Directory ─────────────────────────── */

function BranchDirectory(props: {
  branches: BranchView[];
  messages: MessageView[];
  selectedId: string | undefined;
  onSelect(id: string): void;
}) {
  const { branches, messages, selectedId, onSelect } = props;

  // Upper management first, then by country and state.
  const groups = useMemo(() => {
    const map = new Map<string, BranchView[]>();
    for (const b of [...branches].sort((a, b) => Number(b.isHq) - Number(a.isHq) || a.department.localeCompare(b.department))) {
      const key = [b.country, b.state].filter(Boolean).join(' · ');
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return [...map.entries()];
  }, [branches]);

  const countFor = (id: string) =>
    messages.filter((m) => m.fromBranchId === id || m.toBranchId === id || m.toBranchId === ALL_BRANCHES).length;

  return (
    <aside
      className="scroll-thin flex w-[300px] shrink-0 flex-col overflow-y-auto rounded-xl border border-line bg-elevated p-3"
      aria-label="Branches"
    >
      <SectionLabel icon={Building2} right={<span className="text-[11px] text-faint">{branches.length}</span>}>
        Branches
      </SectionLabel>
      <div className="mt-2 space-y-3">
        {groups.map(([location, list]) => (
          <div key={location}>
            <p className="flex items-center gap-1 px-1 text-[10.5px] font-bold tracking-[0.06em] text-faint uppercase">
              <MapPin className="size-3" aria-hidden />
              {location}
            </p>
            <ul className="mt-1 space-y-1">
              {list.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(b.id)}
                    aria-pressed={b.id === selectedId}
                    className={clsx(
                      'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left',
                      b.id === selectedId ? 'border-accent/50 bg-accent-soft' : 'border-line bg-panel hover:bg-panel-hover'
                    )}
                  >
                    <span
                      className={clsx(
                        'grid size-7 shrink-0 place-items-center rounded-lg',
                        b.isHq ? 'bg-warning-soft text-warning' : 'bg-panel-2 text-muted'
                      )}
                    >
                      {b.isHq ? <Crown className="size-3.5" aria-hidden /> : <Users className="size-3.5" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-fg">{b.department}</span>
                      <span className="block truncate text-[11px] text-muted">{b.city}</span>
                    </span>
                    <span className="shrink-0 rounded-md bg-panel-2 px-1.5 py-0.5 text-[10px] font-bold text-faint tabular-nums">
                      {countFor(b.id)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ─────────────────────────── Channel ─────────────────────────── */

function BranchChannel({ branch, branches, messages }: { branch: BranchView; branches: BranchView[]; messages: MessageView[] }) {
  const byId = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const thread = useMemo(
    () =>
      messages
        .filter((m) => m.fromBranchId === branch.id || m.toBranchId === branch.id || m.toBranchId === ALL_BRANCHES)
        .sort((a, b) => a.sentAt - b.sentAt),
    [messages, branch.id]
  );

  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, branch.id]);

  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-line bg-elevated" aria-label={`${branch.name} channel`}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span
          className={clsx(
            'grid size-9 place-items-center rounded-xl',
            branch.isHq ? 'bg-warning-soft text-warning' : 'bg-accent-soft text-accent'
          )}
        >
          {branch.isHq ? <Crown className="size-4" aria-hidden /> : <Building2 className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold text-fg">{branch.name}</h2>
          <p className="truncate text-[11.5px] text-muted">
            {[branch.city, branch.state, branch.country].filter(Boolean).join(', ')}
            {branch.isHq && ' · Upper management: reports come here'}
          </p>
        </div>
      </header>

      <ol ref={listRef} className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {thread.length === 0 && (
          <li>
            <EmptyState icon={MessageSquare} title="No messages yet">
              Send the first message or report from this branch below.
            </EmptyState>
          </li>
        )}
        {thread.map((m) => (
          <MessageCard key={m.id} message={m} outgoing={m.fromBranchId === branch.id} byId={byId} />
        ))}
      </ol>

      <Composer from={branch} branches={branches} />
    </section>
  );
}

function MessageCard({ message, outgoing, byId }: { message: MessageView; outgoing: boolean; byId: Map<string, BranchView> }) {
  const from = byId.get(message.fromBranchId);
  const to = message.toBranchId === ALL_BRANCHES ? 'All branches' : (byId.get(message.toBranchId)?.name ?? 'Unknown branch');
  const report = message.kind === 'report';
  return (
    <li className={clsx('flex', outgoing ? 'justify-end' : 'justify-start')}>
      <article
        className={clsx(
          'max-w-[78%] rounded-xl border px-3.5 py-2.5',
          report ? 'border-violet/40 bg-violet-soft' : outgoing ? 'border-accent/40 bg-accent-soft' : 'border-line bg-panel'
        )}
      >
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <b className="text-fg">{from?.name ?? 'Unknown branch'}</b>
          <ArrowRight className="size-3" aria-hidden />
          <span>{to}</span>
          {report && (
            <span className="flex items-center gap-1 rounded-md bg-violet px-1.5 py-0.5 text-[9.5px] font-bold text-white uppercase">
              <FileBarChart className="size-3" aria-hidden />
              Report
            </span>
          )}
        </p>
        <p className="mt-1 text-[13.5px] font-semibold text-fg">{message.subject}</p>
        <p className="mt-0.5 text-[13px] leading-snug whitespace-pre-wrap text-fg/85">{message.body}</p>
        {report && <MetricChips metrics={message.metrics} />}
        <p className="mt-1.5 text-[10.5px] text-faint">
          {message.sentByName} · {timeAgo(new Date(message.sentAt))}
        </p>
      </article>
    </li>
  );
}

export function MetricChips({ metrics }: { metrics: ReportMetrics }) {
  const chips: [string, string][] = [];
  if (metrics.onTimePct !== undefined) chips.push(['On-time', `${metrics.onTimePct}%`]);
  if (metrics.inventoryDays !== undefined) chips.push(['Inventory', `${metrics.inventoryDays} days`]);
  if (metrics.openIssues !== undefined) chips.push(['Open issues', String(metrics.openIssues)]);
  if (chips.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {chips.map(([label, value]) => (
        <span key={label} className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-[11px] text-muted">
          {label} <b className="text-fg tabular-nums">{value}</b>
        </span>
      ))}
    </div>
  );
}

function Composer({ from, branches }: { from: BranchView; branches: BranchView[] }) {
  const { sendMessage, blockedReason } = useComms();
  const toast = useToast();
  const hq = branches.find((b) => b.isHq && b.id !== from.id);
  const [to, setTo] = useState<string>(ALL_BRANCHES);
  const [kind, setKind] = useState<MessageKind>('message');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [metrics, setMetrics] = useState({ onTimePct: '', inventoryDays: '', openIssues: '' });
  const [busy, setBusy] = useState(false);

  // Reset the recipient when switching branches.
  useEffect(() => setTo(ALL_BRANCHES), [from.id]);

  const reportToLeadership = () => {
    if (hq) setTo(hq.id);
    setKind('report');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
      await sendMessage({
        fromBranchId: from.id,
        toBranchId: to,
        kind,
        subject,
        body,
        metrics: { onTimePct: num(metrics.onTimePct), inventoryDays: num(metrics.inventoryDays), openIssues: num(metrics.openIssues) },
      });
      toast({ title: kind === 'report' ? 'Report sent. Added to Analytics.' : 'Message sent', tone: 'success' });
      setSubject('');
      setBody('');
      setMetrics({ onTimePct: '', inventoryDays: '', openIssues: '' });
    } catch (err) {
      toast({ title: 'Could not send', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const disabled = !!blockedReason;
  const field =
    'h-8 rounded-lg border border-line bg-panel px-2.5 text-[13px] text-fg outline-none focus:border-accent disabled:opacity-50';

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-line p-3" aria-label="Send a message">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] text-muted">
          From <b className="text-fg">{from.name}</b> to
        </span>
        <select
          value={to}
          onChange={(e) => setTo(e.target.value)}
          disabled={disabled}
          className={clsx(field, 'max-w-[260px]')}
          aria-label="Send to"
        >
          <option value={ALL_BRANCHES}>All branches</option>
          {branches
            .filter((b) => b.id !== from.id)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.isHq ? `${b.name} (upper management)` : b.name}
              </option>
            ))}
        </select>
        <div className="flex h-8 overflow-hidden rounded-lg border border-line" role="radiogroup" aria-label="Type">
          {(['message', 'report'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              disabled={disabled}
              onClick={() => setKind(k)}
              className={clsx(
                'px-2.5 text-[12px] font-semibold capitalize',
                kind === k ? 'bg-accent text-white' : 'bg-panel text-muted hover:text-fg'
              )}
            >
              {k}
            </button>
          ))}
        </div>
        {hq && (
          <button
            type="button"
            disabled={disabled}
            onClick={reportToLeadership}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-warning/50 px-2.5 text-[12px] font-semibold text-warning hover:bg-warning-soft disabled:opacity-50"
          >
            <Crown className="size-3.5" aria-hidden />
            Report to upper management
          </button>
        )}
      </div>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        disabled={disabled}
        maxLength={120}
        placeholder="Subject"
        aria-label="Subject"
        className={clsx(field, 'w-full')}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={disabled}
        maxLength={2000}
        rows={2}
        placeholder={kind === 'report' ? 'What should management know?' : 'Write a message'}
        aria-label="Message"
        className="w-full resize-none rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent disabled:opacity-50"
      />
      {kind === 'report' && (
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="On-time delivery %"
            value={metrics.onTimePct}
            max={100}
            onChange={(v) => setMetrics((m) => ({ ...m, onTimePct: v }))}
          />
          <NumberField
            label="Inventory (days)"
            value={metrics.inventoryDays}
            max={3650}
            onChange={(v) => setMetrics((m) => ({ ...m, inventoryDays: v }))}
          />
          <NumberField
            label="Open issues"
            value={metrics.openIssues}
            max={100000}
            step={1}
            onChange={(v) => setMetrics((m) => ({ ...m, openIssues: v }))}
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-faint">
          {blockedReason ??
            (kind === 'report'
              ? 'Reports go to the executive feed and the Analytics tab.'
              : 'Everyone in the receiving branch sees it live.')}
        </p>
        <Button type="submit" variant="primary" icon={Send} loading={busy} disabled={disabled || !subject.trim() || !body.trim()}>
          {kind === 'report' ? 'Send report' : 'Send'}
        </Button>
      </div>
    </form>
  );
}

function NumberField(props: { label: string; value: string; max: number; step?: number; onChange(v: string): void }) {
  return (
    <label className="text-[11px] text-muted">
      {props.label}
      <input
        type="number"
        min={0}
        max={props.max}
        step={props.step ?? 0.1}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-0.5 h-8 w-full rounded-lg border border-line bg-panel px-2.5 text-[13px] text-fg tabular-nums outline-none focus:border-accent"
      />
    </label>
  );
}

/* ─────────────────────────── Leadership ─────────────────────────── */

function LeadershipReports({ branches, messages, hq }: { branches: BranchView[]; messages: MessageView[]; hq: BranchView | undefined }) {
  const byId = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const reports = useMemo(
    () => messages.filter((m) => m.kind === 'report' && (!hq || m.toBranchId === hq.id)).sort((a, b) => b.sentAt - a.sentAt),
    [messages, hq]
  );

  return (
    <aside
      className="scroll-thin flex w-[320px] shrink-0 flex-col overflow-y-auto rounded-xl border border-line bg-elevated p-3"
      aria-label="Reports to upper management"
    >
      <SectionLabel
        icon={Crown}
        right={
          <Link href="/app/analytics#branch-reports" className="text-[11px] font-semibold text-accent hover:underline">
            In Analytics
          </Link>
        }
      >
        Reports to {hq?.department ?? 'upper management'}
      </SectionLabel>
      {reports.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-line p-3 text-[12px] text-muted">
          No reports yet. Pick a branch and use “Report to upper management”.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="rounded-lg border border-line bg-panel p-2.5">
              <p className="truncate text-[11px] text-muted">{byId.get(r.fromBranchId)?.name ?? 'Unknown branch'}</p>
              <p className="text-[13px] font-semibold text-fg">{r.subject}</p>
              <MetricChips metrics={r.metrics} />
              <p className="mt-1 text-[10.5px] text-faint">{timeAgo(new Date(r.sentAt))}</p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/* ─────────────────────────── Add branch ─────────────────────────── */

function AddBranchDialog({ open, onClose, onAdded }: { open: boolean; onClose(): void; onAdded(): void }) {
  const { addBranch } = useComms();
  const org = useCurrentOrg();
  const toast = useToast();
  const [form, setForm] = useState({ department: '', country: '', state: '', city: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm({ department: '', country: '', state: '', city: '' });
  }, [open]);

  const regions = LOCATIONS[form.country] ?? {};
  const cities = regions[form.state] ?? [];
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Changing a level clears the levels below it.
      if (key === 'country') {
        next.state = '';
        next.city = '';
      }
      if (key === 'state') next.city = '';
      return next;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await addBranch(form);
      toast({ title: `Added ${form.department} · ${form.city}`, tone: 'success' });
      onAdded();
    } catch (err) {
      toast({ title: 'Could not add the branch', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const where = [form.city, form.state, form.country].filter(Boolean).join(', ');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Insert new branch"
      description={`Add a branch to ${org?.name ?? 'your company'}: pick the department, then where it is.`}
    >
      <form onSubmit={submit} className="space-y-3">
        <Step n={1} label="Department">
          <SuggestInput
            id="branch-department"
            value={form.department}
            onChange={set('department')}
            options={DEPARTMENTS}
            placeholder="e.g. Supply Chain"
          />
        </Step>
        <Step n={2} label="Country">
          <SuggestInput
            id="branch-country"
            value={form.country}
            onChange={set('country')}
            options={COUNTRIES}
            placeholder="e.g. United States"
            disabled={!form.department.trim()}
          />
        </Step>
        <Step n={3} label="State / region">
          <SuggestInput
            id="branch-state"
            value={form.state}
            onChange={set('state')}
            options={Object.keys(regions)}
            placeholder="e.g. Texas"
            disabled={!form.country.trim()}
          />
        </Step>
        <Step n={4} label="City">
          <SuggestInput
            id="branch-city"
            value={form.city}
            onChange={set('city')}
            options={cities}
            placeholder="e.g. Dallas"
            disabled={!form.country.trim()}
          />
        </Step>

        <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-[12.5px] text-muted">
          {form.department.trim() && form.city.trim() ? (
            <>
              New branch: <b className="text-fg">{`${form.department.trim()} · ${form.city.trim()}`}</b>
              {where && <span> ({where})</span>}
            </>
          ) : (
            'Fill in the department, country and city. State is optional.'
          )}
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={Plus}
            loading={busy}
            disabled={!form.department.trim() || !form.country.trim() || !form.city.trim()}
          >
            Insert branch
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Step({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-6 grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-fg">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

/** Text input with suggestions (free text is allowed). */
function SuggestInput(props: {
  id: string;
  value: string;
  onChange(v: string): void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <>
      <input
        id={props.id}
        list={`${props.id}-list`}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
        maxLength={60}
        autoComplete="off"
        aria-label={props.placeholder}
        className="h-9 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent disabled:opacity-50"
      />
      <datalist id={`${props.id}-list`}>
        {props.options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}
