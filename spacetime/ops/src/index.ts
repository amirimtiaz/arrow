/**
 * arrow-ops reducers. Every state change in Arrow's supply-chain side goes
 * through one of these, with a role check on `ctx.sender`:
 *   - any employee: join a workspace, trigger scenarios, ask Arrow, escalate
 *   - managers: approve/reject agent proposals, resolve disruptions, reset
 *   - the agent service identity: log runs/steps, propose actions, brief
 */
import { ScheduleAt, SenderError, t } from 'spacetimedb/server';
import { findScenario } from './scenarios';
import spacetimedb, { tickTimer } from './schema';
import {
  actorName,
  clampText,
  clearOrg,
  evaluateDisruption,
  executeOption,
  isAgent,
  openDisruption,
  postFeed,
  pruneOrg,
  requireAgent,
  requireManager,
  requireOrg,
  requireText,
  requireUser,
  resolveDisruptionRow,
  seedOrg,
  startDrift,
  state,
  TICK_INTERVAL_MICROS,
  tickOrg,
  triggerRandom,
  triggerScenarioDef,
} from './ops';
import { SEED_ORGS } from './seed';

export { default } from './schema';

const ROLES = ['analyst', 'manager', 'executive'];
const PROPOSAL_KINDS = ['reroute', 'expedite', 'switch_vendor', 'hold', 'notify', 'ir_draft'];
const STEP_KINDS = ['plan', 'tool_call', 'observation', 'decision', 'handoff', 'message', 'error'];
const FEED_SEVERITIES = ['info', 'success', 'warning', 'critical'];
const AUDIENCES = ['ops', 'manager', 'executive'];
const MAX_STEPS_PER_RUN = 80;

// ─────────────────────────────── Lifecycle ───────────────────────────────

export const init = spacetimedb.init((ctx) => {
  ctx.db.opsState.insert({
    id: 1,
    ownerHex: ctx.sender.toHexString(),
    agentHex: '',
    tickCount: 0n,
    lastTickAt: ctx.timestamp,
    simPaused: false,
  });
  for (const org of SEED_ORGS) seedOrg(ctx, org.id);
  ctx.db.tickTimer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(TICK_INTERVAL_MICROS) });
});

export const onConnect = spacetimedb.clientConnected((ctx) => {
  const profile = ctx.db.userProfile.identity.find(ctx.sender);
  if (profile) ctx.db.userProfile.identity.update({ ...profile, online: true, lastSeenAt: ctx.timestamp });
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const profile = ctx.db.userProfile.identity.find(ctx.sender);
  if (profile) ctx.db.userProfile.identity.update({ ...profile, online: false, lastSeenAt: ctx.timestamp });
});

/** Scheduled every 2 s: moves shipments, samples risk, emits telemetry. */
export const tick = spacetimedb.reducer({ onSchedule: tickTimer }, { timer: tickTimer.rowType }, (ctx) => {
  if (!ctx.sender.equals(ctx.databaseIdentity)) throw new SenderError('tick is scheduler-only');
  const s = state(ctx);
  if (s.simPaused) return;
  const tickCount = s.tickCount + 1n;
  ctx.db.opsState.id.update({ ...s, tickCount, lastTickAt: ctx.timestamp });
  for (const org of [...ctx.db.org.iter()]) {
    tickOrg(ctx, org.id, org.plan, tickCount);
    if (tickCount % 15n === 0n) pruneOrg(ctx, org.id);
  }
});

// ─────────────────────────────── Setup ───────────────────────────────

/** Owner-only: authorise the worker identity that runs the Nemotron agent. */
export const setAgentIdentity = spacetimedb.reducer({ identityHex: t.string() }, (ctx, { identityHex }) => {
  const s = state(ctx);
  if (ctx.sender.toHexString() !== s.ownerHex) throw new SenderError('Only the module owner can authorise the agent');
  const hex = identityHex.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new SenderError('identityHex must be a 64-character hex identity');
  ctx.db.opsState.id.update({ ...s, agentHex: hex });
});

/** Agent worker heartbeat (every ~10 s) with its configuration status. */
export const agentHeartbeat = spacetimedb.reducer(
  { status: t.string(), model: t.string(), message: t.string(), tigerConnected: t.bool() },
  (ctx, args) => {
    requireAgent(ctx);
    if (!['ready', 'not_configured', 'error'].includes(args.status)) throw new SenderError('Unknown status');
    const row = {
      id: 1,
      status: args.status,
      model: clampText(args.model, 120),
      message: clampText(args.message, 300),
      tigerConnected: args.tigerConnected,
      lastSeenAt: ctx.timestamp,
    };
    if (ctx.db.agentService.id.find(1)) ctx.db.agentService.id.update(row);
    else ctx.db.agentService.insert(row);
  }
);

// ─────────────────────────────── People ───────────────────────────────

export const joinWorkspace = spacetimedb.reducer({ name: t.string(), role: t.string(), orgId: t.u32() }, (ctx, { name, role, orgId }) => {
  const cleanName = requireText(name, 'Name', 60);
  if (!ROLES.includes(role)) throw new SenderError('Unknown role');
  requireOrg(ctx, orgId);
  const existing = ctx.db.userProfile.identity.find(ctx.sender);
  if (existing) {
    ctx.db.userProfile.identity.update({ ...existing, name: cleanName, role, orgId, online: true, lastSeenAt: ctx.timestamp });
  } else {
    ctx.db.userProfile.insert({
      identity: ctx.sender,
      name: cleanName,
      role,
      orgId,
      online: true,
      createdAt: ctx.timestamp,
      lastSeenAt: ctx.timestamp,
    });
  }
});

export const switchOrg = spacetimedb.reducer({ orgId: t.u32() }, (ctx, { orgId }) => {
  const profile = requireUser(ctx);
  requireOrg(ctx, orgId);
  ctx.db.userProfile.identity.update({ ...profile, orgId });
});

// ─────────────────────────────── Scenarios ───────────────────────────────

export const triggerScenario = spacetimedb.reducer({ orgId: t.u32(), scenarioKey: t.string() }, (ctx, { orgId, scenarioKey }) => {
  const by = actorName(ctx);
  const org = requireOrg(ctx, orgId);
  const def = findScenario(scenarioKey);
  if (!def || def.orgSlug !== org.slug) throw new SenderError('Unknown scenario for this workspace');
  const d = triggerScenarioDef(ctx, orgId, def);
  postFeed(ctx, orgId, 'info', 'system', `${by} triggered the "${def.shortLabel}" scenario. The agent will investigate automatically.`, {
    link: `disruption:${d.id}`,
  });
});

export const triggerRandomScenario = spacetimedb.reducer({ orgId: t.u32() }, (ctx, { orgId }) => {
  const by = actorName(ctx);
  requireOrg(ctx, orgId);
  const d = triggerRandom(ctx, orgId);
  postFeed(ctx, orgId, 'info', 'system', `${by} generated a random disruption. The agent will investigate automatically.`, {
    link: `disruption:${d.id}`,
  });
});

/** Starts a silent risk build-up on a healthy lane; only Tiger anomaly detection will flag it. */
export const simulateCongestion = spacetimedb.reducer({ orgId: t.u32() }, (ctx, { orgId }) => {
  const profile = requireUser(ctx);
  if (profile.role === 'executive') throw new SenderError('Executives have a read-only view');
  requireOrg(ctx, orgId);
  const r = startDrift(ctx, orgId);
  postFeed(
    ctx,
    orgId,
    'info',
    'system',
    `${profile.name} started a simulated congestion build-up. No disruption is declared; Tiger Data anomaly detection decides when it becomes one.`,
    { author: profile.name, link: `route:${r.id}` }
  );
});

/** Worker-only: a Tiger anomaly (or news signal) opens a disruption. */
export const reportDisruption = spacetimedb.reducer(
  {
    orgId: t.u32(),
    routeId: t.u32(),
    kind: t.string(),
    title: t.string(),
    summary: t.string(),
    severity: t.string(),
    durationHours: t.f64(),
    source: t.string(),
  },
  (ctx, args) => {
    requireAgent(ctx);
    requireOrg(ctx, args.orgId);
    const r = ctx.db.route.id.find(args.routeId);
    if (!r || r.orgId !== args.orgId) throw new SenderError('Unknown route');
    if (r.status === 'disrupted') throw new SenderError('Route is already disrupted');
    const mid = r.waypoints[Math.floor(r.waypoints.length / 2)];
    openDisruption(ctx, {
      orgId: args.orgId,
      scenarioKey: `${args.source}-${args.kind}`,
      kind: args.kind,
      title: requireText(args.title, 'Title', 160),
      summary: requireText(args.summary, 'Summary', 600),
      severity: ['low', 'moderate', 'high', 'critical'].includes(args.severity) ? args.severity : 'moderate',
      lat: mid.lat,
      lng: mid.lng,
      radiusKm: r.mode === 'sea' ? 200 : 40,
      routeIds: [r.id],
      atRiskRouteIds: [],
      nodeIds: [],
      durationHours: Math.min(Math.max(args.durationHours, 1), 720),
      source: args.source === 'news' ? 'news' : 'anomaly',
    });
  }
);

export const resolveDisruption = spacetimedb.reducer({ disruptionId: t.u64() }, (ctx, { disruptionId }) => {
  const by = isAgent(ctx) ? 'Arrow Agent' : requireManager(ctx).name;
  const d = ctx.db.disruption.id.find(disruptionId);
  if (!d) throw new SenderError('Unknown disruption');
  if (d.status === 'resolved') throw new SenderError('Already resolved');
  resolveDisruptionRow(ctx, d, by);
  for (const p of [...ctx.db.actionProposal.iter()]) {
    if (p.disruptionId === disruptionId && p.status === 'pending' && p.kind !== 'ir_draft') {
      ctx.db.actionProposal.id.update({ ...p, status: 'superseded', decisionNote: 'Disruption resolved' });
    }
  }
});

export const resetOrg = spacetimedb.reducer({ orgId: t.u32() }, (ctx, { orgId }) => {
  const manager = requireManager(ctx);
  requireOrg(ctx, orgId);
  clearOrg(ctx, orgId);
  seedOrg(ctx, orgId);
  postFeed(ctx, orgId, 'info', 'system', `${manager.name} reset the demo workspace.`);
});

export const setSimPaused = spacetimedb.reducer({ paused: t.bool() }, (ctx, { paused }) => {
  requireManager(ctx);
  ctx.db.opsState.id.update({ ...state(ctx), simPaused: paused });
});

// ─────────────────────────────── Agent ───────────────────────────────

/** Scores every response option for a disruption (deterministic, no LLM). */
export const evaluateAlternatives = spacetimedb.reducer({ disruptionId: t.u64() }, (ctx, { disruptionId }) => {
  actorName(ctx);
  evaluateDisruption(ctx, disruptionId);
});

export const askArrow = spacetimedb.reducer({ orgId: t.u32(), prompt: t.string() }, (ctx, { orgId, prompt }) => {
  const profile = requireUser(ctx);
  requireOrg(ctx, orgId);
  const pending = [...ctx.db.agentRun.orgId.filter(orgId)].filter(
    (r) => r.trigger === 'ask' && (r.status === 'queued' || r.status === 'running')
  );
  if (pending.length >= 3) throw new SenderError('Arrow is still working on earlier questions. Try again in a moment.');
  ctx.db.agentRun.insert({
    id: 0n,
    orgId,
    disruptionId: 0n,
    trigger: 'ask',
    prompt: requireText(prompt, 'Question', 1000),
    requestedByName: profile.name,
    status: 'queued',
    model: '',
    activeAgent: '',
    stepCount: 0,
    summary: '',
    answer: '',
    error: '',
    startedAt: ctx.timestamp,
    finishedAt: undefined,
  });
});

export const startAgentRun = spacetimedb.reducer({ disruptionId: t.u64(), model: t.string() }, (ctx, { disruptionId, model }) => {
  requireAgent(ctx);
  const d = ctx.db.disruption.id.find(disruptionId);
  if (!d) throw new SenderError('Unknown disruption');
  const existing = [...ctx.db.agentRun.orgId.filter(d.orgId)].find((r) => r.disruptionId === disruptionId && r.trigger === 'event');
  if (existing) throw new SenderError(`Run ${existing.id} already handles this disruption`);
  ctx.db.agentRun.insert({
    id: 0n,
    orgId: d.orgId,
    disruptionId,
    trigger: 'event',
    prompt: '',
    requestedByName: 'Event trigger',
    status: 'running',
    model: clampText(model, 120),
    activeAgent: 'Disruption Analyst',
    stepCount: 0,
    summary: '',
    answer: '',
    error: '',
    startedAt: ctx.timestamp,
    finishedAt: undefined,
  });
});

export const claimAgentRun = spacetimedb.reducer({ runId: t.u64(), model: t.string() }, (ctx, { runId, model }) => {
  requireAgent(ctx);
  const run = ctx.db.agentRun.id.find(runId);
  if (!run) throw new SenderError('Unknown run');
  if (run.status !== 'queued') throw new SenderError('Run is not queued');
  ctx.db.agentRun.id.update({ ...run, status: 'running', model: clampText(model, 120), activeAgent: 'Arrow Copilot' });
});

export const logAgentStep = spacetimedb.reducer(
  {
    runId: t.u64(),
    agent: t.string(),
    kind: t.string(),
    tool: t.string(),
    title: t.string(),
    inputJson: t.string(),
    outputJson: t.string(),
    latencyMs: t.u32(),
  },
  (ctx, args) => {
    requireAgent(ctx);
    const run = ctx.db.agentRun.id.find(args.runId);
    if (!run) throw new SenderError('Unknown run');
    if (!STEP_KINDS.includes(args.kind)) throw new SenderError('Unknown step kind');
    if (run.stepCount >= MAX_STEPS_PER_RUN) throw new SenderError('Step limit reached for this run');
    const seq = run.stepCount + 1;
    ctx.db.agentStep.insert({
      id: 0n,
      runId: args.runId,
      seq,
      agent: clampText(args.agent, 60),
      kind: args.kind,
      tool: clampText(args.tool, 60),
      title: clampText(args.title, 240),
      inputJson: clampText(args.inputJson, 16000),
      outputJson: clampText(args.outputJson, 24000),
      latencyMs: args.latencyMs,
      ts: ctx.timestamp,
    });
    ctx.db.agentRun.id.update({ ...run, stepCount: seq, activeAgent: clampText(args.agent, 60) });
  }
);

export const proposeAction = spacetimedb.reducer(
  {
    runId: t.u64(),
    kind: t.string(),
    optionId: t.u64(),
    title: t.string(),
    rationale: t.string(),
    payloadJson: t.string(),
  },
  (ctx, args) => {
    requireAgent(ctx);
    const run = ctx.db.agentRun.id.find(args.runId);
    if (!run) throw new SenderError('Unknown run');
    if (!PROPOSAL_KINDS.includes(args.kind)) throw new SenderError('Unknown proposal kind');
    const title = requireText(args.title, 'Title', 200);
    const rationale = requireText(args.rationale, 'Rationale', 4000);
    const disruptionId = run.disruptionId;

    if (args.kind === 'ir_draft') {
      const d = ctx.db.disruption.id.find(disruptionId);
      if (!d || d.kind !== 'cyber') throw new SenderError('IR drafts are only for cyber disruptions');
    }
    if (['reroute', 'expedite', 'switch_vendor', 'hold'].includes(args.kind)) {
      const option = ctx.db.routeOption.id.find(args.optionId);
      if (!option || option.disruptionId !== disruptionId) {
        throw new SenderError('optionId must reference a scored option for this disruption');
      }
    }

    const autoExecutes = args.kind === 'notify';
    ctx.db.actionProposal.insert({
      id: 0n,
      runId: args.runId,
      orgId: run.orgId,
      disruptionId,
      kind: args.kind,
      optionId: args.optionId,
      title,
      rationale,
      payloadJson: clampText(args.payloadJson, 20000),
      requiresApproval: !autoExecutes && args.kind !== 'ir_draft',
      status: autoExecutes ? 'executed' : 'pending',
      createdAt: ctx.timestamp,
      decidedByName: autoExecutes ? 'Auto (low risk)' : '',
      decidedAt: autoExecutes ? ctx.timestamp : undefined,
      decisionNote: '',
    });

    if (autoExecutes) {
      postFeed(ctx, run.orgId, 'info', 'agent', `${title}: ${rationale}`, { author: 'Arrow Agent', link: `run:${run.id}` });
    } else if (args.kind !== 'ir_draft') {
      ctx.db.agentRun.id.update({ ...run, status: 'awaiting_approval' });
      postFeed(ctx, run.orgId, 'warning', 'agent', `Approval needed: ${title}`, {
        author: 'Arrow Agent',
        link: `run:${run.id}`,
        audience: 'manager',
      });
    } else {
      postFeed(ctx, run.orgId, 'warning', 'cyber', `Incident draft ready for the Control Tower: ${title}`, {
        author: 'Cyber Triage',
        link: `run:${run.id}`,
      });
    }
  }
);

export const finishAgentRun = spacetimedb.reducer(
  { runId: t.u64(), status: t.string(), summary: t.string(), answer: t.string(), error: t.string() },
  (ctx, args) => {
    requireAgent(ctx);
    const run = ctx.db.agentRun.id.find(args.runId);
    if (!run) throw new SenderError('Unknown run');
    if (!['completed', 'failed'].includes(args.status)) throw new SenderError('Status must be completed or failed');
    const awaiting = [...ctx.db.actionProposal.runId.filter(args.runId)].some((p) => p.status === 'pending' && p.requiresApproval);
    ctx.db.agentRun.id.update({
      ...run,
      status: args.status === 'failed' ? 'failed' : awaiting ? 'awaiting_approval' : 'completed',
      summary: clampText(args.summary, 2000),
      answer: clampText(args.answer, 8000),
      error: clampText(args.error, 2000),
      finishedAt: ctx.timestamp,
    });
    if (args.status === 'failed') {
      postFeed(ctx, run.orgId, 'warning', 'agent', `Agent run #${run.id} failed: ${clampText(args.error, 200)}`, {
        author: 'Arrow Agent',
        link: `run:${run.id}`,
      });
    }
  }
);

export const postFeedItem = spacetimedb.reducer(
  { orgId: t.u32(), audience: t.string(), severity: t.string(), category: t.string(), text: t.string(), link: t.string() },
  (ctx, args) => {
    const author = isAgent(ctx) ? 'Arrow Agent' : requireManager(ctx).name;
    requireOrg(ctx, args.orgId);
    if (!FEED_SEVERITIES.includes(args.severity)) throw new SenderError('Unknown severity');
    if (!AUDIENCES.includes(args.audience)) throw new SenderError('Unknown audience');
    postFeed(ctx, args.orgId, args.severity as 'info', clampText(args.category, 30), requireText(args.text, 'Text', 600), {
      link: clampText(args.link, 120),
      author,
      audience: args.audience,
    });
  }
);

export const escalateFeedItem = spacetimedb.reducer({ feedItemId: t.u64() }, (ctx, { feedItemId }) => {
  const profile = requireUser(ctx);
  const item = ctx.db.feedItem.id.find(feedItemId);
  if (!item) throw new SenderError('Unknown feed item');
  if (item.escalated) return;
  ctx.db.feedItem.id.update({ ...item, escalated: true, audience: 'executive' });
  postFeed(ctx, item.orgId, 'info', 'briefing', `${profile.name} escalated to executives: ${clampText(item.text, 300)}`, {
    link: item.link,
    author: profile.name,
    audience: 'executive',
  });
});

// ─────────────────────────────── Approvals ───────────────────────────────

export const approveAction = spacetimedb.reducer({ proposalId: t.u64(), note: t.string() }, (ctx, { proposalId, note }) => {
  const manager = requireManager(ctx);
  const p = ctx.db.actionProposal.id.find(proposalId);
  if (!p) throw new SenderError('Unknown proposal');
  if (p.status !== 'pending' || !p.requiresApproval) throw new SenderError('This proposal is not awaiting approval');
  const option = ctx.db.routeOption.id.find(p.optionId);
  if (!option) throw new SenderError('The scored option no longer exists. Re-run the evaluation.');
  const d = ctx.db.disruption.id.find(p.disruptionId);
  if (!d || d.status === 'resolved') throw new SenderError('The disruption is no longer active');

  const touched = executeOption(ctx, option.actionsJson, option.label);
  ctx.db.actionProposal.id.update({
    ...p,
    status: 'executed',
    decidedByName: manager.name,
    decidedAt: ctx.timestamp,
    decisionNote: clampText(note, 500),
  });
  ctx.db.disruption.id.update({ ...d, status: 'mitigating' });
  for (const other of [...ctx.db.actionProposal.runId.filter(p.runId)]) {
    if (other.id !== p.id && other.status === 'pending' && other.requiresApproval) {
      ctx.db.actionProposal.id.update({ ...other, status: 'superseded', decisionNote: `Superseded by #${p.id}` });
    }
  }
  const run = ctx.db.agentRun.id.find(p.runId);
  if (run && run.status === 'awaiting_approval') ctx.db.agentRun.id.update({ ...run, status: 'completed' });
  postFeed(
    ctx,
    p.orgId,
    'success',
    'action',
    `${manager.name} approved "${option.label}". ${touched} shipments re-planned; globe updated.`,
    {
      link: `disruption:${d.id}`,
      author: manager.name,
      audience: 'executive',
    }
  );
});

export const rejectAction = spacetimedb.reducer({ proposalId: t.u64(), note: t.string() }, (ctx, { proposalId, note }) => {
  const manager = requireManager(ctx);
  const p = ctx.db.actionProposal.id.find(proposalId);
  if (!p) throw new SenderError('Unknown proposal');
  if (p.status !== 'pending' || !p.requiresApproval) throw new SenderError('This proposal is not awaiting approval');
  ctx.db.actionProposal.id.update({
    ...p,
    status: 'rejected',
    decidedByName: manager.name,
    decidedAt: ctx.timestamp,
    decisionNote: clampText(note, 500),
  });
  const run = ctx.db.agentRun.id.find(p.runId);
  if (run && run.status === 'awaiting_approval') ctx.db.agentRun.id.update({ ...run, status: 'completed' });
  postFeed(ctx, p.orgId, 'info', 'action', `${manager.name} rejected "${p.title}"${note.trim() ? `: ${clampText(note, 200)}` : '.'}`, {
    link: `disruption:${p.disruptionId}`,
    author: manager.name,
  });
});

/** Human-gated ops → IR hand-off: records that a Control Tower member opened the incident. */
export const acknowledgeIrDraft = spacetimedb.reducer(
  { proposalId: t.u64(), incidentRef: t.string() },
  (ctx, { proposalId, incidentRef }) => {
    const profile = requireUser(ctx);
    const p = ctx.db.actionProposal.id.find(proposalId);
    if (!p || p.kind !== 'ir_draft') throw new SenderError('Unknown incident draft');
    if (p.status !== 'pending') throw new SenderError('This draft was already handled');
    ctx.db.actionProposal.id.update({
      ...p,
      status: 'executed',
      decidedByName: profile.name,
      decidedAt: ctx.timestamp,
      decisionNote: `Opened in Control Tower as ${clampText(incidentRef, 40)}`,
    });
    postFeed(ctx, p.orgId, 'info', 'cyber', `Incident response engaged: ${p.title} is now tracked in the isolated Control Tower.`, {
      author: profile.name,
      link: `disruption:${p.disruptionId}`,
    });
  }
);
