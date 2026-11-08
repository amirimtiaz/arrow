'use client';

import clsx from 'clsx';
import { BarChart3, Briefcase, ClipboardCheck, type LucideIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useCurrentOrg, useMyProfile, useOps } from '@/lib/ops/client';
import { Button, Dialog } from '@/components/ui/primitives';
import { errorMessage, useToast } from '@/components/ui/toast';

const ROLES: { value: string; label: string; detail: string; icon: LucideIcon }[] = [
  { value: 'analyst', label: 'Analyst', detail: 'Monitor lanes, run scenarios, ask Arrow, escalate updates.', icon: BarChart3 },
  {
    value: 'manager',
    label: 'Operations manager',
    detail: 'Everything analysts can do, plus approve or reject agent actions.',
    icon: ClipboardCheck,
  },
  { value: 'executive', label: 'Executive', detail: 'Read-only view of status, briefings and escalations.', icon: Briefcase },
];

/** First-visit onboarding: any employee joins with a name and role (no SSO). */
export function JoinWorkspaceDialog() {
  const { conn, status, ready } = useOps();
  const profile = useMyProfile();
  const org = useCurrentOrg();
  const toast = useToast();
  const [name, setName] = useState('');
  const [role, setRole] = useState('manager');
  const [busy, setBusy] = useState(false);

  const open = status === 'connected' && ready && !profile && !!org;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!conn || !org) return;
    setBusy(true);
    try {
      await conn.reducers.joinWorkspace({ name, role, orgId: org.id });
      toast({ title: `Welcome to ${org.name}`, description: 'You are viewing live, simulated operations.', tone: 'success' });
    } catch (err) {
      toast({ title: 'Could not join', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => undefined}
      dismissible={false}
      title="Join the Arrow workspace"
      description={
        <>
          Anyone in the company can view Arrow. Tell us who you are so actions in the feed are attributed. You are joining{' '}
          <strong className="text-fg">{org?.name}</strong>; switch workspaces any time from the top bar.
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-xs font-semibold text-muted">Your name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            placeholder="e.g. Jordan Lee"
            className="mt-1 h-11 w-full rounded-lg border border-line bg-panel-2 px-3 text-sm text-fg outline-none placeholder:text-faint focus:border-accent"
          />
        </label>
        <fieldset>
          <legend className="text-xs font-semibold text-muted">Your role</legend>
          <div className="mt-1 grid gap-2">
            {ROLES.map(({ value, label, detail, icon: Icon }) => (
              <label
                key={value}
                className={clsx(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                  role === value ? 'border-accent bg-accent-soft' : 'border-line hover:bg-panel-hover'
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={value}
                  checked={role === value}
                  onChange={() => setRole(value)}
                  className="sr-only"
                />
                <Icon className={clsx('mt-0.5 size-4', role === value ? 'text-accent' : 'text-muted')} aria-hidden />
                <span>
                  <span className="block text-sm font-semibold text-fg">{label}</span>
                  <span className="block text-xs text-muted">{detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!name.trim()}>
          Enter Arrow
        </Button>
      </form>
    </Dialog>
  );
}
