/**
 * Control Tower vocabulary: plain-language labels, tones and icons for every
 * enum in the arrow-ir module, the (mirrored) permission matrix and the
 * incident templates. Status is always rendered as color + icon + text.
 */
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  CircleDot,
  Eye,
  Info,
  Lock,
  Pencil,
  ShieldCheck,
  Siren,
  Trash2,
  TriangleAlert,
  Upload,
  type LucideIcon,
} from 'lucide-react';

export type Tone = 'danger' | 'warning' | 'success' | 'accent' | 'cyan' | 'violet' | 'muted';

export const TONE_CLASSES: Record<Tone, { text: string; bg: string; border: string; dot: string }> = {
  danger: { text: 'text-danger', bg: 'bg-danger-soft', border: 'border-danger/40', dot: 'bg-danger' },
  warning: { text: 'text-warning', bg: 'bg-warning-soft', border: 'border-warning/40', dot: 'bg-warning' },
  success: { text: 'text-success', bg: 'bg-success-soft', border: 'border-success/40', dot: 'bg-success' },
  accent: { text: 'text-accent', bg: 'bg-accent-soft', border: 'border-accent/40', dot: 'bg-accent' },
  cyan: { text: 'text-cyan', bg: 'bg-cyan-soft', border: 'border-cyan/40', dot: 'bg-cyan' },
  violet: { text: 'text-violet', bg: 'bg-violet-soft', border: 'border-violet/40', dot: 'bg-violet' },
  muted: { text: 'text-muted', bg: 'bg-panel-2', border: 'border-line', dot: 'bg-faint' },
};

export interface StatusMeta {
  label: string;
  tone: Tone;
  icon: LucideIcon;
  hint?: string;
}

// ─────────────────────────────── Roles & permissions ───────────────────────────────

export const ROLES = ['admin', 'incident_commander', 'responder', 'legal_comms', 'executive_viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_META: Record<string, { label: string; description: string; tone: Tone }> = {
  admin: { label: 'Admin', description: 'Manages the team: invites, roles, revocation and lockdown.', tone: 'violet' },
  incident_commander: {
    label: 'Incident commander',
    description: 'Leads incidents: phases, severity, tasks. Can invite responders, legal and viewers.',
    tone: 'accent',
  },
  responder: { label: 'Responder', description: 'Works the incident: affected data, notes, tasks and chat.', tone: 'cyan' },
  legal_comms: { label: 'Legal & comms', description: 'Notification decisions, materiality, notes and chat.', tone: 'warning' },
  executive_viewer: { label: 'Executive viewer', description: 'Read-only view of every incident.', tone: 'muted' },
};

export function roleLabel(role: string) {
  return ROLE_META[role]?.label ?? role;
}

/** Mirror of PERMISSIONS in spacetime/ir/src/core.ts. Used only to hide controls; the server enforces. */
export const PERMISSIONS: Record<string, readonly Role[]> = {
  invite: ['admin', 'incident_commander'],
  manage_members: ['admin'],
  lockdown: ['admin'],
  create_incident: ['admin', 'incident_commander', 'responder'],
  edit_incident: ['admin', 'incident_commander', 'responder'],
  escalate: ['admin', 'incident_commander', 'responder'],
  set_severity: ['admin', 'incident_commander'],
  manage_lifecycle: ['admin', 'incident_commander'],
  assign_commander: ['admin', 'incident_commander'],
  materiality: ['admin', 'incident_commander', 'legal_comms'],
  edit_scope: ['admin', 'incident_commander', 'responder'],
  scope_notification: ['admin', 'incident_commander', 'responder', 'legal_comms'],
  add_note: ['admin', 'incident_commander', 'responder', 'legal_comms'],
  manage_tasks: ['admin', 'incident_commander', 'responder'],
  complete_task: ['admin', 'incident_commander', 'responder', 'legal_comms'],
  chat: ['admin', 'incident_commander', 'responder', 'legal_comms'],
};

export type Permission = keyof typeof PERMISSIONS;

export function can(role: string | undefined, permission: Permission) {
  return !!role && (PERMISSIONS[permission] ?? []).includes(role as Role);
}

export const INVITABLE_ROLES: Record<string, readonly Role[]> = {
  admin: ROLES,
  incident_commander: ['responder', 'legal_comms', 'executive_viewer'],
};

// ─────────────────────────────── Incident vocabulary ───────────────────────────────

export const SEVERITIES = ['SEV1', 'SEV2', 'SEV3', 'SEV4'] as const;

export const SEVERITY_META: Record<string, StatusMeta> = {
  SEV1: { label: 'SEV1 · Critical', tone: 'danger', icon: Siren, hint: 'Business-critical systems down or major data loss.' },
  SEV2: { label: 'SEV2 · High', tone: 'warning', icon: TriangleAlert, hint: 'Significant impact; containment is urgent.' },
  SEV3: { label: 'SEV3 · Moderate', tone: 'cyan', icon: CircleAlert, hint: 'Limited impact; work it today.' },
  SEV4: { label: 'SEV4 · Low', tone: 'muted', icon: Info, hint: 'Minor or suspected; monitor.' },
};

export const PHASES = ['preparation', 'detection_analysis', 'containment_eradication_recovery', 'post_incident'] as const;

export const PHASE_META: Record<string, { label: string; short: string; step: number; description: string }> = {
  preparation: {
    label: 'Preparation',
    short: 'Preparation',
    step: 1,
    description: 'Team, roles and an out-of-band channel ready before it is needed.',
  },
  detection_analysis: {
    label: 'Detection & Analysis',
    short: 'Detection',
    step: 2,
    description: 'Confirm what happened, how bad it is and which data is affected.',
  },
  containment_eradication_recovery: {
    label: 'Containment, Eradication & Recovery',
    short: 'Containment',
    step: 3,
    description: 'Cut the attacker off, remove the foothold and restore systems.',
  },
  post_incident: {
    label: 'Post-Incident Activity',
    short: 'Post-incident',
    step: 4,
    description: 'Notifications, lessons learned and the final report.',
  },
};

export const INCIDENT_STATUS_META: Record<string, StatusMeta> = {
  open: { label: 'Open', tone: 'danger', icon: Activity },
  contained: { label: 'Contained', tone: 'cyan', icon: ShieldCheck },
  closed: { label: 'Closed', tone: 'success', icon: CheckCircle2 },
};

export const SCOPE_STATUSES = [
  'unknown',
  'accessed',
  'exfiltrated',
  'encrypted_ransomware',
  'destroyed_wiped',
  'integrity_modified',
  'contained',
  'restored',
] as const;

export const SCOPE_STATUS_META: Record<string, StatusMeta> = {
  unknown: { label: 'Unknown', tone: 'muted', icon: CircleDot, hint: 'Not yet assessed' },
  accessed: { label: 'Accessed', tone: 'warning', icon: Eye, hint: 'Attacker could read it' },
  exfiltrated: { label: 'Exfiltrated', tone: 'danger', icon: Upload, hint: 'Copied out of the network' },
  encrypted_ransomware: { label: 'Ransomware-locked', tone: 'danger', icon: Lock, hint: 'Encrypted by ransomware' },
  destroyed_wiped: { label: 'Destroyed / wiped', tone: 'danger', icon: Trash2, hint: 'Deleted or wiped' },
  integrity_modified: { label: 'Integrity modified', tone: 'warning', icon: Pencil, hint: 'Altered by the attacker' },
  contained: { label: 'Contained', tone: 'cyan', icon: ShieldCheck, hint: 'Attacker access removed' },
  restored: { label: 'Restored', tone: 'success', icon: CheckCircle2, hint: 'Back in service, verified' },
};

/** Scope statuses that still need action (not contained or restored). */
export const ACTIVE_SCOPE_STATUSES = [
  'unknown',
  'accessed',
  'exfiltrated',
  'encrypted_ransomware',
  'destroyed_wiped',
  'integrity_modified',
];

export const CATEGORIES: Record<string, string> = {
  ransomware: 'Ransomware',
  data_exfiltration: 'Data exfiltration',
  bec_phishing: 'BEC / phishing',
  ddos: 'DDoS',
  insider: 'Insider',
  supply_chain_compromise: 'Supply-chain compromise',
  other: 'Other',
};

/** CISA / US-CERT attack vectors. */
export const ATTACK_VECTORS: Record<string, string> = {
  unknown: 'Unknown',
  attrition: 'Attrition (brute force, DDoS)',
  web: 'Web',
  email_phishing: 'Email / phishing',
  external_removable_media: 'External / removable media',
  impersonation_spoofing: 'Impersonation / spoofing',
  improper_usage: 'Improper usage',
  loss_theft_equipment: 'Loss or theft of equipment',
  other: 'Other',
};

export const FUNCTIONAL_IMPACTS: Record<string, string> = {
  none: 'None',
  low: 'Low: minimal effect on services',
  medium: 'Medium: some critical services lost',
  high: 'High: critical services unavailable',
};

export const INFORMATION_IMPACTS: Record<string, string> = {
  none: 'None',
  privacy_breach: 'Privacy breach (PII / PHI)',
  proprietary_breach: 'Proprietary breach',
  integrity_loss: 'Integrity loss',
};

export const RECOVERABILITY: Record<string, string> = {
  regular: 'Regular: existing resources',
  supplemented: 'Supplemented: extra resources needed',
  extended: 'Extended: outside help needed',
  not_recoverable: 'Not recoverable',
};

export const DATA_CLASSES: Record<string, { label: string; short: string; personal: boolean }> = {
  pii: { label: 'Personal data (PII)', short: 'PII', personal: true },
  phi: { label: 'Health data (PHI)', short: 'PHI', personal: true },
  pci: { label: 'Payment card data (PCI)', short: 'PCI', personal: false },
  credentials: { label: 'Credentials', short: 'Creds', personal: false },
  ip_trade_secret: { label: 'IP / trade secret', short: 'IP', personal: false },
  financial: { label: 'Financial', short: 'Fin', personal: false },
  operational: { label: 'Operational / OT', short: 'Ops/OT', personal: false },
};

export function labelOf(map: Record<string, string>, key: string) {
  return map[key] ?? key.replace(/_/g, ' ');
}

// ─────────────────────────────── Templates ───────────────────────────────

export interface TemplateTask {
  title: string;
  phase: (typeof PHASES)[number];
}

export interface IncidentTemplate {
  key: 'ransomware' | 'exfiltration' | 'bec' | 'blank';
  label: string;
  description: string;
  title: string;
  severity: string;
  category: string;
  attackVector: string;
  functionalImpact: string;
  informationImpact: string;
  recoverability: string;
  summary: string;
  tasks: TemplateTask[];
}

export const TEMPLATES: IncidentTemplate[] = [
  {
    key: 'ransomware',
    label: 'Ransomware',
    description: 'Systems encrypted, ransom note found.',
    title: 'Ransomware on ',
    severity: 'SEV2',
    category: 'ransomware',
    attackVector: 'unknown',
    functionalImpact: 'high',
    informationImpact: 'integrity_loss',
    recoverability: 'supplemented',
    summary:
      'Ransomware encrypted systems at <site>. Ransom note: <name/extension>. Unknown whether data was copied out before encryption.',
    tasks: [
      { title: 'Isolate affected hosts from the network (do not power off)', phase: 'detection_analysis' },
      { title: 'Identify the ransomware strain and save the ransom note', phase: 'detection_analysis' },
      { title: 'Preserve forensic images before any reimaging', phase: 'detection_analysis' },
      { title: 'Disable compromised accounts and rotate privileged credentials', phase: 'containment_eradication_recovery' },
      { title: 'Restore from offline backups after verifying they are clean', phase: 'containment_eradication_recovery' },
      { title: 'Brief legal on notification duties', phase: 'post_incident' },
      { title: 'Hold the lessons-learned review', phase: 'post_incident' },
    ],
  },
  {
    key: 'exfiltration',
    label: 'Data exfiltration',
    description: 'Data copied out of the network.',
    title: 'Data exfiltration from ',
    severity: 'SEV2',
    category: 'data_exfiltration',
    attackVector: 'unknown',
    functionalImpact: 'low',
    informationImpact: 'privacy_breach',
    recoverability: 'extended',
    summary: 'Data was copied from <system> to an external destination. Volume and data types are being confirmed.',
    tasks: [
      { title: 'Identify the exfiltration channel and destination', phase: 'detection_analysis' },
      { title: 'List affected data sets and estimate record counts', phase: 'detection_analysis' },
      { title: 'Block egress to attacker infrastructure', phase: 'containment_eradication_recovery' },
      { title: 'Reset credentials used in the theft', phase: 'containment_eradication_recovery' },
      { title: 'Decide on breach notifications with legal', phase: 'post_incident' },
      { title: 'Hold the lessons-learned review', phase: 'post_incident' },
    ],
  },
  {
    key: 'bec',
    label: 'Business email compromise',
    description: 'Mailbox takeover or invoice fraud.',
    title: 'Business email compromise: ',
    severity: 'SEV3',
    category: 'bec_phishing',
    attackVector: 'email_phishing',
    functionalImpact: 'low',
    informationImpact: 'proprietary_breach',
    recoverability: 'regular',
    summary: 'A mailbox was taken over or impersonated to redirect payments. Amount at risk: <amount>.',
    tasks: [
      { title: 'Call the bank to recall or freeze the fraudulent transfer', phase: 'detection_analysis' },
      { title: 'Search for malicious inbox rules and forwarding', phase: 'detection_analysis' },
      { title: 'Reset the mailbox password and revoke all sessions', phase: 'containment_eradication_recovery' },
      { title: 'Warn finance about the impersonated vendor (by phone)', phase: 'containment_eradication_recovery' },
      { title: 'Hold the lessons-learned review', phase: 'post_incident' },
    ],
  },
  {
    key: 'blank',
    label: 'Blank',
    description: 'Start from an empty record.',
    title: '',
    severity: 'SEV3',
    category: 'other',
    attackVector: 'unknown',
    functionalImpact: 'low',
    informationImpact: 'none',
    recoverability: 'regular',
    summary: '',
    tasks: [],
  },
];
