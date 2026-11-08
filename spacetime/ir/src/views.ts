/**
 * Read restriction for the Control Tower.
 *
 * All IR tables are private. These per-user views (keyed on `ctx.sender`)
 * are the ONLY way a client can read IR data, and each returns rows only when
 * the caller is an ACTIVE member. A non-member, an anonymous identity or a
 * revoked member gets empty results; revocation updates the member row, the
 * views re-evaluate and the rows are dropped from that client immediately.
 *
 * `my_access` is the one view a non-member can read: it only describes the
 * caller's own access state (for the access screen), never incident data.
 */
import { t, type InferSchema, type ViewCtx } from 'spacetimedb/server';
import spacetimedb, { auditLog, incident, incidentEvent, irMember, irTask, message, scopeItem } from './schema';

type VCtx = ViewCtx<InferSchema<typeof spacetimedb>>;

const MAX_FAILED_CODES = 5;

function activeMember(ctx: VCtx) {
  const m = ctx.db.irMember.identity.find(ctx.sender);
  return m && m.status === 'active' ? m : undefined;
}

const IrAccessStatus = t.row('IrAccessStatus', {
  identityHex: t.string(),
  /** none | active | revoked */
  status: t.string(),
  name: t.string(),
  role: t.string(),
  /** True only on a fresh install that is waiting for its first admin. */
  needsBootstrap: t.bool(),
  lockdown: t.bool(),
  lockdownByName: t.string(),
  lockdownReason: t.string(),
  attemptsLeft: t.u32(),
  lockedUntil: t.option(t.timestamp()),
  lastResult: t.string(),
});

export const myAccess = spacetimedb.view({ name: 'my_access', public: true }, t.option(IrAccessStatus), (ctx) => {
  const s = ctx.db.irSettings.id.find(1);
  const m = ctx.db.irMember.identity.find(ctx.sender);
  const attempt = ctx.db.irAccessAttempt.identity.find(ctx.sender);
  const anyMembers = ctx.db.irMember.count() > 0n;
  return {
    identityHex: ctx.sender.toHexString(),
    status: m ? (m.status === 'active' ? 'active' : m.status === 'revoked' ? 'revoked' : 'none') : 'none',
    name: m?.name ?? '',
    role: m?.role ?? '',
    needsBootstrap: !anyMembers && !!s && s.bootstrapHash !== '',
    lockdown: s?.lockdown ?? false,
    lockdownByName: s?.lockdown ? s.lockdownByName : '',
    lockdownReason: s?.lockdown ? s.lockdownReason : '',
    attemptsLeft: Math.max(0, MAX_FAILED_CODES - (attempt?.failures ?? 0)),
    lockedUntil: attempt?.lockedUntil ?? undefined,
    lastResult: attempt?.lastResult ?? '',
  };
});

export const irMembers = spacetimedb.view({ name: 'ir_members', public: true }, t.array(irMember.rowType), (ctx) =>
  activeMember(ctx) ? [...ctx.db.irMember.iter()] : []
);

/** Invite metadata for admins and commanders. Never exposes the code hash. */
const IrInviteInfo = t.row('IrInviteInfo', {
  id: t.u64().primaryKey(),
  role: t.string(),
  label: t.string(),
  createdAt: t.timestamp(),
  expiresAt: t.timestamp(),
  createdByName: t.string(),
  cancelled: t.bool(),
  usedByName: t.string(),
  usedAt: t.option(t.timestamp()),
});

export const irInvites = spacetimedb.view({ name: 'ir_invites', public: true }, t.array(IrInviteInfo), (ctx) => {
  const me = activeMember(ctx);
  if (!me || (me.role !== 'admin' && me.role !== 'incident_commander')) return [];
  return [...ctx.db.irInvite.iter()].map((i) => ({
    id: i.id,
    role: i.role,
    label: i.label,
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
    createdByName: i.createdByName,
    cancelled: i.cancelled,
    usedByName: i.usedByName,
    usedAt: i.usedAt,
  }));
});

/** Settings members need (lockdown banner, audit head). */
const IrStatusInfo = t.row('IrStatusInfo', {
  id: t.u32().primaryKey(),
  lockdown: t.bool(),
  lockdownByName: t.string(),
  lockdownReason: t.string(),
  lockdownAt: t.option(t.timestamp()),
  auditSeq: t.u64(),
  auditHead: t.string(),
});

export const irStatus = spacetimedb.view({ name: 'ir_status', public: true }, t.option(IrStatusInfo), (ctx) => {
  const s = ctx.db.irSettings.id.find(1);
  if (!s || !activeMember(ctx)) return undefined;
  return {
    id: 1,
    lockdown: s.lockdown,
    lockdownByName: s.lockdownByName,
    lockdownReason: s.lockdownReason,
    lockdownAt: s.lockdownAt,
    auditSeq: s.auditSeq,
    auditHead: s.auditHead,
  };
});

export const irIncidents = spacetimedb.view({ name: 'ir_incidents', public: true }, t.array(incident.rowType), (ctx) =>
  activeMember(ctx) ? [...ctx.db.incident.iter()] : []
);

export const irTimeline = spacetimedb.view({ name: 'ir_timeline', public: true }, t.array(incidentEvent.rowType), (ctx) =>
  activeMember(ctx) ? [...ctx.db.incidentEvent.iter()] : []
);

export const irScope = spacetimedb.view({ name: 'ir_scope', public: true }, t.array(scopeItem.rowType), (ctx) =>
  activeMember(ctx) ? [...ctx.db.scopeItem.iter()] : []
);

export const irTasks = spacetimedb.view({ name: 'ir_tasks', public: true }, t.array(irTask.rowType), (ctx) =>
  activeMember(ctx) ? [...ctx.db.irTask.iter()] : []
);

export const irMessages = spacetimedb.view({ name: 'ir_messages', public: true }, t.array(message.rowType), (ctx) =>
  activeMember(ctx) ? [...ctx.db.message.iter()] : []
);

export const irAudit = spacetimedb.view({ name: 'ir_audit', public: true }, t.array(auditLog.rowType), (ctx) =>
  activeMember(ctx) ? [...ctx.db.auditLog.iter()] : []
);
