'use client';

/**
 * Branches and branch-to-branch messages/reports (Communications tab, and the reports panel on Analytics).
 *
 * Live mode: the `branch` and `branch_message` tables in arrow-ops, streamed by their own subscription so a server
 * that doesn't have them yet can't disturb the main one. Writes go through the add_branch / send_branch_message
 * reducers, and the sample branches are seeded once per workspace by seed_branches.
 *
 * Preview mode: if the published module has no branch tables yet, the same sample data runs in this browser only
 * (clearly labelled in the UI) until the module is republished.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { tables } from '@/module_bindings/ops';
import { useCurrentOrg, useMyProfile, useOps, useOpsRows } from './client';
import { BRANCH_SEED, type ReportMetrics } from './branch-seed';

export type { ReportMetrics };
export type CommsMode = 'offline' | 'loading' | 'live' | 'preview';
export type MessageKind = 'message' | 'report';

export interface BranchView {
  id: string;
  orgId: number;
  name: string;
  department: string;
  country: string;
  state: string;
  city: string;
  isHq: boolean;
  createdByName: string;
  createdAt: number;
}

export interface MessageView {
  id: string;
  orgId: number;
  fromBranchId: string;
  /** '0' = every branch. */
  toBranchId: string;
  kind: MessageKind;
  subject: string;
  body: string;
  metrics: ReportMetrics;
  sentByName: string;
  sentAt: number;
}

export interface NewBranch {
  department: string;
  country: string;
  state: string;
  city: string;
}

export interface NewMessage {
  fromBranchId: string;
  toBranchId: string;
  kind: MessageKind;
  subject: string;
  body: string;
  metrics?: ReportMetrics;
}

interface CommsApi {
  mode: CommsMode;
  branches: BranchView[];
  messages: MessageView[];
  /** Why the current viewer can't add branches or send, or null if they can. */
  blockedReason: string | null;
  addBranch(input: NewBranch): Promise<void>;
  sendMessage(input: NewMessage): Promise<void>;
}

const Context = createContext<CommsApi | null>(null);
const PREVIEW_KEY = 'arrow-comms-preview-v1';
const ALL_BRANCHES = '0';

const branchName = (department: string, city: string) => `${department} · ${city}`;
const tsMs = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n);

function parseMetrics(json: string): ReportMetrics {
  if (!json) return {};
  try {
    return JSON.parse(json) as ReportMetrics;
  } catch {
    return {};
  }
}

/** Only known report figures, as numbers. */
function cleanMetrics(metrics: ReportMetrics | undefined): ReportMetrics {
  const out: ReportMetrics = {};
  for (const key of ['onTimePct', 'inventoryDays', 'openIssues'] as const) {
    const v = metrics?.[key];
    if (v !== undefined && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

type PreviewData = Record<number, { branches: BranchView[]; messages: MessageView[] }>;

function seedPreview(orgId: number, slug: string): { branches: BranchView[]; messages: MessageView[] } {
  const seed = BRANCH_SEED[slug];
  if (!seed) return { branches: [], messages: [] };
  const now = Date.now();
  const ids = new Map<string, string>();
  const branches = seed.branches.map((b, i) => {
    const id = `p${orgId}-${i + 1}`;
    ids.set(b.key, id);
    return {
      id,
      orgId,
      name: branchName(b.department, b.city),
      department: b.department,
      country: b.country,
      state: b.state,
      city: b.city,
      isHq: !!b.isHq,
      createdByName: 'Arrow (sample data)',
      createdAt: now,
    };
  });
  const messages = seed.messages.flatMap((m, i) => {
    const from = ids.get(m.from);
    const to = m.to === '*' ? ALL_BRANCHES : ids.get(m.to);
    if (!from || !to) return [];
    return [
      {
        id: `p${orgId}-m${i + 1}`,
        orgId,
        fromBranchId: from,
        toBranchId: to,
        kind: m.kind,
        subject: m.subject,
        body: m.body,
        metrics: m.metrics ?? {},
        sentByName: 'Sample data',
        sentAt: now - m.minutesAgo * 60_000,
      },
    ];
  });
  return { branches, messages };
}

export function CommsProvider({ children }: { children: ReactNode }) {
  const { conn, status, hub } = useOps();
  const org = useCurrentOrg();
  const profile = useMyProfile();
  const orgId = org?.id;
  const [server, setServer] = useState<{ orgId: number; state: 'live' | 'missing' } | null>(null);
  const liveBranches = useOpsRows('branch');
  const liveMessages = useOpsRows('branchMessage');
  const [preview, setPreview] = useState<PreviewData>({});
  const seeded = useRef(new Set<number>());

  // Own subscription for the comms tables: if the server doesn't have them, only this one fails.
  useEffect(() => {
    if (!conn || status !== 'connected' || orgId === undefined) return;
    let active = true;
    const handle = conn
      .subscriptionBuilder()
      .onApplied(() => {
        if (!active) return;
        setServer({ orgId, state: 'live' });
        hub.bumpAll(['branch', 'branchMessage']);
      })
      .onError(() => {
        if (active) setServer({ orgId, state: 'missing' });
      })
      .subscribe([tables.branch.where((r) => r.orgId.eq(orgId)), tables.branchMessage.where((r) => r.orgId.eq(orgId))]);
    return () => {
      active = false;
      try {
        handle.unsubscribe();
      } catch {
        /* never applied (e.g. the tables are missing) */
      }
    };
  }, [conn, status, orgId, hub]);

  const serverState = server && server.orgId === orgId ? server.state : null;
  const mode: CommsMode =
    !org || status !== 'connected' ? 'offline' : serverState === 'live' ? 'live' : serverState === 'missing' ? 'preview' : 'loading';

  const live = useMemo(() => {
    if (orgId === undefined) return { branches: [], messages: [] };
    const branches: BranchView[] = liveBranches
      .filter((b) => b.orgId === orgId)
      .map((b) => ({
        id: String(b.id),
        orgId: b.orgId,
        name: b.name,
        department: b.department,
        country: b.country,
        state: b.state,
        city: b.city,
        isHq: b.isHq,
        createdByName: b.createdByName,
        createdAt: tsMs(b.createdAt),
      }));
    const messages: MessageView[] = liveMessages
      .filter((m) => m.orgId === orgId)
      .map((m) => ({
        id: String(m.id),
        orgId: m.orgId,
        fromBranchId: String(m.fromBranchId),
        toBranchId: String(m.toBranchId),
        kind: m.kind === 'report' ? 'report' : 'message',
        subject: m.subject,
        body: m.body,
        metrics: parseMetrics(m.metricsJson),
        sentByName: m.sentByName,
        sentAt: tsMs(m.sentAt),
      }));
    return { branches, messages };
  }, [liveBranches, liveMessages, orgId]);

  // Live: seed the sample branches once per workspace if it has none (the reducer is idempotent).
  useEffect(() => {
    if (mode !== 'live' || !conn || orgId === undefined || live.branches.length > 0 || seeded.current.has(orgId)) return;
    seeded.current.add(orgId);
    conn.reducers.seedBranches({ orgId }).catch(() => seeded.current.delete(orgId));
  }, [mode, conn, orgId, live.branches.length]);

  // Preview: load this browser's copy, seeding it from the sample data the first time.
  useEffect(() => {
    if (mode !== 'preview' || !org || preview[org.id]) return;
    let saved: PreviewData = {};
    try {
      saved = JSON.parse(localStorage.getItem(PREVIEW_KEY) ?? '{}') as PreviewData;
    } catch {
      saved = {};
    }
    setPreview((p) => ({ ...p, [org.id]: saved[org.id] ?? seedPreview(org.id, org.slug) }));
  }, [mode, org, preview]);

  useEffect(() => {
    if (Object.keys(preview).length === 0) return;
    try {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify(preview));
    } catch {
      /* storage unavailable: the preview lasts for this session */
    }
  }, [preview]);

  const data =
    mode === 'live'
      ? live
      : mode === 'preview' && orgId !== undefined
        ? (preview[orgId] ?? { branches: [], messages: [] })
        : { branches: [], messages: [] };

  const blockedReason =
    mode === 'offline' || mode === 'loading'
      ? 'Not connected to a workspace'
      : mode === 'live' && !profile
        ? 'Join the workspace first'
        : mode === 'live' && profile && profile.orgId !== orgId
          ? 'Switch your profile to this workspace to make changes'
          : null;

  const addBranch = useCallback(
    async (input: NewBranch) => {
      if (orgId === undefined) throw new Error('Not connected to a workspace');
      const clean = {
        department: input.department.trim(),
        country: input.country.trim(),
        state: input.state.trim(),
        city: input.city.trim(),
      };
      if (!clean.department || !clean.country || !clean.city) throw new Error('Department, country and city are required');
      if (mode === 'live' && conn) {
        await conn.reducers.addBranch({ orgId, ...clean });
        return;
      }
      const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
      const existing = preview[orgId]?.branches ?? [];
      if (existing.some((b) => same(b.department, clean.department) && same(b.city, clean.city) && same(b.country, clean.country))) {
        throw new Error('That branch already exists');
      }
      setPreview((p) => {
        const current = p[orgId] ?? { branches: [], messages: [] };
        const branch: BranchView = {
          id: `p${orgId}-${Date.now()}`,
          orgId,
          name: branchName(clean.department, clean.city),
          ...clean,
          isHq: false,
          createdByName: profile?.name ?? 'You',
          createdAt: Date.now(),
        };
        return { ...p, [orgId]: { ...current, branches: [...current.branches, branch] } };
      });
    },
    [mode, conn, orgId, profile, preview]
  );

  const sendMessage = useCallback(
    async (input: NewMessage) => {
      if (orgId === undefined) throw new Error('Not connected to a workspace');
      const subject = input.subject.trim();
      const body = input.body.trim();
      if (!subject || !body) throw new Error('Subject and message are required');
      if (input.fromBranchId === input.toBranchId) throw new Error('Pick a different branch to send to');
      const metrics = input.kind === 'report' ? cleanMetrics(input.metrics) : {};
      if (mode === 'live' && conn) {
        await conn.reducers.sendBranchMessage({
          orgId,
          fromBranchId: BigInt(input.fromBranchId),
          toBranchId: BigInt(input.toBranchId),
          kind: input.kind,
          subject,
          body,
          metricsJson: Object.keys(metrics).length ? JSON.stringify(metrics) : '',
        });
        return;
      }
      setPreview((p) => {
        const current = p[orgId] ?? { branches: [], messages: [] };
        const message: MessageView = {
          id: `p${orgId}-m${Date.now()}`,
          orgId,
          fromBranchId: input.fromBranchId,
          toBranchId: input.toBranchId,
          kind: input.kind,
          subject,
          body,
          metrics,
          sentByName: profile?.name ?? 'You',
          sentAt: Date.now(),
        };
        return { ...p, [orgId]: { ...current, messages: [...current.messages, message] } };
      });
    },
    [mode, conn, orgId, profile]
  );

  const value = useMemo<CommsApi>(
    () => ({ mode, branches: data.branches, messages: data.messages, blockedReason, addBranch, sendMessage }),
    [mode, data.branches, data.messages, blockedReason, addBranch, sendMessage]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useComms(): CommsApi {
  const value = useContext(Context);
  if (!value) throw new Error('useComms must be used inside CommsProvider');
  return value;
}

export { ALL_BRANCHES };
