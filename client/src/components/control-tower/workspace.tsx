'use client';

/**
 * Member workspace: incidents rail · incident / team / audit · response chat.
 * Owns selection, dialogs, the "/" command palette and the "N" shortcut.
 */
import { Command, Lock, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IrMember } from '@/module_bindings/ir/types';
import { errorMessage, useToast } from '@/components/ui/toast';
import { useIr, useIrRows, useIrStatus } from '@/lib/ir/client';
import { IR_DB } from '@/lib/spacetime/config';
import { AuditPanel } from './audit-panel';
import { CHAT_INPUT_ID, ChatPanel } from './chat';
import { CommandPalette, type PaletteCommand } from './command-palette';
import { ControlTowerContext, type CenterView, type ControlTowerApi, type DialogState, type IncidentTab } from './context';
import { CommanderDialog, ConfirmDialog, EscalateDialog, InviteDialog, NoteDialog, ScopeDialog, TaskDialog } from './dialogs';
import { IncidentRail, sortIncidents } from './incident-rail';
import { IncidentView } from './incident-view';
import type { IncidentData } from './logic';
import { NewIncidentDialog } from './new-incident-dialog';
import { buildHandoff, buildReportHtml, downloadFile } from './report';
import { TeamPanel } from './team-panel';
import { Button, EmptyState, Kbd, Pill } from './ui';
import { can as roleCan, PHASE_META, PHASES, ROLE_META, roleLabel, type Permission } from './vocab';

function focusChat() {
  document.getElementById(CHAT_INPUT_ID)?.focus();
}

export function Workspace({ me }: { me: IrMember }) {
  const { conn } = useIr();
  const toast = useToast();
  const status = useIrStatus();
  const incidents = useIrRows('irIncidents');
  const allScope = useIrRows('irScope');
  const allTasks = useIrRows('irTasks');
  const allEvents = useIrRows('irTimeline');
  const allMessages = useIrRows('irMessages');
  const members = useIrRows('irMembers');

  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const [view, setView] = useState<CenterView>('incident');
  const [tab, setTab] = useState<IncidentTab>('scope');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [exportedRefs, setExportedRefs] = useState<ReadonlySet<string>>(() => new Set());
  const [auditVerified, setAuditVerified] = useState(false);

  // Selected incident: the user's pick, else the most urgent open one.
  const sorted = useMemo(() => sortIncidents(incidents), [incidents]);
  const incident = sorted.find((i) => i.id === selectedId) ?? sorted[0] ?? null;

  const data: IncidentData | null = useMemo(() => {
    if (!incident) return null;
    const id = incident.id;
    return {
      incident,
      scope: allScope.filter((s) => s.incidentId === id),
      tasks: allTasks.filter((t) => t.incidentId === id),
      events: allEvents.filter((e) => e.incidentId === id),
      messages: allMessages.filter((m) => m.incidentId === id),
      members,
    };
  }, [incident, allScope, allTasks, allEvents, allMessages, members]);

  const role = me.role;
  const can = useCallback((p: Permission) => roleCan(role, p), [role]);

  const run = useCallback(
    async (fn: () => Promise<unknown>, success?: string) => {
      try {
        await fn();
        if (success) toast({ title: success, tone: 'success' });
        return true;
      } catch (err) {
        toast({ title: 'Action refused', description: errorMessage(err), tone: 'error' });
        return false;
      }
    },
    [toast]
  );

  const api: ControlTowerApi = useMemo(
    () => ({
      me,
      can,
      selectedId: incident?.id ?? null,
      select: setSelectedId,
      view,
      setView,
      tab,
      setTab,
      openDialog: setDialog,
      focusChat,
      run,
      exportedRefs,
      markExported: (ref: string) => setExportedRefs((s) => new Set(s).add(ref)),
      auditVerified,
      setAuditVerified,
    }),
    [me, can, incident, view, tab, run, exportedRefs, auditVerified]
  );

  // Keyboard: "/" opens the command palette, "N" adds a timeline note.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[data-ir-modal]')) return;
      if (e.key === '/') {
        e.preventDefault();
        setDialog({ kind: 'palette' });
      } else if ((e.key === 'n' || e.key === 'N') && incident && roleCan(role, 'add_note')) {
        e.preventDefault();
        setDialog({ kind: 'note' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [incident, role]);

  const close = useCallback(() => setDialog(null), []);
  const exportHtml = useCallback(() => {
    if (!data) return;
    downloadFile(
      `${data.incident.ref}-post-incident-report.html`,
      buildReportHtml(data, { generatedBy: me.name, generatedAtMs: Date.now(), auditSeq: status?.auditSeq, auditHead: status?.auditHead }),
      'text/html;charset=utf-8'
    );
    setExportedRefs((s) => new Set(s).add(data.incident.ref));
  }, [data, me.name, status]);
  const openHandoff = useCallback(() => {
    if (data) setDialog({ kind: 'note', handoff: true, text: buildHandoff(data, Date.now(), role) });
  }, [data, role]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const list: PaletteCommand[] = [];
    const add = (id: string, label: string, group: string, runCmd: () => void, hint?: string) =>
      list.push({ id, label, group, run: runCmd, hint });
    if (incident && data) {
      const open = incident.status !== 'closed';
      if (can('add_note')) add('note', '+ Timeline note', incident.ref, () => setDialog({ kind: 'note' }), 'Shortcut: N');
      if (open && can('edit_scope'))
        add('scope', '+ Affected data', incident.ref, () => setDialog({ kind: 'scope' }), 'Add a row to the scope register');
      if (open && can('escalate'))
        add('escalate', 'Escalate SEV', incident.ref, () => setDialog({ kind: 'escalate' }), `Currently ${incident.severity}`);
      if (open && can('manage_tasks')) add('task', 'Assign task', incident.ref, () => setDialog({ kind: 'task' }));
      if (open && can('assign_commander'))
        add('commander', 'Change incident commander', incident.ref, () => setDialog({ kind: 'commander' }));
      if (open && can('manage_lifecycle') && conn) {
        const next = PHASES[PHASES.indexOf(incident.phase as (typeof PHASES)[number]) + 1];
        if (next)
          add('advance', `Move to ${PHASE_META[next].label}`, incident.ref, () =>
            run(() => conn.reducers.advancePhase({ incidentId: incident.id, note: '' }), `${incident.ref} → ${PHASE_META[next].label}`)
          );
        if (incident.status === 'open')
          add('contain', 'Mark contained', incident.ref, () =>
            setDialog({
              kind: 'confirm',
              title: `Mark ${incident.ref} contained?`,
              body: 'Confirm the attacker no longer has access. This records the containment time.',
              confirmLabel: 'Mark contained',
              tone: 'accent',
              reasonLabel: 'How was it contained? (optional)',
              onConfirm: (note) => conn.reducers.setStatus({ incidentId: incident.id, status: 'contained', note }),
            })
          );
      }
      if (!open && can('manage_lifecycle') && conn)
        add('reopen', 'Reopen incident', incident.ref, () =>
          setDialog({
            kind: 'confirm',
            title: `Reopen ${incident.ref}?`,
            body: 'The record becomes editable again. The reopening is recorded in the timeline.',
            confirmLabel: 'Reopen',
            tone: 'warning',
            reasonLabel: 'Why reopen?',
            onConfirm: (note) => conn.reducers.setStatus({ incidentId: incident.id, status: 'open', note }),
          })
        );
      add('export', 'Export post-incident report', incident.ref, exportHtml);
      if (can('add_note')) add('handoff', 'Shift handoff summary', incident.ref, openHandoff);
      add('chat', 'Message the team', 'Chat', focusChat);
      for (const t of ['scope', 'timeline', 'tasks', 'details', 'report'] as IncidentTab[]) {
        add(`tab-${t}`, `Open ${t === 'details' ? 'incident record' : t === 'report' ? 'report & lessons learned' : t}`, 'Go to', () => {
          setView('incident');
          setTab(t);
        });
      }
    }
    if (can('create_incident'))
      add('new', 'New incident', 'Incidents', () => setDialog({ kind: 'newIncident' }), 'Ransomware, exfiltration, BEC or blank');
    if (can('invite'))
      add('invite', 'Invite responder', 'Team', () => setDialog({ kind: 'invite', role: 'responder' }), 'One-time code, shared in person');
    add('team', 'Team & access', 'Go to', () => setView('team'));
    add('audit', 'Verify audit chain', 'Go to', () => setView('audit'), 'Open the audit log');
    for (const i of sorted) {
      add(`inc-${i.id}`, `${i.ref}: ${i.title}`, 'Incidents', () => {
        setSelectedId(i.id);
        setView('incident');
      });
    }
    return list;
  }, [incident, data, can, conn, run, sorted, exportHtml, openHandoff]);

  const dialogNode = (() => {
    if (!dialog) return null;
    switch (dialog.kind) {
      case 'palette':
        return <CommandPalette commands={commands} onClose={close} />;
      case 'newIncident':
        return <NewIncidentDialog draft={dialog.draft} onClose={close} />;
      case 'invite':
        return <InviteDialog initialRole={dialog.role} onClose={close} />;
      case 'confirm':
        return <ConfirmDialog dialog={dialog} onClose={close} />;
      default:
        if (!incident) return null;
        if (dialog.kind === 'note')
          return <NoteDialog incident={incident} initial={dialog.text} handoff={dialog.handoff} onClose={close} />;
        if (dialog.kind === 'scope') return <ScopeDialog incident={incident} onClose={close} />;
        if (dialog.kind === 'escalate') return <EscalateDialog incident={incident} onClose={close} />;
        if (dialog.kind === 'task') return <TaskDialog incident={incident} initialPhase={dialog.phase} onClose={close} />;
        if (dialog.kind === 'commander') return <CommanderDialog incident={incident} onClose={close} />;
        return null;
    }
  })();

  const openCount = incidents.filter((i) => i.status !== 'closed').length;

  return (
    <ControlTowerContext.Provider value={api}>
      <div className="flex h-full min-h-0 flex-col bg-bg text-fg">
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-elevated px-4 py-2">
          <ShieldCheck className="size-5 text-accent" aria-hidden />
          <h1 className="font-display text-xl tracking-wide uppercase">Cyber Control Tower</h1>
          <Pill tone="cyan">Isolated · {IR_DB}</Pill>
          <Pill tone={openCount > 0 ? 'danger' : 'success'}>
            {openCount} open incident{openCount === 1 ? '' : 's'}
          </Pill>
          {status?.lockdown && (
            <Pill tone="warning">
              <Lock className="size-3" aria-hidden /> Lockdown
            </Pill>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-2 text-sm text-muted">
              <b className="text-fg">{me.name}</b>
              <Pill tone={ROLE_META[me.role]?.tone ?? 'muted'}>{roleLabel(me.role)}</Pill>
            </span>
            <Button
              size="sm"
              variant="ghost"
              icon={Command}
              onClick={() => setDialog({ kind: 'palette' })}
              aria-label="Open command palette"
            >
              Commands <Kbd>/</Kbd>
            </Button>
          </div>
        </header>

        {status?.lockdown && (
          <p
            className="flex items-center gap-2 border-b border-warning/40 bg-warning-soft px-4 py-1.5 text-xs font-semibold text-warning"
            role="status"
          >
            <Lock className="size-3.5" aria-hidden /> Lockdown is on{status.lockdownByName ? ` (by ${status.lockdownByName})` : ''}: no
            invites, new members or role changes.{status.lockdownReason ? ` Reason: ${status.lockdownReason}` : ''}
          </p>
        )}

        <div className="flex min-h-0 flex-1">
          <aside className="w-[256px] shrink-0 border-r border-line bg-elevated">
            <IncidentRail />
          </aside>
          <main className="min-w-0 flex-1 overflow-y-auto scroll-thin" key={`${view}`}>
            {view === 'team' ? (
              <TeamPanel />
            ) : view === 'audit' ? (
              <AuditPanel />
            ) : data ? (
              <IncidentView data={data} key={String(data.incident.id)} />
            ) : (
              <div className="mx-auto max-w-xl p-10">
                <EmptyState
                  icon={ShieldCheck}
                  title="No incidents. All quiet."
                  action={
                    can('create_incident') ? (
                      <Button variant="primary" size="lg" onClick={() => setDialog({ kind: 'newIncident' })}>
                        Open an incident
                      </Button>
                    ) : undefined
                  }
                >
                  When something happens, open an incident from a template or review a draft from Arrow ops in the left rail. Everyone on
                  the team sees it instantly.
                </EmptyState>
              </div>
            )}
          </main>
          <aside className="w-[332px] shrink-0 border-l border-line bg-elevated">
            <ChatPanel incident={view === 'incident' ? incident : null} />
          </aside>
        </div>
      </div>
      {dialogNode}
    </ControlTowerContext.Provider>
  );
}
