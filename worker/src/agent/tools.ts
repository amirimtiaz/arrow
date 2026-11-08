/**
 * Agent tools. Each tool reads live SpacetimeDB rows (or Tiger history) or
 * calls a reducer, and returns compact JSON. All numbers the agent may cite
 * come from these outputs; the LLM never computes cost, delay or risk.
 */
import { z } from 'zod';
import type { HistoryProvider } from '../tiger/history';
import { waitFor, type Ops } from '../spacetime';

export interface RunNotes {
  findings?: string;
  proposalTitle?: string;
  irDrafted?: boolean;
  summary?: string;
}

export interface ToolContext {
  ops: Ops;
  runId: bigint;
  orgId: number;
  disruptionId: bigint;
  history: HistoryProvider;
  notes: RunNotes;
}

export interface ToolResult {
  result: unknown;
  summary: string;
}

export interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodObject;
  /** Ends the current agent's turn loop once executed. */
  terminal?: boolean;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

function tool<S extends z.ZodObject>(def: {
  name: string;
  description: string;
  schema: S;
  terminal?: boolean;
  run(args: z.infer<S>, ctx: ToolContext): Promise<ToolResult> | ToolResult;
}): ToolDef {
  return { ...def, run: async (args, ctx) => def.run(args as z.infer<S>, ctx) };
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// ─────────────────────────────── Data helpers ───────────────────────────────

function orgRoutes(ctx: ToolContext) {
  return [...ctx.ops.db.route.iter()].filter((r) => r.orgId === ctx.orgId);
}
function orgNodes(ctx: ToolContext) {
  return [...ctx.ops.db.node.iter()].filter((n) => n.orgId === ctx.orgId);
}
function orgShipments(ctx: ToolContext) {
  return [...ctx.ops.db.shipment.iter()].filter((s) => s.orgId === ctx.orgId);
}

function requireDisruption(ctx: ToolContext, id?: number) {
  const disruptionId = id !== undefined ? BigInt(id) : ctx.disruptionId;
  const d = ctx.ops.db.disruption.id.find(disruptionId);
  if (!d || d.orgId !== ctx.orgId) throw new Error(`Disruption ${disruptionId} not found in this workspace`);
  return d;
}

function routeSummary(ctx: ToolContext, routeId: number) {
  const r = ctx.ops.db.route.id.find(routeId);
  if (!r) return null;
  const shipments = orgShipments(ctx).filter((s) => s.routeId === r.id);
  return {
    route_id: r.id,
    label: r.label,
    lane: r.lane,
    mode: r.mode,
    status: r.status,
    eta_hours: round(r.etaHours),
    shipments: shipments.length,
    value_in_transit_usd: Math.round(shipments.reduce((sum, s) => sum + s.valueUsd, 0)),
  };
}

function priorityBreakdown(shipments: { priority: string; valueUsd: number; units: number }[]) {
  const out: Record<string, { shipments: number; units: number; value_usd: number }> = {};
  for (const p of ['critical', 'high', 'standard', 'low']) out[p] = { shipments: 0, units: 0, value_usd: 0 };
  for (const s of shipments) {
    const bucket = out[s.priority] ?? (out[s.priority] = { shipments: 0, units: 0, value_usd: 0 });
    bucket.shipments += 1;
    bucket.units += s.units;
    bucket.value_usd += Math.round(s.valueUsd);
  }
  return out;
}

// ─────────────────────────────── Shared tools ───────────────────────────────

export const submitPlan = tool({
  name: 'submit_plan',
  description:
    'Record your investigation plan as an explicit ordered list of steps before calling other tools. Call again to re-plan if new findings change your approach.',
  schema: z.object({
    goal: z.string().min(5).max(300).describe('What this run must achieve'),
    steps: z.array(z.string().min(3).max(200)).min(2).max(8).describe('Ordered steps, each naming the tool you will use'),
  }),
  run: ({ goal, steps }) => ({ result: { recorded: true, goal, steps }, summary: `Plan recorded (${steps.length} steps)` }),
});

export const getDisruption = tool({
  name: 'get_disruption',
  description: 'Get the disruption that triggered this run: kind, severity, location, duration estimate, affected lanes and nodes.',
  schema: z.object({ disruption_id: z.number().int().positive().optional().describe('Defaults to the triggering disruption') }),
  run: ({ disruption_id }, ctx) => {
    const d = requireDisruption(ctx, disruption_id);
    const nodes = d.affectedNodeIds.map((id) => ctx.ops.db.node.id.find(id)).filter((n) => !!n);
    const org = ctx.ops.db.org.id.find(d.orgId);
    return {
      result: {
        disruption_id: Number(d.id),
        workspace: org ? `${org.name} (${org.planLabel})` : String(d.orgId),
        title: d.title,
        kind: d.kind,
        severity: d.severity,
        status: d.status,
        source: d.source,
        summary: d.summary,
        location: { lat: d.lat, lng: d.lng, radius_km: d.radiusKm },
        estimated_duration_hours: d.durationHours,
        affected_routes: d.affectedRouteIds.map((id) => routeSummary(ctx, id)).filter(Boolean),
        affected_nodes: nodes.map((n) => ({ node_id: n.id, name: n.name, kind: n.kind, city: n.city, status: n.status })),
      },
      summary: `${d.title} · ${d.severity} · ${d.affectedRouteIds.length} lanes · ~${d.durationHours} h`,
    };
  },
});

export const listAffectedShipments = tool({
  name: 'list_affected_shipments',
  description:
    'List shipments on the lanes affected by a disruption, with totals by priority (units, value) and the most valuable shipments.',
  schema: z.object({
    disruption_id: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(20).optional().describe('How many top shipments to return (default 8)'),
  }),
  run: ({ disruption_id, limit }, ctx) => {
    const d = requireDisruption(ctx, disruption_id);
    const routeIds = new Set(d.affectedRouteIds);
    const shipments = orgShipments(ctx).filter((s) => routeIds.has(s.routeId) || routeIds.has(s.originRouteId));
    const value = shipments.reduce((sum, s) => sum + s.valueUsd, 0);
    const byPriority = priorityBreakdown(shipments);
    const top = [...shipments]
      .sort((a, b) => b.valueUsd - a.valueUsd)
      .slice(0, limit ?? 8)
      .map((s) => ({
        ref: s.ref,
        goods: s.goods,
        priority: s.priority,
        units: s.units,
        value_usd: Math.round(s.valueUsd),
        cold_chain: s.coldChain,
        status: s.status,
        route: ctx.ops.db.route.id.find(s.routeId)?.label ?? String(s.routeId),
      }));
    return {
      result: {
        shipments: shipments.length,
        units: shipments.reduce((sum, s) => sum + s.units, 0),
        value_usd: Math.round(value),
        cold_chain_shipments: shipments.filter((s) => s.coldChain).length,
        by_priority: byPriority,
        top_by_value: top,
      },
      summary: `${shipments.length} shipments · ${usd(value)} at stake · ${byPriority.critical.shipments} critical, ${byPriority.high.shipments} high`,
    };
  },
});

export const queryRouteHistory = tool({
  name: 'query_route_history',
  description:
    'Query time-series history (Tiger Data) for lanes: average and peak risk index, delays and past incidents over a window, compared with now. Defaults to the affected lanes.',
  schema: z.object({
    route_ids: z.array(z.number().int().positive()).max(6).optional(),
    hours: z.number().int().min(1).max(168).optional().describe('Look-back window in hours (default 168 = 7 days)'),
  }),
  run: async ({ route_ids, hours }, ctx) => {
    const ids =
      route_ids && route_ids.length > 0
        ? route_ids
        : ctx.disruptionId > 0n
          ? requireDisruption(ctx).affectedRouteIds.slice(0, 6)
          : orgRoutes(ctx)
              .filter((r) => r.status !== 'standby')
              .sort((a, b) => b.risk - a.risk)
              .slice(0, 4)
              .map((r) => r.id);
    const history = await ctx.history.routeHistory(ctx.orgId, ids, hours ?? 168);
    const labelled = history.routes.map((h) => ({ ...h, label: ctx.ops.db.route.id.find(h.route_id)?.label ?? String(h.route_id) }));
    const worst = [...labelled].sort((a, b) => b.peak_risk - a.peak_risk)[0];
    return {
      result: { source: history.source, window_hours: history.windowHours, routes: labelled },
      summary: worst
        ? `${history.source}: ${labelled.length} lanes · peak risk ${worst.peak_risk} on ${worst.label} · ${worst.incidents} past incidents`
        : `${history.source}: no history available`,
    };
  },
});

export const checkVendorRisk = tool({
  name: 'check_vendor_risk',
  description:
    'Check vendor and partner risk (risk score 0-100, on-time %, cyber posture, notes) for nodes on the affected lanes, or for the whole workspace.',
  schema: z.object({ scope: z.enum(['affected', 'all']).optional().describe('Default: affected (falls back to all if none)') }),
  run: ({ scope }, ctx) => {
    let nodeIds: Set<number> | null = null;
    if (scope !== 'all' && ctx.disruptionId > 0n) {
      const d = requireDisruption(ctx);
      nodeIds = new Set(d.affectedNodeIds);
      for (const id of d.affectedRouteIds) {
        const r = ctx.ops.db.route.id.find(id);
        if (r) {
          nodeIds.add(r.fromNodeId);
          nodeIds.add(r.toNodeId);
        }
      }
    }
    const all = [...ctx.ops.db.vendor.iter()].filter((v) => v.orgId === ctx.orgId);
    let vendors = nodeIds ? all.filter((v) => nodeIds!.has(v.nodeId)) : all;
    if (vendors.length === 0) vendors = all;
    const rows = vendors
      .sort((a, b) => b.riskScore - a.riskScore)
      .map((v) => ({
        vendor: v.name,
        category: v.category,
        tier: v.tier,
        risk_score: v.riskScore,
        on_time_pct: v.onTimePct,
        cyber_posture: v.cyberPosture,
        node: ctx.ops.db.node.id.find(v.nodeId)?.name ?? '',
        notes: v.notes,
      }));
    const top = rows[0];
    return {
      result: { vendors: rows },
      summary: top
        ? `${rows.length} vendors · highest risk ${top.vendor} (${top.risk_score}/100, ${top.cyber_posture} cyber)`
        : 'No vendors on file',
    };
  },
});

// ─────────────────────────────── Analyst ───────────────────────────────

export const handoffToPlanner = tool({
  name: 'handoff_to_planner',
  description:
    'Hand your findings to the Recovery Planner. Call this once your investigation is complete. Cite only numbers from tool outputs.',
  schema: z.object({ findings: z.string().min(20).max(2000).describe('Concise findings: what happened, what is at stake, key risks') }),
  terminal: true,
  run: ({ findings }, ctx) => {
    ctx.notes.findings = findings;
    return { result: { handed_off: true }, summary: 'Findings handed to the Recovery Planner' };
  },
});

// ─────────────────────────────── Planner ───────────────────────────────

function optionsFor(ctx: ToolContext, disruptionId: bigint) {
  return [...ctx.ops.db.routeOption.iter()]
    .filter((o) => o.disruptionId === disruptionId)
    .sort((a, b) => a.rank - b.rank)
    .map((o) => {
      let impact = 0;
      try {
        impact = (JSON.parse(o.actionsJson) as { expectedImpactUsd?: number }).expectedImpactUsd ?? 0;
      } catch {
        /* ignore */
      }
      return {
        option_key: o.key,
        label: o.label,
        strategy: o.strategy,
        rank: o.rank,
        score: o.score,
        expected_impact_usd: impact,
        added_cost_usd: o.addedCostUsd,
        avg_delay_hours: o.avgDelayHours,
        priority_weighted_delay_hours: o.weightedDelayHours,
        sla_breach_value_usd: o.slaBreachValueUsd,
        residual_risk: o.risk,
        shipments_moved: o.shipmentsMoved,
        shipments_held: o.shipmentsHeld,
        summary: o.summary,
      };
    });
}

export const evaluateRouteAlternatives = tool({
  name: 'evaluate_route_alternatives',
  description:
    'Score every response option for the disruption. SpacetimeDB computes added cost, delay, SLA breaches, residual risk, expected impact and a 0-100 score from live shipments.',
  schema: z.object({ disruption_id: z.number().int().positive().optional() }),
  run: async ({ disruption_id }, ctx) => {
    const d = requireDisruption(ctx, disruption_id);
    const before = new Set([...ctx.ops.db.routeOption.iter()].filter((o) => o.disruptionId === d.id).map((o) => o.id));
    await ctx.ops.reducers.evaluateAlternatives({ disruptionId: d.id });
    await waitFor(ctx.ops.db.routeOption, () => {
      const fresh = [...ctx.ops.db.routeOption.iter()].filter((o) => o.disruptionId === d.id && !before.has(o.id));
      return fresh.length > 0 ? fresh : undefined;
    });
    const options = optionsFor(ctx, d.id);
    const best = options[0];
    return {
      result: { computed_by: 'SpacetimeDB reducer evaluate_alternatives', options },
      summary: best
        ? `${options.length} options scored · best: ${best.label} (score ${best.score}, impact ${usd(best.expected_impact_usd)})`
        : 'No options computed',
    };
  },
});

export const getRouteOptions = tool({
  name: 'get_route_options',
  description: 'Read the already-scored response options for a disruption (call evaluate_route_alternatives first if none exist).',
  schema: z.object({ disruption_id: z.number().int().positive().optional() }),
  run: ({ disruption_id }, ctx) => {
    const d = requireDisruption(ctx, disruption_id);
    const options = optionsFor(ctx, d.id);
    return { result: { options }, summary: `${options.length} scored options` };
  },
});

export const proposeAction = tool({
  name: 'propose_action',
  description:
    'Propose ONE scored option for human approval. State-changing actions never run without an operations manager approving them. Explain the choice citing only tool outputs.',
  schema: z.object({
    option_key: z.string().min(1).max(60).describe('option_key from evaluate_route_alternatives'),
    kind: z.enum(['reroute', 'expedite', 'switch_vendor', 'hold']),
    title: z.string().min(5).max(160),
    rationale: z.string().min(20).max(1500).describe('Why this option beats the alternatives, with cited numbers'),
  }),
  run: async ({ option_key, kind, title, rationale }, ctx) => {
    const option = [...ctx.ops.db.routeOption.iter()].find((o) => o.disruptionId === ctx.disruptionId && o.key === option_key);
    if (!option) throw new Error(`Unknown option_key "${option_key}". Use one returned by evaluate_route_alternatives.`);
    await ctx.ops.reducers.proposeAction({
      runId: ctx.runId,
      kind,
      optionId: option.id,
      title,
      rationale,
      payloadJson: JSON.stringify({ option_key, strategy: option.strategy, score: option.score }),
    });
    ctx.notes.proposalTitle = title;
    return {
      result: { status: 'pending_manager_approval', option: option.label },
      summary: `Proposed "${option.label}" for manager approval`,
    };
  },
});

export const postBriefing = tool({
  name: 'post_briefing',
  description:
    'Post a short status briefing to the live feed (low-risk; runs automatically): what changed, why it matters, what is recommended.',
  schema: z.object({ text: z.string().min(20).max(500) }),
  run: async ({ text }, ctx) => {
    await ctx.ops.reducers.proposeAction({
      runId: ctx.runId,
      kind: 'notify',
      optionId: 0n,
      title: 'Briefing',
      rationale: text,
      payloadJson: '{}',
    });
    return { result: { posted: true }, summary: 'Briefing posted to the live feed' };
  },
});

export const finishRun = tool({
  name: 'finish_run',
  description: 'Finish your part of the run with a 1-3 sentence summary.',
  schema: z.object({ summary: z.string().min(10).max(800) }),
  terminal: true,
  run: ({ summary }, ctx) => {
    ctx.notes.summary = summary;
    return { result: { finished: true }, summary: 'Run summary recorded' };
  },
});

// ─────────────────────────────── Cyber triage ───────────────────────────────

export const getIrHints = tool({
  name: 'get_ir_hints',
  description:
    'Get incident-response context for a cyber disruption: affected systems, indicators of compromise and suspected data scope from detections.',
  schema: z.object({}),
  run: (_args, ctx) => {
    const d = requireDisruption(ctx);
    const preset = ctx.ops.db.scenarioPreset.key.find(d.scenarioKey);
    let hints: unknown = null;
    try {
      hints = preset?.irHintJson ? JSON.parse(preset.irHintJson) : null;
    } catch {
      hints = null;
    }
    const nodes = d.affectedNodeIds.map((id) => ctx.ops.db.node.id.find(id)?.name).filter(Boolean);
    const recentAlerts = [...ctx.ops.db.securityEvent.iter()]
      .filter((e) => e.orgId === ctx.orgId && (e.severity === 'high' || e.severity === 'critical'))
      .slice(-12)
      .map((e) => ({ kind: e.kind, severity: e.severity, source: e.source, detail: e.detail }));
    return {
      result: { disruption: d.title, affected_nodes: nodes, detections: hints, recent_security_alerts: recentAlerts },
      summary: `${recentAlerts.length} high/critical alerts · ${nodes.length} affected systems`,
    };
  },
});

const ScopeItem = z.object({
  asset: z.string().min(2).max(160),
  system: z.string().min(2).max(160),
  data_class: z.enum(['pii', 'phi', 'pci', 'credentials', 'ip', 'financial', 'operational']),
  status: z.enum([
    'unknown',
    'accessed',
    'exfiltrated',
    'encrypted_ransomware',
    'destroyed_wiped',
    'integrity_modified',
    'contained',
    'restored',
  ]),
  confidence: z.enum(['suspected', 'confirmed']),
  records: z.number().int().min(0).max(1_000_000_000),
});

export const draftIrIncident = tool({
  name: 'draft_ir_incident',
  description:
    'Create an incident DRAFT for the isolated Control Tower (NIST SP 800-61 / CISA fields). Ops cannot create incidents: an authenticated IR member reviews the draft.',
  schema: z.object({
    title: z.string().min(5).max(160),
    summary: z.string().min(20).max(1500),
    severity: z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4']),
    category: z.enum(['ransomware', 'data_exfiltration', 'bec_phishing', 'ddos', 'insider', 'supply_chain_compromise', 'other']),
    attack_vector: z.enum([
      'unknown',
      'attrition',
      'web',
      'email_phishing',
      'external_media',
      'impersonation_spoofing',
      'improper_usage',
      'loss_theft',
      'other',
    ]),
    functional_impact: z.enum(['none', 'low', 'medium', 'high']),
    information_impact: z.enum(['none', 'privacy_breach', 'proprietary_breach', 'integrity_loss']),
    recoverability: z.enum(['regular', 'supplemented', 'extended', 'not_recoverable']),
    iocs: z.array(z.string().min(3).max(300)).max(12),
    scope: z.array(ScopeItem).max(12),
  }),
  terminal: true,
  run: async (args, ctx) => {
    const d = requireDisruption(ctx);
    const org = ctx.ops.db.org.id.find(ctx.orgId);
    const payload = {
      title: args.title,
      summary: args.summary,
      severity: args.severity,
      category: args.category,
      attackVector: args.attack_vector,
      functionalImpact: args.functional_impact,
      informationImpact: args.information_impact,
      recoverability: args.recoverability,
      iocs: args.iocs,
      scope: args.scope.map((s) => ({
        asset: s.asset,
        system: s.system,
        dataClass: s.data_class,
        status: s.status,
        confidence: s.confidence,
        records: s.records,
      })),
      affectedNodes: d.affectedNodeIds.map((id) => ctx.ops.db.node.id.find(id)?.name ?? String(id)),
      disruptionId: Number(d.id),
      orgName: org?.name ?? '',
    };
    await ctx.ops.reducers.proposeAction({
      runId: ctx.runId,
      kind: 'ir_draft',
      optionId: 0n,
      title: args.title,
      rationale: args.summary,
      payloadJson: JSON.stringify(payload),
    });
    ctx.notes.irDrafted = true;
    return {
      result: { status: 'draft_ready_for_control_tower' },
      summary: `IR draft created (${args.severity}, ${args.scope.length} scope rows)`,
    };
  },
});

// ─────────────────────────────── Ask Arrow ───────────────────────────────

export const getNetworkOverview = tool({
  name: 'get_network_overview',
  description:
    'Overview of the workspace right now: lanes by status, shipments by status, value in transit / at risk, on-time %, active disruptions, latest risk index.',
  schema: z.object({}),
  run: (_args, ctx) => {
    const org = ctx.ops.db.org.id.find(ctx.orgId);
    const routes = orgRoutes(ctx).filter((r) => r.status !== 'standby');
    const shipments = orgShipments(ctx);
    const count = <T>(rows: T[], key: (r: T) => string) =>
      rows.reduce<Record<string, number>>((acc, r) => ((acc[key(r)] = (acc[key(r)] ?? 0) + 1), acc), {});
    const value = shipments.reduce((s, x) => s + x.valueUsd, 0);
    const late = shipments.filter((s) => s.status === 'delayed' || s.status === 'held').reduce((s, x) => s + x.valueUsd, 0);
    const disruptions = [...ctx.ops.db.disruption.iter()].filter((d) => d.orgId === ctx.orgId && d.status !== 'resolved');
    const risk = [...ctx.ops.db.riskSample.iter()].filter((r) => r.orgId === ctx.orgId).at(-1);
    return {
      result: {
        workspace: org ? { name: org.name, plan: org.planLabel, scope: org.scope, industry: org.industry } : null,
        lanes_by_status: count(routes, (r) => r.status),
        lanes_by_mode: count(routes, (r) => r.mode),
        shipments_by_status: count(shipments, (s) => s.status),
        value_in_transit_usd: Math.round(value),
        value_late_usd: Math.round(late),
        on_time_pct: value > 0 ? round(100 * (1 - late / value)) : 100,
        latest_risk_index: risk?.riskIndex ?? null,
        active_disruptions: disruptions.map((d) => ({
          disruption_id: Number(d.id),
          title: d.title,
          kind: d.kind,
          severity: d.severity,
          status: d.status,
        })),
      },
      summary: `${routes.length} lanes · ${shipments.length} shipments · ${usd(value)} in transit · ${disruptions.length} active disruptions`,
    };
  },
});

export const listRoutes = tool({
  name: 'list_routes',
  description: 'List lanes with status, mode, ETA, shipment count and value in transit. Filter by status or mode; sorted by value.',
  schema: z.object({
    status: z.enum(['healthy', 'at_risk', 'disrupted', 'rerouted']).optional(),
    mode: z.enum(['sea', 'air', 'rail', 'truck']).optional(),
    limit: z.number().int().min(1).max(25).optional(),
  }),
  run: ({ status, mode, limit }, ctx) => {
    const rows = orgRoutes(ctx)
      .filter((r) => r.status !== 'standby' && (!status || r.status === status) && (!mode || r.mode === mode))
      .map((r) => routeSummary(ctx, r.id)!)
      .sort((a, b) => b.value_in_transit_usd - a.value_in_transit_usd)
      .slice(0, limit ?? 10);
    return { result: { routes: rows }, summary: `${rows.length} lanes` };
  },
});

export const listShipments = tool({
  name: 'list_shipments',
  description: 'List shipments filtered by status, priority or route, sorted by value.',
  schema: z.object({
    status: z.enum(['in_transit', 'delayed', 'held', 'rerouted']).optional(),
    priority: z.enum(['critical', 'high', 'standard', 'low']).optional(),
    route_id: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(25).optional(),
  }),
  run: ({ status, priority, route_id, limit }, ctx) => {
    const all = orgShipments(ctx).filter(
      (s) => (!status || s.status === status) && (!priority || s.priority === priority) && (!route_id || s.routeId === route_id)
    );
    const rows = all
      .sort((a, b) => b.valueUsd - a.valueUsd)
      .slice(0, limit ?? 10)
      .map((s) => ({
        ref: s.ref,
        goods: s.goods,
        priority: s.priority,
        status: s.status,
        units: s.units,
        value_usd: Math.round(s.valueUsd),
        delay_hours: round(s.delayHours),
        route: ctx.ops.db.route.id.find(s.routeId)?.label ?? '',
      }));
    const value = all.reduce((sum, s) => sum + s.valueUsd, 0);
    return {
      result: { matching: all.length, matching_value_usd: Math.round(value), top: rows },
      summary: `${all.length} shipments · ${usd(value)}`,
    };
  },
});

export const ANALYST_TOOLS = [submitPlan, getDisruption, listAffectedShipments, queryRouteHistory, checkVendorRisk, handoffToPlanner];
export const PLANNER_TOOLS = [submitPlan, evaluateRouteAlternatives, getRouteOptions, proposeAction, postBriefing, finishRun];
export const CYBER_TOOLS = [getDisruption, getIrHints, draftIrIncident];
export const ASK_TOOLS = [submitPlan, getNetworkOverview, listRoutes, listShipments, queryRouteHistory, checkVendorRisk, postBriefing];
