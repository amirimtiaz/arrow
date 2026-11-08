/**
 * Domain logic shared by the reducers. Helpers take the reducer context so
 * every state change stays inside a SpacetimeDB transaction.
 */
import { SenderError, type Infer, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { findScenario, scenariosForOrg, type DisruptionKind, type ScenarioDef, type Severity } from './scenarios';
import spacetimedb, { disruption, route, shipment } from './schema';
import { genericOptions, round, scoreOptions, type OptionAction, type ScoringShipment } from './scoring';
import { buildOrgSeed, SEED_ORGS } from './seed';
import type { Point, Priority } from './seed/types';

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
type RouteRow = Infer<typeof route.rowType>;
type ShipmentRow = Infer<typeof shipment.rowType>;
type DisruptionRow = Infer<typeof disruption.rowType>;

export const SIM_HOURS_PER_TICK = 0.5;
export const TICK_INTERVAL_MICROS = 2_000_000n;

// ───────────────────────────── Access control ─────────────────────────────

export function state(ctx: Ctx) {
  const row = ctx.db.opsState.id.find(1);
  if (!row) throw new SenderError('Arrow is not initialised');
  return row;
}

export function isAgent(ctx: Ctx): boolean {
  const hex = state(ctx).agentHex;
  return hex.length > 0 && ctx.sender.toHexString() === hex;
}

export function requireAgent(ctx: Ctx): void {
  if (!isAgent(ctx)) throw new SenderError('Only the Arrow agent service can do this');
}

export function requireUser(ctx: Ctx) {
  const profile = ctx.db.userProfile.identity.find(ctx.sender);
  if (!profile) throw new SenderError('Join a workspace first');
  return profile;
}

export function requireManager(ctx: Ctx) {
  const profile = requireUser(ctx);
  if (profile.role !== 'manager') throw new SenderError('Only operations managers can do this');
  return profile;
}

/** Agent or a signed-in user (used for read-only computations both may trigger). */
export function actorName(ctx: Ctx): string {
  if (isAgent(ctx)) return 'Arrow Agent';
  return requireUser(ctx).name;
}

export function requireOrg(ctx: Ctx, orgId: number) {
  const row = ctx.db.org.id.find(orgId);
  if (!row) throw new SenderError(`Unknown org ${orgId}`);
  return row;
}

export function clampText(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export function requireText(value: string, field: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new SenderError(`${field} is required`);
  if (trimmed.length > max) throw new SenderError(`${field} must be ${max} characters or fewer`);
  return trimmed;
}

// ───────────────────────────────── Feed ─────────────────────────────────

export function postFeed(
  ctx: Ctx,
  orgId: number,
  severity: 'info' | 'success' | 'warning' | 'critical',
  category: string,
  text: string,
  options: { link?: string; author?: string; audience?: string } = {}
): void {
  ctx.db.feedItem.insert({
    id: 0n,
    orgId,
    ts: ctx.timestamp,
    audience: options.audience ?? 'ops',
    severity,
    category,
    text: clampText(text, 600),
    link: options.link ?? '',
    author: options.author ?? 'Arrow',
    escalated: false,
  });
}

// ───────────────────────────────── Seeding ─────────────────────────────────

export function seedOrg(ctx: Ctx, orgId: number): void {
  const def = SEED_ORGS.find((o) => o.id === orgId);
  if (!def) throw new SenderError(`No seed for org ${orgId}`);
  const rows = buildOrgSeed(def);

  ctx.db.org.insert({
    id: def.id,
    slug: def.slug,
    name: def.name,
    plan: def.plan,
    planLabel: def.planLabel,
    scope: def.scope,
    industry: def.industry,
    headquarters: def.headquarters,
    tagline: def.tagline,
    viewLat: def.view.lat,
    viewLng: def.view.lng,
    viewAltitude: def.view.altitude,
  });
  for (const n of rows.nodes) ctx.db.node.insert(n);
  for (const r of rows.routes) {
    ctx.db.route.insert({
      ...r,
      baseWaypoints: r.waypoints,
      baseEtaHours: r.etaHours,
      baseCostUsd: r.costUsd,
      baseRisk: r.risk,
      note: '',
      drift: 0,
    });
  }
  for (const s of rows.shipments) {
    const { routeKey: _routeKey, ...rest } = s;
    ctx.db.shipment.insert({ ...rest, originRouteId: 0, status: 'in_transit', delayHours: 0, trips: 0 });
  }
  for (const v of rows.vendors) ctx.db.vendor.insert(v);
  scenariosForOrg(def.slug).forEach((s, i) => {
    ctx.db.scenarioPreset.insert({
      key: s.key,
      orgId,
      title: s.title,
      shortLabel: s.shortLabel,
      tag: s.tag,
      kind: s.kind,
      severity: s.severity,
      summary: s.summary,
      sortOrder: i,
      irHintJson: s.ir ? JSON.stringify(s.ir) : '',
    });
  });

  postFeed(
    ctx,
    orgId,
    'info',
    'system',
    `${def.name} workspace ready: ${rows.routes.filter((r) => !r.standby).length} active lanes, ${rows.shipments.length} shipments in transit.`
  );
}

/** Remove every row that belongs to an org (used by "Reset demo"). */
export function clearOrg(ctx: Ctx, orgId: number): void {
  const deleteAll = <R>(rows: Iterable<R>, remove: (row: R) => void) => {
    for (const row of [...rows]) remove(row);
  };
  const disruptionIds = [...ctx.db.disruption.orgId.filter(orgId)].map((d) => d.id);
  const runIds = [...ctx.db.agentRun.orgId.filter(orgId)].map((r) => r.id);

  for (const id of disruptionIds) {
    deleteAll(ctx.db.routeOption.disruptionId.filter(id), (r) => ctx.db.routeOption.id.delete(r.id));
  }
  for (const id of runIds) {
    deleteAll(ctx.db.agentStep.runId.filter(id), (r) => ctx.db.agentStep.id.delete(r.id));
    deleteAll(ctx.db.actionProposal.runId.filter(id), (r) => ctx.db.actionProposal.id.delete(r.id));
  }
  deleteAll(ctx.db.agentRun.orgId.filter(orgId), (r) => ctx.db.agentRun.id.delete(r.id));
  deleteAll(ctx.db.disruption.orgId.filter(orgId), (r) => ctx.db.disruption.id.delete(r.id));
  deleteAll(ctx.db.shipment.orgId.filter(orgId), (r) => ctx.db.shipment.id.delete(r.id));
  deleteAll(ctx.db.route.orgId.filter(orgId), (r) => ctx.db.route.id.delete(r.id));
  deleteAll(ctx.db.node.orgId.filter(orgId), (r) => ctx.db.node.id.delete(r.id));
  deleteAll(ctx.db.vendor.orgId.filter(orgId), (r) => ctx.db.vendor.id.delete(r.id));
  deleteAll(ctx.db.feedItem.orgId.filter(orgId), (r) => ctx.db.feedItem.id.delete(r.id));
  deleteAll(ctx.db.riskSample.orgId.filter(orgId), (r) => ctx.db.riskSample.id.delete(r.id));
  deleteAll(ctx.db.telemetry.orgId.filter(orgId), (r) => ctx.db.telemetry.id.delete(r.id));
  deleteAll(ctx.db.securityEvent.orgId.filter(orgId), (r) => ctx.db.securityEvent.id.delete(r.id));
  deleteAll(ctx.db.scenarioPreset.orgId.filter(orgId), (r) => ctx.db.scenarioPreset.key.delete(r.key));
  deleteAll(ctx.db.newsSignal.orgId.filter(orgId), (r) => ctx.db.newsSignal.id.delete(r.id));
  deleteAll(ctx.db.newsScan.orgId.filter(orgId), (r) => ctx.db.newsScan.id.delete(r.id));
  ctx.db.org.id.delete(orgId);
}

// ─────────────────────────────── Disruptions ───────────────────────────────

const STATUS_RISK: Record<string, number> = { disrupted: 0.92, at_risk: 0.55, rerouted: 0.38 };

function routesByKey(ctx: Ctx, orgId: number): Map<string, RouteRow> {
  return new Map([...ctx.db.route.orgId.filter(orgId)].map((r) => [r.key, r]));
}

function activeDisruptions(ctx: Ctx, orgId: number): DisruptionRow[] {
  return [...ctx.db.disruption.orgId.filter(orgId)].filter((d) => d.status !== 'resolved');
}

function setRouteStatus(ctx: Ctx, r: RouteRow, status: string, note = r.note): RouteRow {
  const risk = STATUS_RISK[status] ?? r.baseRisk;
  const updated = { ...r, status, risk, note, drift: 0 };
  ctx.db.route.id.update(updated);
  return updated;
}

interface DisruptionInput {
  orgId: number;
  scenarioKey: string;
  kind: string;
  title: string;
  summary: string;
  severity: string;
  lat: number;
  lng: number;
  radiusKm: number;
  routeIds: number[];
  atRiskRouteIds: number[];
  nodeIds: number[];
  durationHours: number;
  source: string;
}

export function openDisruption(ctx: Ctx, input: DisruptionInput): DisruptionRow {
  const row = ctx.db.disruption.insert({
    id: 0n,
    orgId: input.orgId,
    scenarioKey: input.scenarioKey,
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    severity: input.severity,
    lat: input.lat,
    lng: input.lng,
    radiusKm: input.radiusKm,
    affectedRouteIds: input.routeIds,
    affectedNodeIds: input.nodeIds,
    durationHours: input.durationHours,
    source: input.source,
    status: 'active',
    createdAt: ctx.timestamp,
    resolvedAt: undefined,
  });

  for (const id of input.routeIds) {
    const r = ctx.db.route.id.find(id);
    if (r) setRouteStatus(ctx, r, 'disrupted', input.title);
    for (const s of [...ctx.db.shipment.routeId.filter(id)]) {
      if (s.status === 'in_transit') ctx.db.shipment.id.update({ ...s, status: 'delayed' });
    }
  }
  for (const id of input.atRiskRouteIds) {
    const r = ctx.db.route.id.find(id);
    if (r && r.status === 'healthy') setRouteStatus(ctx, r, 'at_risk', `Exposed to: ${input.title}`);
  }
  for (const id of input.nodeIds) {
    const n = ctx.db.node.id.find(id);
    if (n) ctx.db.node.id.update({ ...n, status: input.kind === 'cyber' ? 'offline' : 'degraded' });
  }

  const severity = input.severity === 'critical' || input.kind === 'cyber' ? 'critical' : 'warning';
  postFeed(ctx, input.orgId, severity, input.kind === 'cyber' ? 'cyber' : 'scenario', `${input.title}: ${input.summary}`, {
    link: `disruption:${row.id}`,
    audience: input.severity === 'critical' ? 'executive' : 'ops',
  });
  return row;
}

export function triggerScenarioDef(ctx: Ctx, orgId: number, def: ScenarioDef): DisruptionRow {
  if (activeDisruptions(ctx, orgId).some((d) => d.scenarioKey === def.key)) {
    throw new SenderError(`"${def.title}" is already active. Resolve it before running it again.`);
  }
  const byKey = routesByKey(ctx, orgId);
  const nodeIdByKey = new Map([...ctx.db.node.orgId.filter(orgId)].map((n) => [n.key, n.id]));
  const ids = (keys: string[]) => keys.map((k) => byKey.get(k)?.id).filter((id): id is number => id !== undefined);

  return openDisruption(ctx, {
    orgId,
    scenarioKey: def.key,
    kind: def.kind,
    title: def.title,
    summary: def.summary,
    severity: def.severity,
    lat: def.lat,
    lng: def.lng,
    radiusKm: def.radiusKm,
    routeIds: ids(def.affectedRouteKeys),
    atRiskRouteIds: ids(def.atRiskRouteKeys),
    nodeIds: def.affectedNodeKeys.map((k) => nodeIdByKey.get(k)).filter((id): id is number => id !== undefined),
    durationHours: def.durationHours,
    source: 'scenario',
  });
}

const RANDOM_KINDS: Record<string, DisruptionKind[]> = {
  sea: ['port_congestion', 'weather', 'strike', 'geopolitical'],
  air: ['weather', 'strike'],
  rail: ['accident', 'weather', 'strike'],
  truck: ['accident', 'weather', 'strike'],
};

const KIND_TITLES: Record<string, string> = {
  port_congestion: 'Port congestion',
  weather: 'Severe weather',
  strike: 'Labor action',
  geopolitical: 'Security incident',
  accident: 'Accident',
};

export function triggerRandom(ctx: Ctx, orgId: number): DisruptionRow {
  const busy = new Set(activeDisruptions(ctx, orgId).flatMap((d) => d.affectedRouteIds));
  const candidates = [...ctx.db.route.orgId.filter(orgId)].filter(
    (r) => !r.standby && r.status === 'healthy' && !busy.has(r.id) && [...ctx.db.shipment.routeId.filter(r.id)].length > 0
  );
  if (candidates.length === 0) throw new SenderError('No healthy lanes left to disrupt. Resolve or reset first.');
  const target = candidates[ctx.random.integerInRange(0, candidates.length - 1)];
  const kinds = RANDOM_KINDS[target.mode] ?? RANDOM_KINDS.truck;
  const kind = kinds[ctx.random.integerInRange(0, kinds.length - 1)];
  const mid = target.waypoints[Math.floor(target.waypoints.length / 2)];
  const severity: Severity = ctx.random() < 0.5 ? 'moderate' : 'high';
  const durationHours = round(Math.max(4, target.baseEtaHours * (0.15 + ctx.random() * 0.35)), 0);
  const where = target.lane;

  return openDisruption(ctx, {
    orgId,
    scenarioKey: `random-${kind}`,
    kind,
    title: `${KIND_TITLES[kind] ?? 'Disruption'} on ${target.label}`,
    summary: `${KIND_TITLES[kind] ?? 'A disruption'} is affecting the ${where} lane (${target.label}). Estimated impact window: ${durationHours} hours.`,
    severity,
    lat: mid.lat,
    lng: mid.lng,
    radiusKm: target.mode === 'sea' ? 220 : 40,
    routeIds: [target.id],
    atRiskRouteIds: [],
    nodeIds: [],
    durationHours,
    source: 'random',
  });
}

// ───────────────────────────── Option scoring ─────────────────────────────

export function evaluateDisruption(ctx: Ctx, disruptionId: bigint): number {
  const d = ctx.db.disruption.id.find(disruptionId);
  if (!d) throw new SenderError('Unknown disruption');
  if (d.status === 'resolved') throw new SenderError('This disruption is already resolved');
  const org = requireOrg(ctx, d.orgId);
  const seedOrg = SEED_ORGS.find((o) => o.id === org.id);
  const def = findScenario(d.scenarioKey);
  const allRoutes = [...ctx.db.route.orgId.filter(d.orgId)];
  const routeIdByKey = Object.fromEntries(allRoutes.map((r) => [r.key, r.id]));
  const routeById = new Map(allRoutes.map((r) => [r.id, r]));

  const planRouteIds = def ? def.planRouteKeys.map((k) => routeIdByKey[k]).filter((id) => id !== undefined) : d.affectedRouteIds;
  const planRoutes = planRouteIds.map((id) => routeById.get(id)).filter((r): r is RouteRow => !!r);
  const options = def
    ? def.options
    : genericOptions(
        planRoutes.map((r) => ({
          key: r.key,
          mode: r.mode,
          etaHours: r.baseEtaHours,
          waypoints: r.baseWaypoints.map((p) => [p.lat, p.lng] as Point),
        }))
      );

  const shipments: ScoringShipment[] = planRoutes.flatMap((r) =>
    [...ctx.db.shipment.routeId.filter(r.id)].map((s) => ({
      id: s.id,
      routeKey: r.key,
      units: s.units,
      valueUsd: s.valueUsd,
      priority: s.priority as Priority,
    }))
  );
  if (shipments.length === 0) throw new SenderError('No shipments on the affected lanes need re-planning');

  for (const old of [...ctx.db.routeOption.disruptionId.filter(disruptionId)]) ctx.db.routeOption.id.delete(old.id);
  const results = scoreOptions(options, shipments, {
    durationHours: d.durationHours,
    backlogFactor: def?.backlogFactor ?? 1.15,
    holdCostPerUnitDay: seedOrg?.holdCostPerUnitDay ?? 0.5,
    routeIdByKey,
  });
  for (const r of results) {
    ctx.db.routeOption.insert({
      id: 0n,
      disruptionId,
      orgId: d.orgId,
      key: r.key,
      label: r.label,
      strategy: r.strategy,
      summary: r.summary,
      addedCostUsd: r.addedCostUsd,
      avgDelayHours: r.avgDelayHours,
      weightedDelayHours: r.weightedDelayHours,
      slaBreachValueUsd: r.slaBreachValueUsd,
      risk: r.risk,
      score: r.score,
      rank: r.rank,
      shipmentsAffected: r.shipmentsAffected,
      shipmentsMoved: r.shipmentsMoved,
      shipmentsHeld: r.shipmentsHeld,
      actionsJson: JSON.stringify({ expectedImpactUsd: r.expectedImpactUsd, actions: r.actions }),
    });
  }
  return results.length;
}

// ─────────────────────────────── Execution ───────────────────────────────

function matches(s: ShipmentRow, priorities: Priority[]): boolean {
  return priorities.includes(s.priority as Priority) && s.status !== 'rerouted';
}

/** Apply an approved option's actions to routes and shipments. Returns shipments touched. */
export function executeOption(ctx: Ctx, actionsJson: string, label: string): number {
  const parsed = JSON.parse(actionsJson) as { actions: OptionAction[] };
  let touched = 0;

  for (const action of parsed.actions) {
    switch (action.type) {
      case 'shift': {
        const target = ctx.db.route.id.find(action.toRouteId);
        if (!target) break;
        if (target.status === 'standby' || target.status === 'healthy') {
          setRouteStatus(ctx, { ...target, standby: false }, 'rerouted', `Activated: ${label}`);
        }
        for (const s of [...ctx.db.shipment.routeId.filter(action.fromRouteId)]) {
          if (!matches(s, action.priorities)) continue;
          ctx.db.shipment.id.update({
            ...s,
            routeId: action.toRouteId,
            originRouteId: s.originRouteId || action.fromRouteId,
            progress: 0,
            status: 'rerouted',
            delayHours: s.delayHours + action.extraHours,
          });
          touched += 1;
        }
        break;
      }
      case 'reroute': {
        const r = ctx.db.route.id.find(action.routeId);
        if (!r) break;
        const from = r.baseWaypoints[0];
        const to = r.baseWaypoints[r.baseWaypoints.length - 1];
        const waypoints = [from, ...action.via.map(([lat, lng]) => ({ lat, lng })), to];
        setRouteStatus(ctx, { ...r, waypoints, etaHours: r.baseEtaHours + action.extraHours }, 'rerouted', `Rerouted: ${label}`);
        for (const s of [...ctx.db.shipment.routeId.filter(action.routeId)]) {
          if (!matches(s, action.priorities)) continue;
          ctx.db.shipment.id.update({ ...s, status: 'rerouted', delayHours: s.delayHours + action.extraHours });
          touched += 1;
        }
        break;
      }
      case 'expedite':
      case 'resume': {
        for (const s of [...ctx.db.shipment.routeId.filter(action.routeId)]) {
          if (!matches(s, action.priorities)) continue;
          const extra = action.type === 'resume' ? action.extraHours : 0;
          const speed = action.type === 'expedite' ? s.speed * 1.8 : s.speed;
          ctx.db.shipment.id.update({ ...s, status: 'rerouted', speed, delayHours: s.delayHours + extra });
          touched += 1;
        }
        break;
      }
      case 'hold': {
        for (const s of [...ctx.db.shipment.routeId.filter(action.routeId)]) {
          if (!matches(s, action.priorities) || s.status === 'held') continue;
          ctx.db.shipment.id.update({ ...s, status: 'held' });
          touched += 1;
        }
        break;
      }
    }
  }
  return touched;
}

/** Restore lanes, nodes and shipments once a disruption is over. */
export function resolveDisruptionRow(ctx: Ctx, d: DisruptionRow, by: string): void {
  ctx.db.disruption.id.update({ ...d, status: 'resolved', resolvedAt: ctx.timestamp });
  const stillActive = activeDisruptions(ctx, d.orgId).filter((o) => o.id !== d.id);
  const busyRoutes = new Set(stillActive.flatMap((o) => o.affectedRouteIds));
  const busyNodes = new Set(stillActive.flatMap((o) => o.affectedNodeIds));
  const seedOrg = SEED_ORGS.find((o) => o.id === d.orgId);
  const seededSpeed = new Map(seedOrg ? buildOrgSeed(seedOrg).shipments.map((s) => [s.id, s.speed]) : []);

  for (const r of [...ctx.db.route.orgId.filter(d.orgId)]) {
    if (busyRoutes.has(r.id) || r.status === 'healthy' || r.status === 'standby') continue;
    const restored = { ...r, waypoints: r.baseWaypoints, etaHours: r.baseEtaHours, costUsd: r.baseCostUsd, note: '' };
    setRouteStatus(ctx, restored, r.standby ? 'standby' : 'healthy');
  }
  for (const s of [...ctx.db.shipment.orgId.filter(d.orgId)]) {
    const origin = s.originRouteId;
    if (busyRoutes.has(s.routeId) || (origin && busyRoutes.has(origin))) continue;
    if (s.status === 'in_transit' && origin === 0) continue;
    ctx.db.shipment.id.update({
      ...s,
      routeId: origin || s.routeId,
      originRouteId: 0,
      progress: origin ? ctx.random() : s.progress,
      status: 'in_transit',
      speed: seededSpeed.get(s.id) ?? s.speed,
      delayHours: 0,
    });
  }
  // Activated standby lanes go dark again once their shipments are home.
  for (const r of [...ctx.db.route.orgId.filter(d.orgId)]) {
    const seeded = seedOrg?.routes.find((sr) => sr.key === r.key);
    if (seeded?.standby && !busyRoutes.has(r.id)) {
      ctx.db.route.id.update({ ...r, standby: true, status: 'standby', risk: r.baseRisk, note: '' });
    }
  }
  for (const n of [...ctx.db.node.orgId.filter(d.orgId)]) {
    if (n.status !== 'operational' && !busyNodes.has(n.id)) ctx.db.node.id.update({ ...n, status: 'operational' });
  }
  postFeed(ctx, d.orgId, 'success', 'action', `Resolved: ${d.title}. Lanes restored to normal operations by ${by}.`, {
    link: `disruption:${d.id}`,
  });
}

// ─────────────────────────────── Simulation ───────────────────────────────

const SECURITY_BASELINE: Record<string, { kind: string; detail: string }[]> = {
  low: [
    { kind: 'failed_login', detail: 'Failed sign-in from unrecognised device' },
    { kind: 'phishing_reported', detail: 'Employee reported a suspicious email' },
    { kind: 'port_scan', detail: 'Inbound port scan blocked at edge firewall' },
    { kind: 'mfa_denied', detail: 'MFA push denied by user' },
  ],
  incident: [
    { kind: 'ransomware_beacon', detail: 'C2 beacon from encrypted host' },
    { kind: 'edr_alert', detail: 'EDR: mass file encryption behaviour' },
    { kind: 'data_egress', detail: 'Unusual outbound transfer volume' },
    { kind: 'privilege_escalation', detail: 'New domain admin added outside change window' },
    { kind: 'lateral_movement', detail: 'PsExec execution across servers' },
  ],
};

const BASELINE_EVENT_RATE: Record<string, number> = { gold: 0.55, silver: 0.35, bronze: 0.12 };

/** Start an undeclared risk build-up on a healthy lane (for Tiger anomaly detection demos). */
export function startDrift(ctx: Ctx, orgId: number): RouteRow {
  const candidates = [...ctx.db.route.orgId.filter(orgId)].filter(
    (r) => r.status === 'healthy' && r.drift === 0 && [...ctx.db.shipment.routeId.filter(r.id)].length > 0
  );
  if (candidates.length === 0) throw new SenderError('No healthy lane available for a simulated build-up');
  const target = candidates[ctx.random.integerInRange(0, candidates.length - 1)];
  const updated = { ...target, drift: 0.035, note: 'Telemetry trending up (simulated congestion build-up)' };
  ctx.db.route.id.update(updated);
  return updated;
}

export function tickOrg(ctx: Ctx, orgId: number, plan: string, tickCount: bigint): void {
  for (const r of [...ctx.db.route.orgId.filter(orgId)]) {
    if (r.drift > 0 && r.status === 'healthy') {
      ctx.db.route.id.update({ ...r, risk: Math.min(0.9, r.risk + r.drift) });
    }
  }
  const routes = [...ctx.db.route.orgId.filter(orgId)];
  const routeById = new Map(routes.map((r) => [r.id, r]));
  let totalValue = 0;
  let riskWeighted = 0;
  let lateValue = 0;
  let valueAtRisk = 0;
  let inTransit = 0;
  const unitsByRoute = new Map<number, number>();
  const delayByRoute = new Map<number, number>();

  for (const s of [...ctx.db.shipment.orgId.filter(orgId)]) {
    const r = routeById.get(s.routeId);
    if (!r) continue;
    const frozen = s.status === 'held' || (r.status === 'disrupted' && s.status !== 'rerouted');
    let next = s;
    if (frozen) {
      next = { ...s, status: s.status === 'held' ? 'held' : 'delayed', delayHours: s.delayHours + SIM_HOURS_PER_TICK };
    } else {
      const statusFactor = r.status === 'at_risk' ? 0.6 : 1;
      const lengthFactor = r.etaHours > r.baseEtaHours ? r.baseEtaHours / r.etaHours : 1;
      let progress = s.progress + s.speed * statusFactor * lengthFactor;
      let trips = s.trips;
      if (progress >= 1) {
        progress -= 1;
        trips += 1;
      }
      const status = s.status === 'delayed' ? 'in_transit' : s.status;
      next = { ...s, progress, trips, status };
    }
    ctx.db.shipment.id.update(next);

    inTransit += 1;
    totalValue += s.valueUsd;
    riskWeighted += s.valueUsd * r.risk;
    if (next.status === 'delayed' || next.status === 'held') lateValue += s.valueUsd;
    if (next.status === 'delayed' || next.status === 'held' || r.status === 'at_risk') valueAtRisk += s.valueUsd;
    unitsByRoute.set(r.id, (unitsByRoute.get(r.id) ?? 0) + s.units);
    delayByRoute.set(r.id, Math.max(delayByRoute.get(r.id) ?? 0, next.delayHours));
  }

  const active = activeDisruptions(ctx, orgId);
  const severityBump = active.reduce(
    (sum, d) => sum + ({ critical: 9, high: 6, moderate: 3, low: 1 }[d.severity] ?? 2) * (d.status === 'mitigating' ? 0.4 : 1),
    0
  );
  const base = totalValue > 0 ? (riskWeighted / totalValue) * 100 : 0;
  const noise = (ctx.random() - 0.5) * 3;
  ctx.db.riskSample.insert({
    id: 0n,
    orgId,
    ts: ctx.timestamp,
    riskIndex: round(Math.min(100, Math.max(0, base + severityBump + noise)), 1),
    onTimePct: round(totalValue > 0 ? 100 * (1 - lateValue / totalValue) : 100, 1),
    valueAtRiskUsd: round(valueAtRisk, 0),
    inTransit,
  });

  if (tickCount % 5n === 0n) {
    for (const r of routes) {
      if (r.status === 'standby') continue;
      ctx.db.telemetry.insert({
        id: 0n,
        orgId,
        routeId: r.id,
        ts: ctx.timestamp,
        delayHours: round(delayByRoute.get(r.id) ?? 0, 1),
        riskIndex: round(Math.min(100, Math.max(0, r.risk * 100 + (ctx.random() - 0.5) * 6)), 1),
        costUsd: round(r.costUsd * (0.97 + ctx.random() * 0.06), 0),
        inTransitUnits: unitsByRoute.get(r.id) ?? 0,
      });
    }
  }

  emitSecurityEvents(ctx, orgId, plan, active);
}

function emitSecurityEvents(ctx: Ctx, orgId: number, plan: string, active: DisruptionRow[]): void {
  const nodes = [...ctx.db.node.orgId.filter(orgId)];
  const pick = <T>(list: T[]) => list[ctx.random.integerInRange(0, list.length - 1)];
  if (ctx.random() < (BASELINE_EVENT_RATE[plan] ?? 0.2)) {
    const e = pick(SECURITY_BASELINE.low);
    ctx.db.securityEvent.insert({
      id: 0n,
      orgId,
      ts: ctx.timestamp,
      kind: e.kind,
      severity: ctx.random() < 0.8 ? 'low' : 'medium',
      source: pick(nodes)?.name ?? 'Edge',
      detail: e.detail,
    });
  }
  for (const d of active) {
    if (d.kind !== 'cyber') continue;
    const burst = d.status === 'mitigating' ? 1 : ctx.random.integerInRange(2, 4);
    const sources = d.affectedNodeIds.map((id) => nodes.find((n) => n.id === id)?.name).filter((n): n is string => !!n);
    for (let i = 0; i < burst; i++) {
      const e = pick(SECURITY_BASELINE.incident);
      ctx.db.securityEvent.insert({
        id: 0n,
        orgId,
        ts: ctx.timestamp,
        kind: e.kind,
        severity: ctx.random() < 0.45 ? 'critical' : 'high',
        source: sources.length > 0 ? pick(sources) : 'Unknown host',
        detail: e.detail,
      });
    }
  }
}

/** Keep rolling tables bounded; Tiger keeps the long-term history. */
export function pruneOrg(ctx: Ctx, orgId: number): void {
  const keepNewest = <R extends { ts: { microsSinceUnixEpoch: bigint } }>(rows: R[], keep: number, remove: (row: R) => void) => {
    if (rows.length <= keep) return;
    rows.sort((a, b) => (a.ts.microsSinceUnixEpoch < b.ts.microsSinceUnixEpoch ? -1 : 1));
    for (const row of rows.slice(0, rows.length - keep)) remove(row);
  };
  keepNewest([...ctx.db.riskSample.orgId.filter(orgId)], 180, (r) => ctx.db.riskSample.id.delete(r.id));
  keepNewest([...ctx.db.telemetry.orgId.filter(orgId)], 1200, (r) => ctx.db.telemetry.id.delete(r.id));
  keepNewest([...ctx.db.securityEvent.orgId.filter(orgId)], 400, (r) => ctx.db.securityEvent.id.delete(r.id));
  keepNewest([...ctx.db.feedItem.orgId.filter(orgId)], 250, (r) => ctx.db.feedItem.id.delete(r.id));
}

// ─────────────────────────────── Grok News Scout ───────────────────────────────

const MAX_SIGNALS_PER_ORG = 40;
const MAX_SCANS_PER_ORG = 20;

const byTime = (a: { microsSinceUnixEpoch: bigint }, b: { microsSinceUnixEpoch: bigint }) =>
  a.microsSinceUnixEpoch < b.microsSinceUnixEpoch ? -1 : 1;

export function pruneScans(ctx: Ctx, orgId: number): void {
  const scans = [...ctx.db.newsScan.orgId.filter(orgId)].sort((a, b) => byTime(a.startedAt, b.startedAt));
  for (const old of scans.slice(0, Math.max(0, scans.length - MAX_SCANS_PER_ORG))) ctx.db.newsScan.id.delete(old.id);
}

export function pruneSignals(ctx: Ctx, orgId: number): void {
  const signals = [...ctx.db.newsSignal.orgId.filter(orgId)].sort((a, b) => byTime(a.ts, b.ts));
  const removable = signals.filter((s) => s.status !== 'escalated');
  for (const old of removable.slice(0, Math.max(0, signals.length - MAX_SIGNALS_PER_ORG))) ctx.db.newsSignal.id.delete(old.id);
}

const SIGNAL_TO_DISRUPTION: Record<string, DisruptionKind> = {
  weather: 'weather',
  port_congestion: 'port_congestion',
  strike: 'strike',
  blockage: 'blockage',
  cyber: 'cyber',
  geopolitical: 'geopolitical',
  accident: 'accident',
};

/** A person escalates a Grok news signal into a disruption, which wakes the Nemotron agents. */
export function escalateSignal(ctx: Ctx, signalId: bigint, by: string): DisruptionRow {
  const signal = ctx.db.newsSignal.id.find(signalId);
  if (!signal) throw new SenderError('Unknown news signal');
  if (signal.status !== 'new') throw new SenderError('This signal was already handled');
  const routes = signal.routeIds
    .map((id) => ctx.db.route.id.find(id))
    .filter((r): r is RouteRow => !!r && r.orgId === signal.orgId && (r.status === 'healthy' || r.status === 'at_risk'))
    .slice(0, 3);
  if (routes.length === 0) throw new SenderError('None of the lanes this signal mentions can be disrupted right now');

  const severity: Severity = signal.severity === 'critical' ? 'high' : signal.severity === 'warning' ? 'moderate' : 'low';
  const d = openDisruption(ctx, {
    orgId: signal.orgId,
    scenarioKey: `news-${signal.kind}`,
    kind: SIGNAL_TO_DISRUPTION[signal.kind] ?? 'geopolitical',
    title: clampText(`News: ${signal.headline}`, 160),
    summary: clampText(
      `${signal.summary} (Real-world signal found by the Grok News Scout and escalated by ${by}. Network data is simulated.)`,
      600
    ),
    severity,
    lat: signal.lat,
    lng: signal.lng,
    radiusKm: routes[0].mode === 'sea' ? 250 : 60,
    routeIds: routes.map((r) => r.id),
    atRiskRouteIds: [],
    nodeIds: [],
    durationHours: severity === 'high' ? 72 : severity === 'moderate' ? 36 : 12,
    source: 'news',
  });
  ctx.db.newsSignal.id.update({ ...signal, status: 'escalated', disruptionId: d.id, decidedByName: by });
  return d;
}
