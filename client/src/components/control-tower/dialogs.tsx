'use client';

/** Quick-add and confirmation dialogs. Each one is a single focused form. */
import { Check, Copy, KeyRound, Siren, StickyNote } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Incident } from '@/module_bindings/ir/types';
import { useIr, useIrRows, useIrStatus } from '@/lib/ir/client';
import { generateCode, hashCode } from '@/lib/ir/codes';
import { useCt, type DialogState } from './context';
import { formatDuration, useNow } from './format';
import { Button, cx, ErrorNote, Field, inputClass, Modal, Select, StatusBadge } from './ui';
import {
  DATA_CLASSES,
  INVITABLE_ROLES,
  PHASE_META,
  PHASES,
  ROLE_META,
  roleLabel,
  SCOPE_STATUS_META,
  SCOPE_STATUSES,
  SEVERITIES,
  SEVERITY_META,
} from './vocab';

type Close = () => void;

// ─────────────────────────────── Timeline note / handoff ───────────────────────────────

export function NoteDialog({
  incident,
  initial,
  handoff,
  onClose,
}: {
  incident: Incident;
  initial?: string;
  handoff?: boolean;
  onClose: Close;
}) {
  const { conn } = useIr();
  const { run } = useCt();
  const [text, setText] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!conn || !text.trim()) return;
    setBusy(true);
    const ok = await run(
      () => conn.reducers.addTimelineNote({ incidentId: incident.id, text, kind: handoff ? 'handoff' : 'note' }),
      handoff ? 'Shift handoff posted to the timeline' : 'Note added to the timeline'
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal
      title={handoff ? 'Post shift handoff' : '+ Timeline note'}
      description={`${incident.ref} · Notes are timestamped, attributed to you and cannot be edited or deleted.`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={handoff ? 'Handoff summary (edit before posting)' : 'What happened or what did you find?'}>
          <textarea
            className={cx(inputClass, 'min-h-36 leading-relaxed', handoff && 'font-mono text-xs')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
            placeholder="e.g. Confirmed WMS-APP-01..04 isolated from the VLAN at 14:20."
            required
            data-autofocus
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" icon={StickyNote} busy={busy} disabled={!text.trim()}>
            {handoff ? 'Post handoff' : 'Add note'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────── Affected data ───────────────────────────────

export function ScopeDialog({ incident, onClose }: { incident: Incident; onClose: Close }) {
  const { conn } = useIr();
  const { run } = useCt();
  const [asset, setAsset] = useState('');
  const [system, setSystem] = useState('');
  const [owner, setOwner] = useState('');
  const [dataClass, setDataClass] = useState('pii');
  const [records, setRecords] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [confidence, setConfidence] = useState('suspected');
  const [status, setStatus] = useState('unknown');
  const [notify, setNotify] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const suggestedNotify = DATA_CLASSES[dataClass]?.personal || dataClass === 'pci';
  const notification = notify ?? suggestedNotify;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!conn) return;
    const n = Math.max(0, Math.floor(Number(records.replace(/[,\s]/g, '')) || 0));
    setBusy(true);
    const ok = await run(
      () =>
        conn.reducers.addScopeItem({
          incidentId: incident.id,
          asset,
          system,
          owner,
          dataClass,
          records: BigInt(n),
          evidenceRef,
          confidence,
          status,
          notificationRequired: notification,
        }),
      `Added “${asset}” to the scope register`
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal
      title="+ Affected data"
      description={`${incident.ref} · One row per affected data asset. Everyone sees it live.`}
      onClose={onClose}
      width="max-w-2xl"
    >
      <form onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Field label="What data? (asset or dataset)" className="col-span-2">
          <input
            className={inputClass}
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            maxLength={160}
            required
            placeholder="e.g. Customer delivery addresses"
          />
        </Field>
        <Field label="System that holds it">
          <input
            className={inputClass}
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            maxLength={120}
            placeholder="e.g. 3PL manifest database"
          />
        </Field>
        <Field label="Data owner">
          <input
            className={inputClass}
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            maxLength={80}
            placeholder="e.g. Logistics IT"
          />
        </Field>
        <Field label="Data class">
          <Select
            value={dataClass}
            onChange={setDataClass}
            options={Object.entries(DATA_CLASSES).map(([k, v]) => [k, v.label] as [string, string])}
          />
        </Field>
        <Field label="Estimated records" hint="Leave empty if unknown.">
          <input
            className={inputClass}
            value={records}
            onChange={(e) => setRecords(e.target.value)}
            inputMode="numeric"
            placeholder="e.g. 48,200"
          />
        </Field>
        <Field label="What happened to it?" className="col-span-2">
          <div className="grid grid-cols-4 gap-2">
            {SCOPE_STATUSES.map((s) => {
              const meta = SCOPE_STATUS_META[s];
              const Icon = meta.icon;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  aria-pressed={status === s}
                  className={cx(
                    'flex h-11 items-center gap-1.5 rounded-lg border px-2 text-left text-xs font-semibold',
                    status === s ? 'border-accent bg-accent-soft text-fg' : 'border-line text-muted hover:bg-panel-hover'
                  )}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Confidence">
          <div className="grid grid-cols-2 gap-2">
            {['suspected', 'confirmed'].map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={confidence === c}
                onClick={() => setConfidence(c)}
                className={cx(
                  'h-10 rounded-lg border text-sm font-semibold capitalize',
                  confidence === c ? 'border-accent bg-accent-soft text-fg' : 'border-line text-muted hover:bg-panel-hover'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Evidence reference">
          <input
            className={inputClass}
            value={evidenceRef}
            onChange={(e) => setEvidenceRef(e.target.value)}
            maxLength={200}
            placeholder="e.g. EDR alert 4471, image HDD-03"
          />
        </Field>
        <label className="col-span-2 flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-panel-2 p-3">
          <input
            type="checkbox"
            className="mt-0.5 size-5 accent-[var(--warning)]"
            checked={notification}
            onChange={(e) => setNotify(e.target.checked)}
          />
          <span className="text-sm">
            <b className="text-fg">Notification may be required</b>
            <span className="block text-xs text-muted">
              {suggestedNotify ? 'Suggested for personal or card data. ' : ''}Legal decides; this flag puts it on their list.
            </span>
          </span>
        </label>
        <div className="col-span-2 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!asset.trim()}>
            Add to scope register
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────── Escalate severity ───────────────────────────────

export function EscalateDialog({ incident, onClose }: { incident: Incident; onClose: Close }) {
  const { conn } = useIr();
  const { run, can } = useCt();
  const currentIdx = SEVERITIES.indexOf(incident.severity as (typeof SEVERITIES)[number]);
  const [severity, setSeverity] = useState<string>(SEVERITIES[Math.max(0, currentIdx - 1)]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const canLower = can('set_severity');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!conn) return;
    setBusy(true);
    const ok = await run(
      () => conn.reducers.setSeverity({ incidentId: incident.id, severity, reason }),
      `${incident.ref} is now ${severity}`
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal
      title="Change severity"
      description={`${incident.ref} is ${SEVERITY_META[incident.severity]?.label}.`}
      onClose={onClose}
      tone="danger"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-2">
          {SEVERITIES.map((s, i) => {
            const allowed = s !== incident.severity && (i < currentIdx || canLower);
            const meta = SEVERITY_META[s];
            return (
              <button
                key={s}
                type="button"
                disabled={!allowed}
                aria-pressed={severity === s}
                onClick={() => setSeverity(s)}
                className={cx(
                  'flex items-center justify-between gap-3 rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-40',
                  severity === s ? 'border-accent bg-accent-soft' : 'border-line hover:bg-panel-hover'
                )}
              >
                <StatusBadge meta={meta} />
                <span className="flex-1 text-xs text-muted">{meta.hint}</span>
                {s === incident.severity && <span className="text-xs font-semibold text-faint">current</span>}
              </button>
            );
          })}
        </div>
        {!canLower && <p className="text-xs text-faint">Only the incident commander or an admin can lower severity.</p>}
        <Field label="Why? (shared with the team)">
          <input
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="e.g. PHI exfiltration confirmed"
            data-autofocus
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" icon={Siren} busy={busy} disabled={severity === incident.severity}>
            Set {severity}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────── Invite ───────────────────────────────

const TTL_OPTIONS: [string, string][] = [
  ['15', '15 minutes'],
  ['60', '1 hour'],
  ['480', '8 hours'],
  ['1440', '24 hours'],
];

export function InviteDialog({ initialRole, onClose }: { initialRole?: string; onClose: Close }) {
  const { conn } = useIr();
  const { me } = useCt();
  const status = useIrStatus();
  const now = useNow();
  const roles: readonly string[] = INVITABLE_ROLES[me.role] ?? [];
  const [role, setRole] = useState<string>(
    initialRole && roles.includes(initialRole) ? initialRole : roles.includes('responder') ? 'responder' : (roles[0] ?? 'responder')
  );
  const [label, setLabel] = useState('');
  const [ttl, setTtl] = useState('60');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ code: string; expiresAt: number; role: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (!conn) return;
    setBusy(true);
    setError(null);
    try {
      const code = generateCode();
      const codeHash = await hashCode(code);
      await conn.reducers.createInvite({ codeHash, role, label, ttlMinutes: Number(ttl) });
      setIssued({ code, expiresAt: Date.now() + Number(ttl) * 60_000, role, label });
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^SenderError:\s*/, '') : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (issued) {
    const left = issued.expiresAt - now;
    return (
      <Modal
        title="One-time code ready"
        description="Read it aloud or show it in person. It is shown only once: the server stored just its hash."
        onClose={onClose}
        footer={
          <Button variant="primary" onClick={onClose} data-primary>
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-accent/40 bg-accent-soft p-5 text-center">
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">
              {roleLabel(issued.role)}
              {issued.label ? ` · for ${issued.label}` : ''}
            </p>
            <p
              className="mt-2 font-mono text-4xl font-bold tracking-[0.18em] text-fg select-all"
              aria-label={`Code ${issued.code.split('').join(' ')}`}
            >
              {issued.code}
            </p>
            <p className={cx('mt-2 text-sm font-semibold', left > 0 ? 'text-muted' : 'text-danger')}>
              {left > 0 ? `Expires in ${formatDuration(left)} · works once` : 'Expired'}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs leading-relaxed text-muted">
              They open the Control Tower, type their name and this code. Their access starts immediately; you can revoke it anytime.
            </p>
            <Button icon={copied ? Check : Copy} onClick={copy}>
              {copied ? 'Copied' : 'Copy code'}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Invite to the response team"
      description="Codes are generated in your browser and shared out-of-band, never by corporate email or Slack."
      onClose={onClose}
    >
      {status?.lockdown ? (
        <p className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
          Lockdown is on. An admin must lift it before anyone new can join.
        </p>
      ) : (
        <form onSubmit={generate} className="space-y-4">
          <Field label="Role">
            <div className="grid gap-2">
              {roles.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={role === r}
                  onClick={() => setRole(r)}
                  className={cx(
                    'rounded-lg border p-3 text-left',
                    role === r ? 'border-accent bg-accent-soft' : 'border-line hover:bg-panel-hover'
                  )}
                >
                  <span className="block text-sm font-semibold text-fg">{ROLE_META[r].label}</span>
                  <span className="block text-xs text-muted">{ROLE_META[r].description}</span>
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Who is it for?">
              <input
                className={inputClass}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
                placeholder="e.g. Sam (night shift)"
                data-autofocus
              />
            </Field>
            <Field label="Code expires after">
              <Select value={ttl} onChange={setTtl} options={TTL_OPTIONS} />
            </Field>
          </div>
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" icon={KeyRound} busy={busy}>
              Generate one-time code
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ─────────────────────────────── Task ───────────────────────────────

export function TaskDialog({ incident, initialPhase, onClose }: { incident: Incident; initialPhase?: string; onClose: Close }) {
  const { conn } = useIr();
  const { run } = useCt();
  const members = useIrRows('irMembers').filter((m) => m.status === 'active' && m.role !== 'executive_viewer');
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [phase, setPhase] = useState(
    initialPhase && initialPhase !== 'preparation' ? initialPhase : incident.phase === 'preparation' ? 'detection_analysis' : incident.phase
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!conn) return;
    setBusy(true);
    const ok = await run(() => conn.reducers.assignTask({ incidentId: incident.id, title, assigneeHex: assignee, phase }), 'Task added');
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal title="Assign a task" description={incident.ref} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Task">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            placeholder="e.g. Rotate VPN service-account passwords"
            data-autofocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Owner">
            <Select
              value={assignee}
              onChange={setAssignee}
              options={[
                ['', 'Unassigned'],
                ...members.map((m) => [m.identity.toHexString(), `${m.name} (${roleLabel(m.role)})`] as [string, string]),
              ]}
            />
          </Field>
          <Field label="Phase">
            <Select
              value={phase}
              onChange={setPhase}
              options={PHASES.filter((p) => p !== 'preparation').map((p) => [p, PHASE_META[p].label] as [string, string])}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!title.trim()}>
            Add task
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────── Commander ───────────────────────────────

export function CommanderDialog({ incident, onClose }: { incident: Incident; onClose: Close }) {
  const { conn } = useIr();
  const { run } = useCt();
  const leads = useIrRows('irMembers').filter((m) => m.status === 'active' && (m.role === 'admin' || m.role === 'incident_commander'));
  const [busyHex, setBusyHex] = useState<string | null>(null);

  async function assign(hex: string, name: string) {
    if (!conn) return;
    setBusyHex(hex);
    const ok = await run(
      () => conn.reducers.assignCommander({ incidentId: incident.id, memberHex: hex }),
      `${name} now commands ${incident.ref}`
    );
    setBusyHex(null);
    if (ok) onClose();
  }

  return (
    <Modal title="Incident commander" description="Only incident commanders and admins can lead an incident." onClose={onClose}>
      <div className="grid gap-2">
        {leads.map((m) => {
          const hex = m.identity.toHexString();
          const current = hex === incident.commanderHex;
          return (
            <div key={hex} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
              <div>
                <p className="text-sm font-semibold text-fg">{m.name}</p>
                <p className="text-xs text-muted">{roleLabel(m.role)}</p>
              </div>
              {current ? (
                <span className="text-xs font-semibold text-success">Current commander</span>
              ) : (
                <Button size="sm" variant="primary" busy={busyHex === hex} onClick={() => assign(hex, m.name)}>
                  Make commander
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ─────────────────────────────── Confirm ───────────────────────────────

export function ConfirmDialog({ dialog, onClose }: { dialog: Extract<DialogState, { kind: 'confirm' }>; onClose: Close }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await dialog.onConfirm(reason);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^SenderError:\s*/, '') : String(err));
    } finally {
      setBusy(false);
    }
  }

  const variant = dialog.tone === 'danger' ? 'danger' : dialog.tone === 'warning' ? 'warning' : 'primary';
  return (
    <Modal
      title={dialog.title}
      description={dialog.body}
      tone={dialog.tone}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={variant} busy={busy} onClick={confirm} data-primary={dialog.reasonLabel ? undefined : true}>
            {dialog.confirmLabel}
          </Button>
        </>
      }
    >
      {(dialog.reasonLabel || error) && (
        <div className="space-y-3">
          {dialog.reasonLabel && (
            <Field label={dialog.reasonLabel}>
              <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} data-autofocus />
            </Field>
          )}
          <ErrorNote message={error} />
        </div>
      )}
    </Modal>
  );
}
