/**
 * arrow-ir security smoke test.
 *
 *   cd spacetime/ir && npm run smoke            (publishes a throwaway DB first)
 *   cd spacetime/ir && npm run smoke -- --no-publish
 *
 * Publishes the module to a SEPARATE throwaway database (default
 * `arrow-ir-smoke`, wiped each run) so the demo database `arrow-ir` is never
 * touched, then drives it with several fresh identities through the real
 * generated client bindings (WebSocket subscriptions + reducer calls) and the
 * HTTP SQL endpoint. Proves: non-members read nothing, bootstrap works once,
 * invite → redeem, wrong/used codes fail, brute-force lockout, RBAC denials,
 * revocation cuts live data and reducer access, lockdown, and that the audit
 * chain verifies and detects tampering.
 *
 * Env: SPACETIME_CLI, IR_SMOKE_DB (default arrow-ir-smoke),
 *      SPACETIME_HTTP (default http://127.0.0.1:3000), SPACETIME_SERVER (default local)
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DbConnection, tables } from '../client/src/module_bindings/ir';
import { auditCanonical, verifyAuditChain, type AuditRowLike } from '../client/src/lib/ir/audit-chain';
import { generateCode, normalizeCode } from '../client/src/lib/ir/codes';
import { sha256HexSync } from '../client/src/lib/ir/sha256';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.IR_SMOKE_DB ?? 'arrow-ir-smoke';
const HTTP = process.env.SPACETIME_HTTP ?? 'http://127.0.0.1:3000';
const WS = HTTP.replace(/^http/, 'ws');
const SERVER = process.env.SPACETIME_SERVER ?? 'local';

if (DB === 'arrow-ir' || DB === 'arrow-ops') {
  console.error(`Refusing to run the smoke test against "${DB}": it wipes the database.`);
  process.exit(2);
}

function findCli(): string {
  if (process.env.SPACETIME_CLI) return process.env.SPACETIME_CLI;
  const base = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'SpacetimeDB', 'bin') : '';
  if (base && existsSync(base)) {
    const versions = readdirSync(base)
      .filter((v) => /^\d+\.\d+\.\d+$/.test(v) && existsSync(join(base, v, 'spacetimedb-cli.exe')))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    if (versions.length) return join(base, versions[0], 'spacetimedb-cli.exe');
  }
  return 'spacetime';
}
const CLI = findCli();

function cli(args: string[]) {
  const r = spawnSync(CLI, args, { encoding: 'utf8', cwd: ROOT });
  if (r.error || r.status !== 0) throw new Error(`CLI ${args[0]} failed: ${r.error?.message ?? r.stderr}`);
  return r.stdout;
}

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

// ─────────────────────────────── Reporting ───────────────────────────────

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
async function expectReject(name: string, p: Promise<unknown>, includes: string) {
  try {
    await p;
    check(name, false, 'call succeeded but should have been rejected');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check(name, msg.includes(includes), `rejected: "${msg}"`);
  }
}
async function expectOk(name: string, p: Promise<unknown>) {
  try {
    await p;
    check(name, true);
  } catch (e) {
    check(name, false, `rejected: ${e instanceof Error ? e.message : String(e)}`);
  }
}
async function until(fn: () => boolean, ms = 4000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return fn();
}

// ─────────────────────────────── Clients ───────────────────────────────

const VIEWS = [
  tables.myAccess,
  tables.irStatus,
  tables.irMembers,
  tables.irInvites,
  tables.irIncidents,
  tables.irTimeline,
  tables.irScope,
  tables.irTasks,
  tables.irMessages,
  tables.irAudit,
];

interface Client {
  label: string;
  conn: DbConnection;
  hex: string;
  token: string;
}

function connect(label: string): Promise<Client> {
  return new Promise((resolvePromise, reject) => {
    DbConnection.builder()
      .withUri(WS)
      .withDatabaseName(DB)
      .onConnect((conn, identity, token) => {
        conn
          .subscriptionBuilder()
          .onApplied(() => resolvePromise({ label, conn, hex: identity.toHexString(), token }))
          .onError(() => reject(new Error(`${label}: subscription failed`)))
          .subscribe(VIEWS);
      })
      .onConnectError((_ctx, err) => reject(err))
      .build();
  });
}

const access = (c: Client) => [...c.conn.db.myAccess.iter()][0];
const count = (
  c: Client,
  view: 'irIncidents' | 'irAudit' | 'irMembers' | 'irMessages' | 'irScope' | 'irTimeline' | 'irTasks' | 'irInvites'
) => [...c.conn.db[view].iter()].length;

async function httpSql(token: string, sql: string) {
  const res = await fetch(`${HTTP}/v1/database/${DB}/sql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: sql,
  });
  return { status: res.status, body: await res.text() };
}

function blankIncident(title: string) {
  return {
    title,
    severity: 'SEV3',
    category: 'other',
    attackVector: 'unknown',
    functionalImpact: 'low',
    informationImpact: 'none',
    recoverability: 'regular',
    summary: '',
    iocs: [] as string[],
    detectedMinutesAgo: 0,
    template: 'blank',
    linkedDisruptionId: 0n,
    opsDraftRef: '',
    orgName: '',
    affectedNodes: [] as string[],
    scope: [],
    tasks: [],
  };
}

async function invite(by: Client, role: string, label: string) {
  const code = generateCode();
  await by.conn.reducers.createInvite({ codeHash: sha(normalizeCode(code)), role, label, ttlMinutes: 30 });
  return code;
}

// ─────────────────────────────── Run ───────────────────────────────

async function main() {
  console.log(`arrow-ir smoke test → database "${DB}" at ${HTTP} (CLI: ${CLI})\n`);
  if (!process.argv.includes('--no-publish')) {
    cli(['publish', DB, '--server', SERVER, '--module-path', 'spacetime/ir', '--delete-data=always', '--yes']);
    console.log(`Published spacetime/ir to throwaway database "${DB}" (data wiped).\n`);
  }

  const X = await connect('outsider');
  const A = await connect('admin');
  const C = await connect('commander');
  const R = await connect('responder');
  const V = await connect('viewer');

  console.log('── Read restriction (non-member) ──');
  check('outsider my_access says status=none', access(X)?.status === 'none');
  check('outsider sees 0 incidents / members / audit rows', count(X, 'irIncidents') + count(X, 'irMembers') + count(X, 'irAudit') === 0);
  for (const table of ['incident', 'audit_log', 'ir_member', 'ir_invite', 'message', 'scope_item']) {
    const r = await httpSql(X.token, `SELECT * FROM ${table}`);
    check(`outsider direct SQL on private table "${table}" is refused`, r.status >= 400, `HTTP ${r.status}: ${r.body.slice(0, 80)}`);
  }
  const auditViaView = await httpSql(X.token, 'SELECT * FROM ir_audit');
  check('outsider SQL on view ir_audit returns 0 rows', auditViaView.status === 200 && /"rows":\[\]/.test(auditViaView.body));

  console.log('\n── Bootstrap (first admin, once) ──');
  check('bootstrap not offered before the owner arms it', access(X)?.needsBootstrap === false);
  const bootstrapCode = generateCode(4, 4);
  cli(['call', DB, 'set_bootstrap_code_hash', JSON.stringify(sha(normalizeCode(bootstrapCode))), '--server', SERVER, '--yes']);
  check('owner armed bootstrap hash via CLI; non-member now sees needsBootstrap', await until(() => access(X)?.needsBootstrap === true));
  await expectOk(
    'wrong bootstrap code is recorded, not thrown',
    X.conn.reducers.bootstrapAdmin({ code: 'AAAA-BBBB-CCCC-DDDD', name: 'Mallory' })
  );
  check(
    '…outsider still not a member, 4 attempts left',
    access(X)?.status === 'none' && access(X)?.attemptsLeft === 4 && access(X)?.lastResult === 'wrong_code'
  );
  await expectOk(
    'admin bootstraps with the right code',
    A.conn.reducers.bootstrapAdmin({ code: bootstrapCode.toLowerCase(), name: 'Avery Admin' })
  );
  check('…admin is active with role admin', access(A)?.status === 'active' && access(A)?.role === 'admin');
  check('…admin can now read the audit log', await until(() => count(A, 'irAudit') > 0));
  await expectReject(
    'bootstrap code cannot be used twice',
    C.conn.reducers.bootstrapAdmin({ code: bootstrapCode, name: 'Eve' }),
    'Bootstrap is closed'
  );

  console.log('\n── Invites (hash only, one-time) ──');
  const cCode = await invite(A, 'incident_commander', 'Casey');
  await expectOk('commander redeems admin-issued invite', C.conn.reducers.redeemInvite({ code: cCode, name: 'Casey Commander' }));
  check('…commander is active incident_commander', access(C)?.status === 'active' && access(C)?.role === 'incident_commander');
  await expectReject('commander cannot invite an admin', invite(C, 'admin', 'nope'), 'cannot grant');
  const rCode = await invite(C, 'responder', 'Riley');
  const spaced = ` ${rCode.toLowerCase().replace(/-/g, ' ')} `;
  await expectOk(
    'responder redeems (lowercase, spaces normalised)',
    R.conn.reducers.redeemInvite({ code: spaced, name: 'Riley Responder' })
  );
  await expectReject('a used code cannot be reused', X.conn.reducers.redeemInvite({ code: rCode, name: 'Mallory' }), 'already used');
  check(
    'invite view never exposes code hashes',
    !JSON.stringify([...A.conn.db.irInvites.iter()], (_k, v) => (typeof v === 'bigint' ? String(v) : v)).includes(sha(normalizeCode(rCode)))
  );

  console.log('\n── Brute-force protection ──');
  for (let i = 0; i < 4; i++) await X.conn.reducers.redeemInvite({ code: `WRNG-${i}${i}${i}${i}-ZZZZ`, name: 'Mallory' });
  check('5th wrong code locks the identity', !!access(X)?.lockedUntil && access(X)?.lastResult === 'locked');
  const vCode = await invite(C, 'executive_viewer', 'Vic');
  await expectReject(
    'locked identity is refused even with a valid code',
    X.conn.reducers.redeemInvite({ code: vCode, name: 'Mallory' }),
    'Too many incorrect codes'
  );
  await expectOk('viewer redeems the same (still unused) code', V.conn.reducers.redeemInvite({ code: vCode, name: 'Vic Viewer' }));

  console.log('\n── Deny-by-default RBAC ──');
  await expectReject('non-member cannot create an incident', X.conn.reducers.createIncident(blankIncident('Fake')), 'not a member');
  await expectReject('non-member cannot chat', X.conn.reducers.sendMessage({ incidentId: 0n, text: 'hi' }), 'not a member');
  await expectReject(
    'executive viewer cannot chat (read-only)',
    V.conn.reducers.sendMessage({ incidentId: 0n, text: 'hi' }),
    'Access denied'
  );
  await expectReject('responder cannot set lockdown', R.conn.reducers.setLockdown({ enabled: true, reason: '' }), 'Access denied');
  await expectReject('responder cannot invite', invite(R, 'responder', 'x'), 'Access denied');
  await expectReject('commander cannot revoke members', C.conn.reducers.revokeMember({ memberHex: R.hex, reason: '' }), 'Access denied');

  console.log('\n── Incident lifecycle ──');
  await expectOk(
    'commander opens a ransomware incident with scope + tasks',
    C.conn.reducers.createIncident({
      title: 'Ransomware at Grand Prairie 3PL',
      severity: 'SEV2',
      category: 'ransomware',
      attackVector: 'email_phishing',
      functionalImpact: 'high',
      informationImpact: 'privacy_breach',
      recoverability: 'supplemented',
      summary: 'WMS encrypted; outbound frozen.',
      iocs: ['185.220.101.47:443'],
      detectedMinutesAgo: 42,
      template: 'ransomware',
      linkedDisruptionId: 7n,
      opsDraftRef: 'ops-proposal:99',
      orgName: 'Northstar Global Retail',
      affectedNodes: ['Grand Prairie DC'],
      scope: [
        {
          asset: 'WMS database',
          system: 'WMS',
          owner: 'IT',
          dataClass: 'operational',
          records: 0n,
          evidenceRef: '',
          confidence: 'confirmed',
          status: 'encrypted_ransomware',
          notificationRequired: false,
        },
        {
          asset: 'Customer addresses',
          system: 'Manifest DB',
          owner: 'Ops',
          dataClass: 'pii',
          records: 48200n,
          evidenceRef: 'EDR-1',
          confidence: 'suspected',
          status: 'exfiltrated',
          notificationRequired: true,
        },
      ],
      tasks: [{ title: 'Isolate WMS hosts', phase: 'detection_analysis' }],
    })
  );
  const incident = [...C.conn.db.irIncidents.iter()][0];
  check(
    '…incident has ref, SEV2, detection phase, commander, GDPR clock',
    !!incident &&
      /^IR-\d{4}-001$/.test(incident.ref) &&
      incident.phase === 'detection_analysis' &&
      incident.commanderName === 'Casey Commander' &&
      !!incident.personalDataAwareAt,
    incident?.ref
  );
  await expectReject(
    'same ops draft cannot be opened twice',
    C.conn.reducers.createIncident({ ...blankIncident('dup'), template: 'ops_draft', opsDraftRef: 'ops-proposal:99' }),
    'already opened'
  );
  check(
    'responder and viewer receive the incident live',
    await until(() => count(R, 'irIncidents') === 1 && count(V, 'irIncidents') === 1)
  );
  check('outsider still sees 0 incidents', count(X, 'irIncidents') === 0);
  const id = incident.id;
  await expectOk(
    'responder adds a scope row',
    R.conn.reducers.addScopeItem({
      incidentId: id,
      asset: 'VPN creds',
      system: 'VPN',
      owner: 'NetOps',
      dataClass: 'credentials',
      records: 12n,
      evidenceRef: '',
      confidence: 'suspected',
      status: 'accessed',
      notificationRequired: false,
    })
  );
  const scopeRow = [...R.conn.db.irScope.iter()].find((s) => s.asset === 'VPN creds');
  await expectOk(
    'responder updates scope status',
    R.conn.reducers.updateScopeStatus({ scopeId: scopeRow!.id, status: 'contained', confidence: 'confirmed', note: 'rotated' })
  );
  check(
    'commander sees the scope status change live',
    await until(() => [...C.conn.db.irScope.iter()].some((s) => s.asset === 'VPN creds' && s.status === 'contained'))
  );
  await expectOk(
    'responder escalates SEV2 → SEV1',
    R.conn.reducers.setSeverity({ incidentId: id, severity: 'SEV1', reason: 'PII confirmed' })
  );
  await expectReject(
    'responder cannot lower severity',
    R.conn.reducers.setSeverity({ incidentId: id, severity: 'SEV3', reason: '' }),
    'lower severity'
  );
  await expectReject('responder cannot advance the phase', R.conn.reducers.advancePhase({ incidentId: id, note: '' }), 'Access denied');
  await expectOk('responder chats in the incident room', R.conn.reducers.sendMessage({ incidentId: id, text: 'WMS-APP-01 isolated' }));
  check(
    'commander receives the chat message live',
    await until(() => [...C.conn.db.irMessages.iter()].some((m) => m.text === 'WMS-APP-01 isolated'))
  );
  await expectOk('commander advances to containment', C.conn.reducers.advancePhase({ incidentId: id, note: '' }));
  await expectReject(
    'closing before post-incident is refused',
    C.conn.reducers.setStatus({ incidentId: id, status: 'closed', note: '' }),
    'Post-Incident'
  );
  check('timeline is populated (append-only)', await until(() => count(C, 'irTimeline') >= 6), `${count(C, 'irTimeline')} events`);

  console.log('\n── Revocation (live) ──');
  const before = { incidents: count(R, 'irIncidents'), messages: count(R, 'irMessages'), audit: count(R, 'irAudit') };
  const t0 = Date.now();
  await expectOk('admin revokes the responder', A.conn.reducers.revokeMember({ memberHex: R.hex, reason: 'Laptop lost' }));
  const emptied = await until(
    () => count(R, 'irIncidents') === 0 && count(R, 'irMessages') === 0 && count(R, 'irAudit') === 0 && count(R, 'irScope') === 0
  );
  check(
    "revoked responder's live subscription is emptied",
    emptied,
    `before: ${before.incidents} incidents, ${before.messages} messages, ${before.audit} audit rows → after: ${count(R, 'irIncidents')}/${count(R, 'irMessages')}/${count(R, 'irAudit')} in ${Date.now() - t0} ms`
  );
  check('…and my_access reports status=revoked', access(R)?.status === 'revoked');
  await expectReject(
    "revoked responder's reducer calls fail",
    R.conn.reducers.sendMessage({ incidentId: id, text: 'still here?' }),
    'revoked'
  );
  const r2 = await invite(A, 'responder', 'Riley again');
  await expectReject(
    'revoked identity cannot re-join with a new code',
    R.conn.reducers.redeemInvite({ code: r2, name: 'Riley' }),
    'revoked'
  );
  const rSql = await httpSql(R.token, 'SELECT * FROM ir_incidents');
  check('revoked responder SQL on ir_incidents returns 0 rows', rSql.status === 200 && /"rows":\[\]/.test(rSql.body));

  console.log('\n── Lockdown ──');
  await expectOk('admin turns lockdown on', A.conn.reducers.setLockdown({ enabled: true, reason: 'Possible insider' }));
  await expectReject('lockdown blocks new invites', invite(C, 'responder', 'x'), 'Lockdown');
  const fresh = await connect('fresh');
  await expectReject(
    'lockdown blocks redemption of an existing code',
    fresh.conn.reducers.redeemInvite({ code: r2, name: 'Newbie' }),
    'Lockdown'
  );
  await expectReject('lockdown blocks role changes', A.conn.reducers.setRole({ memberHex: C.hex, role: 'responder' }), 'Lockdown');
  check('non-member sees lockdown on the access screen', await until(() => access(fresh)?.lockdown === true));
  await expectOk('admin lifts lockdown', A.conn.reducers.setLockdown({ enabled: false, reason: '' }));

  console.log('\n── Tamper-evident audit chain ──');
  const rows = [...A.conn.db.irAudit.iter()] as AuditRowLike[];
  const nodeHash = async (s: string) => sha(s);
  const verdict = await verifyAuditChain(rows, nodeHash);
  check(
    'audit chain verifies end-to-end',
    verdict.ok,
    verdict.ok ? `${verdict.count} entries, head #${verdict.headSeq} ${verdict.headHash.slice(0, 16)}…` : verdict.reason
  );
  const status = [...A.conn.db.irStatus.iter()][0];
  check(
    'chain head matches the server-recorded head',
    verdict.ok && status?.auditHead === verdict.headHash && status.auditSeq === verdict.headSeq
  );
  const sample = auditCanonical(rows[0]);
  check('browser fallback SHA-256 matches Node crypto', sha256HexSync(new TextEncoder().encode(sample)) === sha(sample));
  const actions = new Set(rows.map((r) => r.action));
  check('failed code attempts are audited', actions.has('bootstrap_admin.failed') && actions.has('redeem_invite.failed'));
  const tampered = rows.map((r) => (r.seq === 5n ? { ...r, payload: r.payload.replace(/.$/, ' ') } : r));
  const t1 = await verifyAuditChain(tampered, nodeHash);
  check('edited entry is detected at its seq', !t1.ok && t1.brokenSeq === 5n, t1.ok ? '' : `#${t1.brokenSeq}: ${t1.reason}`);
  const t2 = await verifyAuditChain(
    rows.filter((r) => r.seq !== 7n),
    nodeHash
  );
  check('deleted entry is detected', !t2.ok && t2.brokenSeq === 7n, t2.ok ? '' : `#${t2.brokenSeq}: ${t2.reason}`);
  const t3 = await verifyAuditChain(
    rows.map((r) => (r.seq === 9n ? { ...r, actorName: 'Someone else' } : r)),
    nodeHash
  );
  check('re-attributed entry is detected', !t3.ok && t3.brokenSeq === 9n, t3.ok ? '' : `#${t3.brokenSeq}: ${t3.reason}`);

  for (const c of [X, A, C, R, V, fresh]) c.conn.disconnect();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
