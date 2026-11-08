/**
 * arrow-ir reducers: the isolated incident-response command center.
 *
 * Security model (all enforced here, server-side):
 *  - Identity: invite-only. The first admin is created with a one-time
 *    bootstrap code (owner sets its hash after publishing). After that,
 *    members join only by redeeming a one-time invite code whose SHA-256 hash
 *    an admin/commander registered. Codes are shared out-of-band.
 *  - Deny-by-default RBAC: every reducer resolves `ctx.sender` to an ACTIVE
 *    member and checks the permission matrix in `core.ts`.
 *  - Brute-force protection: 5 wrong codes lock an identity for 10 minutes;
 *    more than 30 wrong codes per minute server-wide pause redemption.
 *  - Revocation is immediate; lockdown freezes invites, joins and role changes.
 *  - Every reducer appends a hash-chained audit row (see `auditCanonical`).
 *  - Reads happen only through the member-gated views in `views.ts`.
 */
import { SenderError, t } from 'spacetimedb/server';
import spacetimedb from './schema';
import {
  activeAdmins,
  ATTACK_VECTORS,
  audit,
  CATEGORIES,
  CONFIDENCE,
  DATA_CLASSES,
  findMemberByHex,
  FUNCTIONAL_IMPACTS,
  GENESIS_HASH,
  hexHash,
  INCIDENT_STATUSES,
  INFORMATION_IMPACTS,
  INVITABLE_ROLES,
  isOwner,
  label,
  memberActor,
  MINUTE_MICROS,
  normalizeCode,
  nowMicros,
  oneOf,
  PERMISSIONS,
  PERSONAL_DATA_CLASSES,
  PHASES,
  RECOVERABILITY,
  requireIncident,
  requireMember,
  requireNoLockdown,
  requireOpenIncident,
  ROLE_LABELS,
  ROLES,
  SCOPE_STATUSES,
  senderActor,
  settings,
  SEVERITIES,
  sha256Hex,
  systemMessage,
  TEMPLATES,
  text,
  textList,
  timeline,
  touchIncident,
  tsPlus,
  type Actor,
  type Ctx,
  type Role,
} from './core';

export { default } from './schema';
export * from './views';

const MAX_FAILED_CODES = 5;
const LOCK_MICROS = 10n * MINUTE_MICROS;
const GLOBAL_FAIL_LIMIT = 30;
const MAX_OPEN_INVITES = 25;

const PHASE_LABELS: Record<string, string> = {
  preparation: 'Preparation',
  detection_analysis: 'Detection & Analysis',
  containment_eradication_recovery: 'Containment, Eradication & Recovery',
  post_incident: 'Post-Incident Activity',
};

const ScopeInput = t.object('ScopeInput', {
  asset: t.string(),
  system: t.string(),
  owner: t.string(),
  dataClass: t.string(),
  records: t.u64(),
  evidenceRef: t.string(),
  confidence: t.string(),
  status: t.string(),
  notificationRequired: t.bool(),
});

const TaskInput = t.object('TaskInput', {
  title: t.string(),
  phase: t.string(),
});

function can(role: string, permission: string) {
  return (PERMISSIONS[permission] ?? []).includes(role as Role);
}

function fmtCount(n: bigint) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ─────────────────────────────── Lifecycle ───────────────────────────────

export const init = spacetimedb.init((ctx) => {
  ctx.db.irSettings.insert({
    id: 1,
    ownerHex: ctx.sender.toHexString(),
    bootstrapHash: '',
    lockdown: false,
    lockdownByName: '',
    lockdownReason: '',
    lockdownAt: undefined,
    auditSeq: 0n,
    auditHead: GENESIS_HASH,
    incidentCounter: 0,
    failWindowStart: ctx.timestamp,
    failWindowCount: 0,
    createdAt: ctx.timestamp,
  });
  audit(ctx, senderActor(ctx, 'Database owner'), 'init', 'ir_settings', { note: 'arrow-ir initialised' });
});

/** Presence only (no audit row: connecting is not a state change to the incident record). */
export const onConnect = spacetimedb.clientConnected((ctx) => {
  const m = ctx.db.irMember.identity.find(ctx.sender);
  if (m && m.status === 'active') ctx.db.irMember.identity.update({ ...m, online: true, lastSeenAt: ctx.timestamp });
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const m = ctx.db.irMember.identity.find(ctx.sender);
  if (m && m.online) ctx.db.irMember.identity.update({ ...m, online: false, lastSeenAt: ctx.timestamp });
});

// ─────────────────────────────── Bootstrap & access ───────────────────────────────

/** Owner-only: register the SHA-256 hash of the one-time bootstrap code. */
export const setBootstrapCodeHash = spacetimedb.reducer({ codeHash: t.string() }, (ctx, { codeHash }) => {
  if (!isOwner(ctx)) throw new SenderError('Only the database owner can set the bootstrap code');
  if (ctx.db.irMember.count() > 0n) {
    throw new SenderError('This Control Tower already has members; bootstrap is closed. Use invites.');
  }
  const hash = hexHash(codeHash, 'codeHash');
  ctx.db.irSettings.id.update({ ...settings(ctx), bootstrapHash: hash });
  audit(ctx, senderActor(ctx, 'Database owner'), 'set_bootstrap_code_hash', 'ir_settings', {});
});

/** Throws if this identity (or the whole server) is temporarily locked out. */
function checkThrottle(ctx: Ctx) {
  const now = nowMicros(ctx);
  const a = ctx.db.irAccessAttempt.identity.find(ctx.sender);
  if (a?.lockedUntil && a.lockedUntil.microsSinceUnixEpoch > now) {
    const mins = Number((a.lockedUntil.microsSinceUnixEpoch - now) / MINUTE_MICROS) + 1;
    throw new SenderError(`Too many incorrect codes from this device. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }
  const s = settings(ctx);
  if (now - s.failWindowStart.microsSinceUnixEpoch < MINUTE_MICROS && s.failWindowCount >= GLOBAL_FAIL_LIMIT) {
    throw new SenderError('Too many incorrect codes on this server in the last minute. Wait a minute and try again.');
  }
}

/**
 * Records a wrong code WITHOUT throwing: a thrown error would roll back the
 * failure counter. The caller sees the outcome through the `my_access` view.
 */
function recordFailure(ctx: Ctx, claimedName: string, action: string) {
  const now = nowMicros(ctx);
  const a = ctx.db.irAccessAttempt.identity.find(ctx.sender);
  let failures = a?.failures ?? 0;
  if (a?.lastFailureAt && now - a.lastFailureAt.microsSinceUnixEpoch > LOCK_MICROS) failures = 0;
  failures += 1;
  let lockedUntil = a?.lockedUntil ?? undefined;
  const locked = failures >= MAX_FAILED_CODES;
  if (locked) {
    lockedUntil = tsPlus(ctx, LOCK_MICROS);
    failures = 0;
  }
  const row = {
    identity: ctx.sender,
    failures,
    lastFailureAt: ctx.timestamp,
    lockedUntil,
    lastResult: locked ? 'locked' : 'wrong_code',
  };
  if (a) ctx.db.irAccessAttempt.identity.update(row);
  else ctx.db.irAccessAttempt.insert(row);

  const s = settings(ctx);
  const inWindow = now - s.failWindowStart.microsSinceUnixEpoch < MINUTE_MICROS;
  ctx.db.irSettings.id.update({
    ...s,
    failWindowStart: inWindow ? s.failWindowStart : ctx.timestamp,
    failWindowCount: inWindow ? s.failWindowCount + 1 : 1,
  });
  audit(ctx, senderActor(ctx, claimedName), action, `identity:${ctx.sender.toHexString()}`, {
    attemptsLeft: locked ? 0 : MAX_FAILED_CODES - failures,
    lockedMinutes: locked ? 10 : 0,
  });
}

function clearFailures(ctx: Ctx) {
  if (ctx.db.irAccessAttempt.identity.find(ctx.sender)) ctx.db.irAccessAttempt.identity.delete(ctx.sender);
}

/** First admin: works once, only while the team has zero members. */
export const bootstrapAdmin = spacetimedb.reducer({ code: t.string(), name: t.string() }, (ctx, { code, name }) => {
  const cleanName = text(name, 'Name', 60);
  const raw = text(code, 'Code', 64);
  const s = settings(ctx);
  if (ctx.db.irMember.count() > 0n || !s.bootstrapHash) {
    throw new SenderError('Bootstrap is closed: this Control Tower already has an admin. Ask an admin for an invite code.');
  }
  checkThrottle(ctx);
  if (sha256Hex(normalizeCode(raw)) !== s.bootstrapHash) {
    recordFailure(ctx, cleanName, 'bootstrap_admin.failed');
    return;
  }
  const member = ctx.db.irMember.insert({
    identity: ctx.sender,
    name: cleanName,
    role: 'admin',
    status: 'active',
    addedByName: 'Bootstrap code',
    joinedAt: ctx.timestamp,
    lastSeenAt: ctx.timestamp,
    online: true,
    revokedAt: undefined,
    revokedByName: '',
  });
  ctx.db.irSettings.id.update({ ...settings(ctx), bootstrapHash: '' });
  clearFailures(ctx);
  audit(ctx, memberActor(member), 'bootstrap_admin', `member:${ctx.sender.toHexString()}`, { name: cleanName, role: 'admin' });
  systemMessage(ctx, 0n, `${cleanName} activated this Control Tower as its first admin. Membership is now invite-only.`);
});

/** Admin / commander: register an invite. Only the code's SHA-256 hash is sent. */
export const createInvite = spacetimedb.reducer(
  { codeHash: t.string(), role: t.string(), label: t.string(), ttlMinutes: t.u32() },
  (ctx, args) => {
    const me = requireMember(ctx, 'invite');
    requireNoLockdown(ctx, 'adding members');
    const role = oneOf(args.role, ROLES, 'role');
    if (!(INVITABLE_ROLES[me.role] ?? []).includes(role as Role)) {
      throw new SenderError(`Your role (${ROLE_LABELS[me.role]}) cannot grant the ${ROLE_LABELS[role]} role. Ask an admin.`);
    }
    const hash = hexHash(args.codeHash, 'Code hash');
    if (ctx.db.irInvite.codeHash.find(hash)) throw new SenderError('Code collision. Generate a new code.');
    const now = nowMicros(ctx);
    const open = [...ctx.db.irInvite.iter()].filter((i) => !i.cancelled && !i.usedAt && i.expiresAt.microsSinceUnixEpoch > now).length;
    if (open >= MAX_OPEN_INVITES) throw new SenderError('Too many open invites. Cancel unused ones first.');
    const ttl = Math.min(Math.max(args.ttlMinutes, 5), 1440);
    const inviteLabel = text(args.label, 'Label', 80, false);
    const invite = ctx.db.irInvite.insert({
      id: 0n,
      codeHash: hash,
      role,
      label: inviteLabel,
      createdAt: ctx.timestamp,
      expiresAt: tsPlus(ctx, BigInt(ttl) * MINUTE_MICROS),
      createdByName: me.name,
      createdByHex: me.identity.toHexString(),
      cancelled: false,
      usedByName: '',
      usedByHex: '',
      usedAt: undefined,
    });
    audit(ctx, memberActor(me), 'create_invite', `invite:${invite.id}`, { role, label: inviteLabel, ttlMinutes: ttl });
  }
);

export const cancelInvite = spacetimedb.reducer({ inviteId: t.u64() }, (ctx, { inviteId }) => {
  const me = requireMember(ctx, 'invite');
  const invite = ctx.db.irInvite.id.find(inviteId);
  if (!invite) throw new SenderError('Unknown invite');
  if (!(INVITABLE_ROLES[me.role] ?? []).includes(invite.role as Role)) {
    throw new SenderError('Only an admin can cancel this invite');
  }
  if (invite.usedAt) throw new SenderError('This invite was already used');
  if (invite.cancelled) throw new SenderError('This invite is already cancelled');
  ctx.db.irInvite.id.update({ ...invite, cancelled: true });
  audit(ctx, memberActor(me), 'cancel_invite', `invite:${invite.id}`, { role: invite.role, label: invite.label });
});

/** Anyone: redeem a one-time code. Binds the caller's Identity to a new member. */
export const redeemInvite = spacetimedb.reducer({ code: t.string(), name: t.string() }, (ctx, { code, name }) => {
  const cleanName = text(name, 'Name', 60);
  const raw = text(code, 'Code', 64);
  const existing = ctx.db.irMember.identity.find(ctx.sender);
  if (existing?.status === 'active') throw new SenderError('You are already a member of the incident response team.');
  if (existing?.status === 'revoked') {
    throw new SenderError('This device identity was revoked. Ask an admin for a new code and join from a fresh identity.');
  }
  requireNoLockdown(ctx, 'adding members');
  checkThrottle(ctx);
  const invite = ctx.db.irInvite.codeHash.find(sha256Hex(normalizeCode(raw)));
  if (!invite) {
    recordFailure(ctx, cleanName, 'redeem_invite.failed');
    return;
  }
  if (invite.cancelled) throw new SenderError('This code was cancelled by an admin. Ask for a new one.');
  if (invite.usedAt) throw new SenderError('This code was already used. Each code works once; ask for a new one.');
  if (invite.expiresAt.microsSinceUnixEpoch <= nowMicros(ctx)) {
    throw new SenderError('This code has expired. Ask for a new one.');
  }
  const row = {
    identity: ctx.sender,
    name: cleanName,
    role: invite.role,
    status: 'active',
    addedByName: invite.createdByName,
    joinedAt: ctx.timestamp,
    lastSeenAt: ctx.timestamp,
    online: true,
    revokedAt: undefined,
    revokedByName: '',
  };
  const member = existing ? ctx.db.irMember.identity.update(row) : ctx.db.irMember.insert(row);
  ctx.db.irInvite.id.update({ ...invite, usedByName: cleanName, usedByHex: ctx.sender.toHexString(), usedAt: ctx.timestamp });
  clearFailures(ctx);
  audit(ctx, memberActor(member), 'redeem_invite', `invite:${invite.id}`, { name: cleanName, role: invite.role });
  systemMessage(ctx, 0n, `${cleanName} joined as ${ROLE_LABELS[invite.role]} (invited by ${invite.createdByName}).`);
});

/** Admin: revoke a member. Their reducer calls fail and their views go empty at once. */
export const revokeMember = spacetimedb.reducer({ memberHex: t.string(), reason: t.string() }, (ctx, args) => {
  const me = requireMember(ctx, 'manage_members');
  const target = findMemberByHex(ctx, args.memberHex);
  if (target.identity.equals(me.identity)) throw new SenderError('You cannot revoke yourself. Ask another admin.');
  if (target.status === 'revoked') throw new SenderError(`${target.name} is already revoked`);
  const reason = text(args.reason, 'Reason', 300, false);
  ctx.db.irMember.identity.update({
    ...target,
    status: 'revoked',
    online: false,
    revokedAt: ctx.timestamp,
    revokedByName: me.name,
  });
  // Invites the revoked member issued and nobody used yet are cancelled too.
  const targetHex = target.identity.toHexString();
  for (const inv of [...ctx.db.irInvite.iter()]) {
    if (inv.createdByHex === targetHex && !inv.usedAt && !inv.cancelled) {
      ctx.db.irInvite.id.update({ ...inv, cancelled: true });
    }
  }
  audit(ctx, memberActor(me), 'revoke_member', `member:${targetHex}`, { name: target.name, role: target.role, reason });
  systemMessage(ctx, 0n, `${me.name} revoked ${target.name}'s access${reason ? `: ${reason}` : '.'}`);
});

export const setRole = spacetimedb.reducer({ memberHex: t.string(), role: t.string() }, (ctx, args) => {
  const me = requireMember(ctx, 'manage_members');
  requireNoLockdown(ctx, 'changing roles');
  const role = oneOf(args.role, ROLES, 'role');
  const target = findMemberByHex(ctx, args.memberHex);
  if (target.status !== 'active') throw new SenderError(`${target.name} is not an active member`);
  if (target.role === role) throw new SenderError(`${target.name} is already ${ROLE_LABELS[role]}`);
  if (target.role === 'admin' && activeAdmins(ctx).length <= 1) {
    throw new SenderError('This is the last admin. Make someone else an admin first.');
  }
  ctx.db.irMember.identity.update({ ...target, role });
  audit(ctx, memberActor(me), 'set_role', `member:${target.identity.toHexString()}`, {
    name: target.name,
    from: target.role,
    to: role,
  });
  systemMessage(ctx, 0n, `${me.name} changed ${target.name}'s role: ${ROLE_LABELS[target.role]} → ${ROLE_LABELS[role]}.`);
});

/** Admin: freeze (or unfreeze) membership changes. Revocation stays available. */
export const setLockdown = spacetimedb.reducer({ enabled: t.bool(), reason: t.string() }, (ctx, args) => {
  const me = requireMember(ctx, 'lockdown');
  const s = settings(ctx);
  if (s.lockdown === args.enabled) throw new SenderError(args.enabled ? 'Lockdown is already on' : 'Lockdown is already off');
  const reason = text(args.reason, 'Reason', 300, false);
  ctx.db.irSettings.id.update({
    ...s,
    lockdown: args.enabled,
    lockdownByName: args.enabled ? me.name : '',
    lockdownReason: args.enabled ? reason : '',
    lockdownAt: args.enabled ? ctx.timestamp : undefined,
  });
  audit(ctx, memberActor(me), args.enabled ? 'lockdown_on' : 'lockdown_off', 'ir_settings', { reason });
  systemMessage(
    ctx,
    0n,
    args.enabled
      ? `${me.name} turned lockdown ON: no invites, new members or role changes until it is lifted.${reason ? ` Reason: ${reason}` : ''}`
      : `${me.name} lifted lockdown. Invites and role changes are allowed again.`
  );
});

// ─────────────────────────────── Incidents ───────────────────────────────

export const createIncident = spacetimedb.reducer(
  {
    title: t.string(),
    severity: t.string(),
    category: t.string(),
    attackVector: t.string(),
    functionalImpact: t.string(),
    informationImpact: t.string(),
    recoverability: t.string(),
    summary: t.string(),
    iocs: t.array(t.string()),
    detectedMinutesAgo: t.u32(),
    template: t.string(),
    linkedDisruptionId: t.u64(),
    opsDraftRef: t.string(),
    orgName: t.string(),
    affectedNodes: t.array(t.string()),
    scope: t.array(ScopeInput),
    tasks: t.array(TaskInput),
  },
  (ctx, args) => {
    const me = requireMember(ctx, 'create_incident');
    const actor = memberActor(me);
    const title = text(args.title, 'Title', 160);
    const severity = oneOf(args.severity, SEVERITIES, 'severity');
    const category = oneOf(args.category, CATEGORIES, 'category');
    const attackVector = oneOf(args.attackVector, ATTACK_VECTORS, 'attack vector');
    const functionalImpact = oneOf(args.functionalImpact, FUNCTIONAL_IMPACTS, 'functional impact');
    const informationImpact = oneOf(args.informationImpact, INFORMATION_IMPACTS, 'information impact');
    const recoverability = oneOf(args.recoverability, RECOVERABILITY, 'recoverability');
    const template = oneOf(args.template, TEMPLATES, 'template');
    const summary = text(args.summary, 'Summary', 4000, false);
    const iocs = textList(args.iocs, 'IOCs', 50, 300);
    const affectedNodes = textList(args.affectedNodes, 'affected nodes', 50, 120);
    const opsDraftRef = text(args.opsDraftRef, 'Draft reference', 60, false);
    const orgName = text(args.orgName, 'Organisation', 120, false);
    if (args.scope.length > 50) throw new SenderError('At most 50 scope rows per incident at creation');
    if (args.tasks.length > 30) throw new SenderError('At most 30 starter tasks');
    if (opsDraftRef) {
      const dup = [...ctx.db.incident.iter()].find((i) => i.opsDraftRef === opsDraftRef);
      if (dup) throw new SenderError(`This draft was already opened as ${dup.ref}`);
    }
    const scope = args.scope.map((s) => ({
      asset: text(s.asset, 'Asset', 160),
      system: text(s.system, 'System', 120, false),
      owner: text(s.owner, 'Owner', 80, false),
      dataClass: oneOf(s.dataClass, DATA_CLASSES, 'data class'),
      records: s.records,
      evidenceRef: text(s.evidenceRef, 'Evidence reference', 200, false),
      confidence: oneOf(s.confidence, CONFIDENCE, 'confidence'),
      status: oneOf(s.status, SCOPE_STATUSES, 'scope status'),
      notificationRequired: s.notificationRequired,
    }));
    const tasks = args.tasks.map((tk) => ({
      title: text(tk.title, 'Task', 200),
      phase: oneOf(tk.phase, PHASES, 'phase'),
    }));

    const s = settings(ctx);
    const n = s.incidentCounter + 1;
    ctx.db.irSettings.id.update({ ...s, incidentCounter: n });
    const year = new Date(Number(nowMicros(ctx) / 1000n)).getUTCFullYear();
    const ref = `IR-${year}-${String(n).padStart(3, '0')}`;
    const minutesAgo = BigInt(Math.min(args.detectedMinutesAgo, 60 * 24 * 30));
    const detectedAt = tsPlus(ctx, -minutesAgo * MINUTE_MICROS);
    const commands = me.role === 'admin' || me.role === 'incident_commander';
    const hasPersonalData = scope.some((r) => PERSONAL_DATA_CLASSES.includes(r.dataClass));

    const inc = ctx.db.incident.insert({
      id: 0n,
      ref,
      title,
      severity,
      phase: 'detection_analysis',
      status: 'open',
      category,
      attackVector,
      functionalImpact,
      informationImpact,
      recoverability,
      iocs,
      summary,
      lessonsLearned: '',
      template,
      detectedAt,
      reportedAt: ctx.timestamp,
      containedAt: undefined,
      closedAt: undefined,
      reporterName: me.name,
      reporterHex: actor.hex,
      commanderName: commands ? me.name : '',
      commanderHex: commands ? actor.hex : '',
      personalDataAwareAt: hasPersonalData ? ctx.timestamp : undefined,
      materialityAt: undefined,
      linkedDisruptionId: args.linkedDisruptionId,
      opsDraftRef,
      orgName,
      affectedNodes,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
      updatedByName: me.name,
    });

    timeline(
      ctx,
      inc,
      actor,
      'created',
      `${me.name} opened ${ref} — ${severity}, ${label(category)}${
        opsDraftRef ? `, from Arrow ops draft (disruption #${args.linkedDisruptionId})` : ''
      }. Phase: Detection & Analysis.${commands ? ` ${me.name} is incident commander.` : ' No commander assigned yet.'}`
    );
    for (const row of scope) {
      ctx.db.scopeItem.insert({
        id: 0n,
        incidentId: inc.id,
        ...row,
        createdAt: ctx.timestamp,
        updatedAt: ctx.timestamp,
        updatedByName: me.name,
      });
    }
    if (scope.length > 0) {
      timeline(
        ctx,
        inc,
        actor,
        'scope',
        `Scope register started with ${scope.length} affected data asset${scope.length === 1 ? '' : 's'}.`
      );
    }
    if (hasPersonalData) {
      timeline(ctx, inc, actor, 'field', 'Personal data (PII/PHI) is in scope: awareness time recorded for the GDPR 72-hour clock.');
    }
    for (const tk of tasks) {
      ctx.db.irTask.insert({
        id: 0n,
        incidentId: inc.id,
        title: tk.title,
        phase: tk.phase,
        assigneeHex: '',
        assigneeName: '',
        status: 'open',
        createdAt: ctx.timestamp,
        createdByName: me.name,
        completedAt: undefined,
        completedByName: '',
      });
    }
    audit(ctx, actor, 'create_incident', `incident:${ref}`, {
      title,
      severity,
      category,
      template,
      opsDraftRef,
      linkedDisruptionId: args.linkedDisruptionId,
      scopeRows: scope.length,
      tasks: tasks.length,
    });
    systemMessage(ctx, inc.id, `${ref} opened by ${me.name} (${severity}). Commander: ${commands ? me.name : 'unassigned'}.`);
  }
);

const EDITABLE_FIELDS: Record<string, { label: string; allowed?: readonly string[]; max?: number }> = {
  title: { label: 'Title', max: 160 },
  category: { label: 'Category', allowed: CATEGORIES },
  attackVector: { label: 'Attack vector', allowed: ATTACK_VECTORS },
  functionalImpact: { label: 'Functional impact', allowed: FUNCTIONAL_IMPACTS },
  informationImpact: { label: 'Information impact', allowed: INFORMATION_IMPACTS },
  recoverability: { label: 'Recoverability', allowed: RECOVERABILITY },
  summary: { label: 'Summary', max: 4000 },
  lessonsLearned: { label: 'Lessons learned', max: 8000 },
};

export const updateIncident = spacetimedb.reducer({ incidentId: t.u64(), field: t.string(), value: t.string() }, (ctx, args) => {
  const me = requireMember(ctx, 'edit_incident');
  const inc = requireOpenIncident(ctx, args.incidentId);
  const def = EDITABLE_FIELDS[args.field];
  if (!def) throw new SenderError('This field cannot be edited');
  const value = def.allowed
    ? oneOf(args.value, def.allowed, def.label.toLowerCase())
    : text(args.value, def.label, def.max ?? 200, args.field === 'title');
  const field = args.field as keyof typeof inc;
  const before = String(inc[field] ?? '');
  if (before === value) return;
  const next = touchIncident(ctx, { ...inc, [args.field]: value }, memberActor(me));
  const long = args.field === 'summary' || args.field === 'lessonsLearned';
  timeline(
    ctx,
    next,
    memberActor(me),
    'field',
    long ? `${me.name} updated the ${def.label.toLowerCase()}.` : `${def.label}: ${label(before) || '—'} → ${label(value)}`
  );
  audit(ctx, memberActor(me), 'update_incident', `incident:${inc.ref}`, {
    field: args.field,
    from: long ? `${before.length} chars` : before,
    to: long ? value.slice(0, 500) : value,
  });
});

export const setIocs = spacetimedb.reducer({ incidentId: t.u64(), iocs: t.array(t.string()) }, (ctx, args) => {
  const me = requireMember(ctx, 'edit_incident');
  const inc = requireOpenIncident(ctx, args.incidentId);
  const iocs = textList(args.iocs, 'IOCs', 50, 300);
  const added = iocs.filter((i) => !inc.iocs.includes(i));
  const removed = inc.iocs.filter((i) => !iocs.includes(i));
  if (added.length === 0 && removed.length === 0) return;
  const next = touchIncident(ctx, { ...inc, iocs }, memberActor(me));
  const parts = [
    added.length ? `added ${added.map((i) => `"${i}"`).join(', ')}` : '',
    removed.length ? `removed ${removed.map((i) => `"${i}"`).join(', ')}` : '',
  ].filter(Boolean);
  timeline(ctx, next, memberActor(me), 'field', `Indicators of compromise: ${parts.join('; ')}.`);
  audit(ctx, memberActor(me), 'set_iocs', `incident:${inc.ref}`, { added, removed });
});

function severityRank(sev: string) {
  return SEVERITIES.indexOf(sev); // 0 = SEV1 (most severe)
}

export const setSeverity = spacetimedb.reducer({ incidentId: t.u64(), severity: t.string(), reason: t.string() }, (ctx, args) => {
  const me = requireMember(ctx, 'escalate');
  const inc = requireOpenIncident(ctx, args.incidentId);
  const severity = oneOf(args.severity, SEVERITIES, 'severity');
  if (severity === inc.severity) throw new SenderError(`${inc.ref} is already ${severity}`);
  const raising = severityRank(severity) < severityRank(inc.severity);
  if (!raising && !can(me.role, 'set_severity')) {
    throw new SenderError('Only the incident commander or an admin can lower severity');
  }
  const reason = text(args.reason, 'Reason', 300, false);
  const next = touchIncident(ctx, { ...inc, severity }, memberActor(me));
  const verb = raising ? 'escalated' : 'lowered';
  timeline(
    ctx,
    next,
    memberActor(me),
    'severity',
    `${me.name} ${verb} severity ${inc.severity} → ${severity}${reason ? `: ${reason}` : '.'}`
  );
  audit(ctx, memberActor(me), 'set_severity', `incident:${inc.ref}`, { from: inc.severity, to: severity, reason });
  systemMessage(ctx, inc.id, `${me.name} ${verb} ${inc.ref} to ${severity}${reason ? `: ${reason}` : '.'}`);
});

function changePhase(ctx: Ctx, actor: Actor, incidentId: bigint, phase: string, note: string) {
  const inc = requireOpenIncident(ctx, incidentId);
  if (phase === inc.phase) throw new SenderError(`${inc.ref} is already in ${PHASE_LABELS[phase]}`);
  let next = { ...inc, phase };
  // Leaving containment for post-incident means the threat is contained.
  if (phase === 'post_incident' && inc.status === 'open') {
    next = { ...next, status: 'contained', containedAt: inc.containedAt ?? ctx.timestamp };
  }
  next = touchIncident(ctx, next, actor);
  timeline(
    ctx,
    next,
    actor,
    'phase',
    `${actor.name} moved ${inc.ref} to ${PHASE_LABELS[phase]} (from ${PHASE_LABELS[inc.phase]})${note ? `: ${note}` : '.'}${
      next.status !== inc.status ? ' Status set to Contained.' : ''
    }`
  );
  audit(ctx, actor, 'set_phase', `incident:${inc.ref}`, { from: inc.phase, to: phase, note });
  systemMessage(ctx, inc.id, `${inc.ref} is now in ${PHASE_LABELS[phase]}.`);
}

export const advancePhase = spacetimedb.reducer({ incidentId: t.u64(), note: t.string() }, (ctx, args) => {
  const me = requireMember(ctx, 'manage_lifecycle');
  const inc = requireOpenIncident(ctx, args.incidentId);
  const idx = PHASES.indexOf(inc.phase);
  if (idx < 0 || idx >= PHASES.length - 1) throw new SenderError(`${inc.ref} is already in the last phase`);
  changePhase(ctx, memberActor(me), inc.id, PHASES[idx + 1], text(args.note, 'Note', 500, false));
});

export const setPhase = spacetimedb.reducer({ incidentId: t.u64(), phase: t.string(), note: t.string() }, (ctx, args) => {
  const me = requireMember(ctx, 'manage_lifecycle');
  changePhase(ctx, memberActor(me), args.incidentId, oneOf(args.phase, PHASES, 'phase'), text(args.note, 'Note', 500, false));
});

export const setStatus = spacetimedb.reducer({ incidentId: t.u64(), status: t.string(), note: t.string() }, (ctx, args) => {
  const me = requireMember(ctx, 'manage_lifecycle');
  const inc = requireIncident(ctx, args.incidentId);
  const status = oneOf(args.status, INCIDENT_STATUSES, 'status');
  const note = text(args.note, 'Note', 500, false);
  if (status === inc.status) throw new SenderError(`${inc.ref} is already ${status}`);
  if (status === 'closed' && inc.phase !== 'post_incident') {
    throw new SenderError('Move the incident to Post-Incident Activity before closing it.');
  }
  let next = { ...inc, status };
  if (status === 'contained') next = { ...next, containedAt: inc.containedAt ?? ctx.timestamp };
  if (status === 'closed') next = { ...next, closedAt: ctx.timestamp, containedAt: inc.containedAt ?? ctx.timestamp };
  if (status === 'open') next = { ...next, closedAt: undefined };
  next = touchIncident(ctx, next, memberActor(me));
  const words: Record<string, string> = {
    contained: 'marked the incident Contained',
    closed: 'closed the incident',
    open: inc.status === 'closed' ? 'reopened the incident' : 'set the incident back to Open',
  };
  timeline(ctx, next, memberActor(me), 'status', `${me.name} ${words[status]}${note ? `: ${note}` : '.'}`);
  audit(ctx, memberActor(me), 'set_status', `incident:${inc.ref}`, { from: inc.status, to: status, note });
  systemMessage(ctx, inc.id, `${me.name} ${words[status]} (${inc.ref}).`);
});

export const assignCommander = spacetimedb.reducer({ incidentId: t.u64(), memberHex: t.string() }, (ctx, args) => {
  const me = requireMember(ctx, 'assign_commander');
  const inc = requireOpenIncident(ctx, args.incidentId);
  const target = findMemberByHex(ctx, args.memberHex);
  if (target.status !== 'active') throw new SenderError(`${target.name} is not an active member`);
  if (target.role !== 'admin' && target.role !== 'incident_commander') {
    throw new SenderError(`${target.name} must be an incident commander or admin to lead an incident`);
  }
  const hex = target.identity.toHexString();
  if (inc.commanderHex === hex) throw new SenderError(`${target.name} already commands ${inc.ref}`);
  const next = touchIncident(ctx, { ...inc, commanderHex: hex, commanderName: target.name }, memberActor(me));
  timeline(ctx, next, memberActor(me), 'commander', `Incident commander: ${inc.commanderName || 'unassigned'} → ${target.name}.`);
  audit(ctx, memberActor(me), 'assign_commander', `incident:${inc.ref}`, { from: inc.commanderName, to: target.name });
  systemMessage(ctx, inc.id, `${target.name} is now incident commander for ${inc.ref}.`);
});

/** Legal / commander: record (or withdraw) the materiality determination (SEC 8-K Item 1.05 clock). */
export const setMateriality = spacetimedb.reducer({ incidentId: t.u64(), determined: t.bool(), note: t.string() }, (ctx, args) => {
  const me = requireMember(ctx, 'materiality');
  const inc = requireOpenIncident(ctx, args.incidentId);
  const note = text(args.note, 'Note', 500, false);
  if (args.determined === !!inc.materialityAt) {
    throw new SenderError(args.determined ? 'Materiality is already recorded' : 'No materiality determination to withdraw');
  }
  const next = touchIncident(ctx, { ...inc, materialityAt: args.determined ? ctx.timestamp : undefined }, memberActor(me));
  timeline(
    ctx,
    next,
    memberActor(me),
    'materiality',
    args.determined
      ? `${me.name} recorded that the incident was determined material${note ? `: ${note}` : '.'} (SEC 8-K Item 1.05 clock, informational.)`
      : `${me.name} withdrew the materiality determination${note ? `: ${note}` : '.'}`
  );
  audit(ctx, memberActor(me), 'set_materiality', `incident:${inc.ref}`, { determined: args.determined, note });
});

// ─────────────────────────────── Scope register ───────────────────────────────

export const addScopeItem = spacetimedb.reducer(
  {
    incidentId: t.u64(),
    asset: t.string(),
    system: t.string(),
    owner: t.string(),
    dataClass: t.string(),
    records: t.u64(),
    evidenceRef: t.string(),
    confidence: t.string(),
    status: t.string(),
    notificationRequired: t.bool(),
  },
  (ctx, args) => {
    const me = requireMember(ctx, 'edit_scope');
    const inc = requireOpenIncident(ctx, args.incidentId);
    if ([...ctx.db.scopeItem.incidentId.filter(inc.id)].length >= 200) throw new SenderError('Scope register is full (200 rows)');
    const row = {
      id: 0n,
      incidentId: inc.id,
      asset: text(args.asset, 'Asset', 160),
      system: text(args.system, 'System', 120, false),
      owner: text(args.owner, 'Owner', 80, false),
      dataClass: oneOf(args.dataClass, DATA_CLASSES, 'data class'),
      records: args.records,
      evidenceRef: text(args.evidenceRef, 'Evidence reference', 200, false),
      confidence: oneOf(args.confidence, CONFIDENCE, 'confidence'),
      status: oneOf(args.status, SCOPE_STATUSES, 'scope status'),
      notificationRequired: args.notificationRequired,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
      updatedByName: me.name,
    };
    const inserted = ctx.db.scopeItem.insert(row);
    let next = inc;
    if (PERSONAL_DATA_CLASSES.includes(row.dataClass) && !inc.personalDataAwareAt) {
      next = { ...inc, personalDataAwareAt: ctx.timestamp };
    }
    next = touchIncident(ctx, next, memberActor(me));
    timeline(
      ctx,
      next,
      memberActor(me),
      'scope',
      `Added affected data "${row.asset}" (${row.dataClass.toUpperCase()}${row.records > 0n ? `, ~${fmtCount(row.records)} records` : ''}): ${label(
        row.status
      )}, ${row.confidence}.${row.notificationRequired ? ' Notification may be required.' : ''}${
        next.personalDataAwareAt && !inc.personalDataAwareAt ? ' GDPR 72-hour awareness clock started (informational).' : ''
      }`
    );
    audit(ctx, memberActor(me), 'add_scope_item', `scope:${inserted.id}`, {
      incident: inc.ref,
      asset: row.asset,
      dataClass: row.dataClass,
      records: row.records,
      status: row.status,
      confidence: row.confidence,
      notificationRequired: row.notificationRequired,
    });
  }
);

export const updateScopeStatus = spacetimedb.reducer(
  { scopeId: t.u64(), status: t.string(), confidence: t.string(), note: t.string() },
  (ctx, args) => {
    const me = requireMember(ctx, 'edit_scope');
    const item = ctx.db.scopeItem.id.find(args.scopeId);
    if (!item) throw new SenderError('Unknown scope row');
    const inc = requireOpenIncident(ctx, item.incidentId);
    const status = oneOf(args.status, SCOPE_STATUSES, 'scope status');
    const confidence = oneOf(args.confidence, CONFIDENCE, 'confidence');
    const note = text(args.note, 'Note', 300, false);
    if (status === item.status && confidence === item.confidence) return;
    ctx.db.scopeItem.id.update({ ...item, status, confidence, updatedAt: ctx.timestamp, updatedByName: me.name });
    const next = touchIncident(ctx, inc, memberActor(me));
    timeline(
      ctx,
      next,
      memberActor(me),
      'scope',
      `"${item.asset}": ${label(item.status)} (${item.confidence}) → ${label(status)} (${confidence})${note ? `. ${note}` : '.'}`
    );
    audit(ctx, memberActor(me), 'update_scope_status', `scope:${item.id}`, {
      incident: inc.ref,
      asset: item.asset,
      from: `${item.status}/${item.confidence}`,
      to: `${status}/${confidence}`,
      note,
    });
  }
);

export const setScopeNotification = spacetimedb.reducer({ scopeId: t.u64(), required: t.bool(), note: t.string() }, (ctx, args) => {
  const me = requireMember(ctx, 'scope_notification');
  const item = ctx.db.scopeItem.id.find(args.scopeId);
  if (!item) throw new SenderError('Unknown scope row');
  const inc = requireOpenIncident(ctx, item.incidentId);
  if (item.notificationRequired === args.required) return;
  const note = text(args.note, 'Note', 300, false);
  ctx.db.scopeItem.id.update({ ...item, notificationRequired: args.required, updatedAt: ctx.timestamp, updatedByName: me.name });
  const next = touchIncident(ctx, inc, memberActor(me));
  timeline(
    ctx,
    next,
    memberActor(me),
    'scope',
    `"${item.asset}": ${args.required ? 'flagged — notification may be required' : 'notification flag cleared'}${note ? `. ${note}` : '.'}`
  );
  audit(ctx, memberActor(me), 'set_scope_notification', `scope:${item.id}`, {
    incident: inc.ref,
    asset: item.asset,
    required: args.required,
    note,
  });
});

// ─────────────────────────────── Timeline, tasks, chat ───────────────────────────────

export const addTimelineNote = spacetimedb.reducer({ incidentId: t.u64(), text: t.string(), kind: t.string() }, (ctx, args) => {
  const me = requireMember(ctx, 'add_note');
  const inc = requireIncident(ctx, args.incidentId);
  const kind = oneOf(args.kind, ['note', 'handoff'], 'note kind');
  const body = text(args.text, 'Note', 4000);
  const next = touchIncident(ctx, inc, memberActor(me));
  timeline(ctx, next, memberActor(me), kind, body);
  audit(ctx, memberActor(me), kind === 'handoff' ? 'shift_handoff' : 'add_timeline_note', `incident:${inc.ref}`, {
    text: body.slice(0, 500),
  });
});

export const assignTask = spacetimedb.reducer(
  { incidentId: t.u64(), title: t.string(), assigneeHex: t.string(), phase: t.string() },
  (ctx, args) => {
    const me = requireMember(ctx, 'manage_tasks');
    const inc = requireOpenIncident(ctx, args.incidentId);
    const title = text(args.title, 'Task', 200);
    const phase = oneOf(args.phase, PHASES, 'phase');
    let assigneeHex = '';
    let assigneeName = '';
    if (args.assigneeHex.trim()) {
      const target = findMemberByHex(ctx, args.assigneeHex);
      if (target.status !== 'active') throw new SenderError(`${target.name} is not an active member`);
      if (target.role === 'executive_viewer') throw new SenderError('Executive viewers are read-only and cannot own tasks');
      assigneeHex = target.identity.toHexString();
      assigneeName = target.name;
    }
    if ([...ctx.db.irTask.incidentId.filter(inc.id)].length >= 200) throw new SenderError('Task list is full (200 tasks)');
    const task = ctx.db.irTask.insert({
      id: 0n,
      incidentId: inc.id,
      title,
      phase,
      assigneeHex,
      assigneeName,
      status: 'open',
      createdAt: ctx.timestamp,
      createdByName: me.name,
      completedAt: undefined,
      completedByName: '',
    });
    const next = touchIncident(ctx, inc, memberActor(me));
    timeline(ctx, next, memberActor(me), 'task', `Task added: "${title}"${assigneeName ? ` → ${assigneeName}` : ' (unassigned)'}.`);
    audit(ctx, memberActor(me), 'assign_task', `task:${task.id}`, { incident: inc.ref, title, assignee: assigneeName, phase });
  }
);

export const completeTask = spacetimedb.reducer({ taskId: t.u64(), note: t.string() }, (ctx, args) => {
  const me = requireMember(ctx, 'complete_task');
  const task = ctx.db.irTask.id.find(args.taskId);
  if (!task) throw new SenderError('Unknown task');
  if (task.status === 'done') throw new SenderError('This task is already done');
  const inc = requireOpenIncident(ctx, task.incidentId);
  const leads = me.role === 'admin' || me.role === 'incident_commander';
  if (!leads && task.assigneeHex && task.assigneeHex !== me.identity.toHexString()) {
    throw new SenderError(`Only ${task.assigneeName} or the incident commander can complete this task`);
  }
  const note = text(args.note, 'Note', 300, false);
  ctx.db.irTask.id.update({ ...task, status: 'done', completedAt: ctx.timestamp, completedByName: me.name });
  const next = touchIncident(ctx, inc, memberActor(me));
  timeline(ctx, next, memberActor(me), 'task', `Task done: "${task.title}"${note ? ` — ${note}` : ''}.`);
  audit(ctx, memberActor(me), 'complete_task', `task:${task.id}`, { incident: inc.ref, title: task.title, note });
});

/** Out-of-band chat. incidentId 0 is the team-wide channel. Part of the audit trail. */
export const sendMessage = spacetimedb.reducer({ incidentId: t.u64(), text: t.string() }, (ctx, args) => {
  const me = requireMember(ctx, 'chat');
  const body = text(args.text, 'Message', 2000);
  let target = 'channel:team';
  if (args.incidentId !== 0n) {
    const inc = requireIncident(ctx, args.incidentId);
    target = `incident:${inc.ref}`;
  }
  ctx.db.message.insert({
    id: 0n,
    incidentId: args.incidentId,
    ts: ctx.timestamp,
    senderHex: me.identity.toHexString(),
    senderName: me.name,
    senderRole: me.role,
    kind: 'chat',
    text: body,
  });
  audit(ctx, memberActor(me), 'send_message', target, { text: body });
});
