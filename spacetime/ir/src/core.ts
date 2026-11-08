/**
 * Shared helpers for arrow-ir: vocabulary, the permission matrix, input
 * validation, the hash-chained audit log and the incident timeline.
 */
import { Timestamp } from 'spacetimedb';
import { SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import spacetimedb from './schema';

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

// ─────────────────────────────── Vocabulary ───────────────────────────────

export const ROLES = ['admin', 'incident_commander', 'responder', 'legal_comms', 'executive_viewer'] as const;
export type Role = (typeof ROLES)[number];

/** NIST SP 800-61 incident-response lifecycle. */
export const PHASES = ['preparation', 'detection_analysis', 'containment_eradication_recovery', 'post_incident'];
export const SEVERITIES = ['SEV1', 'SEV2', 'SEV3', 'SEV4']; // SEV1 = most severe
export const INCIDENT_STATUSES = ['open', 'contained', 'closed'];
export const CATEGORIES = ['ransomware', 'data_exfiltration', 'bec_phishing', 'ddos', 'insider', 'supply_chain_compromise', 'other'];
/** CISA / US-CERT attack vector taxonomy. */
export const ATTACK_VECTORS = [
  'unknown',
  'attrition',
  'web',
  'email_phishing',
  'external_removable_media',
  'impersonation_spoofing',
  'improper_usage',
  'loss_theft_equipment',
  'other',
];
export const FUNCTIONAL_IMPACTS = ['none', 'low', 'medium', 'high'];
export const INFORMATION_IMPACTS = ['none', 'privacy_breach', 'proprietary_breach', 'integrity_loss'];
export const RECOVERABILITY = ['regular', 'supplemented', 'extended', 'not_recoverable'];
export const DATA_CLASSES = ['pii', 'phi', 'pci', 'credentials', 'ip_trade_secret', 'financial', 'operational'];
export const CONFIDENCE = ['suspected', 'confirmed'];
export const SCOPE_STATUSES = [
  'unknown',
  'accessed',
  'exfiltrated',
  'encrypted_ransomware',
  'destroyed_wiped',
  'integrity_modified',
  'contained',
  'restored',
];
export const TEMPLATES = ['blank', 'ransomware', 'exfiltration', 'bec', 'ops_draft'];
export const PERSONAL_DATA_CLASSES = ['pii', 'phi'];

// ─────────────────────────────── Permissions ───────────────────────────────

/**
 * Deny-by-default permission matrix. A reducer names the permission it needs;
 * any role not listed is refused. (The client mirrors this only to hide
 * buttons; the server is the enforcement point.)
 */
export const PERMISSIONS: Record<string, readonly Role[]> = {
  invite: ['admin', 'incident_commander'],
  manage_members: ['admin'], // revoke members, change roles
  lockdown: ['admin'],
  create_incident: ['admin', 'incident_commander', 'responder'],
  edit_incident: ['admin', 'incident_commander', 'responder'], // classification, IOCs, summary, lessons learned
  escalate: ['admin', 'incident_commander', 'responder'], // raise severity
  set_severity: ['admin', 'incident_commander'], // raise or lower
  manage_lifecycle: ['admin', 'incident_commander'], // phase, status (contain / close / reopen)
  assign_commander: ['admin', 'incident_commander'],
  materiality: ['admin', 'incident_commander', 'legal_comms'],
  edit_scope: ['admin', 'incident_commander', 'responder'],
  scope_notification: ['admin', 'incident_commander', 'responder', 'legal_comms'],
  add_note: ['admin', 'incident_commander', 'responder', 'legal_comms'],
  manage_tasks: ['admin', 'incident_commander', 'responder'],
  complete_task: ['admin', 'incident_commander', 'responder', 'legal_comms'],
  chat: ['admin', 'incident_commander', 'responder', 'legal_comms'],
};

/** Which roles each role may grant through an invite. */
export const INVITABLE_ROLES: Record<string, readonly Role[]> = {
  admin: ROLES,
  incident_commander: ['responder', 'legal_comms', 'executive_viewer'],
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  incident_commander: 'Incident commander',
  responder: 'Responder',
  legal_comms: 'Legal & comms',
  executive_viewer: 'Executive viewer',
};

// ─────────────────────────────── Access ───────────────────────────────

export function settings(ctx: Ctx) {
  const s = ctx.db.irSettings.id.find(1);
  if (!s) throw new SenderError('IR database is not initialised');
  return s;
}

/** The caller's member row, if they are an ACTIVE member; otherwise throws. */
export function requireMember(ctx: Ctx, permission?: string) {
  const m = ctx.db.irMember.identity.find(ctx.sender);
  if (!m) throw new SenderError('Access denied: you are not a member of the incident response team.');
  if (m.status === 'revoked') throw new SenderError('Access denied: your access was revoked by an admin.');
  if (m.status !== 'active') throw new SenderError('Access denied: your membership is not active.');
  if (permission !== undefined) {
    const allowed = PERMISSIONS[permission];
    if (!allowed || !allowed.includes(m.role as Role)) {
      throw new SenderError(`Access denied: the ${ROLE_LABELS[m.role] ?? m.role} role cannot do this.`);
    }
  }
  return m;
}

export function isOwner(ctx: Ctx) {
  return ctx.sender.toHexString() === settings(ctx).ownerHex;
}

export function requireNoLockdown(ctx: Ctx, what: string) {
  if (settings(ctx).lockdown) throw new SenderError(`Lockdown is on: ${what} is frozen until an admin lifts it.`);
}

export function activeAdmins(ctx: Ctx) {
  return [...ctx.db.irMember.iter()].filter((m) => m.status === 'active' && m.role === 'admin');
}

export function findMemberByHex(ctx: Ctx, hex: string) {
  const clean = hex.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(clean)) throw new SenderError('Member identity must be a 64-character hex string');
  const m = [...ctx.db.irMember.iter()].find((row) => row.identity.toHexString() === clean);
  if (!m) throw new SenderError('Unknown member');
  return m;
}

// ─────────────────────────────── Validation ───────────────────────────────

// Control characters other than tab / newline / carriage return.
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function text(value: string, label: string, max: number, required = true): string {
  const v = (value ?? '').trim();
  if (required && v.length === 0) throw new SenderError(`${label} is required`);
  if (v.length > max) throw new SenderError(`${label} must be at most ${max} characters`);
  if (CONTROL_CHARS.test(v)) throw new SenderError(`${label} contains invalid characters`);
  return v;
}

export function oneOf(value: string, allowed: readonly string[], label: string): string {
  if (!allowed.includes(value)) throw new SenderError(`Unknown ${label}: ${String(value).slice(0, 40)}`);
  return value;
}

export function textList(values: string[], label: string, maxItems: number, maxLen: number): string[] {
  if (values.length > maxItems) throw new SenderError(`At most ${maxItems} ${label}`);
  return values.map((v) => text(v, label, maxLen)).filter((v) => v.length > 0);
}

export function hexHash(value: string, label: string): string {
  const v = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(v)) throw new SenderError(`${label} must be a SHA-256 hex digest`);
  return v;
}

// ─────────────────────────────── Codes & hashing ───────────────────────────────

export function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input)));
}

/**
 * Canonical form of a one-time code before hashing: uppercase, letters and
 * digits only (so "abcd-efgh" and "ABCDEFGH" match), with the Crockford
 * look-alikes folded (O→0, I/L→1) because codes are read aloud. Codes use the
 * Crockford base32 alphabet, which never contains I, L, O or U. The browser
 * and `scripts/ir-bootstrap.mjs` apply the same rule before hashing.
 */
export function normalizeCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

// ─────────────────────────────── Time ───────────────────────────────

export const MINUTE_MICROS = 60_000_000n;

export function nowMicros(ctx: Ctx): bigint {
  return ctx.timestamp.microsSinceUnixEpoch;
}

export function tsPlus(ctx: Ctx, micros: bigint): Timestamp {
  return new Timestamp(ctx.timestamp.microsSinceUnixEpoch + micros);
}

// ─────────────────────────────── Audit chain ───────────────────────────────

export const GENESIS_HASH = '0'.repeat(64);

/**
 * CANONICAL AUDIT FORMAT (the browser's "Verify audit chain" re-computes it):
 *
 *   canonical = JSON.stringify([prevHash, String(seq), String(tsMicros),
 *                               actorHex, actorName, action, target, payload])
 *   hash      = lowercase hex SHA-256 of the UTF-8 bytes of `canonical`
 *
 * - seq starts at 1 and has no gaps; prevHash of seq 1 is 64 zeros.
 * - tsMicros is the row's timestamp in microseconds since the Unix epoch.
 * - payload is a JSON string stored verbatim (hashed as stored).
 * A JSON array is used instead of a delimiter so no field value can shift
 * into its neighbour, and every column of the row is covered by the hash.
 */
export function auditCanonical(r: {
  prevHash: string;
  seq: bigint;
  tsMicros: bigint;
  actorHex: string;
  actorName: string;
  action: string;
  target: string;
  payload: string;
}): string {
  return JSON.stringify([r.prevHash, r.seq.toString(), r.tsMicros.toString(), r.actorHex, r.actorName, r.action, r.target, r.payload]);
}

export interface Actor {
  hex: string;
  name: string;
  role: string;
}

export function memberActor(m: { identity: { toHexString(): string }; name: string; role: string }): Actor {
  return { hex: m.identity.toHexString(), name: m.name, role: m.role };
}

export function senderActor(ctx: Ctx, name: string): Actor {
  return { hex: ctx.sender.toHexString(), name, role: '' };
}

/** Append one hash-chained audit row. Call it from every state-changing reducer. */
export function audit(ctx: Ctx, actor: Actor, action: string, target: string, payload: Record<string, unknown> = {}) {
  const s = settings(ctx);
  const seq = s.auditSeq + 1n;
  const prevHash = s.auditHead || GENESIS_HASH;
  const payloadText = JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  const row = {
    seq,
    ts: ctx.timestamp,
    actorHex: actor.hex,
    actorName: actor.name,
    action,
    target,
    payload: payloadText,
    prevHash,
    hash: '',
  };
  row.hash = sha256Hex(auditCanonical({ ...row, tsMicros: ctx.timestamp.microsSinceUnixEpoch }));
  ctx.db.auditLog.insert(row);
  ctx.db.irSettings.id.update({ ...s, auditSeq: seq, auditHead: row.hash });
}

// ─────────────────────────────── Incidents ───────────────────────────────

export function requireIncident(ctx: Ctx, incidentId: bigint) {
  const inc = ctx.db.incident.id.find(incidentId);
  if (!inc) throw new SenderError('Unknown incident');
  return inc;
}

export function requireOpenIncident(ctx: Ctx, incidentId: bigint) {
  const inc = requireIncident(ctx, incidentId);
  if (inc.status === 'closed') throw new SenderError(`${inc.ref} is closed. Reopen it to make changes.`);
  return inc;
}

type IncidentRow = ReturnType<typeof requireIncident>;

/** Append-only timeline entry (auto-timestamped and attributed). */
export function timeline(ctx: Ctx, inc: IncidentRow, actor: Actor, kind: string, body: string) {
  ctx.db.incidentEvent.insert({
    id: 0n,
    incidentId: inc.id,
    ts: ctx.timestamp,
    actorName: actor.name,
    actorRole: actor.role,
    actorHex: actor.hex,
    kind,
    phase: inc.phase,
    text: body.slice(0, 4000),
  });
}

/** Persist an incident change and stamp who/when. */
export function touchIncident(ctx: Ctx, inc: IncidentRow, actor: Actor) {
  const next = { ...inc, updatedAt: ctx.timestamp, updatedByName: actor.name };
  ctx.db.incident.id.update(next);
  return next;
}

export function systemMessage(ctx: Ctx, incidentId: bigint, body: string) {
  ctx.db.message.insert({
    id: 0n,
    incidentId,
    ts: ctx.timestamp,
    senderHex: '',
    senderName: 'Control Tower',
    senderRole: 'system',
    kind: 'system',
    text: body.slice(0, 2000),
  });
}

export function label(value: string): string {
  return value.replace(/_/g, ' ');
}
