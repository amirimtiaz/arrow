/**
 * Scenario playbooks. A scenario describes WHAT happens (where, which lanes,
 * for how long) and which physical responses exist (alternate DCs, standby
 * lanes, reroutes). It never contains outcome numbers: costs, delays, risk
 * and scores are computed from the live shipments in `scoring.ts`.
 */
import { CAPE_OF_GOOD_HOPE, SOUTH_CHINA_SEA_TO_INDIAN_OCEAN } from './seed/lanes';
import type { Point } from './seed/types';

export type DisruptionKind = 'weather' | 'port_congestion' | 'accident' | 'blockage' | 'cyber' | 'strike' | 'geopolitical';

export type Severity = 'low' | 'moderate' | 'high' | 'critical';

/** How one priority bucket of affected shipments is handled by an option. */
export type Treatment =
  | { type: 'hold'; risk: number }
  | {
      type: 'shift';
      /** affected route key → target route key */
      to: Record<string, string>;
      extraHours: number;
      costPerUnit: number;
      risk: number;
    }
  | {
      type: 'reroute';
      /** affected route key → replacement waypoints between its endpoints */
      via: Record<string, Point[]>;
      extraHours: number;
      costPerUnit: number;
      risk: number;
    }
  | { type: 'expedite'; extraHours: number; costPerUnit: number; risk: number }
  | { type: 'delay'; extraHours: number; costPerUnit: number; risk: number };

export interface OptionTemplate {
  key: string;
  label: string;
  strategy: string;
  summary: string;
  urgent: Treatment; // critical + high
  standard: Treatment;
  low: Treatment;
  fixedCostUsd: number;
}

export interface IrScopeHint {
  asset: string;
  system: string;
  dataClass: string;
  status: string;
  confidence: 'suspected' | 'confirmed';
  records: number;
}

export interface IrHint {
  category: string;
  attackVector: string;
  functionalImpact: string;
  informationImpact: string;
  recoverability: string;
  iocs: string[];
  scope: IrScopeHint[];
}

export interface ScenarioDef {
  key: string;
  orgSlug: string;
  title: string;
  shortLabel: string;
  tag: string;
  kind: DisruptionKind;
  severity: Severity;
  summary: string;
  lat: number;
  lng: number;
  radiusKm: number;
  /** Routes drawn as disrupted on the globe. */
  affectedRouteKeys: string[];
  /** Routes whose shipments the response options re-plan (subset of affected). */
  planRouteKeys: string[];
  /** Routes shown as at-risk (amber) but not frozen. */
  atRiskRouteKeys: string[];
  affectedNodeKeys: string[];
  durationHours: number;
  /** Queue/backlog multiplier applied when cargo waits it out. */
  backlogFactor: number;
  options: OptionTemplate[];
  ir?: IrHint;
}

const hold = (risk: number): Treatment => ({ type: 'hold', risk });

const AMAZON_3PL_ROUTES = ['3pl-dallas', '3pl-plano', '3pl-houston', '3pl-austin'];
const toFortWorth = {
  '3pl-dallas': 'fortworth-dallas',
  '3pl-plano': 'fortworth-plano',
  '3pl-houston': 'fortworth-houston',
  '3pl-austin': 'fortworth-austin',
};
const toCvgCharter = Object.fromEntries(AMAZON_3PL_ROUTES.map((k) => [k, 'cvg-dallas-charter']));

const SUEZ_ROUTES = ['yantian-rotterdam', 'singapore-hamburg'];
const viaCape: Record<string, Point[]> = {
  'yantian-rotterdam': [...SOUTH_CHINA_SEA_TO_INDIAN_OCEAN, ...CAPE_OF_GOOD_HOPE],
  'singapore-hamburg': [[2.6, 101.2], [5.8, 97.2], [5.6, 80.6], ...CAPE_OF_GOOD_HOPE, [53.0, 7.0]],
};
const suezToAir = { 'yantian-rotterdam': 'hkg-lej', 'singapore-hamburg': 'sin-lej' };

const CVS_TEXAS_ROUTES = ['texas-dallas', 'texas-houston', 'texas-sanantonio'];
const toOkc = {
  'texas-dallas': 'okc-dallas',
  'texas-houston': 'okc-houston',
  'texas-sanantonio': 'okc-sanantonio',
};
const toIndyAir = Object.fromEntries(CVS_TEXAS_ROUTES.map((k) => [k, 'indy-dallas-air']));

const MMK_MARKET_ROUTES = ['market-richardson', 'market-plano', 'market-catering'];
const toCashCarry = {
  'market-richardson': 'cashcarry-richardson',
  'market-plano': 'cashcarry-plano',
  'market-catering': 'cashcarry-catering',
};

export const SCENARIOS: ScenarioDef[] = [
  // ───────────────────────────── Amazon (Gold) ─────────────────────────────
  {
    key: 'amz-ransomware-3pl',
    orgSlug: 'amazon',
    title: 'Ransomware at Grand Prairie 3PL',
    shortLabel: 'Ransomware · 3PL',
    tag: 'Cyber',
    kind: 'cyber',
    severity: 'critical',
    summary:
      "Ransomware encrypted the partner's warehouse management system at the Grand Prairie cross-dock. Outbound linehauls to Dallas, Plano, Houston and Austin are frozen and inbound air cargo cannot be received.",
    lat: 32.7,
    lng: -97.0,
    radiusKm: 45,
    affectedRouteKeys: [...AMAZON_3PL_ROUTES, 'dfw-3pl', 'fortworth-3pl'],
    planRouteKeys: AMAZON_3PL_ROUTES,
    atRiskRouteKeys: ['cvg-dfw'],
    affectedNodeKeys: ['3pl-grandprairie'],
    durationHours: 72,
    backlogFactor: 1.15,
    options: [
      {
        key: 'wait',
        label: 'Wait for 3PL recovery',
        strategy: 'wait',
        summary: 'Hold all outbound volume until the partner restores its WMS from backup.',
        urgent: hold(0.55),
        standard: hold(0.55),
        low: hold(0.55),
        fixedCostUsd: 0,
      },
      {
        key: 'alternate-dc',
        label: 'Shift to Fort Worth FC, delay low-priority',
        strategy: 'alternate_dc',
        summary:
          'Re-pick critical, high and standard orders at Fort Worth FC and run its standby linehauls; low-priority parcels wait for the 3PL.',
        urgent: { type: 'shift', to: toFortWorth, extraHours: 3, costPerUnit: 0.35, risk: 0.15 },
        standard: { type: 'shift', to: toFortWorth, extraHours: 3, costPerUnit: 0.35, risk: 0.15 },
        low: hold(0.55),
        fixedCostUsd: 6000,
      },
      {
        key: 'alternate-dc-all',
        label: 'Shift all volume to Fort Worth FC',
        strategy: 'alternate_dc_all',
        summary: 'Move every order to Fort Worth FC. Exceeds its spare capacity, so overtime and congestion risk rise.',
        urgent: { type: 'shift', to: toFortWorth, extraHours: 3, costPerUnit: 0.35, risk: 0.28 },
        standard: { type: 'shift', to: toFortWorth, extraHours: 3, costPerUnit: 0.35, risk: 0.28 },
        low: { type: 'shift', to: toFortWorth, extraHours: 3, costPerUnit: 0.35, risk: 0.28 },
        fixedCostUsd: 18000,
      },
      {
        key: 'air-charter',
        label: 'Air-charter urgent parcels from CVG',
        strategy: 'air_expedite',
        summary: 'Charter flights from the CVG air hub with direct injection to Dallas; everything else waits.',
        urgent: { type: 'shift', to: toCvgCharter, extraHours: 6, costPerUnit: 4.2, risk: 0.1 },
        standard: hold(0.55),
        low: hold(0.55),
        fixedCostUsd: 22000,
      },
    ],
    ir: {
      category: 'ransomware',
      attackVector: 'email_phishing',
      functionalImpact: 'high',
      informationImpact: 'privacy_breach',
      recoverability: 'supplemented',
      iocs: [
        'Encrypted files with .lockd extension on WMS-APP-01..04',
        'Outbound TLS to 185.220.101.47:443 from WMS-DB-01',
        'Phishing email "Updated carrier rate sheet" to 3PL dispatch',
      ],
      scope: [
        {
          asset: 'WMS production database',
          system: 'Grand Prairie 3PL WMS',
          dataClass: 'operational',
          status: 'encrypted_ransomware',
          confidence: 'confirmed',
          records: 0,
        },
        {
          asset: 'Customer delivery addresses & phone numbers',
          system: '3PL manifest database',
          dataClass: 'pii',
          status: 'exfiltrated',
          confidence: 'suspected',
          records: 48200,
        },
        {
          asset: 'Partner VPN service-account credentials',
          system: 'Site-to-site VPN',
          dataClass: 'credentials',
          status: 'accessed',
          confidence: 'suspected',
          records: 12,
        },
      ],
    },
  },
  {
    key: 'amz-suez-blockage',
    orgSlug: 'amazon',
    title: 'Suez Canal blocked',
    shortLabel: 'Suez blockage',
    tag: 'Blockage',
    kind: 'blockage',
    severity: 'high',
    summary:
      'A grounded ultra-large container ship is blocking the Suez Canal. Northbound Asia–Europe sailings are stopped; salvage teams estimate 6–8 days to refloat, with a queue of 300+ vessels behind it.',
    lat: 30.0,
    lng: 32.55,
    radiusKm: 160,
    affectedRouteKeys: SUEZ_ROUTES,
    planRouteKeys: SUEZ_ROUTES,
    atRiskRouteKeys: ['rotterdam-leipzig', 'hamburg-leipzig'],
    affectedNodeKeys: [],
    durationHours: 168,
    backlogFactor: 1.35,
    options: [
      {
        key: 'wait',
        label: 'Wait at anchorage for reopening',
        strategy: 'wait',
        summary: 'Vessels queue at the canal entrance until the ship is refloated and the backlog clears.',
        urgent: hold(0.6),
        standard: hold(0.6),
        low: hold(0.6),
        fixedCostUsd: 0,
      },
      {
        key: 'cape-all',
        label: 'Reroute all sailings via the Cape',
        strategy: 'reroute_cape',
        summary: 'Divert every sailing around the Cape of Good Hope: certain arrival, about 9–10 extra days at sea.',
        urgent: { type: 'reroute', via: viaCape, extraHours: 230, costPerUnit: 0.9, risk: 0.2 },
        standard: { type: 'reroute', via: viaCape, extraHours: 230, costPerUnit: 0.9, risk: 0.2 },
        low: { type: 'reroute', via: viaCape, extraHours: 230, costPerUnit: 0.9, risk: 0.2 },
        fixedCostUsd: 0,
      },
      {
        key: 'air-all',
        label: 'Air-freight everything',
        strategy: 'air_all',
        summary: 'Move all affected cargo onto Asia–Europe air lanes at crisis charter rates.',
        urgent: { type: 'shift', to: suezToAir, extraHours: 0, costPerUnit: 12, risk: 0.1 },
        standard: { type: 'shift', to: suezToAir, extraHours: 0, costPerUnit: 12, risk: 0.1 },
        low: { type: 'shift', to: suezToAir, extraHours: 0, costPerUnit: 12, risk: 0.1 },
        fixedCostUsd: 0,
      },
      {
        key: 'split-air-cape',
        label: 'Fly high-priority, reroute the rest via the Cape',
        strategy: 'split_air_cape',
        summary: 'Critical and high-priority SKUs move to air; standard and low-priority cargo sails around the Cape.',
        urgent: { type: 'shift', to: suezToAir, extraHours: 0, costPerUnit: 12, risk: 0.1 },
        standard: { type: 'reroute', via: viaCape, extraHours: 230, costPerUnit: 0.9, risk: 0.2 },
        low: { type: 'reroute', via: viaCape, extraHours: 230, costPerUnit: 0.9, risk: 0.2 },
        fixedCostUsd: 0,
      },
    ],
  },
  {
    key: 'amz-typhoon-yantian',
    orgSlug: 'amazon',
    title: 'Typhoon closes Port of Yantian',
    shortLabel: 'Typhoon · Yantian',
    tag: 'Weather',
    kind: 'weather',
    severity: 'high',
    summary:
      'A signal-8 typhoon has closed the Port of Yantian for an estimated 48 hours. Vessel loading and gate-in are suspended; Pearl River Delta trucking is restricted.',
    lat: 21.6,
    lng: 115.4,
    radiusKm: 320,
    affectedRouteKeys: ['yantian-la', 'shenzhen-yantian'],
    planRouteKeys: ['yantian-la'],
    atRiskRouteKeys: ['yantian-rotterdam', 'dongguan-hkg'],
    affectedNodeKeys: ['port-yantian'],
    durationHours: 48,
    backlogFactor: 1.2,
    options: [
      {
        key: 'wait',
        label: 'Hold all cargo until the port reopens',
        strategy: 'wait',
        summary: 'Keep containers at the terminal and factory until the typhoon passes.',
        urgent: hold(0.2),
        standard: hold(0.2),
        low: hold(0.2),
        fixedCostUsd: 0,
      },
      {
        key: 'divert-all',
        label: 'Divert all cargo to Port of Xiamen',
        strategy: 'divert_port_all',
        summary: 'Truck every container 500 km to Xiamen and rebook on the next transpacific sailing.',
        urgent: { type: 'shift', to: { 'yantian-la': 'xiamen-la' }, extraHours: 10, costPerUnit: 1.4, risk: 0.3 },
        standard: { type: 'shift', to: { 'yantian-la': 'xiamen-la' }, extraHours: 10, costPerUnit: 1.4, risk: 0.3 },
        low: { type: 'shift', to: { 'yantian-la': 'xiamen-la' }, extraHours: 10, costPerUnit: 1.4, risk: 0.3 },
        fixedCostUsd: 9000,
      },
      {
        key: 'split-divert',
        label: 'Divert urgent cargo to Xiamen, hold the rest',
        strategy: 'split_divert_hold',
        summary: 'Only critical and high-priority containers are trucked to Xiamen; standard and low-priority cargo waits 48 h.',
        urgent: { type: 'shift', to: { 'yantian-la': 'xiamen-la' }, extraHours: 10, costPerUnit: 1.4, risk: 0.3 },
        standard: hold(0.2),
        low: hold(0.2),
        fixedCostUsd: 9000,
      },
      {
        key: 'air-urgent',
        label: 'Fly urgent cargo from Hong Kong',
        strategy: 'air_expedite',
        summary: 'Move urgent cargo onto the HKG–CVG air lane; everything else waits.',
        urgent: { type: 'shift', to: { 'yantian-la': 'hkg-cvg' }, extraHours: 6, costPerUnit: 11, risk: 0.15 },
        standard: hold(0.2),
        low: hold(0.2),
        fixedCostUsd: 4000,
      },
    ],
  },
  // ──────────────────────────────── CVS (Silver) ───────────────────────────────
  {
    key: 'cvs-ransomware-texas',
    orgSlug: 'cvs',
    title: 'Ransomware at Texas DC',
    shortLabel: 'Ransomware · Texas DC',
    tag: 'Cyber',
    kind: 'cyber',
    severity: 'critical',
    summary:
      'Ransomware encrypted the 3PL-operated warehouse system at the Texas DC and spread to the pharmacy claims integration. Store replenishment for Dallas, Houston and San Antonio has stopped.',
    lat: 32.75,
    lng: -97.33,
    radiusKm: 40,
    affectedRouteKeys: [...CVS_TEXAS_ROUTES, 'indy-texas'],
    planRouteKeys: CVS_TEXAS_ROUTES,
    atRiskRouteKeys: [],
    affectedNodeKeys: ['dc-texas'],
    durationHours: 96,
    backlogFactor: 1.15,
    options: [
      {
        key: 'wait',
        label: 'Wait for DC systems to be restored',
        strategy: 'wait',
        summary: 'Hold Texas replenishment until the 3PL restores its WMS.',
        urgent: hold(0.6),
        standard: hold(0.6),
        low: hold(0.6),
        fixedCostUsd: 0,
      },
      {
        key: 'overflow-okc',
        label: 'Serve Texas stores from Oklahoma City',
        strategy: 'alternate_dc',
        summary: 'Re-slot critical, high and standard Rx at the OKC overflow DC; OTC restock waits.',
        urgent: { type: 'shift', to: toOkc, extraHours: 14, costPerUnit: 0.5, risk: 0.18 },
        standard: { type: 'shift', to: toOkc, extraHours: 14, costPerUnit: 0.5, risk: 0.18 },
        low: hold(0.6),
        fixedCostUsd: 8000,
      },
      {
        key: 'air-critical-okc',
        label: 'Air-courier critical Rx, shift the rest to OKC',
        strategy: 'split_air_overflow',
        summary: 'Critical and high-priority prescriptions fly from the Midwest DC; standard Rx is re-slotted at OKC; OTC restock waits.',
        urgent: { type: 'shift', to: toIndyAir, extraHours: 5, costPerUnit: 3.8, risk: 0.1 },
        standard: { type: 'shift', to: toOkc, extraHours: 14, costPerUnit: 0.5, risk: 0.18 },
        low: hold(0.6),
        fixedCostUsd: 12000,
      },
      {
        key: 'overflow-all',
        label: 'Move all Texas volume to OKC',
        strategy: 'alternate_dc_all',
        summary: 'Shift every Texas order to OKC, including OTC restock. Exceeds overflow capacity.',
        urgent: { type: 'shift', to: toOkc, extraHours: 14, costPerUnit: 0.5, risk: 0.3 },
        standard: { type: 'shift', to: toOkc, extraHours: 14, costPerUnit: 0.5, risk: 0.3 },
        low: { type: 'shift', to: toOkc, extraHours: 14, costPerUnit: 0.5, risk: 0.3 },
        fixedCostUsd: 15000,
      },
    ],
    ir: {
      category: 'ransomware',
      attackVector: 'impersonation_spoofing',
      functionalImpact: 'high',
      informationImpact: 'privacy_breach',
      recoverability: 'extended',
      iocs: [
        'Help-desk password reset requested by caller impersonating a DC supervisor',
        'PsExec lateral movement from WMS-APP-02 to CLAIMS-INT-01',
        'Ransom note README_RESTORE.txt on file shares',
      ],
      scope: [
        {
          asset: 'Texas DC WMS database',
          system: '3PL WMS',
          dataClass: 'operational',
          status: 'encrypted_ransomware',
          confidence: 'confirmed',
          records: 0,
        },
        {
          asset: 'Prescription fill records',
          system: 'Pharmacy claims integration',
          dataClass: 'phi',
          status: 'exfiltrated',
          confidence: 'suspected',
          records: 212000,
        },
        {
          asset: 'Pharmacist & technician accounts',
          system: 'Active Directory (DC domain)',
          dataClass: 'credentials',
          status: 'accessed',
          confidence: 'confirmed',
          records: 340,
        },
      ],
    },
  },
  {
    key: 'cvs-hurricane-florida',
    orgSlug: 'cvs',
    title: 'Hurricane closes Florida DC',
    shortLabel: 'Hurricane · Florida',
    tag: 'Weather',
    kind: 'weather',
    severity: 'high',
    summary:
      'A Category 3 hurricane made landfall near Tampa Bay. The Orlando DC is closed and I-4 / Florida Turnpike are under evacuation orders for an estimated 72 hours.',
    lat: 28.0,
    lng: -82.0,
    radiusKm: 260,
    affectedRouteKeys: ['orlando-miami', 'orlando-tampa', 'jax-orlando'],
    planRouteKeys: ['orlando-miami', 'orlando-tampa'],
    atRiskRouteKeys: ['sanjuan-jax'],
    affectedNodeKeys: ['dc-orlando'],
    durationHours: 72,
    backlogFactor: 1.25,
    options: [
      {
        key: 'wait',
        label: 'Wait for the Florida DC to reopen',
        strategy: 'wait',
        summary: 'Hold Florida store replenishment until roads reopen.',
        urgent: hold(0.4),
        standard: hold(0.4),
        low: hold(0.4),
        fixedCostUsd: 0,
      },
      {
        key: 'atlanta-all',
        label: 'Serve Florida stores from Atlanta',
        strategy: 'alternate_dc_all',
        summary: 'Run all Florida replenishment from the Atlanta overflow DC once roads allow.',
        urgent: {
          type: 'shift',
          to: { 'orlando-miami': 'atlanta-miami', 'orlando-tampa': 'atlanta-tampa' },
          extraHours: 9,
          costPerUnit: 0.7,
          risk: 0.22,
        },
        standard: {
          type: 'shift',
          to: { 'orlando-miami': 'atlanta-miami', 'orlando-tampa': 'atlanta-tampa' },
          extraHours: 9,
          costPerUnit: 0.7,
          risk: 0.22,
        },
        low: {
          type: 'shift',
          to: { 'orlando-miami': 'atlanta-miami', 'orlando-tampa': 'atlanta-tampa' },
          extraHours: 9,
          costPerUnit: 0.7,
          risk: 0.22,
        },
        fixedCostUsd: 10000,
      },
      {
        key: 'atlanta-urgent',
        label: 'Atlanta for urgent Rx, hold retail restock',
        strategy: 'split_alternate_dc',
        summary: 'Critical and high-priority prescriptions run from Atlanta; standard and low-priority restock waits.',
        urgent: {
          type: 'shift',
          to: { 'orlando-miami': 'atlanta-miami', 'orlando-tampa': 'atlanta-tampa' },
          extraHours: 9,
          costPerUnit: 0.7,
          risk: 0.22,
        },
        standard: hold(0.4),
        low: hold(0.4),
        fixedCostUsd: 6000,
      },
    ],
  },
  {
    key: 'cvs-reefer-failure',
    orgSlug: 'cvs',
    title: 'Reefer failure on vaccine lane',
    shortLabel: 'Cold chain · I-94',
    tag: 'Accident',
    kind: 'accident',
    severity: 'high',
    summary:
      'A refrigerated trailer carrying vaccines lost its compressor on I-94 near Kalamazoo. Temperature loggers show 9 °C and rising; replacement equipment is about 10 hours away.',
    lat: 42.2,
    lng: -85.5,
    radiusKm: 30,
    affectedRouteKeys: ['vaccine-indy'],
    planRouteKeys: ['vaccine-indy'],
    atRiskRouteKeys: [],
    affectedNodeKeys: [],
    durationHours: 10,
    backlogFactor: 1.1,
    options: [
      {
        key: 'wait',
        label: 'Wait for the replacement trailer',
        strategy: 'wait',
        summary: 'Keep the load on the failed reefer until a replacement arrives. Excursion risk is high.',
        urgent: hold(0.75),
        standard: hold(0.75),
        low: hold(0.75),
        fixedCostUsd: 0,
      },
      {
        key: 'backup-reefer',
        label: 'Transload to the backup reefer',
        strategy: 'backup_reefer',
        summary: 'Dispatch the standby reefer from Kalamazoo and transload within 3 hours via US-131 / I-69.',
        urgent: { type: 'shift', to: { 'vaccine-indy': 'indy-detroit-reefer' }, extraHours: 3, costPerUnit: 0.4, risk: 0.12 },
        standard: { type: 'shift', to: { 'vaccine-indy': 'indy-detroit-reefer' }, extraHours: 3, costPerUnit: 0.4, risk: 0.12 },
        low: { type: 'shift', to: { 'vaccine-indy': 'indy-detroit-reefer' }, extraHours: 3, costPerUnit: 0.4, risk: 0.12 },
        fixedCostUsd: 2500,
      },
      {
        key: 'air-courier',
        label: 'Air-courier the vaccines',
        strategy: 'air_expedite',
        summary: 'Fly the full load in temperature-controlled packaging to Indianapolis.',
        urgent: { type: 'shift', to: { 'vaccine-indy': 'vaccine-indy-air' }, extraHours: 1, costPerUnit: 2.8, risk: 0.08 },
        standard: { type: 'shift', to: { 'vaccine-indy': 'vaccine-indy-air' }, extraHours: 1, costPerUnit: 2.8, risk: 0.08 },
        low: { type: 'shift', to: { 'vaccine-indy': 'vaccine-indy-air' }, extraHours: 1, costPerUnit: 2.8, risk: 0.08 },
        fixedCostUsd: 4000,
      },
    ],
  },
  // ──────────────────────────── Maple & Main (Bronze) ────────────────────────────
  {
    key: 'mmk-pos-ransomware',
    orgSlug: 'maple-main',
    title: 'Ransomware locks POS & ordering',
    shortLabel: 'Ransomware · POS',
    tag: 'Cyber',
    kind: 'cyber',
    severity: 'high',
    summary:
      'Ransomware locked the point-of-sale and online-ordering system at both dining rooms. Automatic supplier re-orders stopped, so tomorrow morning’s produce deliveries were never placed.',
    lat: 32.95,
    lng: -96.73,
    radiusKm: 12,
    affectedRouteKeys: MMK_MARKET_ROUTES,
    planRouteKeys: MMK_MARKET_ROUTES,
    atRiskRouteKeys: ['dairy-richardson', 'meats-richardson'],
    affectedNodeKeys: ['kitchen-richardson', 'kitchen-plano'],
    durationHours: 48,
    backlogFactor: 1.1,
    options: [
      {
        key: 'wait',
        label: 'Wait for the POS vendor to restore',
        strategy: 'wait',
        summary: 'Run on current inventory until ordering comes back. Fresh produce runs out on day one.',
        urgent: hold(0.65),
        standard: hold(0.65),
        low: hold(0.65),
        fixedCostUsd: 0,
      },
      {
        key: 'phone-cash-carry',
        label: 'Phone orders + cash & carry for today',
        strategy: 'manual_orders_split',
        summary:
          "Owner picks up today's urgent produce at Cash & Carry; standard items are phoned in for tomorrow's truck; dry goods wait.",
        urgent: { type: 'shift', to: toCashCarry, extraHours: 1, costPerUnit: 6, risk: 0.1 },
        standard: { type: 'delay', extraHours: 14, costPerUnit: 0, risk: 0.15 },
        low: hold(0.3),
        fixedCostUsd: 120,
      },
      {
        key: 'cash-carry-all',
        label: 'Buy everything at Cash & Carry',
        strategy: 'switch_vendor_all',
        summary: 'Replace all produce deliveries with cash & carry purchases at retail-plus pricing.',
        urgent: { type: 'shift', to: toCashCarry, extraHours: 1, costPerUnit: 6, risk: 0.1 },
        standard: { type: 'shift', to: toCashCarry, extraHours: 1, costPerUnit: 6, risk: 0.1 },
        low: { type: 'shift', to: toCashCarry, extraHours: 1, costPerUnit: 6, risk: 0.1 },
        fixedCostUsd: 240,
      },
    ],
    ir: {
      category: 'ransomware',
      attackVector: 'web',
      functionalImpact: 'high',
      informationImpact: 'privacy_breach',
      recoverability: 'supplemented',
      iocs: [
        'Ransom note on POS terminals: "Your files are encrypted"',
        'Remote-access tool installed via outdated online-ordering plugin',
      ],
      scope: [
        {
          asset: 'POS transaction database',
          system: 'Cloud POS',
          dataClass: 'operational',
          status: 'encrypted_ransomware',
          confidence: 'confirmed',
          records: 0,
        },
        {
          asset: 'Stored card tokens',
          system: 'Online ordering',
          dataClass: 'pci',
          status: 'accessed',
          confidence: 'suspected',
          records: 3100,
        },
        {
          asset: 'Customer emails & phone numbers',
          system: 'Online ordering',
          dataClass: 'pii',
          status: 'exfiltrated',
          confidence: 'suspected',
          records: 5400,
        },
      ],
    },
  },
  {
    key: 'mmk-ice-storm',
    orgSlug: 'maple-main',
    title: 'Ice storm closes US-75',
    shortLabel: 'Ice storm · US-75',
    tag: 'Weather',
    kind: 'weather',
    severity: 'high',
    summary: 'Freezing rain has closed US-75 between downtown Dallas and Richardson. TxDOT expects about 30 hours before lanes reopen.',
    lat: 32.86,
    lng: -96.77,
    radiusKm: 18,
    affectedRouteKeys: ['market-richardson', 'market-plano'],
    planRouteKeys: ['market-richardson', 'market-plano'],
    atRiskRouteKeys: ['dairy-richardson', 'market-catering'],
    affectedNodeKeys: [],
    durationHours: 30,
    backlogFactor: 1.1,
    options: [
      {
        key: 'wait',
        label: 'Wait for US-75 to reopen',
        strategy: 'wait',
        summary: 'Skip today’s produce delivery and run a reduced menu.',
        urgent: hold(0.5),
        standard: hold(0.5),
        low: hold(0.5),
        fixedCostUsd: 0,
      },
      {
        key: 'detour',
        label: 'Detour via Dallas North Tollway',
        strategy: 'detour',
        summary: 'Send the produce van around the closure on the Tollway and George Bush Turnpike.',
        urgent: {
          type: 'shift',
          to: { 'market-richardson': 'market-richardson-alt', 'market-plano': 'market-plano-alt' },
          extraHours: 1,
          costPerUnit: 1.2,
          risk: 0.18,
        },
        standard: {
          type: 'shift',
          to: { 'market-richardson': 'market-richardson-alt', 'market-plano': 'market-plano-alt' },
          extraHours: 1,
          costPerUnit: 1.2,
          risk: 0.18,
        },
        low: {
          type: 'shift',
          to: { 'market-richardson': 'market-richardson-alt', 'market-plano': 'market-plano-alt' },
          extraHours: 1,
          costPerUnit: 1.2,
          risk: 0.18,
        },
        fixedCostUsd: 40,
      },
      {
        key: 'local-farm',
        label: 'Buy urgent produce from McKinney farm',
        strategy: 'switch_vendor_split',
        summary: 'Source urgent produce from the local organic farm north of the closure; the rest waits.',
        urgent: {
          type: 'shift',
          to: { 'market-richardson': 'farm-richardson', 'market-plano': 'farm-richardson' },
          extraHours: 1,
          costPerUnit: 9,
          risk: 0.12,
        },
        standard: hold(0.5),
        low: hold(0.5),
        fixedCostUsd: 60,
      },
    ],
  },
  {
    key: 'mmk-produce-breakdown',
    orgSlug: 'maple-main',
    title: 'Produce truck breakdown on US-281',
    shortLabel: 'Breakdown · US-281',
    tag: 'Accident',
    kind: 'accident',
    severity: 'moderate',
    summary:
      'The co-op’s produce truck broke down north of Edinburg. A replacement tractor is about 14 hours away and the load is warming.',
    lat: 26.9,
    lng: -98.15,
    radiusKm: 20,
    affectedRouteKeys: ['rgv-market'],
    planRouteKeys: ['rgv-market'],
    atRiskRouteKeys: ['market-richardson', 'market-plano'],
    affectedNodeKeys: [],
    durationHours: 14,
    backlogFactor: 1.1,
    options: [
      {
        key: 'wait',
        label: 'Wait for the replacement tractor',
        strategy: 'wait',
        summary: 'Keep the load on the truck until the co-op’s replacement arrives.',
        urgent: hold(0.45),
        standard: hold(0.45),
        low: hold(0.45),
        fixedCostUsd: 0,
      },
      {
        key: 'local-farm',
        label: 'Substitute from McKinney farm',
        strategy: 'switch_vendor_all',
        summary: 'Replace the whole order with local farm produce at premium prices.',
        urgent: { type: 'shift', to: { 'rgv-market': 'farm-richardson' }, extraHours: 2, costPerUnit: 9, risk: 0.12 },
        standard: { type: 'shift', to: { 'rgv-market': 'farm-richardson' }, extraHours: 2, costPerUnit: 9, risk: 0.12 },
        low: { type: 'shift', to: { 'rgv-market': 'farm-richardson' }, extraHours: 2, costPerUnit: 9, risk: 0.12 },
        fixedCostUsd: 60,
      },
      {
        key: 'cash-carry-urgent',
        label: 'Cash & carry for urgent items, wait for the rest',
        strategy: 'switch_vendor_split',
        summary: 'Pick up urgent produce at Cash & Carry today; the co-op load arrives tomorrow.',
        urgent: { type: 'shift', to: { 'rgv-market': 'cashcarry-richardson' }, extraHours: 1, costPerUnit: 6, risk: 0.1 },
        standard: hold(0.45),
        low: hold(0.45),
        fixedCostUsd: 60,
      },
    ],
  },
];

export function scenariosForOrg(orgSlug: string): ScenarioDef[] {
  return SCENARIOS.filter((s) => s.orgSlug === orgSlug);
}

export function findScenario(key: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.key === key);
}
