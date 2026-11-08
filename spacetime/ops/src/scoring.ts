/**
 * Deterministic option scoring. Pure functions with no SpacetimeDB imports,
 * so they can be unit-tested with plain Node.
 *
 * Every option is converted to an expected financial impact:
 *
 *   impact = added logistics cost
 *          + SLA-breach penalties   (value × penalty rate, by priority)
 *          + delay cost             (value × hours × hourly rate, by priority)
 *          + residual-risk cost     (value × residual risk × RISK_RATE)
 *
 * score = 100 × (lowest impact ÷ this option's impact), so the best option
 * scores 100 and the others show how much worse they are. The agent reads
 * these numbers through its tools; it never invents them.
 */
import type { OptionTemplate, Treatment } from './scenarios';
import type { Point, Priority } from './seed/types';

export const SLA_HOURS: Record<Priority, number> = { critical: 12, high: 24, standard: 72, low: 168 };
export const BREACH_PENALTY: Record<Priority, number> = { critical: 0.3, high: 0.12, standard: 0.03, low: 0.01 };
export const DELAY_RATE_PER_HOUR: Record<Priority, number> = {
  critical: 0.0008,
  high: 0.0003,
  standard: 0.00005,
  low: 0.00002,
};
export const PRIORITY_WEIGHT: Record<Priority, number> = { critical: 4, high: 3, standard: 1.5, low: 0.5 };
export const RISK_RATE = 0.1;

export interface ScoringShipment {
  id: number;
  routeKey: string;
  units: number;
  valueUsd: number;
  priority: Priority;
}

export interface ScoringContext {
  durationHours: number;
  backlogFactor: number;
  holdCostPerUnitDay: number;
  routeIdByKey: Record<string, number>;
}

export type OptionAction =
  | { type: 'hold'; routeId: number; priorities: Priority[] }
  | { type: 'shift'; fromRouteId: number; toRouteId: number; priorities: Priority[]; extraHours: number }
  | { type: 'reroute'; routeId: number; via: Point[]; extraHours: number; priorities: Priority[] }
  | { type: 'expedite'; routeId: number; priorities: Priority[] }
  | { type: 'resume'; routeId: number; priorities: Priority[]; extraHours: number };

export interface ComputedOption {
  key: string;
  label: string;
  strategy: string;
  summary: string;
  addedCostUsd: number;
  avgDelayHours: number;
  weightedDelayHours: number;
  slaBreachValueUsd: number;
  risk: number;
  expectedImpactUsd: number;
  score: number;
  rank: number;
  shipmentsAffected: number;
  shipmentsMoved: number;
  shipmentsHeld: number;
  actions: OptionAction[];
}

export function bucketOf(priority: Priority): 'urgent' | 'standard' | 'low' {
  if (priority === 'critical' || priority === 'high') return 'urgent';
  return priority;
}

function treatmentFor(option: OptionTemplate, priority: Priority): Treatment {
  return option[bucketOf(priority)];
}

function evaluateOne(option: OptionTemplate, shipments: ScoringShipment[], ctx: ScoringContext) {
  let addedCost = option.fixedCostUsd;
  let delayUnitHours = 0;
  let weightedDelayNum = 0;
  let weightedDelayDen = 0;
  let breachValue = 0;
  let breachPenalty = 0;
  let delayCost = 0;
  let riskValue = 0;
  let totalUnits = 0;
  let totalValue = 0;
  let moved = 0;
  let held = 0;

  for (const s of shipments) {
    const t = treatmentFor(option, s.priority);
    let delay: number;
    if (t.type === 'hold') {
      delay = ctx.durationHours * ctx.backlogFactor;
      addedCost += s.units * ctx.holdCostPerUnitDay * (delay / 24);
      held += 1;
    } else {
      delay = t.extraHours;
      addedCost += s.units * t.costPerUnit;
      if (t.type !== 'delay') moved += 1;
    }

    const weight = PRIORITY_WEIGHT[s.priority] * s.valueUsd;
    weightedDelayNum += delay * weight;
    weightedDelayDen += weight;
    delayUnitHours += delay * s.units;
    totalUnits += s.units;
    totalValue += s.valueUsd;

    if (delay > SLA_HOURS[s.priority]) {
      breachValue += s.valueUsd;
      breachPenalty += s.valueUsd * BREACH_PENALTY[s.priority];
    }
    delayCost += s.valueUsd * delay * DELAY_RATE_PER_HOUR[s.priority];
    riskValue += s.valueUsd * t.risk;
  }

  const risk = totalValue > 0 ? riskValue / totalValue : 0;
  const expectedImpact = addedCost + breachPenalty + delayCost + riskValue * RISK_RATE;

  return {
    addedCostUsd: round(addedCost, 0),
    avgDelayHours: round(totalUnits > 0 ? delayUnitHours / totalUnits : 0, 1),
    weightedDelayHours: round(weightedDelayDen > 0 ? weightedDelayNum / weightedDelayDen : 0, 1),
    slaBreachValueUsd: round(breachValue, 0),
    risk: round(risk, 3),
    expectedImpactUsd: round(expectedImpact, 0),
    shipmentsAffected: shipments.length,
    shipmentsMoved: moved,
    shipmentsHeld: held,
  };
}

/** Translate an option into concrete state changes, grouped per route. */
export function buildActions(option: OptionTemplate, shipments: ScoringShipment[], ctx: ScoringContext): OptionAction[] {
  const actions: OptionAction[] = [];
  const routeKeys = [...new Set(shipments.map((s) => s.routeKey))];

  for (const routeKey of routeKeys) {
    const routeId = ctx.routeIdByKey[routeKey];
    if (routeId === undefined) continue;
    const present = new Set(shipments.filter((s) => s.routeKey === routeKey).map((s) => s.priority));
    const groups = new Map<string, { t: Treatment; priorities: Priority[] }>();

    for (const priority of ['critical', 'high', 'standard', 'low'] as Priority[]) {
      if (!present.has(priority)) continue;
      const t = treatmentFor(option, priority);
      const target = t.type === 'shift' ? (t.to[routeKey] ?? '') : '';
      const groupKey = `${t.type}:${target}`;
      const group = groups.get(groupKey) ?? { t, priorities: [] };
      group.priorities.push(priority);
      groups.set(groupKey, group);
    }

    const shifts: OptionAction[] = [];
    const reroutes: OptionAction[] = [];
    const others: OptionAction[] = [];
    for (const { t, priorities } of groups.values()) {
      switch (t.type) {
        case 'hold':
          others.push({ type: 'hold', routeId, priorities });
          break;
        case 'shift': {
          const toRouteId = ctx.routeIdByKey[t.to[routeKey] ?? ''];
          if (toRouteId === undefined) {
            others.push({ type: 'hold', routeId, priorities });
          } else {
            shifts.push({ type: 'shift', fromRouteId: routeId, toRouteId, priorities, extraHours: t.extraHours });
          }
          break;
        }
        case 'reroute':
          reroutes.push({ type: 'reroute', routeId, via: t.via[routeKey] ?? [], extraHours: t.extraHours, priorities });
          break;
        case 'expedite':
          others.push({ type: 'expedite', routeId, priorities });
          break;
        case 'delay':
          others.push({ type: 'resume', routeId, priorities, extraHours: t.extraHours });
          break;
      }
    }
    // Shipments that leave the route move first, then the route geometry changes.
    actions.push(...shifts, ...reroutes, ...others);
  }
  return actions;
}

export function scoreOptions(options: OptionTemplate[], shipments: ScoringShipment[], ctx: ScoringContext): ComputedOption[] {
  const evaluated = options.map((option) => ({
    option,
    metrics: evaluateOne(option, shipments, ctx),
    actions: buildActions(option, shipments, ctx),
  }));
  const best = Math.min(...evaluated.map((e) => Math.max(e.metrics.expectedImpactUsd, 1)));
  const ranked = [...evaluated].sort((a, b) => a.metrics.expectedImpactUsd - b.metrics.expectedImpactUsd);

  return evaluated.map((e) => ({
    key: e.option.key,
    label: e.option.label,
    strategy: e.option.strategy,
    summary: e.option.summary,
    ...e.metrics,
    score: round((100 * best) / Math.max(e.metrics.expectedImpactUsd, 1), 1),
    rank: ranked.indexOf(e) + 1,
    actions: e.actions,
  }));
}

/** Generic responses for random or anomaly-detected disruptions. */
export function genericOptions(routes: { key: string; mode: string; etaHours: number; waypoints: Point[] }[]): OptionTemplate[] {
  const maxEta = Math.max(...routes.map((r) => r.etaHours), 1);
  const primaryMode = routes[0]?.mode ?? 'truck';
  const rerouteCost = { sea: 0.6, rail: 0.4, truck: 0.5, air: 1.5 }[primaryMode] ?? 0.5;
  const expediteCost = { sea: 9, rail: 3, truck: 1.5, air: 0.8 }[primaryMode] ?? 2;
  const via = Object.fromEntries(routes.map((r) => [r.key, bulge(r.waypoints)]));
  const reroute: Treatment = {
    type: 'reroute',
    via,
    extraHours: round(Math.max(1, maxEta * 0.22), 1),
    costPerUnit: rerouteCost,
    risk: 0.2,
  };
  const expedite: Treatment = { type: 'expedite', extraHours: 0, costPerUnit: expediteCost, risk: 0.12 };
  const hold: Treatment = { type: 'hold', risk: 0.45 };

  return [
    {
      key: 'wait',
      label: 'Wait it out',
      strategy: 'wait',
      summary: 'Hold affected cargo until the lane clears.',
      urgent: hold,
      standard: hold,
      low: hold,
      fixedCostUsd: 0,
    },
    {
      key: 'reroute',
      label: 'Reroute via alternate corridor',
      strategy: 'reroute',
      summary: 'Send all affected cargo along an alternate corridor around the disruption.',
      urgent: reroute,
      standard: reroute,
      low: reroute,
      fixedCostUsd: 500,
    },
    {
      key: 'expedite-urgent',
      label: 'Expedite urgent cargo, hold the rest',
      strategy: 'expedite_split',
      summary: 'Upgrade critical and high-priority cargo to premium service; the rest waits.',
      urgent: expedite,
      standard: hold,
      low: hold,
      fixedCostUsd: 1500,
    },
    {
      key: 'split',
      label: 'Expedite urgent, reroute the rest',
      strategy: 'split',
      summary: 'Premium service for urgent cargo; everything else takes the alternate corridor.',
      urgent: expedite,
      standard: reroute,
      low: reroute,
      fixedCostUsd: 2000,
    },
  ];
}

/** Offset a path sideways so an alternate corridor is visibly distinct. */
export function bulge(points: Point[]): Point[] {
  if (points.length < 2) return [];
  const [aLat, aLng] = points[0];
  const [bLat, bLng] = points[points.length - 1];
  const dLat = bLat - aLat;
  const dLng = bLng - aLng;
  const length = Math.hypot(dLat, dLng) || 1;
  const offset = Math.min(Math.max(length * 0.18, 0.05), 12);
  const nLat = (-dLng / length) * offset;
  const nLng = (dLat / length) * offset;
  const interior = points.slice(1, -1);
  if (interior.length === 0) {
    return [[(aLat + bLat) / 2 + nLat, (aLng + bLng) / 2 + nLng]];
  }
  return interior.map(([lat, lng]) => [lat + nLat * 0.6, lng + nLng * 0.6]);
}

export function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
