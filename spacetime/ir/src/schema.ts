/**
 * arrow-ir schema: the isolated incident-response database behind the
 * Control Tower.
 *
 * EVERY TABLE IS PRIVATE. Clients never subscribe to these tables directly;
 * they read through the per-user views in `views.ts`, which return rows only
 * when the caller (`ctx.sender`) is an ACTIVE member. Revoking a member makes
 * every view return nothing for that identity, so their client stops
 * receiving IR data immediately. All writes go through role-checked reducers
 * in `index.ts`, and every reducer appends a hash-chained `audit_log` row.
 *
 * This database shares nothing with arrow-ops: no tables, no credentials, no
 * worker access. It can run on an isolated laptop or LAN (`spacetime start`).
 */
import { schema, table, t } from 'spacetimedb/server';

/** Singleton (id = 1): ownership, bootstrap, lockdown, audit-chain head, throttles. */
export const irSettings = table(
  { name: 'ir_settings' },
  {
    id: t.u32().primaryKey(),
    ownerHex: t.string(),
    /** SHA-256 hex of the one-time bootstrap code; '' once used or never set. */
    bootstrapHash: t.string(),
    lockdown: t.bool(),
    lockdownByName: t.string(),
    lockdownReason: t.string(),
    lockdownAt: t.option(t.timestamp()),
    /** Last appended audit row (seq and hash): the chain head. */
    auditSeq: t.u64(),
    auditHead: t.string(),
    incidentCounter: t.u32(),
    /** Server-wide failed-code throttle (fixed 60 s window). */
    failWindowStart: t.timestamp(),
    failWindowCount: t.u32(),
    createdAt: t.timestamp(),
  }
);

/** Incident-response team member. Created only by bootstrap or invite redemption. */
export const irMember = table(
  { name: 'ir_member' },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    role: t.string(), // admin | incident_commander | responder | legal_comms | executive_viewer
    status: t.string(), // invited | active | revoked (members are created active on redemption)
    addedByName: t.string(),
    joinedAt: t.timestamp(),
    lastSeenAt: t.timestamp(),
    online: t.bool(),
    revokedAt: t.option(t.timestamp()),
    revokedByName: t.string(),
  }
);

/**
 * One-time invite. Only the SHA-256 hex of the code is stored; the code
 * itself is generated in the admin's browser and shared out-of-band.
 */
export const irInvite = table(
  { name: 'ir_invite' },
  {
    id: t.u64().primaryKey().autoInc(),
    codeHash: t.string().unique(),
    role: t.string(),
    label: t.string(),
    createdAt: t.timestamp(),
    expiresAt: t.timestamp(),
    createdByName: t.string(),
    createdByHex: t.string(),
    cancelled: t.bool(),
    usedByName: t.string(),
    usedByHex: t.string(),
    usedAt: t.option(t.timestamp()),
  }
);

/** Per-identity failed-code tracking (brute-force protection). */
export const irAccessAttempt = table(
  { name: 'ir_access_attempt' },
  {
    identity: t.identity().primaryKey(),
    failures: t.u32(),
    lastFailureAt: t.option(t.timestamp()),
    lockedUntil: t.option(t.timestamp()),
    lastResult: t.string(), // ok | wrong_code
  }
);

/** Incident record: NIST SP 800-61 lifecycle + CISA/US-CERT notification fields. */
export const incident = table(
  { name: 'incident' },
  {
    id: t.u64().primaryKey().autoInc(),
    ref: t.string().unique(), // IR-2026-001
    title: t.string(),
    severity: t.string(), // SEV1 (critical) .. SEV4 (low)
    phase: t.string(), // preparation | detection_analysis | containment_eradication_recovery | post_incident
    status: t.string(), // open | contained | closed
    category: t.string(),
    attackVector: t.string(),
    functionalImpact: t.string(),
    informationImpact: t.string(),
    recoverability: t.string(),
    iocs: t.array(t.string()),
    summary: t.string(),
    lessonsLearned: t.string(),
    template: t.string(),
    detectedAt: t.timestamp(),
    reportedAt: t.timestamp(),
    containedAt: t.option(t.timestamp()),
    closedAt: t.option(t.timestamp()),
    reporterName: t.string(),
    reporterHex: t.string(),
    commanderName: t.string(),
    commanderHex: t.string(),
    /** Informational regulatory clocks. */
    personalDataAwareAt: t.option(t.timestamp()),
    materialityAt: t.option(t.timestamp()),
    /** One-way ops → IR link (copied from a human-reviewed draft; no ops credentials). */
    linkedDisruptionId: t.u64(),
    opsDraftRef: t.string(),
    orgName: t.string(),
    affectedNodes: t.array(t.string()),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
    updatedByName: t.string(),
  }
);

/** Append-only timeline. Every change to an incident writes one row. */
export const incidentEvent = table(
  { name: 'incident_event' },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64().index('btree'),
    ts: t.timestamp(),
    actorName: t.string(),
    actorRole: t.string(),
    actorHex: t.string(),
    kind: t.string(), // created | note | phase | status | severity | field | scope | task | commander | materiality | handoff
    phase: t.string(),
    text: t.string(),
  }
);

/** Scope register: one row per affected data asset. */
export const scopeItem = table(
  { name: 'scope_item' },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64().index('btree'),
    asset: t.string(),
    system: t.string(),
    owner: t.string(),
    dataClass: t.string(), // pii | phi | pci | credentials | ip_trade_secret | financial | operational_ot
    records: t.u64(),
    evidenceRef: t.string(),
    confidence: t.string(), // suspected | confirmed
    status: t.string(), // unknown | accessed | exfiltrated | encrypted_ransomware | destroyed_wiped | integrity_modified | contained | restored
    notificationRequired: t.bool(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
    updatedByName: t.string(),
  }
);

export const irTask = table(
  { name: 'ir_task' },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64().index('btree'),
    title: t.string(),
    phase: t.string(),
    assigneeHex: t.string(),
    assigneeName: t.string(),
    status: t.string(), // open | done
    createdAt: t.timestamp(),
    createdByName: t.string(),
    completedAt: t.option(t.timestamp()),
    completedByName: t.string(),
  }
);

/** Out-of-band incident chat. incidentId 0 = team-wide channel. */
export const message = table(
  { name: 'message' },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64().index('btree'),
    ts: t.timestamp(),
    senderHex: t.string(),
    senderName: t.string(),
    senderRole: t.string(),
    kind: t.string(), // chat | system
    text: t.string(),
  }
);

/**
 * Tamper-evident audit log. `seq` is explicit and gap-free (not autoInc).
 * hash = SHA-256 hex of the canonical string defined in `core.ts`
 * (`auditCanonical`), which chains `prevHash`.
 */
export const auditLog = table(
  { name: 'audit_log' },
  {
    seq: t.u64().primaryKey(),
    ts: t.timestamp(),
    actorHex: t.string(),
    actorName: t.string(),
    action: t.string(),
    target: t.string(),
    payload: t.string(),
    prevHash: t.string(),
    hash: t.string(),
  }
);

const spacetimedb = schema({
  irSettings,
  irMember,
  irInvite,
  irAccessAttempt,
  incident,
  incidentEvent,
  scopeItem,
  irTask,
  message,
  auditLog,
});

export default spacetimedb;
