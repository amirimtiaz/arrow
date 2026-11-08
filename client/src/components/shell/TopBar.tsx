'use client';

import clsx from 'clsx';
import { Check, ChevronDown, FlaskConical, Globe2, LineChart, Moon, Rss, ShieldCheck, Sun, UserRound, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useOps, useOpsRows, useMyProfile, useOrgSelection, useCurrentOrg } from '@/lib/ops/client';
import { PLAN_STYLE } from '@/lib/ops/status';
import { useTheme } from '@/lib/theme';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Dropdown } from '@/components/ui/primitives';
import { ArrowMark } from './ArrowMark';
import { TopBarActionsTarget, TopBarTitleTarget } from './TopBarSlots';

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/app', label: 'Silk Road', icon: Globe2 },
  { href: '/app/control-tower', label: 'Control Tower', icon: ShieldCheck },
  { href: '/app/analytics', label: 'Analytics', icon: LineChart },
  { href: '/app/feed', label: 'Feed', icon: Rss },
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
      <Link href="/" className="flex items-center gap-2 pr-1 text-accent" aria-label="Arrow home">
        <ArrowMark className="size-7" />
        <span className="text-lg font-extrabold tracking-tight text-fg">Arrow</span>
      </Link>

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
                'flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
                active
                  ? 'border-accent/40 bg-accent-soft text-accent'
                  : 'border-line bg-panel text-muted hover:bg-panel-hover hover:text-fg'
              )}
            >
              <Icon className="size-4" aria-hidden />
              <span className={clsx(!active && 'hidden min-[1800px]:inline')}>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mx-1 h-7 w-px bg-line" />
      <TopBarTitleTarget className="min-w-0 flex-1 !shrink" />

      <TopBarActionsTarget className="flex items-center gap-2" />
      <span
        className="flex h-8 items-center gap-1.5 rounded-lg border border-warning/40 bg-warning-soft px-2.5 text-[11px] font-bold tracking-wide text-warning uppercase"
        title="All data in this demo is synthetic"
      >
        <FlaskConical className="size-3.5" aria-hidden />
        Simulated
      </span>
      <OrgSwitcher />
      <ConnectionChip />
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
          <p className="px-2 pt-1 pb-2 text-[11px] font-bold tracking-wide text-faint uppercase">Workspace</p>
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

function ConnectionChip() {
  const { status, error, retry } = useOps();
  const state = {
    connected: { label: 'System running', className: 'border-success/40 bg-success-soft text-success', dot: 'bg-success' },
    connecting: { label: 'Connecting', className: 'border-line bg-panel text-muted', dot: 'bg-faint animate-soft-pulse' },
    reconnecting: {
      label: 'Reconnecting',
      className: 'border-warning/40 bg-warning-soft text-warning',
      dot: 'bg-warning animate-soft-pulse',
    },
    error: { label: 'Offline', className: 'border-danger/40 bg-danger-soft text-danger', dot: 'bg-danger' },
  }[status];

  return (
    <button
      type="button"
      onClick={status === 'error' ? retry : undefined}
      title={status === 'error' ? `${error ?? 'Disconnected'}. Click to retry.` : 'Live connection to SpacetimeDB'}
      className={clsx(
        'flex h-8 items-center gap-2 rounded-lg border px-2.5 text-[12px] font-bold',
        state.className,
        status !== 'error' && 'cursor-default'
      )}
    >
      <span className={clsx('size-2 rounded-full', state.dot)} aria-hidden />
      <span className="hidden whitespace-nowrap min-[1700px]:inline">{state.label}</span>
      <span className="sr-only min-[1700px]:hidden">{state.label}</span>
    </button>
  );
}

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
  const { identityHex, resetIdentity } = useOps();
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
          aria-label="Account"
          className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-accent to-violet text-xs font-bold text-white"
        >
          {initials || <UserRound className="size-4" aria-hidden />}
        </button>
      )}
    >
      {(close) => (
        <div className="p-1.5">
          <p className="text-sm font-semibold text-fg">{profile?.name ?? 'Not joined yet'}</p>
          <p className="text-xs text-muted">{profile ? ROLE_LABEL[profile.role] : 'Join a workspace to take actions'}</p>
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
