'use client';

/**
 * One incident. Built for the 3-second rule: severity, phase, commander, time
 * since detection, affected-asset counts and the last update sit in one strip,
 * followed by exactly one "Next step" with one primary action.
 */
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  Crown,
  Database,
  Eye,
  FileDown,
  Globe2,
  History,
  ListChecks,
  ListTodo,
  NotebookPen,
  Plus,
  Siren,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useIr } from '@/lib/ir/client';
import { useCt, type IncidentTab } from './context';
import { IncidentDetails } from './details';
import { formatDuration, formatTime, formatUtc, relativeTime, tsMs, useNow } from './format';
import { nextStep, phaseChecklist, scopeCounts, type IncidentData, type NextStep } from './logic';
import { RegulatoryClocks } from './reg-clocks';
import { ReportPanel, useReportExport } from './report-panel';
import { ScopeRegister } from './scope-register';
import { TaskList, TaskRow } from './tasks';
import { Timeline } from './timeline';
import { Button, cx, Kbd, StatusBadge } from './ui';
import {
  INCIDENT_STATUS_META,
  PHASE_META,
  PHASES,
  roleLabel,
  SCOPE_STATUS_META,
  SCOPE_STATUSES,
  SEVERITY_META,
  TONE_CLASSES,
} from './vocab';

function Tile({ label, icon: Icon, children, onClick }: { label: string; icon: LucideIcon; children: ReactNode; onClick?: () => void }) {
  const heading = (
    <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-muted uppercase">
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
  // Clickable tiles only hold phrasing content (spans), so they can be buttons.
  return onClick ? (
    <button type="button" onClick={onClick} className="rounded-xl border border-line bg-panel p-3 text-left hover:bg-panel-hover">
      {heading}
      <span className="mt-1.5 block">{children}</span>
    </button>
  ) : (
    <div className="rounded-xl border border-line bg-panel p-3">
      {heading}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Overview({ data }: { data: IncidentData }) {
  const { setTab } = useCt();
  const now = useNow();
  const inc = data.incident;
  const counts = scopeCounts(data.scope);
  const phase = PHASE_META[inc.phase];
  const detected = tsMs(inc.detectedAt);
  const updated = tsMs(inc.updatedAt);

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-6">
      <Tile label="Severity" icon={Siren}>
        <StatusBadge meta={SEVERITY_META[inc.severity] ?? SEVERITY_META.SEV3} />
      </Tile>
      <Tile label="Phase" icon={ListChecks}>
        <p className="text-sm font-bold text-fg">
          {phase?.step ?? '?'} of 4 · {phase?.short ?? inc.phase}
        </p>
        <div className="mt-1">
          <StatusBadge meta={INCIDENT_STATUS_META[inc.status] ?? INCIDENT_STATUS_META.open} size="sm" />
        </div>
      </Tile>
      <Tile label="Commander" icon={Crown}>
        {inc.commanderName ? (
          <p className="truncate text-sm font-bold text-fg">{inc.commanderName}</p>
        ) : (
          <p className="text-sm font-bold text-warning">Unassigned</p>
        )}
      </Tile>
      <Tile label="Since detection" icon={Clock3}>
        <p className={cx('font-mono text-xl font-bold', inc.status === 'closed' ? 'text-muted' : 'text-fg')}>
          {formatDuration((inc.closedAt ? tsMs(inc.closedAt) : now) - detected)}
        </p>
        <p className="text-[11px] text-faint" title={formatUtc(detected)}>
          Detected {formatTime(detected)}
        </p>
      </Tile>
      <Tile label="Affected data" icon={Database} onClick={() => setTab('scope')}>
        {data.scope.length === 0 ? (
          <span className="block text-sm font-bold text-warning">None recorded</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {SCOPE_STATUSES.filter((s) => counts[s] > 0).map((s) => (
              <StatusBadge key={s} size="sm" meta={{ ...SCOPE_STATUS_META[s], label: `${counts[s]} ${SCOPE_STATUS_META[s].label}` }} />
            ))}
          </span>
        )}
      </Tile>
      <Tile label="Last update" icon={History} onClick={() => setTab('timeline')}>
        <span className="block text-sm font-bold text-fg">{relativeTime(updated, now)}</span>
        <span className="block truncate text-[11px] text-faint">by {inc.updatedByName}</span>
      </Tile>
    </div>
  );
}

function NextStepCard({ data, step }: { data: IncidentData; step: NextStep }) {
  const { conn } = useIr();
  const { me, can, run, openDialog, setTab } = useCt();
  const exportReport = useReportExport(data);
  const inc = data.incident;
  const allowed = step.permission === null || can(step.permission);
  const tone = TONE_CLASSES[step.tone];

  function act() {
    if (!conn) return;
    const myHex = me.identity.toHexString();
    switch (step.action) {
      case 'take_command':
        run(() => conn.reducers.assignCommander({ incidentId: inc.id, memberHex: myHex }), `You now command ${inc.ref}`);
        break;
      case 'assign_commander':
        openDialog({ kind: 'commander' });
        break;
      case 'add_scope':
        openDialog({ kind: 'scope' });
        break;
      case 'review_scope':
        setTab('scope');
        break;
      case 'invite':
        openDialog({ kind: 'invite', role: 'responder' });
        break;
      case 'advance': {
        const next = PHASES[PHASES.indexOf(inc.phase as (typeof PHASES)[number]) + 1];
        run(
          () => conn.reducers.advancePhase({ incidentId: inc.id, note: '' }),
          next ? `${inc.ref} → ${PHASE_META[next].label}` : undefined
        );
        break;
      }
      case 'contain':
        openDialog({
          kind: 'confirm',
          title: `Mark ${inc.ref} contained?`,
          body: 'Confirm the attacker no longer has access (hosts isolated, accounts disabled, egress blocked). This records the containment time.',
          confirmLabel: 'Mark contained',
          tone: 'accent',
          reasonLabel: 'How was it contained? (optional)',
          onConfirm: (note) => conn.reducers.setStatus({ incidentId: inc.id, status: 'contained', note }),
        });
        break;
      case 'lessons':
        setTab('report');
        break;
      case 'tasks':
        setTab('tasks');
        break;
      case 'close':
        openDialog({
          kind: 'confirm',
          title: `Close ${inc.ref}?`,
          body: 'Closing freezes the record: no more scope, task or field changes. Notes and chat stay open. An admin or commander can reopen it.',
          confirmLabel: 'Close incident',
          tone: 'success',
          reasonLabel: 'Closing note (optional)',
          onConfirm: (note) => conn.reducers.setStatus({ incidentId: inc.id, status: 'closed', note }),
        });
        break;
      case 'export':
        exportReport('html');
        break;
    }
  }

  return (
    <section aria-label="Next step" className={cx('flex flex-wrap items-center gap-4 rounded-xl border-2 bg-panel p-4', tone.border)}>
      <div className={cx('grid size-11 shrink-0 place-items-center rounded-full', tone.bg, tone.text)}>
        <ArrowRight className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold tracking-wider text-muted uppercase">Next step</p>
        <p className="text-lg leading-snug font-bold text-fg">{step.title}</p>
        <p className="mt-0.5 text-sm text-muted">{step.detail}</p>
      </div>
      {allowed ? (
        <Button variant="primary" size="lg" onClick={act}>
          {step.label}
        </Button>
      ) : (
        <p className="max-w-[220px] text-sm text-muted">
          Waiting on {inc.commanderName ? `${inc.commanderName} (commander)` : 'the incident commander'}. Your role ({roleLabel(me.role)})
          can’t do this step.
        </p>
      )}
    </section>
  );
}

function QuickAdd({ data }: { data: IncidentData }) {
  const { can, openDialog } = useCt();
  const inc = data.incident;
  const open = inc.status !== 'closed';
  const items: { show: boolean; label: ReactNode; icon: LucideIcon; onClick: () => void; danger?: boolean }[] = [
    { show: open && can('edit_scope'), label: 'Affected data', icon: Plus, onClick: () => openDialog({ kind: 'scope' }) },
    {
      show: can('add_note'),
      label: (
        <>
          Timeline note <Kbd>N</Kbd>
        </>
      ),
      icon: Plus,
      onClick: () => openDialog({ kind: 'note' }),
    },
    {
      show: open && can('escalate') && inc.severity !== 'SEV1',
      label: 'Escalate SEV',
      icon: Siren,
      onClick: () => openDialog({ kind: 'escalate' }),
      danger: true,
    },
    { show: can('invite'), label: 'Invite responder', icon: UserPlus, onClick: () => openDialog({ kind: 'invite', role: 'responder' }) },
    { show: open && can('manage_tasks'), label: 'Assign task', icon: ListTodo, onClick: () => openDialog({ kind: 'task' }) },
  ];
  const visible = items.filter((i) => i.show);
  if (visible.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-muted">
        <Eye className="size-4" aria-hidden /> Read-only access: you can follow everything live, including the chat.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Quick add">
      {visible.map((i, idx) => (
        <Button key={idx} icon={i.icon} onClick={i.onClick} className={i.danger ? 'border-danger/50 text-danger' : undefined}>
          {i.label}
        </Button>
      ))}
    </div>
  );
}

function PhaseStepper({ data }: { data: IncidentData }) {
  const { exportedRefs, auditVerified } = useCt();
  const inc = data.incident;
  const currentIdx = PHASES.indexOf(inc.phase as (typeof PHASES)[number]);
  const [picked, setPicked] = useState<string | null>(null);
  const shown = picked ?? inc.phase;
  const checklist = phaseChecklist(shown, data, { auditVerified, exported: exportedRefs.has(inc.ref) });
  const phaseTasks = data.tasks.filter((t) => t.phase === shown).sort((a, b) => Number(a.id - b.id));

  return (
    <section aria-label="Incident phases" className="rounded-xl border border-line bg-panel p-3">
      <ol className="grid grid-cols-4 gap-1.5">
        {PHASES.map((p, i) => {
          const done = i < currentIdx || inc.status === 'closed';
          const current = i === currentIdx && inc.status !== 'closed';
          return (
            <li key={p}>
              <button
                type="button"
                onClick={() => setPicked(p)}
                aria-current={current ? 'step' : undefined}
                aria-pressed={shown === p}
                className={cx(
                  'flex h-full w-full flex-col items-start gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors',
                  shown === p ? 'border-accent bg-accent-soft' : 'border-line hover:bg-panel-hover'
                )}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
                  {done ? (
                    <CheckCircle2 className="size-4 text-success" aria-hidden />
                  ) : current ? (
                    <span className="grid size-4 place-items-center rounded-full bg-accent text-[10px] text-white">{i + 1}</span>
                  ) : (
                    <Circle className="size-4 text-faint" aria-hidden />
                  )}
                  {done ? 'Done' : current ? 'Current' : 'Later'}
                </span>
                <span className={cx('text-xs leading-tight font-semibold', current ? 'text-fg' : 'text-muted')}>{PHASE_META[p].label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-muted">{PHASE_META[shown].description}</p>
          <ul className="space-y-1">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-sm">
                {c.done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <Circle className="size-4 shrink-0 text-faint" aria-hidden />
                )}
                <span className={c.done ? 'text-muted' : 'text-fg'}>{c.label}</span>
                <span className="sr-only">{c.done ? '(done)' : '(to do)'}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted">Tasks in this phase</p>
          {phaseTasks.length === 0 ? (
            <p className="text-sm text-faint">{shown === 'preparation' ? 'Readiness is checked automatically.' : 'None.'}</p>
          ) : (
            <ul className="-mx-2">
              {phaseTasks.map((t) => (
                <TaskRow key={String(t.id)} task={t} incident={inc} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

const TABS: { key: IncidentTab; label: string; icon: LucideIcon }[] = [
  { key: 'scope', label: 'Scope register', icon: Database },
  { key: 'timeline', label: 'Timeline', icon: History },
  { key: 'tasks', label: 'Tasks', icon: ListTodo },
  { key: 'details', label: 'Incident record', icon: NotebookPen },
  { key: 'report', label: 'Report & handoff', icon: FileDown },
];

export function IncidentView({ data }: { data: IncidentData }) {
  const { me, tab, setTab } = useCt();
  const exportReport = useReportExport(data);
  const inc = data.incident;
  const step = nextStep(data, me.role);
  const counts: Partial<Record<IncidentTab, number>> = {
    scope: data.scope.length,
    timeline: data.events.length,
    tasks: data.tasks.filter((t) => t.status === 'open').length,
  };

  return (
    <div className="mx-auto max-w-[1180px] space-y-4 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-muted">
            {inc.ref}
            {inc.orgName ? ` · ${inc.orgName}` : ''}
          </p>
          <h1 className="font-display text-3xl leading-tight tracking-wide text-fg uppercase">{inc.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {inc.linkedDisruptionId > 0n && (
            <Link
              href={`/app?focus=disruption:${inc.linkedDisruptionId}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-cyan/50 bg-cyan-soft px-3.5 text-sm font-semibold text-cyan hover:opacity-90"
            >
              <Globe2 className="size-4" aria-hidden /> Blast radius
            </Link>
          )}
          <Button icon={FileDown} onClick={() => exportReport('html')}>
            Export report
          </Button>
        </div>
      </header>

      <Overview data={data} />
      <NextStepCard data={data} step={step} />
      <QuickAdd data={data} />

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <PhaseStepper key={String(inc.id)} data={data} />
        <RegulatoryClocks incident={inc} />
      </div>

      <div>
        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Incident sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cx(
                '-mb-px flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold whitespace-nowrap',
                tab === t.key ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
              )}
            >
              <t.icon className="size-4" aria-hidden />
              {t.label}
              {counts[t.key] !== undefined && <span className="rounded bg-panel-2 px-1.5 text-[11px] text-muted">{counts[t.key]}</span>}
            </button>
          ))}
        </div>
        <div role="tabpanel">
          {tab === 'scope' && <ScopeRegister incident={inc} scope={data.scope} />}
          {tab === 'timeline' && <Timeline events={data.events} closed={inc.status === 'closed'} />}
          {tab === 'tasks' && <TaskList incident={inc} tasks={data.tasks} />}
          {tab === 'details' && <IncidentDetails incident={inc} />}
          {tab === 'report' && <ReportPanel data={data} />}
        </div>
      </div>
    </div>
  );
}
