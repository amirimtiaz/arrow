/**
 * Deterministic Conquest GIS math: coordinates, distances, deal score, 5-year cost of occupancy and break-even.
 * "LLMs choose and explain; code calculates" (CLAUDE.md §8): every number on the page comes from here, and the
 * Nemotron Deal Evaluator only receives these results as facts.
 */
import type { Competitor, Landlord, Market, Point, Site } from './types';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* ---------------------------------------------------------------- geo */

export interface LatLng {
  lat: number;
  lng: number;
}

/** World units (0–1000, y down) → latitude/longitude around the market centre. */
export function toLatLng(market: Market, p: Point): LatLng {
  const unitsPerMi = 1000 / market.widthMi;
  const dyMi = (500 - p.y) / unitsPerMi;
  const dxMi = (p.x - 500) / unitsPerMi;
  const lat = market.center.lat + dyMi / 69.0;
  const lng = market.center.lng + dxMi / (69.172 * Math.cos((market.center.lat * Math.PI) / 180));
  return { lat, lng };
}

/** Great-circle distance in miles (haversine). */
export function haversineMi(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function distanceMi(market: Market, a: Point, b: Point): number {
  return haversineMi(toLatLng(market, a), toLatLng(market, b));
}

export function unitsPerMile(market: Market): number {
  return 1000 / market.widthMi;
}

export function formatLatLng({ lat, lng }: LatLng): string {
  return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`;
}

export interface NearbyCompetitor extends Competitor {
  distanceMi: number;
}

/** Competitors sorted by distance from the site. */
export function competitorsNear(market: Market, site: Site): NearbyCompetitor[] {
  return market.competitors
    .map((c) => ({ ...c, distanceMi: distanceMi(market, site, c) }))
    .sort((a, b) => a.distanceMi - b.distanceMi);
}

export const COMPETITION_RADIUS_MI = 1;

export function competitorsWithin(market: Market, site: Site, radiusMi = COMPETITION_RADIUS_MI): number {
  return competitorsNear(market, site).filter((c) => c.distanceMi <= radiusMi).length;
}

/* ---------------------------------------------------------------- landlord */

export interface LandlordRating {
  average: number;
  count: number;
}

export function landlordRating(landlord: Landlord): LandlordRating {
  const count = landlord.ratingCounts.reduce((s, n) => s + n, 0);
  const total = landlord.ratingCounts.reduce((s, n, i) => s + n * (i + 1), 0);
  return { average: count ? total / count : 0, count };
}

export function landlordFor(market: Market, site: Site): Landlord {
  return market.landlords.find((l) => l.id === site.landlordId) ?? market.landlords[0];
}

/* ---------------------------------------------------------------- deal score */

export type DealLabel = 'Strong' | 'Fair' | 'Weak';

export interface DealFactor {
  key: string;
  label: string;
  /** Points earned out of `weight`. */
  points: number;
  weight: number;
  detail: string;
}

export interface DealScore {
  score: number;
  label: DealLabel;
  factors: DealFactor[];
}

export const DEAL_WEIGHTS = { rent: 25, traffic: 25, competition: 20, landlord: 15, flexibility: 15 } as const;

export function dealLabel(score: number): DealLabel {
  return score >= 70 ? 'Strong' : score >= 50 ? 'Fair' : 'Weak';
}

/**
 * Weighted 0–100 score. Each factor maps to 0–1, then is multiplied by its weight:
 * - rent vs market: 20% below market → full marks, 20% above → zero
 * - foot traffic: share of the market's "excellent" traffic level
 * - competition: −25% per competitor within 1 mi (4+ → zero)
 * - landlord: past-tenant average, 3.0★ → zero, 5.0★ → full
 * - escalation & flexibility: 50% escalation (2.5% → full, 4% → zero), 25% free rent (6 mo → full),
 *   25% TI coverage of build-out (50%+ → full)
 */
export function dealScore(market: Market, site: Site): DealScore {
  const rentRatio = site.rentPsf / market.marketRentPsf;
  const rent = clamp01((1.2 - rentRatio) / 0.4);
  const traffic = clamp01(site.dailyTraffic / market.trafficTarget);
  const nearby = competitorsWithin(market, site);
  const competition = clamp01(1 - nearby / 4);
  const rating = landlordRating(landlordFor(market, site));
  const landlord = clamp01((rating.average - 3) / 2);
  const { escalationPct, freeRentMonths, tiPsf, buildOutPsf } = site.lease;
  const esc = clamp01((4 - escalationPct) / 1.5);
  const free = clamp01(freeRentMonths / 6);
  const ti = clamp01(tiPsf / buildOutPsf / 0.5);
  const flexibility = 0.5 * esc + 0.25 * free + 0.25 * ti;

  const pct = Math.round((rentRatio - 1) * 100);
  const factors: DealFactor[] = [
    {
      key: 'rent',
      label: 'Rent vs market',
      points: rent * DEAL_WEIGHTS.rent,
      weight: DEAL_WEIGHTS.rent,
      detail: `$${site.rentPsf.toFixed(2)} vs $${market.marketRentPsf.toFixed(2)} market (${pct === 0 ? 'at market' : `${Math.abs(pct)}% ${pct < 0 ? 'below' : 'above'}`})`,
    },
    {
      key: 'traffic',
      label: 'Foot traffic',
      points: traffic * DEAL_WEIGHTS.traffic,
      weight: DEAL_WEIGHTS.traffic,
      detail: `${site.dailyTraffic.toLocaleString('en-US')}/day vs ${market.trafficTarget.toLocaleString('en-US')} target`,
    },
    {
      key: 'competition',
      label: 'Competition density',
      points: competition * DEAL_WEIGHTS.competition,
      weight: DEAL_WEIGHTS.competition,
      detail: `${nearby} competitor${nearby === 1 ? '' : 's'} within ${COMPETITION_RADIUS_MI} mi`,
    },
    {
      key: 'landlord',
      label: 'Landlord rating',
      points: landlord * DEAL_WEIGHTS.landlord,
      weight: DEAL_WEIGHTS.landlord,
      detail: `${rating.average.toFixed(1)}★ from ${rating.count} past tenants`,
    },
    {
      key: 'flexibility',
      label: 'Escalation & flexibility',
      points: flexibility * DEAL_WEIGHTS.flexibility,
      weight: DEAL_WEIGHTS.flexibility,
      detail: `${escalationPct}%/yr bumps · ${freeRentMonths} mo free · TI covers ${Math.round((tiPsf / buildOutPsf) * 100)}% of build-out`,
    },
  ];
  const score = Math.round(factors.reduce((s, f) => s + f.points, 0));
  return { score, label: dealLabel(score), factors };
}

/* ---------------------------------------------------------------- cost of occupancy */

export const PROJECTION_YEARS = 5;

export interface YearCost {
  year: number;
  baseRent: number;
  freeRent: number;
  cam: number;
  total: number;
}

export interface MonthPoint {
  month: number;
  /** Cumulative occupancy cost incl. net build-out, $. */
  cost: number;
  /** Cumulative contribution from the simulated revenue model, $. */
  contribution: number;
}

export interface Projection {
  years: YearCost[];
  buildOut: number;
  tiAllowance: number;
  netBuildOut: number;
  deposit: number;
  baseRentTotal: number;
  freeRentTotal: number;
  camTotal: number;
  /** 5-year total cost of occupancy: base rent (after free rent) + CAM + build-out − TI. */
  total5y: number;
  effectivePsf: number;
  /** Simulated revenue model results. */
  unitsPerDay: number;
  annualRevenue: number;
  monthlyContribution: number;
  /** Month (1-based) in which cumulative contribution covers cumulative cost, or null if not within 5 years. */
  breakEvenMonth: number | null;
  /** Revenue a year needed for contribution to cover year-1 occupancy. */
  breakEvenRevenue: number;
  months: MonthPoint[];
}

/** Revenue ramps from 55% to 100% over the first six months of trading. */
function ramp(monthIndex: number) {
  return Math.min(1, 0.55 + 0.075 * monthIndex);
}

export function projectCosts(market: Market, site: Site): Projection {
  const { sqft, rentPsf, lease } = site;
  const esc = lease.escalationPct / 100;
  const buildOut = lease.buildOutPsf * sqft;
  const tiAllowance = Math.min(lease.tiPsf, lease.buildOutPsf) * sqft;
  const netBuildOut = buildOut - tiAllowance;
  const deposit = ((rentPsf * sqft) / 12) * lease.depositMonths;
  const camAnnual = lease.camPsf * sqft;

  const rev = market.revenue;
  const nearby = competitorsWithin(market, site);
  const demandShare = Math.max(0, 1 - rev.competitorDrag * nearby);
  const unitsPerDay = site.dailyTraffic * rev.capture * demandShare;
  const annualRevenue = unitsPerDay * rev.unitValue * rev.operatingDays;
  const monthlyContribution = (annualRevenue * rev.margin) / 12;

  const years: YearCost[] = [];
  const months: MonthPoint[] = [{ month: 0, cost: netBuildOut, contribution: 0 }];
  let cumCost = netBuildOut;
  let cumContribution = 0;
  let breakEvenMonth: number | null = null;

  for (let y = 0; y < PROJECTION_YEARS; y++) {
    const baseAnnual = rentPsf * sqft * (1 + esc) ** y;
    let freeRent = 0;
    for (let m = 0; m < 12; m++) {
      const monthIndex = y * 12 + m;
      const isFree = monthIndex < lease.freeRentMonths;
      const base = isFree ? 0 : baseAnnual / 12;
      if (isFree) freeRent += baseAnnual / 12;
      cumCost += base + camAnnual / 12;
      cumContribution += monthlyContribution * ramp(monthIndex);
      months.push({ month: monthIndex + 1, cost: cumCost, contribution: cumContribution });
      if (breakEvenMonth === null && cumContribution >= cumCost) breakEvenMonth = monthIndex + 1;
    }
    years.push({ year: y + 1, baseRent: baseAnnual, freeRent, cam: camAnnual, total: baseAnnual - freeRent + camAnnual });
  }

  const baseRentTotal = years.reduce((s, y) => s + y.baseRent, 0);
  const freeRentTotal = years.reduce((s, y) => s + y.freeRent, 0);
  const camTotal = years.reduce((s, y) => s + y.cam, 0);
  const total5y = baseRentTotal - freeRentTotal + camTotal + netBuildOut;

  return {
    years,
    buildOut,
    tiAllowance,
    netBuildOut,
    deposit,
    baseRentTotal,
    freeRentTotal,
    camTotal,
    total5y,
    effectivePsf: total5y / sqft / PROJECTION_YEARS,
    unitsPerDay,
    annualRevenue,
    monthlyContribution,
    breakEvenMonth,
    breakEvenRevenue: (rentPsf * sqft + camAnnual) / rev.margin,
    months,
  };
}

/* ---------------------------------------------------------------- foot traffic */

export function hourlyTraffic(market: Market, site: Site): { label: string; visitors: number }[] {
  const sum = market.hourlyProfile.reduce((s, n) => s + n, 0);
  return market.hourlyProfile.map((w, h) => ({
    label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
    visitors: Math.round((site.dailyTraffic * w) / sum),
  }));
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function weekdayTraffic(market: Market, site: Site): { label: string; visitors: number }[] {
  const mean = market.weekdayProfile.reduce((s, n) => s + n, 0) / 7;
  return market.weekdayProfile.map((w, i) => ({ label: WEEKDAYS[i], visitors: Math.round((site.dailyTraffic * w) / mean) }));
}

export function peakHour(market: Market, site: Site): string {
  const rows = hourlyTraffic(market, site);
  return rows.reduce((best, r) => (r.visitors > best.visitors ? r : best), rows[0]).label;
}

/* ---------------------------------------------------------------- Nemotron facts */

const PROMPT_PREFIX = '[[agents:deal]] ';
const PROMPT_LIMIT = 1000;

/**
 * Compact, code-computed facts for the Nemotron Deal Evaluator. The prompt (prefix + JSON) must stay under the
 * reducer's 1000-character limit, so names are trimmed if needed.
 */
export function dealPrompt(market: Market, site: Site, orgName: string): string {
  const score = dealScore(market, site);
  const projection = projectCosts(market, site);
  const landlord = landlordRating(landlordFor(market, site));
  const build = (name: string) =>
    PROMPT_PREFIX +
    JSON.stringify({
      business: orgName,
      use: market.useLabel,
      site: name,
      market: market.city,
      sqft: site.sqft,
      rentPsfYr: site.rentPsf,
      marketRentPsfYr: market.marketRentPsf,
      escalationPct: site.lease.escalationPct,
      termYears: site.lease.termYears,
      camPsfYr: site.lease.camPsf,
      tiPsf: site.lease.tiPsf,
      buildOutPsf: site.lease.buildOutPsf,
      netBuildOutUsd: Math.round(projection.netBuildOut),
      freeRentMonths: site.lease.freeRentMonths,
      cost5yUsd: Math.round(projection.total5y),
      breakEvenMonth: projection.breakEvenMonth ?? 'not within 5 years',
      dailyTraffic: site.dailyTraffic,
      competitorsWithin1Mi: competitorsWithin(market, site),
      landlordRating: Number(landlord.average.toFixed(2)),
      landlordReviews: landlord.count,
      dealScore: score.score,
      dealLabel: score.label,
    });
  let prompt = build(site.name);
  if (prompt.length > PROMPT_LIMIT) prompt = build(site.name.slice(0, Math.max(8, site.name.length - (prompt.length - PROMPT_LIMIT))));
  return prompt.slice(0, PROMPT_LIMIT);
}

export function promptFacts(prompt: string): string {
  return prompt.startsWith(PROMPT_PREFIX) ? prompt.slice(PROMPT_PREFIX.length) : prompt;
}
