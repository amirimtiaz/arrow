export type Point = [lat: number, lng: number];

export type NodeKind = 'supplier' | 'factory' | 'port' | 'airport' | 'warehouse' | 'store' | 'kitchen';

export type Mode = 'sea' | 'air' | 'rail' | 'truck';

export type Priority = 'critical' | 'high' | 'standard' | 'low';

export interface SeedNode {
  key: string;
  kind: NodeKind;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  standby?: boolean;
}

export interface SeedRoute {
  key: string;
  from: string;
  to: string;
  mode: Mode;
  lane: string;
  /** Intermediate waypoints between the two nodes (sea lanes, corridors). */
  via?: Point[];
  standby?: boolean;
  etaHours: number;
  costUsd: number;
  risk: number;
  /** Shipments seeded on this route (standby routes start empty). */
  shipments?: number;
  cargo?: string;
}

export interface SeedVendor {
  nodeKey: string;
  name: string;
  category: string;
  tier: 'strategic' | 'preferred' | 'backup';
  riskScore: number;
  onTimePct: number;
  cyberPosture: 'strong' | 'moderate' | 'weak';
  notes: string;
}

export interface CargoProfile {
  goods: string[];
  units: [min: number, max: number];
  unitValueUsd: [min: number, max: number];
  coldChain?: boolean;
  /** Relative weights for critical / high / standard / low. */
  priorityMix: [number, number, number, number];
}

export interface SeedOrg {
  id: number;
  slug: string;
  name: string;
  plan: 'bronze' | 'silver' | 'gold';
  planLabel: string;
  scope: 'Local' | 'National' | 'Global';
  industry: string;
  headquarters: string;
  tagline: string;
  view: { lat: number; lng: number; altitude: number };
  shipmentRefPrefix: string;
  /** Storage / demurrage cost of holding one unit for a day (USD). */
  holdCostPerUnitDay: number;
  nodes: SeedNode[];
  routes: SeedRoute[];
  vendors: SeedVendor[];
  cargo: Record<string, CargoProfile>;
}
