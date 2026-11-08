'use client';

import clsx from 'clsx';
import {
  Antenna,
  Bot,
  Check,
  ChevronDown,
  Globe2,
  LineChart,
  MapPinned,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useOps, useOpsRows, useMyProfile, useOrgSelection, useCurrentOrg } from '@/lib/ops/client';
import { PLAN_STYLE } from '@/lib/ops/status';
import { useTheme } from '@/lib/theme';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Dropdown } from '@/components/ui/primitives';
import { ArrowShotLink } from '@/components/transition/arrow-transition';
import { ArrowMark } from './ArrowMark';
import { SettingsMenu } from './SettingsMenu';
import { TopBarActionsTarget, TopBarTitleTarget } from './TopBarSlots';

/** Icon-only tabs; the name shows as a tooltip. The Control Tower stays last (Winstead track, demo step 5). */
const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/app', label: 'Silk Road', icon: Globe2 },
  { href: '/app/communications', label: 'Communications', icon: Wifi },
  { href: '/app/analytics', label: 'Analytics', icon: LineChart },
  { href: '/app/agents', label: 'Current AI Agents', icon: Bot },
  { href: '/app/feed', label: 'Live Feed', icon: Antenna },
  { href: '/app/conquest', label: 'Conquest GIS', icon: MapPinned },
  { href: '/app/control-tower', label: 'Control Tower', icon: ShieldCheck },
];

const ROLE_LABEL: Record<string, string> = {
  analyst: 'Supply-chain analyst',
  manager: 'Operations manager',
  executive: 'Executive',
};

export function TopBar() {
  const pathname = usePathname();
  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2.5 border-b border-line bg-elevated px-4 [&>*]:shrink-0">
      <ArrowShotLink
        href="/"
        direction="back"
        caption="Back to Arrow"
        className="flex items-center gap-2 pr-1 text-accent"
        aria-label="Arrow home"
      >
        <ArrowMark className="size-7" />
        <span className="text-lg font-extrabold tracking-tight text-fg">Arrow</span>
      </ArrowShotLink>

      <nav className="flex items-center gap-1.5" aria-label="Main">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/app' ? pathname === '/app' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'grid size-8 shrink-0 place-items-center rounded-lg border transition-colors',
                active
                  ? 'border-accent/40 bg-accent-soft text-accent'
                  : 'border-line bg-panel text-muted hover:bg-panel-hover hover:text-fg'
              )}
            >
              <Icon className="size-4" aria-hidden />
            </Link>
          );
        })}
      </nav>

      <div className="mx-1 h-7 w-px bg-line" />
      <TopBarTitleTarget className="min-w-0 flex-1 !shrink" />

      <TopBarActionsTarget className="flex items-center gap-2" />
      <OrgSwitcher />
      <SettingsMenu />
      <ThemeToggle />
      <UserMenu />
    </header>
  );
}

function OrgSwitcher() {
  const orgs = useOpsRows('org');
  const current = useCurrentOrg();
  const { setOrgId } = useOrgSelection();
  const { conn } = useOps();
  const profile = useMyProfile();
  const toast = useToast();
  const sorted = [...orgs].sort((a, b) => b.id - a.id);

  const choose = (id: number) => {
    setOrgId(id);
    if (conn && profile && profile.orgId !== id) {
      conn.reducers
        .switchOrg({ orgId: id })
        .catch((e) => toast({ title: 'Could not switch workspace', description: errorMessage(e), tone: 'error' }));
    }
  };

  return (
    <Dropdown
      width="w-80"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex h-8 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-[13px] font-semibold text-fg hover:bg-panel-hover"
        >
          {current ? (
            <>
              <PlanBadge plan={current.plan} />
              <span className="max-w-[120px] truncate whitespace-nowrap">{current.name}</span>
            </>
          ) : (
            <span className="text-muted">Loading workspace…</span>
          )}
          <ChevronDown className="size-3.5 text-faint" aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <div>
          <p className="px-2 pt-1 pb-2 text-[11px] font-bold tracking-wide text-faint uppercase">Workspace · all data simulated</p>
          {sorted.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => {
                choose(org.id);
                close();
              }}
              className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-panel-hover"
            >
              <PlanBadge plan={org.plan} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg">{org.name}</span>
                <span className="block text-xs text-muted">
                  {org.planLabel} · {org.scope} · {org.industry}
                </span>
              </span>
              {current?.id === org.id && <Check className="mt-0.5 size-4 text-accent" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  );
}

export function PlanBadge({ plan }: { plan: string }) {
  const style = PLAN_STYLE[plan] ?? PLAN_STYLE.bronze;
  return (
    <span className={clsx('rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide uppercase', style.className)}>
      {style.label}
    </span>
  );
}

/** Live-feed connection, shown as a dot on the avatar: faint green pulse when connected, red pulse when not. */
const LIVE_STATE = {
  connected: { label: 'Live feed connected', dot: 'live-dot-ok', text: 'text-success' },
  connecting: { label: 'Connecting to the live feed…', dot: 'live-dot-wait', text: 'text-muted' },
  reconnecting: { label: 'Live feed disconnected. Reconnecting…', dot: 'live-dot-down', text: 'text-danger' },
  error: { label: 'Live feed disconnected', dot: 'live-dot-down', text: 'text-danger' },
} as const;

function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const Icon = theme === 'dark' ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="grid size-8 place-items-center rounded-lg border border-line bg-panel text-muted hover:bg-panel-hover hover:text-fg"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

function UserMenu() {
  const profile = useMyProfile();
  const { identityHex, resetIdentity, status, error, retry } = useOps();
  const live = LIVE_STATE[status];
  const initials = profile?.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Dropdown
      width="w-72"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={`Account. ${live.label}`}
          title={live.label}
          className="relative grid size-8 place-items-center rounded-full bg-gradient-to-br from-accent to-violet text-xs font-bold text-white"
        >
          {initials || <UserRound className="size-4" aria-hidden />}
          <span className={clsx('live-dot', live.dot)} aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <div className="p-1.5">
          <p className="text-sm font-semibold text-fg">{profile?.name ?? 'Not joined yet'}</p>
          <p className="text-xs text-muted">{profile ? ROLE_LABEL[profile.role] : 'Join a workspace to take actions'}</p>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-2 py-1.5">
            <span className={clsx('live-dot live-dot-inline', live.dot)} aria-hidden />
            <span className={clsx('min-w-0 flex-1 truncate text-xs font-semibold', live.text)} title={error ?? live.label}>
              {live.label}
            </span>
            {status === 'error' && (
              <button
                type="button"
                onClick={retry}
                className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-accent hover:bg-panel-hover"
              >
                Retry
              </button>
            )}
          </div>
          <p className="mt-2 truncate font-mono text-[10px] text-faint" title={identityHex ?? ''}>
            Identity {identityHex ? `${identityHex.slice(0, 10)}…${identityHex.slice(-6)}` : '—'}
          </p>
          <button
            type="button"
            onClick={() => {
              resetIdentity();
              close();
            }}
            className="mt-3 w-full rounded-lg border border-line px-2 py-1.5 text-xs font-semibold text-muted hover:bg-panel-hover hover:text-fg"
          >
            Sign in as a different person
          </button>
        </div>
      )}
    </Dropdown>
  );
}
