'use client';

/** Members, invites and lockdown. Admins manage the team; commanders can invite responders. */
import { CircleDot, KeyRound, Lock, LockOpen, ShieldX, UserPlus, Users, UserX, Wifi, WifiOff } from 'lucide-react';
import { useIr, useIrRows, useIrStatus } from '@/lib/ir/client';
import { useCt } from './context';
import { formatDateTime, formatDuration, tsMs, useNow } from './format';
import { Button, EmptyState, Pill, SectionTitle, Select, StatusBadge } from './ui';
import { INVITABLE_ROLES, ROLE_META, ROLES, roleLabel, type StatusMeta } from './vocab';

const MEMBER_STATUS: Record<string, StatusMeta> = {
  online: { label: 'Online', tone: 'success', icon: Wifi },
  offline: { label: 'Offline', tone: 'muted', icon: WifiOff },
  revoked: { label: 'Revoked', tone: 'danger', icon: ShieldX },
};

export function TeamPanel() {
  const { conn } = useIr();
  const { me, can, run, openDialog } = useCt();
  const members = useIrRows('irMembers');
  const invites = useIrRows('irInvites');
  const status = useIrStatus();
  const now = useNow();
  const myHex = me.identity.toHexString();
  const isAdmin = can('manage_members');
  const lockdown = !!status?.lockdown;

  const roleOrder: readonly string[] = ROLES;
  const grantable: readonly string[] = INVITABLE_ROLES[me.role] ?? [];
  const sortedMembers = [...members].sort((a, b) =>
    a.status === b.status ? roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) : a.status === 'active' ? -1 : 1
  );
  const sortedInvites = [...invites].sort((a, b) => (a.createdAt.microsSinceUnixEpoch > b.createdAt.microsSinceUnixEpoch ? -1 : 1));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-wide text-fg uppercase">Team &amp; access</h1>
          <p className="text-sm text-muted">Invite-only. Independent of corporate SSO, email and Slack. Every change is audited.</p>
        </div>
        <div className="flex gap-2">
          {can('lockdown') && conn && (
            <Button
              variant={lockdown ? 'secondary' : 'warning'}
              icon={lockdown ? LockOpen : Lock}
              onClick={() =>
                openDialog({
                  kind: 'confirm',
                  title: lockdown ? 'Lift lockdown?' : 'Turn on lockdown?',
                  body: lockdown
                    ? 'Invites, new members and role changes will be allowed again.'
                    : 'Freezes membership: no new invites, no code redemptions and no role changes until lifted. Revoking access still works.',
                  confirmLabel: lockdown ? 'Lift lockdown' : 'Turn on lockdown',
                  tone: 'warning',
                  reasonLabel: lockdown ? undefined : 'Reason (shown to the team)',
                  onConfirm: (reason) => conn.reducers.setLockdown({ enabled: !lockdown, reason }),
                })
              }
            >
              {lockdown ? 'Lift lockdown' : 'Lockdown'}
            </Button>
          )}
          {can('invite') && (
            <Button variant="primary" icon={UserPlus} disabled={lockdown} onClick={() => openDialog({ kind: 'invite' })}>
              Invite responder
            </Button>
          )}
        </div>
      </div>

      {lockdown && (
        <p
          className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning"
          role="status"
        >
          <Lock className="size-4" aria-hidden /> Lockdown is on{status?.lockdownByName ? ` (by ${status.lockdownByName})` : ''}
          {status?.lockdownReason ? `: ${status.lockdownReason}` : ''}. Membership is frozen.
        </p>
      )}

      <section>
        <SectionTitle icon={Users}>Members ({members.filter((m) => m.status === 'active').length} active)</SectionTitle>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-panel-2 text-left text-[11px] font-bold tracking-wider text-muted uppercase">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Joined</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sortedMembers.map((m) => {
                const hex = m.identity.toHexString();
                const self = hex === myHex;
                const st = m.status === 'revoked' ? 'revoked' : m.online ? 'online' : 'offline';
                return (
                  <tr key={hex} className={m.status === 'revoked' ? 'opacity-60' : ''}>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-fg">
                        {m.name} {self && <span className="text-xs font-normal text-accent">(you)</span>}
                      </p>
                      <p className="font-mono text-[11px] text-faint" title={hex}>
                        {hex.slice(0, 10)}… · added by {m.addedByName}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      {isAdmin && !self && m.status === 'active' && !lockdown && conn ? (
                        <Select
                          ariaLabel={`Role of ${m.name}`}
                          className="h-9 w-48 text-xs"
                          value={m.role}
                          options={ROLES.map((r) => [r, ROLE_META[r].label] as [string, string])}
                          onChange={(role) =>
                            run(() => conn.reducers.setRole({ memberHex: hex, role }), `${m.name} is now ${roleLabel(role)}`)
                          }
                        />
                      ) : (
                        <Pill tone={ROLE_META[m.role]?.tone ?? 'muted'}>{roleLabel(m.role)}</Pill>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge meta={MEMBER_STATUS[st]} size="sm" />
                      {m.status === 'revoked' && m.revokedAt && (
                        <p className="mt-0.5 text-[11px] text-faint">
                          by {m.revokedByName} · {formatDateTime(tsMs(m.revokedAt))}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted">{formatDateTime(tsMs(m.joinedAt))}</td>
                    <td className="px-3 py-2.5 text-right">
                      {isAdmin && !self && m.status === 'active' && conn && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={UserX}
                          className="text-danger hover:text-danger"
                          onClick={() =>
                            openDialog({
                              kind: 'confirm',
                              title: `Revoke ${m.name}?`,
                              body: 'Their access ends immediately: every action they try is refused and incident data stops reaching their screen. This cannot be undone for this device.',
                              confirmLabel: 'Revoke access',
                              tone: 'danger',
                              reasonLabel: 'Reason (recorded in the audit log)',
                              onConfirm: (reason) => conn.reducers.revokeMember({ memberHex: hex, reason }),
                            })
                          }
                        >
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {can('invite') && (
        <section>
          <SectionTitle icon={KeyRound}>One-time invites</SectionTitle>
          {sortedInvites.length === 0 ? (
            <EmptyState icon={KeyRound} title="No invites yet">
              Codes are generated in your browser; the server keeps only a SHA-256 hash. Share them in person or by phone.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {sortedInvites.map((inv) => {
                const expires = tsMs(inv.expiresAt);
                const used = !!inv.usedAt;
                const meta: StatusMeta = used
                  ? { label: `Used by ${inv.usedByName}`, tone: 'success', icon: CircleDot }
                  : inv.cancelled
                    ? { label: 'Cancelled', tone: 'muted', icon: CircleDot }
                    : expires <= now
                      ? { label: 'Expired', tone: 'muted', icon: CircleDot }
                      : { label: `Open · expires in ${formatDuration(expires - now)}`, tone: 'warning', icon: CircleDot };
                const cancellable = !used && !inv.cancelled && expires > now && grantable.includes(inv.role);
                return (
                  <li key={String(inv.id)} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <Pill tone={ROLE_META[inv.role]?.tone ?? 'muted'}>{roleLabel(inv.role)}</Pill>
                    <span className="min-w-0 flex-1 text-sm text-fg">
                      {inv.label || 'No label'}
                      <span className="block text-[11px] text-faint">
                        created by {inv.createdByName} · {formatDateTime(tsMs(inv.createdAt))}
                      </span>
                    </span>
                    <StatusBadge meta={meta} size="sm" />
                    {cancellable && conn && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => run(() => conn.reducers.cancelInvite({ inviteId: inv.id }), 'Invite cancelled')}
                      >
                        Cancel
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-xl border border-line bg-panel p-4 text-sm text-muted">
        <SectionTitle>How access works</SectionTitle>
        <ul className="list-disc space-y-1 pl-5">
          <li>Every action is checked on the server against the caller’s role. Hiding a button is never the protection.</li>
          <li>Incident data is served only to active members. Revoked members stop receiving it instantly.</li>
          <li>Five wrong codes lock a device for 10 minutes; failed attempts are written to the audit log.</li>
          <li>
            Roles: {ROLES.map((r) => `${ROLE_META[r].label} (${ROLE_META[r].description.replace(/\.$/, '').toLowerCase()})`).join('; ')}.
          </li>
        </ul>
      </section>
    </div>
  );
}
