/**
 * Conquest GIS data model. All listings, landlords and competitors are simulated demo data. Map positions are in
 * "world units" (0–1000 on both axes); each market says how many miles its 1000 units span, and positions are turned
 * into latitude/longitude from the market centre so distances come from real coordinates (haversine).
 */

export type Plan = 'gold' | 'silver' | 'bronze';

export interface Point {
  x: number;
  y: number;
}

export interface LeaseTerms {
  termYears: number;
  /** Annual base-rent escalation, percent. */
  escalationPct: number;
  /** CAM / NNN charges, $/sqft/yr (held flat in projections). */
  camPsf: number;
  /** Tenant-improvement allowance from the landlord, $/sqft. */
  tiPsf: number;
  /** Estimated build-out cost for this use, $/sqft. */
  buildOutPsf: number;
  /** Security deposit in months of base rent (refundable, not a cost). */
  depositMonths: number;
  freeRentMonths: number;
}

export interface Site extends Point {
  id: string;
  name: string;
  address: string;
  neighborhood: string;
  photo: string;
  sqft: number;
  /** Asking base rent, $/sqft/yr. */
  rentPsf: number;
  lease: LeaseTerms;
  /** Daily visitors (or catchment trips for logistics sites). */
  dailyTraffic: number;
  landlordId: string;
  zoning: string;
  listedDaysAgo: number;
  highlights: string[];
}

export interface Competitor extends Point {
  id: string;
  name: string;
  category: string;
  rating: number;
}

export interface Review {
  tenant: string;
  stars: number;
  text: string;
}

export interface Landlord {
  id: string;
  name: string;
  title: string;
  company: string;
  photo: string;
  /** Count of past-tenant ratings by star, index 0 = 1 star … index 4 = 5 stars. */
  ratingCounts: [number, number, number, number, number];
  responseTime: string;
  portfolio: string;
  reviews: Review[];
}

export interface Hotspot extends Point {
  r: number;
  intensity: number;
}

export interface Highway {
  name: string;
  shield: string;
  points: [number, number][];
  /** Where along the polyline (0–1) to draw the shield. */
  shieldAt?: number;
}

export interface MapArt {
  rivers: { name: string; d: string; width: number; labelAt: Point }[];
  lakes: { name: string; d: string; labelAt: Point }[];
  parks: { name: string; d: string; labelAt: Point }[];
  highways: Highway[];
  /** Named arterials drawn on the 1-mile grid: "h" runs east–west at y, "v" north–south at x. */
  arterials: { name: string; axis: 'h' | 'v'; at: number }[];
  districts: { name: string; x: number; y: number; r: number; density: number }[];
  airport?: { name: string; x: number; y: number };
}

export interface RevenueModel {
  /** What one unit of demand is ("covers", "transactions", "packages"). */
  unit: string;
  /** Units per daily visitor before competition. */
  capture: number;
  /** Revenue (or delivery value) per unit, $. */
  unitValue: number;
  /** Contribution margin before occupancy, 0–1. */
  margin: number;
  /** Share of demand lost per competitor within 1 mi. */
  competitorDrag: number;
  operatingDays: number;
  note: string;
}

export interface Market {
  plan: Plan;
  city: string;
  region: string;
  useLabel: string;
  /** Miles spanned by 1000 world units. */
  widthMi: number;
  center: { lat: number; lng: number };
  /** Market average asking rent for comparable space, $/sqft/yr NNN. */
  marketRentPsf: number;
  /** Daily traffic that earns full marks. */
  trafficTarget: number;
  trafficLabel: string;
  /** Hourly shape of traffic, 24 relative weights. */
  hourlyProfile: number[];
  /** Mon–Sun relative weights. */
  weekdayProfile: number[];
  revenue: RevenueModel;
  art: MapArt;
  heat: Hotspot[];
  sites: Site[];
  competitors: Competitor[];
  landlords: Landlord[];
  home?: { name: string; x: number; y: number };
}
