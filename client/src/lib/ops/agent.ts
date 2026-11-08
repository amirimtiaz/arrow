'use client';

/** Agent roster + service status helpers shared by the Silk Road and Ask Arrow UIs. */
import { useEffect, useMemo, useState } from 'react';
import { tsToMs } from '@/lib/format';
import { useOpsRows } from './client';

/** The Nemotron agents of one event-driven run, in pipeline order. */
export const AGENTS = [
  { name: 'Disruption Analyst', role: 'Plans and investigates impact and history', when: 'always' },
  { name: 'Recovery Planner', role: 'Scores options and proposes a response', when: 'always' },
  { name: 'Risk Auditor', role: 'Independently challenges the proposal', when: 'always' },
  { name: 'Cyber Triage', role: 'Drafts incidents for the Control Tower', when: 'cyber' },
  { name: 'Recovery Monitor', role: 'Verifies the outcome after approval', when: 'approved' },
] as const;

export type AgentServiceState = 'online' | 'not_configured' | 'error' | 'offline' | 'unknown';

export interface AgentService {
  state: AgentServiceState;
  model: string;
  message: string;
  tigerConnected: boolean;
}

/** Live status of the worker that runs the Nemotron agents (heartbeat every ~10 s). */
export function useAgentService(): AgentService {
  const rows = useOpsRows('agentService');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const row = rows[0];
    if (!row) {
      return { state: 'unknown', model: '', message: 'The agent service has not connected yet.', tigerConnected: false };
    }
    if (now - tsToMs(row.lastSeenAt) > 35_000) {
      return {
        state: 'offline',
        model: row.model,
        message: 'No heartbeat from the agent worker in the last 35 s.',
        tigerConnected: false,
      };
    }
    const state = row.status === 'ready' ? 'online' : row.status === 'not_configured' ? 'not_configured' : 'error';
    return { state, model: row.model, message: row.message, tigerConnected: row.tigerConnected };
  }, [rows, now]);
}

/** "nvidia/nemotron-3-super-120b-a12b" → "Nemotron 3 Super 120B". */
export function prettyModel(model: string): string {
  const id = model.split('/').pop() ?? model;
  if (!id) return 'Nemotron';
  return id
    .replace(/-a\d+b$/i, '')
    .split('-')
    .map((part) => (/^\d+b$/i.test(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}
