/**
 * Visual vocabulary for statuses. Status is always shown as color + icon +
 * text (CLAUDE.md §8), so every entry carries all three.
 */
import {
  AlertOctagon,
  AlertTriangle,
  Anchor,
  ArrowLeftRight,
  CheckCircle2,
  ChefHat,
  CircleDashed,
  CloudLightning,
  Factory,
  Flame,
  Megaphone,
  Package,
  Plane,
  ShieldAlert,
  Ship,
  Store,
  Swords,
  TrainFront,
  Truck,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

export interface StatusMeta {
  label: string;
  /** CSS variable name (without --) used for WebGL/canvas colors. */
  cssVar: string;
  /** Tailwind text color class. */
  text: string;
  /** Tailwind soft background class. */
  soft: string;
  icon: LucideIcon;
}

export const ROUTE_STATUS: Record<string, StatusMeta> = {
  healthy: { label: 'Healthy', cssVar: 'success', text: 'text-success', soft: 'bg-success-soft', icon: CheckCircle2 },
  at_risk: { label: 'At risk', cssVar: 'warning', text: 'text-warning', soft: 'bg-warning-soft', icon: AlertTriangle },
  disrupted: { label: 'Disrupted', cssVar: 'danger', text: 'text-danger', soft: 'bg-danger-soft', icon: AlertOctagon },
  rerouted: { label: 'Rerouted', cssVar: 'cyan', text: 'text-cyan', soft: 'bg-cyan-soft', icon: ArrowLeftRight },
  standby: { label: 'Standby', cssVar: 'faint', text: 'text-faint', soft: 'bg-panel-2', icon: CircleDashed },
};

export const SHIPMENT_STATUS: Record<string, StatusMeta> = {
  in_transit: { label: 'In transit', cssVar: 'success', text: 'text-success', soft: 'bg-success-soft', icon: Package },
  delayed: { label: 'Delayed', cssVar: 'danger', text: 'text-danger', soft: 'bg-danger-soft', icon: AlertOctagon },
  held: { label: 'Held', cssVar: 'warning', text: 'text-warning', soft: 'bg-warning-soft', icon: CircleDashed },
  rerouted: { label: 'Rerouted', cssVar: 'cyan', text: 'text-cyan', soft: 'bg-cyan-soft', icon: ArrowLeftRight },
};

export const SEVERITY: Record<string, StatusMeta> = {
  low: { label: 'Low', cssVar: 'success', text: 'text-success', soft: 'bg-success-soft', icon: CheckCircle2 },
  moderate: { label: 'Moderate', cssVar: 'warning', text: 'text-warning', soft: 'bg-warning-soft', icon: AlertTriangle },
  high: { label: 'High', cssVar: 'danger', text: 'text-danger', soft: 'bg-danger-soft', icon: AlertOctagon },
  critical: { label: 'Critical', cssVar: 'danger', text: 'text-danger', soft: 'bg-danger-soft', icon: ShieldAlert },
};

export const FEED_SEVERITY: Record<string, StatusMeta> = {
  info: { label: 'Info', cssVar: 'accent', text: 'text-accent', soft: 'bg-accent-soft', icon: Megaphone },
  success: { label: 'Resolved', cssVar: 'success', text: 'text-success', soft: 'bg-success-soft', icon: CheckCircle2 },
  warning: { label: 'Warning', cssVar: 'warning', text: 'text-warning', soft: 'bg-warning-soft', icon: AlertTriangle },
  critical: { label: 'Critical', cssVar: 'danger', text: 'text-danger', soft: 'bg-danger-soft', icon: AlertOctagon },
};

export const NODE_KIND: Record<string, { label: string; icon: LucideIcon; cssVar: string }> = {
  supplier: { label: 'Supplier', icon: Package, cssVar: 'violet' },
  factory: { label: 'Factory', icon: Factory, cssVar: 'violet' },
  port: { label: 'Port', icon: Anchor, cssVar: 'accent' },
  airport: { label: 'Airport', icon: Plane, cssVar: 'cyan' },
  warehouse: { label: 'Warehouse / DC', icon: Warehouse, cssVar: 'warning' },
  store: { label: 'Store / delivery station', icon: Store, cssVar: 'success' },
  kitchen: { label: 'Kitchen', icon: ChefHat, cssVar: 'success' },
};

export const MODE: Record<string, { label: string; icon: LucideIcon }> = {
  sea: { label: 'Sea', icon: Ship },
  air: { label: 'Air', icon: Plane },
  rail: { label: 'Rail', icon: TrainFront },
  truck: { label: 'Truck', icon: Truck },
};

export const DISRUPTION_KIND: Record<string, { label: string; icon: LucideIcon }> = {
  cyber: { label: 'Cyber', icon: ShieldAlert },
  weather: { label: 'Weather', icon: CloudLightning },
  blockage: { label: 'Blockage', icon: Ship },
  port_congestion: { label: 'Port congestion', icon: Anchor },
  accident: { label: 'Accident', icon: Flame },
  strike: { label: 'Labor action', icon: Megaphone },
  geopolitical: { label: 'Geopolitical', icon: Swords },
};

export const PLAN_STYLE: Record<string, { label: string; className: string }> = {
  bronze: { label: 'Bronze', className: 'text-[#c9814a] bg-[rgba(201,129,74,0.14)] border-[rgba(201,129,74,0.35)]' },
  silver: { label: 'Silver', className: 'text-[#9fb2c8] bg-[rgba(159,178,200,0.14)] border-[rgba(159,178,200,0.35)]' },
  gold: { label: 'Gold', className: 'text-[#e3b341] bg-[rgba(227,179,65,0.14)] border-[rgba(227,179,65,0.35)]' },
};

export function riskLevel(index: number): { label: string; meta: StatusMeta } {
  if (index >= 55) return { label: 'Critical', meta: SEVERITY.critical };
  if (index >= 38) return { label: 'High', meta: SEVERITY.high };
  if (index >= 26) return { label: 'Elevated', meta: SEVERITY.moderate };
  return { label: 'Low', meta: SEVERITY.low };
}
