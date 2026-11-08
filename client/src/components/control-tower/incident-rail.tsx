'use client';

/** Left rail: incidents, pending ops drafts (one-way hand-off) and team / audit navigation. */
import { FileInput, PlugZap, Plus, ScrollText, ShieldCheck, Unplug, Users } from 'lucide-react';
import { useMemo } from 'react';
import type { Incident } from '@/module_bindings/ir/types';
import { useIrRows } from '@/lib/ir/client';
import { useOps, useOpsRows } from '@/lib/ops/client';
import { useCt } from './context';
import { draftRef, parseDraft } from './drafts';
import { formatDuration, tsMs, useNow } from './format';
import { Button, cx, Pill, StatusBadge } from './ui';
import { INCIDENT_STATUS_META, PHASE_META, SEVERITIES, SEVERITY_META } from './vocab';

const SEVERITY_EDGE: Record<string, string> = {
  danger: 'border-l-danger',
  warning: 'border-l-warning',
  cyan: 'border-l-cyan',
  muted: 'border-l-line-strong',
};

export function sortIncidents(list: Incident[]) {
  const order: readonly string[] = SEVERITIES;
  return [...list].sort((a, b) => {
    const closedA = a.status === 'closed' ? 1 : 0;
    const closedB = b.status === 'closed' ? 1 : 0;
    if (closedA !== closedB) return closedA - closedB;
    const sev = order.indexOf(a.severity) - order.indexOf(b.severity);
    if (sev !== 0) return sev;
    return a.updatedAt.microsSinceUnixEpoch > b.updatedAt.microsSinceUnixEpoch ? -1 : 1;
  });
}

function OpsDrafts({ incidents }: { incidents: Incident[] }) {
  const ops = useOps();
  const proposals = useOpsRows('actionProposal');
  const { can, openDialog } = useCt();
  const opened = useMemo(() => new Set(incidents.map((i) => i.opsDraftRef).filter(Boolean)), [incidents]);
  const drafts = useMemo(
    () =>
      proposals
        .filter((p) => p.kind === 'ir_draft' && p.status === 'pending' && !opened.has(draftRef(p.id)))
        .map(parseDraft)
        .sort((a, b) => b.createdAtMs - a.createdAtMs),
    [proposals, opened]
  );
  const online = ops.status === 'connected';

  return (
    <div className="border-t border-line px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold tracking-wider text-muted uppercase">Drafts from Arrow ops</h3>
        {online ? (
          <Pill tone="cyan">
            <PlugZap className="size-3" aria-hidden /> One-way
          </Pill>
        ) : (
          <Pill tone="muted">
            <Unplug className="size-3" aria-hidden /> Ops link offline
          </Pill>
        )}
      </div>
      {!online ? (
        <p className="text-[11px] leading-snug text-faint">
          Drafts appear when the ops side is reachable. The Control Tower works without it.
        </p>
      ) : drafts.length === 0 ? (
        <p className="text-[11px] leading-snug text-faint">
          No pending drafts. The ops agent drafts one when it detects a cyber disruption.
        </p>
      ) : (
        <ul className="space-y-2">
          {drafts.map((d) => (
            <li key={String(d.proposalId)} className="rounded-lg border border-cyan/40 bg-cyan-soft p-2.5">
              <p className="line-clamp-2 text-xs font-semibold text-fg">{d.title}</p>
              <p className="mt-0.5 text-[11px] text-muted">
                {d.severity} · disruption #{String(d.disruptionId)} · {d.scope.length} assets
              </p>
              {can('create_incident') ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={FileInput}
                  className="mt-2 w-full"
                  onClick={() => openDialog({ kind: 'newIncident', draft: d })}
                >
                  Review &amp; open incident
                </Button>
              ) : (
                <p className="mt-1 text-[11px] text-faint">Waiting for a commander or responder to review.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function IncidentRail() {
  const { can, selectedId, select, view, setView, openDialog } = useCt();
  const incidents = useIrRows('irIncidents');
  const members = useIrRows('irMembers');
  const invites = useIrRows('irInvites');
  const now = useNow();
  const sorted = useMemo(() => sortIncidents(incidents), [incidents]);
  const activeMembers = members.filter((m) => m.status === 'active').length;
  const openInvites = invites.filter((i) => !i.usedAt && !i.cancelled && tsMs(i.expiresAt) > now).length;

  return (
    <nav className="flex h-full min-h-0 flex-col" aria-label="Incidents">
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <h2 className="text-[11px] font-bold tracking-wider text-muted uppercase">Incidents ({incidents.length})</h2>
        {can('create_incident') && (
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => openDialog({ kind: 'newIncident' })}>
            New
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        <ul className="space-y-1.5 px-2 pb-2">
          {sorted.length === 0 && (
            <li className="rounded-lg border border-dashed border-line px-3 py-6 text-center">
              <ShieldCheck className="mx-auto size-6 text-success" aria-hidden />
              <p className="mt-1 text-xs font-semibold text-fg">No incidents</p>
              <p className="text-[11px] text-faint">Open one from a template or an ops draft.</p>
            </li>
          )}
          {sorted.map((inc) => {
            const sev = SEVERITY_META[inc.severity] ?? SEVERITY_META.SEV3;
            const selected = view === 'incident' && inc.id === selectedId;
            return (
              <li key={String(inc.id)}>
                <button
                  type="button"
                  onClick={() => {
                    select(inc.id);
                    setView('incident');
                  }}
                  aria-current={selected ? 'true' : undefined}
                  className={cx(
                    'w-full rounded-lg border-l-4 px-2.5 py-2 text-left transition-colors',
                    SEVERITY_EDGE[sev.tone] ?? 'border-l-line-strong',
                    selected ? 'bg-accent-soft ring-1 ring-accent/50' : 'bg-panel hover:bg-panel-hover',
                    inc.status === 'closed' && 'opacity-70'
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-semibold text-muted">{inc.ref}</span>
                    <StatusBadge meta={{ ...sev, label: inc.severity }} size="sm" />
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm font-semibold text-fg">{inc.title}</span>
                  <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span>{PHASE_META[inc.phase]?.short ?? inc.phase}</span>
                    {inc.status === 'closed' ? (
                      <StatusBadge meta={INCIDENT_STATUS_META.closed} size="sm" />
                    ) : (
                      <span className="font-mono" title="Time since detection">
                        {formatDuration(now - tsMs(inc.detectedAt))}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <OpsDrafts incidents={incidents} />
      </div>
      <div className="space-y-1 border-t border-line p-2">
        <button
          type="button"
          onClick={() => setView('team')}
          aria-current={view === 'team' ? 'page' : undefined}
          className={cx(
            'flex h-10 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold',
            view === 'team' ? 'bg-accent-soft text-fg' : 'text-muted hover:bg-panel-hover hover:text-fg'
          )}
        >
          <Users className="size-4" aria-hidden />
          Team &amp; access
          <span className="ml-auto text-[11px] font-normal text-faint">
            {activeMembers} active{openInvites ? ` · ${openInvites} invite${openInvites === 1 ? '' : 's'}` : ''}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setView('audit')}
          aria-current={view === 'audit' ? 'page' : undefined}
          className={cx(
            'flex h-10 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold',
            view === 'audit' ? 'bg-accent-soft text-fg' : 'text-muted hover:bg-panel-hover hover:text-fg'
          )}
        >
          <ScrollText className="size-4" aria-hidden />
          Audit log
        </button>
      </div>
    </nav>
  );
}
