'use client';

/** Append-only incident timeline: every change, auto-timestamped and attributed. */
import {
  ArrowRightLeft,
  ClipboardCheck,
  Crown,
  Database,
  Flag,
  Gavel,
  History,
  ListChecks,
  Pencil,
  Plus,
  Siren,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import type { IncidentEvent } from '@/module_bindings/ir/types';
import { useCt } from './context';
import { formatTime, formatUtc, relativeTime, tsMs, useNow } from './format';
import { Button, cx, EmptyState, Pill } from './ui';
import { PHASE_META, roleLabel, TONE_CLASSES, type Tone } from './vocab';

const KIND_META: Record<string, { icon: LucideIcon; tone: Tone; label: string }> = {
  created: { icon: Flag, tone: 'danger', label: 'Opened' },
  note: { icon: StickyNote, tone: 'accent', label: 'Note' },
  handoff: { icon: ArrowRightLeft, tone: 'violet', label: 'Shift handoff' },
  phase: { icon: ListChecks, tone: 'cyan', label: 'Phase' },
  status: { icon: ClipboardCheck, tone: 'success', label: 'Status' },
  severity: { icon: Siren, tone: 'danger', label: 'Severity' },
  field: { icon: Pencil, tone: 'muted', label: 'Record' },
  scope: { icon: Database, tone: 'warning', label: 'Scope' },
  task: { icon: ListChecks, tone: 'muted', label: 'Task' },
  commander: { icon: Crown, tone: 'accent', label: 'Commander' },
  materiality: { icon: Gavel, tone: 'warning', label: 'Legal' },
};

const FILTERS = [
  ['all', 'Everything'],
  ['notes', 'Notes & handoffs'],
  ['changes', 'Changes'],
] as const;

export function Timeline({ events, closed }: { events: IncidentEvent[]; closed: boolean }) {
  const { can, openDialog } = useCt();
  const now = useNow();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const sorted = [...events]
    .filter(
      (e) =>
        filter === 'all' || (filter === 'notes' ? e.kind === 'note' || e.kind === 'handoff' : e.kind !== 'note' && e.kind !== 'handoff')
    )
    .sort((a, b) => (a.ts.microsSinceUnixEpoch > b.ts.microsSinceUnixEpoch ? -1 : 1));

  return (
    <section aria-label="Timeline">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-line bg-panel-2 p-0.5" role="tablist" aria-label="Filter timeline">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cx(
                'h-8 rounded-md px-3 text-xs font-semibold',
                filter === key ? 'bg-panel text-fg shadow-panel' : 'text-muted hover:text-fg'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-faint">Append-only · newest first</span>
          {can('add_note') && (
            <Button size="sm" icon={Plus} onClick={() => openDialog({ kind: 'note' })}>
              Timeline note <span className="ml-1 font-mono text-[10px] text-faint">N</span>
            </Button>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={History} title="Nothing here yet">
          {closed ? 'This incident has no matching entries.' : 'Every change and note appears here automatically.'}
        </EmptyState>
      ) : (
        <ol className="relative space-y-2 border-l border-line pl-5">
          {sorted.map((e) => {
            const meta = KIND_META[e.kind] ?? KIND_META.field;
            const Icon = meta.icon;
            const ms = tsMs(e.ts);
            const isNote = e.kind === 'note' || e.kind === 'handoff';
            return (
              <li key={String(e.id)} className="relative">
                <span
                  className={cx(
                    'absolute top-2.5 -left-[29px] grid size-[18px] place-items-center rounded-full border bg-panel',
                    TONE_CLASSES[meta.tone].border
                  )}
                >
                  <Icon className={cx('size-2.5', TONE_CLASSES[meta.tone].text)} aria-hidden />
                </span>
                <div
                  className={cx(
                    'rounded-lg border px-3 py-2',
                    isNote
                      ? e.kind === 'handoff'
                        ? 'border-violet/40 bg-violet-soft'
                        : 'border-accent/30 bg-accent-soft'
                      : 'border-line bg-panel'
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <time className="font-mono font-semibold text-fg" dateTime={new Date(ms).toISOString()} title={formatUtc(ms)}>
                      {formatTime(ms)}
                    </time>
                    <span className="text-faint">{relativeTime(ms, now)}</span>
                    <Pill tone={meta.tone}>{meta.label}</Pill>
                    <span className="text-muted">
                      {e.actorName}
                      {e.actorRole ? ` · ${roleLabel(e.actorRole)}` : ''}
                    </span>
                    <span className="ml-auto text-[11px] text-faint">{PHASE_META[e.phase]?.short ?? e.phase}</span>
                  </div>
                  <p
                    className={cx(
                      'mt-1 text-sm leading-relaxed whitespace-pre-wrap',
                      isNote ? 'text-fg' : 'text-muted',
                      e.kind === 'handoff' && 'font-mono text-xs'
                    )}
                  >
                    {e.text}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
