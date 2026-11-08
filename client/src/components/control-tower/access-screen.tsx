'use client';

/**
 * The Control Tower's front door. Shown to anyone who is not an ACTIVE
 * incident-response member. It renders no incident data (the server would
 * not send any anyway): it explains the restriction, takes a one-time code
 * and reports wrong / expired / used codes, lockouts, revocation and lockdown.
 */
import { KeyRound, Lock, RefreshCw, ShieldCheck, ShieldX, Unplug, UserCheck, WifiOff } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage } from '@/components/ui/toast';
import { IR_DB, SPACETIME_URI } from '@/lib/spacetime/config';
import { useIr, useMyAccess } from '@/lib/ir/client';
import { formatDuration, tsMs, useNow } from './format';
import { Button, cx, ErrorNote, Field, inputClass, Modal, Spinner } from './ui';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 items-start justify-center overflow-y-auto bg-bg px-4 py-10 scroll-thin">
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}

function Header() {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="grid size-12 place-items-center rounded-xl border border-accent/40 bg-accent-soft text-accent">
        <ShieldCheck className="size-6" aria-hidden />
      </div>
      <div>
        <h1 className="font-display text-3xl tracking-wide text-fg uppercase">Cyber Control Tower</h1>
        <p className="text-sm text-muted">Incident response command center · isolated</p>
      </div>
    </div>
  );
}

export function ConnectingScreen() {
  return (
    <Shell>
      <Header />
      <div className="rounded-2xl border border-line bg-panel p-6">
        <Spinner label="Connecting to the isolated incident-response server…" />
      </div>
    </Shell>
  );
}

export function UnreachableScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <Shell>
      <Header />
      <div className="rounded-2xl border border-danger/40 bg-panel p-6" role="alert">
        <div className="flex items-start gap-3">
          <WifiOff className="mt-0.5 size-6 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-danger">IR server unreachable</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              The Control Tower runs on its own database (<span className="font-mono text-fg">{IR_DB}</span>), separate from Arrow
              operations. It is not answering at <span className="font-mono text-fg">{SPACETIME_URI}</span>.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              On an isolated network, check that the IR laptop is running <span className="font-mono text-fg">spacetime start</span> and
              that this device is on the same network. Retrying automatically.
            </p>
            {error && <p className="mt-2 font-mono text-xs text-faint">{error}</p>}
            <Button className="mt-4" icon={RefreshCw} onClick={onRetry}>
              Retry now
            </Button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

export function AccessScreen() {
  const { conn, identityHex, resetIdentity } = useIr();
  const access = useMyAccess();
  const now = useNow();
  const [mode, setMode] = useState<'invite' | 'bootstrap'>('invite');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!access) return <ConnectingScreen />;

  const effectiveMode = access.needsBootstrap ? mode : 'invite';
  const lockedMs = access.lockedUntil ? tsMs(access.lockedUntil) - now : 0;
  const locked = lockedMs > 0;
  const revoked = access.status === 'revoked';
  const blocked = revoked || access.lockdown || locked;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!conn || blocked) return;
    setBusy(true);
    setError(null);
    setChecked(false);
    try {
      if (effectiveMode === 'bootstrap') await conn.reducers.bootstrapAdmin({ code, name });
      else await conn.reducers.redeemInvite({ code, name });
      // A wrong code does not throw (so the failed attempt is counted); the
      // outcome arrives through my_access. Success swaps this screen out.
      setChecked(true);
      setCode('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const wrongCode = checked && access.status !== 'active' && (access.lastResult === 'wrong_code' || access.lastResult === 'locked');

  return (
    <Shell>
      <Header />

      <div className="rounded-2xl border border-line bg-panel p-6 shadow-panel">
        <h2 className="text-lg font-bold text-fg">Restricted to the incident response team</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
          <li className="flex gap-2">
            <Unplug className="mt-0.5 size-4 shrink-0 text-cyan" aria-hidden />
            <span>
              <b className="text-fg">Isolated from corporate accounts.</b> No company login, email or Slack. During an attack those may be
              compromised, so this room has its own members and its own server.
            </span>
          </li>
          <li className="flex gap-2">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-cyan" aria-hidden />
            <span>
              <b className="text-fg">Invite only.</b> Enter the one-time code your admin or incident commander gave you in person or by
              phone.
            </span>
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-cyan" aria-hidden />
            <span>
              <b className="text-fg">Everything is recorded</b> in a tamper-evident audit log, including failed codes.
            </span>
          </li>
        </ul>

        {revoked && (
          <div className="mt-5 rounded-xl border border-danger/40 bg-danger-soft p-4" role="alert">
            <p className="flex items-center gap-2 font-bold text-danger">
              <ShieldX className="size-5" aria-hidden /> Your access was revoked
            </p>
            <p className="mt-1 text-sm text-muted">
              An admin removed this device from the team. If that was a mistake, ask an admin for a new code. For safety, a revoked device
              identity can never rejoin: you will need to start over with a new one.
            </p>
            <Button className="mt-3" variant="secondary" icon={RefreshCw} onClick={() => setConfirmReset(true)}>
              Start over with a new device identity
            </Button>
          </div>
        )}

        {!revoked && access.lockdown && (
          <div className="mt-5 rounded-xl border border-warning/40 bg-warning-soft p-4" role="status">
            <p className="flex items-center gap-2 font-bold text-warning">
              <Lock className="size-5" aria-hidden /> Lockdown: no new members right now
            </p>
            <p className="mt-1 text-sm text-muted">
              An admin{access.lockdownByName ? ` (${access.lockdownByName})` : ''} froze membership changes
              {access.lockdownReason ? `: “${access.lockdownReason}”` : '.'} Codes cannot be redeemed until it is lifted.
            </p>
          </div>
        )}

        {!revoked && locked && (
          <div className="mt-5 rounded-xl border border-danger/40 bg-danger-soft p-4" role="alert">
            <p className="flex items-center gap-2 font-bold text-danger">
              <Lock className="size-5" aria-hidden /> Too many incorrect codes
            </p>
            <p className="mt-1 text-sm text-muted">
              This device is locked for <span className="font-mono text-fg">{formatDuration(lockedMs)}</span>. Check the code with the
              person who gave it to you.
            </p>
          </div>
        )}

        {!revoked && (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {access.needsBootstrap && (
              <div
                className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-panel-2 p-1"
                role="tablist"
                aria-label="How are you joining?"
              >
                {(
                  [
                    ['invite', 'I have an invite code'],
                    ['bootstrap', 'First-time setup'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={effectiveMode === key}
                    onClick={() => {
                      setMode(key);
                      setError(null);
                      setChecked(false);
                    }}
                    className={cx(
                      'h-10 rounded-lg text-sm font-semibold transition-colors',
                      effectiveMode === key ? 'bg-panel text-fg shadow-panel' : 'text-muted hover:text-fg'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {effectiveMode === 'bootstrap' && (
              <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-fg">
                This Control Tower has no members yet. Enter the one-time <b>bootstrap code</b> printed by{' '}
                <span className="font-mono">scripts/ir-bootstrap.mjs</span> to become its first admin. It works once.
              </p>
            )}
            <Field label="Your name (as teammates know you)">
              <input
                className={cx(inputClass, 'h-12 text-base')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoComplete="name"
                placeholder="e.g. Dana Ortiz"
                required
                disabled={blocked}
              />
            </Field>
            <Field
              label={effectiveMode === 'bootstrap' ? 'Bootstrap code' : 'One-time access code'}
              hint="Dashes, spaces and capital letters do not matter."
            >
              <input
                className={cx(inputClass, 'h-14 font-mono text-xl tracking-[0.2em] uppercase')}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={64}
                autoComplete="one-time-code"
                spellCheck={false}
                placeholder="XXXX-XXXX-XXXX"
                required
                disabled={blocked}
              />
            </Field>

            {wrongCode && !locked && (
              <p role="alert" className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
                That code did not match. {access.attemptsLeft} attempt{access.attemptsLeft === 1 ? '' : 's'} left before this device is
                locked for 10 minutes.
              </p>
            )}
            <ErrorNote message={error} />

            <Button type="submit" variant="primary" size="lg" className="w-full" icon={UserCheck} busy={busy} disabled={blocked || !conn}>
              {effectiveMode === 'bootstrap' ? 'Become the first admin' : 'Join the response team'}
            </Button>
          </form>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-faint">
        Device identity <span className="font-mono">{identityHex ? `${identityHex.slice(0, 8)}…${identityHex.slice(-6)}` : '—'}</span> ·
        server <span className="font-mono">{IR_DB}</span>
      </p>

      {confirmReset && (
        <Modal
          title="Start over with a new identity?"
          tone="warning"
          description="This browser forgets its revoked identity and connects as a brand-new one. You will need a fresh one-time code from an admin."
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
              <Button
                variant="warning"
                data-primary
                onClick={() => {
                  setConfirmReset(false);
                  resetIdentity();
                }}
              >
                Start over
              </Button>
            </>
          }
        />
      )}
    </Shell>
  );
}
