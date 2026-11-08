'use client';

/** Faces and short keys for the five Nemotron agents, shared by the roster and the direct agent chat. */
import clsx from 'clsx';
import Image from 'next/image';
import { AGENTS } from '@/lib/ops/agent';

/** Keys the worker understands in a "[[agents:…]]" prefix, in AGENTS (pipeline) order. */
export const AGENT_KEYS = ['analyst', 'planner', 'auditor', 'cyber', 'monitor'] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

const SHORT_NAMES: Record<AgentKey, string> = {
  analyst: 'Analyst',
  planner: 'Planner',
  auditor: 'Auditor',
  cyber: 'Cyber',
  monitor: 'Monitor',
};

export interface AgentProfile {
  key: AgentKey;
  name: string;
  short: string;
  role: string;
  avatar: string;
}

export const AGENT_PROFILES: AgentProfile[] = AGENTS.map((agent, i) => {
  const key = AGENT_KEYS[i];
  return { key, name: agent.name, short: SHORT_NAMES[key], role: agent.role, avatar: `/images/app/agents/${key}.jpg` };
});

const BY_NAME = new Map(AGENT_PROFILES.map((p) => [p.name, p]));

export function agentByName(name: string): AgentProfile | undefined {
  return BY_NAME.get(name);
}

/** Ring colour around an avatar; the caller always pairs it with a text label. */
export type AvatarTone = 'idle' | 'selected' | 'working' | 'success' | 'warning' | 'danger' | 'muted' | 'inverse';

const RING: Record<AvatarTone, string> = {
  idle: 'border-line-strong',
  inverse: 'border-white/70',
  selected: 'border-accent',
  working: 'border-accent',
  success: 'border-success',
  warning: 'border-warning',
  danger: 'border-danger',
  muted: 'border-line',
};

export function AgentAvatar({
  agent,
  size = 32,
  tone = 'idle',
  className,
}: {
  agent: AgentProfile;
  size?: number;
  tone?: AvatarTone;
  className?: string;
}) {
  return (
    <span
      className={clsx('relative inline-grid shrink-0 place-items-center rounded-full border-2 p-px', RING[tone], className)}
      style={{ width: size + 6, height: size + 6 }}
    >
      {tone === 'working' && <span className="absolute -inset-[3px] animate-soft-pulse rounded-full border-2 border-accent/60" aria-hidden />}
      <Image
        src={agent.avatar}
        alt=""
        width={size}
        height={size}
        className={clsx('rounded-full object-cover', tone === 'muted' && 'opacity-50 grayscale')}
        style={{ width: size, height: size }}
      />
    </span>
  );
}
