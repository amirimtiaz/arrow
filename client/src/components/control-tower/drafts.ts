/**
 * Ops â†’ IR hand-off. The Arrow agent can only produce an incident DRAFT in
 * the ops database (`action_proposal` kind `ir_draft`). A signed-in Control
 * Tower member reviews it and creates the incident here; the ops side never
 * holds IR credentials. Payloads are parsed defensively: anything unknown
 * falls back to a safe default the member can correct in the form.
 */
import { ATTACK_VECTORS, CATEGORIES, DATA_CLASSES, FUNCTIONAL_IMPACTS, INFORMATION_IMPACTS, RECOVERABILITY, SCOPE_STATUSES } from './vocab';

export interface DraftScopeRow {
  asset: string;
  system: string;
  owner: string;
  dataClass: string;
  status: string;
  confidence: string;
  records: bigint;
  notificationRequired: boolean;
}

export interface ParsedDraft {
  proposalId: bigint;
  title: string;
  summary: string;
  rationale: string;
  severity: string;
  category: string;
  attackVector: string;
  functionalImpact: string;
  informationImpact: string;
  recoverability: string;
  iocs: string[];
  scope: DraftScopeRow[];
  affectedNodes: string[];
  disruptionId: bigint;
  orgName: string;
  createdAtMs: number;
}

export function draftRef(proposalId: bigint) {
  return `ops-proposal:${proposalId}`;
}

function str(v: unknown, max = 400): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '';
}

function pick(value: unknown, allowed: Record<string, unknown> | readonly string[], aliases: Record<string, string>, fallback: string) {
  const keys = Array.isArray(allowed) ? allowed : Object.keys(allowed);
  const v = str(value, 60)
    .toLowerCase()
    .replace(/[\s/-]+/g, '_');
  if (keys.includes(v)) return v;
  if (aliases[v] && keys.includes(aliases[v])) return aliases[v];
  return fallback;
}

function severityOf(v: unknown): string {
  const s = str(v, 20).toUpperCase().replace(/\s+/g, '');
  if (/^SEV[1-4]$/.test(s)) return s;
  const map: Record<string, string> = { CRITICAL: 'SEV1', HIGH: 'SEV2', MODERATE: 'SEV3', MEDIUM: 'SEV3', LOW: 'SEV4' };
  return map[s] ?? 'SEV2';
}

function records(v: unknown): bigint {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n)) : 0n;
}

interface ProposalLike {
  id: bigint;
  title: string;
  rationale: string;
  payloadJson: string;
  disruptionId: bigint;
  createdAt: { microsSinceUnixEpoch: bigint };
}

export function parseDraft(p: ProposalLike): ParsedDraft {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(p.payloadJson || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
  } catch {
    /* malformed payload: fall back to the proposal's own fields */
  }
  const scopeRaw = Array.isArray(raw.scope) ? raw.scope.slice(0, 50) : [];
  const scope: DraftScopeRow[] = scopeRaw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => {
      const dataClass = pick(
        s.dataClass,
        DATA_CLASSES,
        {
          operational_ot: 'operational',
          ot: 'operational',
          ip: 'ip_trade_secret',
          trade_secret: 'ip_trade_secret',
          payment: 'pci',
          health: 'phi',
          personal: 'pii',
        },
        'operational'
      );
      return {
        asset: str(s.asset, 160) || 'Unnamed asset',
        system: str(s.system, 120),
        owner: str(s.owner, 80),
        dataClass,
        status: pick(
          s.status,
          SCOPE_STATUSES,
          { encrypted: 'encrypted_ransomware', ransomware: 'encrypted_ransomware', wiped: 'destroyed_wiped' },
          'unknown'
        ),
        confidence: str(s.confidence, 20).toLowerCase() === 'confirmed' ? 'confirmed' : 'suspected',
        records: records(s.records),
        notificationRequired:
          typeof s.notificationRequired === 'boolean' ? s.notificationRequired : ['pii', 'phi', 'pci'].includes(dataClass),
      };
    });
  const list = (v: unknown, max: number, len: number) =>
    Array.isArray(v)
      ? v
          .map((x) => str(x, len))
          .filter(Boolean)
          .slice(0, max)
      : [];
  const disruption = Number(raw.disruptionId);
  return {
    proposalId: p.id,
    title: str(raw.title, 160) || p.title.slice(0, 160),
    summary: str(raw.summary, 4000) || p.rationale.slice(0, 4000),
    rationale: p.rationale,
    severity: severityOf(raw.severity),
    category: pick(
      raw.category,
      CATEGORIES,
      { exfiltration: 'data_exfiltration', bec: 'bec_phishing', phishing: 'bec_phishing', supply_chain: 'supply_chain_compromise' },
      'other'
    ),
    attackVector: pick(
      raw.attackVector,
      ATTACK_VECTORS,
      { email: 'email_phishing', phishing: 'email_phishing', spoofing: 'impersonation_spoofing' },
      'unknown'
    ),
    functionalImpact: pick(raw.functionalImpact, FUNCTIONAL_IMPACTS, {}, 'medium'),
    informationImpact: pick(
      raw.informationImpact,
      INFORMATION_IMPACTS,
      { privacy: 'privacy_breach', proprietary: 'proprietary_breach', integrity: 'integrity_loss' },
      'none'
    ),
    recoverability: pick(raw.recoverability, RECOVERABILITY, {}, 'supplemented'),
    iocs: list(raw.iocs, 50, 300),
    scope,
    affectedNodes: list(raw.affectedNodes, 50, 120),
    disruptionId: Number.isFinite(disruption) && disruption > 0 ? BigInt(Math.round(disruption)) : p.disruptionId,
    orgName: str(raw.orgName, 120),
    createdAtMs: Number(p.createdAt.microsSinceUnixEpoch / 1000n),
  };
}
