/**
 * Deterministic seed builder. Turns the declarative org definitions into
 * table rows with stable IDs, so "Reset demo" always restores the same
 * network. Pure (no SpacetimeDB imports) so it can be tested in Node.
 */
import { AMAZON } from './amazon';
import { CVS } from './cvs';
import { KITCHEN } from './kitchen';
import type { Mode, Point, Priority, SeedOrg } from './types';

export const SEED_ORGS: SeedOrg[] = [AMAZON, CVS, KITCHEN];

export interface NodeRow {
  id: number;
  orgId: number;
  key: string;
  kind: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  status: string;
  standby: boolean;
}

export interface RouteRow {
  id: number;
  orgId: number;
  key: string;
  fromNodeId: number;
  toNodeId: number;
  mode: Mode;
  label: string;
  lane: string;
  waypoints: { lat: number; lng: number }[];
  status: string;
  standby: boolean;
  etaHours: number;
  costUsd: number;
  risk: number;
}

export interface ShipmentRow {
  id: number;
  orgId: number;
  routeId: number;
  routeKey: string;
  ref: string;
  goods: string;
  units: number;
  valueUsd: number;
  priority: Priority;
  coldChain: boolean;
  progress: number;
  speed: number;
}

export interface VendorRow {
  id: number;
  orgId: number;
  nodeId: number;
  name: string;
  category: string;
  tier: string;
  riskScore: number;
  onTimePct: number;
  cyberPosture: string;
  notes: string;
}

export interface OrgSeedRows {
  nodes: NodeRow[];
  routes: RouteRow[];
  shipments: ShipmentRow[];
  vendors: VendorRow[];
}

/** Small seeded PRNG (mulberry32) so seeds are reproducible. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRIORITIES: Priority[] = ['critical', 'high', 'standard', 'low'];

/** Largest-remainder allocation so each route gets a stable priority mix. */
function allocatePriorities(n: number, mix: [number, number, number, number], rand: () => number): Priority[] {
  const total = mix.reduce((a, b) => a + b, 0);
  const exact = mix.map((m) => (m / total) * n);
  const counts = exact.map(Math.floor);
  let remaining = n - counts.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
  for (const { i } of order) {
    if (remaining <= 0) break;
    counts[i] += 1;
    remaining -= 1;
  }
  const list = counts.flatMap((c, i) => Array.from({ length: c }, () => PRIORITIES[i]));
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const LOOP_TICKS: Record<Mode, number> = { sea: 160, rail: 95, truck: 70, air: 45 };
const REFERENCE_ETA: Record<Mode, number> = { sea: 500, rail: 50, truck: 4, air: 16 };

export function speedFor(mode: Mode, etaHours: number, jitter: number): number {
  const scale = Math.min(Math.max(Math.sqrt(etaHours / REFERENCE_ETA[mode]), 0.6), 1.6);
  return (1 / (LOOP_TICKS[mode] * scale)) * (0.9 + jitter * 0.2);
}

export function buildOrgSeed(org: SeedOrg): OrgSeedRows {
  const rand = prng(org.id * 7919);
  const nodeIdByKey = new Map<string, number>();
  const nodes: NodeRow[] = org.nodes.map((n, i) => {
    const id = org.id * 1000 + i + 1;
    nodeIdByKey.set(n.key, id);
    return {
      id,
      orgId: org.id,
      key: n.key,
      kind: n.kind,
      name: n.name,
      city: n.city,
      country: n.country,
      lat: n.lat,
      lng: n.lng,
      status: 'operational',
      standby: n.standby ?? false,
    };
  });
  const nodeByKey = new Map(org.nodes.map((n) => [n.key, n]));

  const routes: RouteRow[] = org.routes.map((r, i) => {
    const from = nodeByKey.get(r.from);
    const to = nodeByKey.get(r.to);
    if (!from || !to) throw new Error(`Route ${r.key} references an unknown node`);
    const points: Point[] = [[from.lat, from.lng], ...(r.via ?? []), [to.lat, to.lng]];
    return {
      id: org.id * 1000 + i + 1,
      orgId: org.id,
      key: r.key,
      fromNodeId: nodeIdByKey.get(r.from)!,
      toNodeId: nodeIdByKey.get(r.to)!,
      mode: r.mode,
      label: `${from.city.split(',')[0]} → ${to.city.split(',')[0]}`,
      lane: r.lane,
      waypoints: points.map(([lat, lng]) => ({ lat, lng })),
      status: r.standby ? 'standby' : 'healthy',
      standby: r.standby ?? false,
      etaHours: r.etaHours,
      costUsd: r.costUsd,
      risk: r.risk,
    };
  });

  const shipments: ShipmentRow[] = [];
  let seq = 0;
  org.routes.forEach((r, i) => {
    const count = r.standby ? 0 : (r.shipments ?? 0);
    const profile = org.cargo[r.cargo ?? ''];
    if (count === 0 || !profile) return;
    const priorities = allocatePriorities(count, profile.priorityMix, rand);
    for (let k = 0; k < count; k++) {
      seq += 1;
      const units = Math.round(profile.units[0] + rand() * (profile.units[1] - profile.units[0]));
      const unitValue = profile.unitValueUsd[0] + rand() * (profile.unitValueUsd[1] - profile.unitValueUsd[0]);
      shipments.push({
        id: org.id * 100000 + seq,
        orgId: org.id,
        routeId: org.id * 1000 + i + 1,
        routeKey: r.key,
        ref: `${org.shipmentRefPrefix}-${String(10000 + ((seq * 7393) % 89999)).padStart(5, '0')}`,
        goods: profile.goods[Math.floor(rand() * profile.goods.length)],
        units,
        valueUsd: Math.round(units * unitValue),
        priority: priorities[k],
        coldChain: profile.coldChain ?? false,
        progress: (k + rand() * 0.6) / count,
        speed: speedFor(r.mode, r.etaHours, rand()),
      });
    }
  });

  const vendors: VendorRow[] = org.vendors.map((v, i) => ({
    id: org.id * 1000 + i + 1,
    orgId: org.id,
    nodeId: nodeIdByKey.get(v.nodeKey) ?? 0,
    name: v.name,
    category: v.category,
    tier: v.tier,
    riskScore: v.riskScore,
    onTimePct: v.onTimePct,
    cyberPosture: v.cyberPosture,
    notes: v.notes,
  }));

  return { nodes, routes, shipments, vendors };
}
