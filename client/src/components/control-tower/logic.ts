/**
 * Derived incident state: the single "Next step", the per-phase checklists
 * and the asset counts behind the 3-second overview. Pure functions only.
 */
import type { Incident, IncidentEvent, IrMember, IrTask, Message, ScopeItem } from '@/module_bindings/ir/types';
import { ACTIVE_SCOPE_STATUSES, DATA_CLASSES, SCOPE_STATUSES, type Permission, type Tone } from './vocab';

export interface IncidentData {
  incident: Incident;
  scope: ScopeItem[];
  tasks: IrTask[];
  events: IncidentEvent[];
  messages: Message[];
  members: IrMember[];
}

export type NextAction =
  | 'take_command'
  | 'assign_commander'
  | 'add_scope'
  | 'review_scope'
  | 'invite'
  | 'advance'
  | 'contain'
  | 'lessons'
  | 'tasks'
  | 'close'
  | 'export';

export interface NextStep {
  title: string;
  detail: string;
  action: NextAction;
  label: string;
  /** Permission needed to take the action; null = anyone (navigation/export). */
  permission: Permission | null;
  tone: Tone;
}

export function scopeCounts(scope: ScopeItem[]) {
  const counts: Record<string, number> = Object.fromEntries(SCOPE_STATUSES.map((s) => [s, 0]));
  for (const s of scope) counts[s.status] = (counts[s.status] ?? 0) + 1;
  return counts;
}

export function nextStep(d: IncidentData, myRole: string): NextStep {
  const { incident: inc, scope, tasks, members } = d;
  const unknown = scope.filter((s) => s.status === 'unknown').length;
  const stillActive = scope.filter((s) => ACTIVE_SCOPE_STATUSES.includes(s.status)).length;
  const openTasks = tasks.filter((t) => t.status === 'open').length;
  const activeMembers = members.filter((m) => m.status === 'active').length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  if (inc.status === 'closed') {
    return {
      title: 'Incident closed',
      detail: 'Export the post-incident report for your records. It is generated in your browser and works offline.',
      action: 'export',
      label: 'Export post-incident report',
      permission: null,
      tone: 'success',
    };
  }
  if (!inc.commanderHex) {
    const lead = myRole === 'admin' || myRole === 'incident_commander';
    return {
      title: 'Assign an incident commander',
      detail: 'One person owns decisions, severity and phase changes. Everyone else knows who to ask.',
      action: lead ? 'take_command' : 'assign_commander',
      label: lead ? 'Take command' : 'Assign commander',
      permission: 'assign_commander',
      tone: 'warning',
    };
  }
  if (inc.phase === 'preparation') {
    return {
      title: 'Start Detection & Analysis',
      detail: 'Confirm what happened and which data is affected.',
      action: 'advance',
      label: 'Start detection & analysis',
      permission: 'manage_lifecycle',
      tone: 'accent',
    };
  }
  if (inc.phase === 'detection_analysis') {
    if (scope.length === 0) {
      return {
        title: 'Record what data is affected',
        detail: 'Add each affected data set: what it is, which system holds it, and what the attacker did to it.',
        action: 'add_scope',
        label: '+ Affected data',
        permission: 'edit_scope',
        tone: 'danger',
      };
    }
    if (unknown > 0) {
      return {
        title: `Assess ${plural(unknown, 'asset')} with unknown status`,
        detail: 'Decide for each one: accessed, exfiltrated, ransomware-locked, wiped, modified or already contained.',
        action: 'review_scope',
        label: 'Open scope register',
        permission: null,
        tone: 'warning',
      };
    }
    if (activeMembers < 2) {
      return {
        title: 'Bring in a responder',
        detail: 'You are working alone. Invite a responder with a one-time code read out in person or by phone.',
        action: 'invite',
        label: 'Invite responder',
        permission: 'invite',
        tone: 'warning',
      };
    }
    return {
      title: 'Start containment',
      detail: `Analysis is done: ${plural(scope.length, 'asset')} in scope. Move to Containment, Eradication & Recovery.`,
      action: 'advance',
      label: 'Start containment',
      permission: 'manage_lifecycle',
      tone: 'accent',
    };
  }
  if (inc.phase === 'containment_eradication_recovery') {
    if (inc.status === 'open') {
      return {
        title: 'Cut the attacker off, then mark the incident contained',
        detail: 'Isolate hosts, disable compromised accounts and block attacker infrastructure. Mark contained when access is gone.',
        action: 'contain',
        label: 'Mark contained',
        permission: 'manage_lifecycle',
        tone: 'danger',
      };
    }
    if (stillActive > 0) {
      return {
        title: `Recover ${plural(stillActive, 'affected asset')}`,
        detail: 'Move each asset to Contained or Restored in the scope register as the work completes.',
        action: 'review_scope',
        label: 'Open scope register',
        permission: null,
        tone: 'warning',
      };
    }
    return {
      title: 'Move to post-incident review',
      detail: 'Everything is contained or restored. Next: notifications, lessons learned and the final report.',
      action: 'advance',
      label: 'Start post-incident review',
      permission: 'manage_lifecycle',
      tone: 'accent',
    };
  }
  // post_incident
  if (!inc.lessonsLearned.trim()) {
    return {
      title: 'Write the lessons learned',
      detail: 'What worked, what did not, and what changes now. It goes into the post-incident report.',
      action: 'lessons',
      label: 'Write lessons learned',
      permission: 'edit_incident',
      tone: 'accent',
    };
  }
  if (openTasks > 0) {
    return {
      title: `Finish ${plural(openTasks, 'open task')}`,
      detail: 'Close out the remaining follow-ups before closing the incident.',
      action: 'tasks',
      label: 'Open tasks',
      permission: null,
      tone: 'warning',
    };
  }
  return {
    title: 'Close the incident',
    detail: 'All work is done. Closing freezes the record; an admin or commander can reopen it.',
    action: 'close',
    label: 'Close incident',
    permission: 'manage_lifecycle',
    tone: 'success',
  };
}

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export function phaseChecklist(phase: string, d: IncidentData, flags: { auditVerified: boolean; exported: boolean }): ChecklistItem[] {
  const { incident: inc, scope, tasks, messages, members } = d;
  const personal = scope.some((s) => DATA_CLASSES[s.dataClass]?.personal || s.dataClass === 'pci');
  switch (phase) {
    case 'preparation':
      return [
        { label: 'Response team has 2+ active members', done: members.filter((m) => m.status === 'active').length >= 2 },
        { label: 'Incident commander assigned', done: !!inc.commanderHex },
        { label: 'Out-of-band chat in use', done: messages.some((m) => m.kind === 'chat') },
        { label: 'Audit chain verified this session', done: flags.auditVerified },
      ];
    case 'detection_analysis':
      return [
        { label: 'Attack vector identified', done: inc.attackVector !== 'unknown' },
        { label: 'Affected data recorded in scope', done: scope.length > 0 },
        { label: 'Every asset assessed (none Unknown)', done: scope.length > 0 && scope.every((s) => s.status !== 'unknown') },
        { label: 'Indicators of compromise recorded', done: inc.iocs.length > 0 },
      ];
    case 'containment_eradication_recovery':
      return [
        { label: 'Incident marked contained', done: !!inc.containedAt },
        {
          label: 'All assets contained or restored',
          done: scope.length > 0 && scope.every((s) => !ACTIVE_SCOPE_STATUSES.includes(s.status)),
        },
        { label: 'Notification duties reviewed', done: !personal || scope.some((s) => s.notificationRequired) || !!inc.materialityAt },
      ];
    default:
      return [
        { label: 'Lessons learned written', done: inc.lessonsLearned.trim().length > 0 },
        { label: 'All tasks done', done: tasks.every((t) => t.status === 'done') },
        { label: 'Post-incident report exported', done: flags.exported },
        { label: 'Incident closed', done: inc.status === 'closed' },
      ];
  }
}
