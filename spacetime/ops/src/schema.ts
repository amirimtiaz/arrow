/**
 * arrow-ops schema.
 *
 * Every piece of supply-chain state lives here: orgs (one per plan tier), the
 * network (nodes, routes, shipments, vendors), disruptions and the scored
 * response options, the agent's runs/steps/proposals, the live feed and the
 * rolling telemetry the Tiger bridge mirrors. All tables are public: any
 * employee can view Arrow. Writes go through role-checked reducers.
 */
import { schema, table, t } from 'spacetimedb/server';

export const LatLng = t.object('LatLng', { lat: t.f64(), lng: t.f64() });

/** One finding submitted by the Grok News Scout (runs in the browser via Puter.js). */
export const NewsSignalInput = t.object('NewsSignalInput', {
  headline: t.string(),
  summary: t.string(),
  region: t.string(),
  kind: t.string(),
  severity: t.string(),
  relevance: t.f64(),
  lat: t.f64(),
  lng: t.f64(),
  routeIds: t.array(t.u32()),
  sources: t.array(t.string()),
});

/** Singleton (id = 1) holding module ownership and simulation state. */
export const opsState = table(
  { name: 'ops_state', public: true },
  {
    id: t.u32().primaryKey(),
    ownerHex: t.string(),
    agentHex: t.string(),
    tickCount: t.u64(),
    lastTickAt: t.timestamp(),
    simPaused: t.bool(),
  }
);

/** Singleton (id = 1) heartbeat from the agent worker, so the UI can show its real status. */
export const agentService = table(
  { name: 'agent_service', public: true },
  {
    id: t.u32().primaryKey(),
    status: t.string(), // ready | not_configured | error
    model: t.string(),
    message: t.string(),
    tigerConnected: t.bool(),
    lastSeenAt: t.timestamp(),
  }
);

export const tickTimer = table(
  { name: 'tick_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

export const org = table(
  { name: 'org', public: true },
  {
    id: t.u32().primaryKey(),
    slug: t.string().unique(),
    name: t.string(),
    plan: t.string(), // bronze | silver | gold
    planLabel: t.string(),
    scope: t.string(), // Local | National | Global
    industry: t.string(),
    headquarters: t.string(),
    tagline: t.string(),
    viewLat: t.f64(),
    viewLng: t.f64(),
    viewAltitude: t.f64(),
  }
);

/** Scenario presets available to each org (catalog for the Crisis Scenarios panel). */
export const scenarioPreset = table(
  { name: 'scenario_preset', public: true },
  {
    key: t.string().primaryKey(),
    orgId: t.u32().index('btree'),
    title: t.string(),
    shortLabel: t.string(),
    tag: t.string(),
    kind: t.string(),
    severity: t.string(),
    summary: t.string(),
    sortOrder: t.u32(),
    /** Incident-response hints for cyber presets (JSON); empty otherwise. */
    irHintJson: t.string(),
  }
);

export const userProfile = table(
  { name: 'user_profile', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    role: t.string(), // analyst | manager | executive
    orgId: t.u32(),
    online: t.bool(),
    createdAt: t.timestamp(),
    lastSeenAt: t.timestamp(),
  }
);

export const node = table(
  { name: 'node', public: true },
  {
    id: t.u32().primaryKey(),
    orgId: t.u32().index('btree'),
    key: t.string(),
    kind: t.string(), // supplier | factory | port | airport | warehouse | store | kitchen
    name: t.string(),
    city: t.string(),
    country: t.string(),
    lat: t.f64(),
    lng: t.f64(),
    status: t.string(), // operational | degraded | offline
    standby: t.bool(),
  }
);

export const route = table(
  { name: 'route', public: true },
  {
    id: t.u32().primaryKey(),
    orgId: t.u32().index('btree'),
    key: t.string(),
    fromNodeId: t.u32(),
    toNodeId: t.u32(),
    mode: t.string(), // sea | air | rail | truck
    label: t.string(),
    lane: t.string(),
    waypoints: t.array(LatLng),
    baseWaypoints: t.array(LatLng),
    status: t.string(), // healthy | at_risk | disrupted | rerouted | standby
    standby: t.bool(),
    etaHours: t.f64(),
    baseEtaHours: t.f64(),
    costUsd: t.f64(),
    baseCostUsd: t.f64(),
    risk: t.f64(),
    baseRisk: t.f64(),
    note: t.string(),
    /** Per-tick upward risk drift used to simulate an undeclared congestion build-up. */
    drift: t.f64().default(0),
  }
);

export const shipment = table(
  { name: 'shipment', public: true },
  {
    id: t.u32().primaryKey(),
    orgId: t.u32().index('btree'),
    routeId: t.u32().index('btree'),
    originRouteId: t.u32(), // 0 unless an executed action moved it
    ref: t.string(),
    goods: t.string(),
    units: t.u32(),
    valueUsd: t.f64(),
    priority: t.string(), // critical | high | standard | low
    coldChain: t.bool(),
    progress: t.f64(),
    speed: t.f64(),
    status: t.string(), // in_transit | delayed | held | rerouted
    delayHours: t.f64(),
    trips: t.u32(),
  }
);

export const vendor = table(
  { name: 'vendor', public: true },
  {
    id: t.u32().primaryKey(),
    orgId: t.u32().index('btree'),
    nodeId: t.u32(),
    name: t.string(),
    category: t.string(),
    tier: t.string(), // strategic | preferred | backup
    riskScore: t.f64(), // 0..100
    onTimePct: t.f64(),
    cyberPosture: t.string(), // strong | moderate | weak
    notes: t.string(),
  }
);

export const disruption = table(
  { name: 'disruption', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    orgId: t.u32().index('btree'),
    scenarioKey: t.string(),
    kind: t.string(), // weather | port_congestion | accident | blockage | cyber | strike | geopolitical
    title: t.string(),
    summary: t.string(),
    severity: t.string(), // low | moderate | high | critical
    lat: t.f64(),
    lng: t.f64(),
    radiusKm: t.f64(),
    affectedRouteIds: t.array(t.u32()),
    affectedNodeIds: t.array(t.u32()),
    durationHours: t.f64(),
    source: t.string(), // scenario | anomaly | news | random
    status: t.string(), // active | mitigating | resolved
    createdAt: t.timestamp(),
    resolvedAt: t.option(t.timestamp()),
  }
);

export const routeOption = table(
  { name: 'route_option', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    disruptionId: t.u64().index('btree'),
    orgId: t.u32(),
    key: t.string(),
    label: t.string(),
    strategy: t.string(),
    summary: t.string(),
    addedCostUsd: t.f64(),
    avgDelayHours: t.f64(),
    weightedDelayHours: t.f64(),
    slaBreachValueUsd: t.f64(),
    risk: t.f64(),
    score: t.f64(),
    rank: t.u32(),
    shipmentsAffected: t.u32(),
    shipmentsMoved: t.u32(),
    shipmentsHeld: t.u32(),
    actionsJson: t.string(),
  }
);

export const agentRun = table(
  { name: 'agent_run', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    orgId: t.u32().index('btree'),
    disruptionId: t.u64(), // 0 for Ask Arrow requests
    trigger: t.string(), // event | ask
    prompt: t.string(),
    requestedByName: t.string(),
    status: t.string(), // queued | running | awaiting_approval | completed | failed
    model: t.string(),
    activeAgent: t.string(),
    stepCount: t.u32(),
    summary: t.string(),
    answer: t.string(),
    error: t.string(),
    startedAt: t.timestamp(),
    finishedAt: t.option(t.timestamp()),
  }
);

export const agentStep = table(
  { name: 'agent_step', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    runId: t.u64().index('btree'),
    seq: t.u32(),
    agent: t.string(),
    kind: t.string(), // plan | tool_call | observation | decision | handoff | message | error
    tool: t.string(),
    title: t.string(),
    inputJson: t.string(),
    outputJson: t.string(),
    latencyMs: t.u32(),
    ts: t.timestamp(),
  }
);

export const actionProposal = table(
  { name: 'action_proposal', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    runId: t.u64().index('btree'),
    orgId: t.u32(),
    disruptionId: t.u64(),
    kind: t.string(), // reroute | expedite | switch_vendor | hold | notify | ir_draft
    optionId: t.u64(),
    title: t.string(),
    rationale: t.string(),
    payloadJson: t.string(),
    requiresApproval: t.bool(),
    status: t.string(), // pending | approved | rejected | executed | superseded
    createdAt: t.timestamp(),
    decidedByName: t.string(),
    decidedAt: t.option(t.timestamp()),
    decisionNote: t.string(),
  }
);

export const feedItem = table(
  { name: 'feed_item', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    orgId: t.u32().index('btree'),
    ts: t.timestamp(),
    audience: t.string(), // ops | manager | executive
    severity: t.string(), // info | success | warning | critical
    category: t.string(), // system | scenario | agent | action | cyber | briefing
    text: t.string(),
    link: t.string(),
    author: t.string(),
    escalated: t.bool(),
  }
);

/** Org-level risk index sampled every tick; drives the live risk monitor. */
export const riskSample = table(
  { name: 'risk_sample', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    orgId: t.u32().index('btree'),
    ts: t.timestamp(),
    riskIndex: t.f64(),
    onTimePct: t.f64(),
    valueAtRiskUsd: t.f64(),
    inTransit: t.u32(),
  }
);

/** Per-route telemetry (recent rows only). The worker mirrors it to Tiger. */
export const telemetry = table(
  { name: 'telemetry', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    orgId: t.u32().index('btree'),
    routeId: t.u32(),
    ts: t.timestamp(),
    delayHours: t.f64(),
    riskIndex: t.f64(),
    costUsd: t.f64(),
    inTransitUnits: t.u32(),
  }
);

/**
 * Real-world news signals found by the Grok News Scout bot (xAI live web + X
 * search) that could affect this workspace's lanes. Humans decide whether a
 * signal becomes a disruption.
 */
export const newsSignal = table(
  { name: 'news_signal', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    orgId: t.u32().index('btree'),
    scanId: t.u64(),
    ts: t.timestamp(),
    headline: t.string(),
    summary: t.string(),
    region: t.string(),
    kind: t.string(), // weather | port_congestion | strike | blockage | cyber | geopolitical | accident
    severity: t.string(), // watch | warning | critical
    relevance: t.f64(), // 0..1
    lat: t.f64(),
    lng: t.f64(),
    routeIds: t.array(t.u32()),
    sourcesJson: t.string(), // JSON array of URLs
    status: t.string(), // new | escalated | dismissed
    disruptionId: t.u64(),
    decidedByName: t.string(),
  }
);

/** One Grok News Scout pass (requested by a person or by the bot's schedule). */
export const newsScan = table(
  { name: 'news_scan', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    orgId: t.u32().index('btree'),
    trigger: t.string(), // manual | auto
    requestedByName: t.string(),
    status: t.string(), // queued | running | completed | failed
    model: t.string(),
    signalCount: t.u32(),
    /** Real articles Grok reviewed in this scan. */
    searchCalls: t.u32(),
    error: t.string(),
    startedAt: t.timestamp(),
    finishedAt: t.option(t.timestamp()),
  }
);

/** Simulated security telemetry (recent rows only). Mirrored to Tiger. */
export const securityEvent = table(
  { name: 'security_event', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    orgId: t.u32().index('btree'),
    ts: t.timestamp(),
    kind: t.string(),
    severity: t.string(), // low | medium | high | critical
    source: t.string(),
    detail: t.string(),
  }
);

const spacetimedb = schema({
  opsState,
  agentService,
  tickTimer,
  org,
  scenarioPreset,
  userProfile,
  node,
  route,
  shipment,
  vendor,
  disruption,
  routeOption,
  agentRun,
  agentStep,
  actionProposal,
  feedItem,
  riskSample,
  telemetry,
  securityEvent,
  newsSignal,
  newsScan,
});

export default spacetimedb;
