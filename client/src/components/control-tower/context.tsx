'use client';

/** Workspace-level state shared by the Control Tower panels. */
import { createContext, useContext } from 'react';
import type { IrMember } from '@/module_bindings/ir/types';
import type { ParsedDraft } from './drafts';
import type { Permission, Tone } from './vocab';

export type CenterView = 'incident' | 'team' | 'audit';
export type IncidentTab = 'scope' | 'timeline' | 'tasks' | 'details' | 'report';

export type DialogState =
  | { kind: 'note'; text?: string; handoff?: boolean }
  | { kind: 'scope' }
  | { kind: 'escalate' }
  | { kind: 'invite'; role?: string }
  | { kind: 'newIncident'; draft?: ParsedDraft }
  | { kind: 'task'; phase?: string }
  | { kind: 'commander' }
  | { kind: 'palette' }
  | {
      kind: 'confirm';
      title: string;
      body: string;
      confirmLabel: string;
      tone: Tone;
      reasonLabel?: string;
      onConfirm: (reason: string) => Promise<unknown>;
    }
  | null;

export interface ControlTowerApi {
  me: IrMember;
  can: (permission: Permission) => boolean;
  selectedId: bigint | null;
  select: (id: bigint | null) => void;
  view: CenterView;
  setView: (view: CenterView) => void;
  tab: IncidentTab;
  setTab: (tab: IncidentTab) => void;
  openDialog: (dialog: DialogState) => void;
  focusChat: () => void;
  /** Runs a reducer call; shows a toast on failure (and on success when given). Resolves true on success. */
  run: (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;
  exportedRefs: ReadonlySet<string>;
  markExported: (ref: string) => void;
  auditVerified: boolean;
  setAuditVerified: (ok: boolean) => void;
}

export const ControlTowerContext = createContext<ControlTowerApi | null>(null);

export function useCt(): ControlTowerApi {
  const value = useContext(ControlTowerContext);
  if (!value) throw new Error('useCt must be used inside the Control Tower workspace');
  return value;
}
