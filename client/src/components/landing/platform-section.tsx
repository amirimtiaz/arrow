import clsx from 'clsx';
import { BrainCircuit, ChartSpline, Earth, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionIntro } from './section-intro';
import { CONTAINER, EYEBROW } from './styles';

const ROUTE_STATES = [
  { label: 'Healthy', color: '#22C55E' },
  { label: 'At risk', color: '#F5A524' },
  { label: 'Disrupted', color: '#F2555A' },
  { label: 'Rerouted', color: '#22D3EE' },
] as const;

const TRACE_STEPS = [
  { kind: 'plan', detail: 'investigate disruption' },
  { kind: 'tool_call', detail: 'query_route_history' },
  { kind: 'decision', detail: 'awaiting approval' },
] as const;

const TOWER_FEATURES = ['SEV1–4', 'Scope register', 'Live chat', 'Audit chain'] as const;

function RouteLegend() {
  return (
    <ul aria-label="Route status colors" className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium">
      {ROUTE_STATES.map((state) => (
        <li key={state.label} className="inline-flex items-center gap-1.5 text-[#F5F1E8]/80">
          <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: state.color }} />
          {state.label}
        </li>
      ))}
    </ul>
  );
}

function TracePreview() {
  return (
    <ol aria-label="Example agent trace" className="space-y-1.5 font-mono text-[11px]/5">
      {TRACE_STEPS.map((step) => (
        <li key={step.kind} className="flex gap-2 overflow-hidden whitespace-nowrap">
          <span className="w-[4.75rem] shrink-0 text-[#8CC2F5]">{step.kind}</span>
          <span className="truncate text-[#F5F1E8]/70">{step.detail}</span>
        </li>
      ))}
    </ol>
  );
}

function TowerChips() {
  return (
    <ul aria-label="Control Tower features" className="flex flex-wrap gap-2">
      {TOWER_FEATURES.map((feature) => (
        <li key={feature} className="rounded-full bg-[#F5F1E8]/8 px-3 py-1 text-xs font-medium text-[#F5F1E8]/80">
          {feature}
        </li>
      ))}
    </ul>
  );
}

/** Decorative sketch of a risk spike crossing an alert threshold and recovering. */
function RiskSparkline() {
  return (
    <svg viewBox="0 0 200 48" aria-hidden="true" focusable="false" className="h-12 w-full overflow-visible">
      <line x1="0" y1="18" x2="200" y2="18" stroke="#F2555A" strokeOpacity="0.55" strokeDasharray="4 4" />
      <polyline
        points="0,38 22,36 42,37 62,35 80,34 94,29 104,13 114,7 126,15 142,28 162,33 182,35 200,34"
        fill="none"
        stroke="#8CC2F5"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="114" cy="7" r="3.5" fill="#F2555A" />
    </svg>
  );
}

interface Pillar {
  name: string;
  kicker: string;
  icon: LucideIcon;
  body: string;
  poweredBy: string;
  detail: ReactNode;
}

const PILLARS: Pillar[] = [
  {
    name: 'Silk Road',
    kicker: 'Live 3D globe',
    icon: Earth,
    body: 'Every supplier, port, warehouse and lane on one globe. When a disruption hits, affected routes turn red and the blast radius is clear at a glance.',
    poweredBy: 'SpacetimeDB',
    detail: <RouteLegend />,
  },
  {
    name: 'Agentic response',
    kicker: 'Investigates on its own',
    icon: BrainCircuit,
    body: 'Nemotron agents start the moment a disruption appears. They plan, call tools, compare options and recommend. A human approves before anything changes.',
    poweredBy: 'NVIDIA Nemotron',
    detail: <TracePreview />,
  },
  {
    name: 'Control Tower',
    kicker: 'Cyber incident command',
    icon: ShieldCheck,
    body: 'An isolated, invite-only command center for cyber incidents: documentation, scope of affected data, real-time chat and a tamper-evident audit log.',
    poweredBy: 'Isolated SpacetimeDB',
    detail: <TowerChips />,
  },
  {
    name: 'Analytics',
    kicker: 'History and anomalies',
    icon: ChartSpline,
    body: 'Time-series history of route risk, delays and security events. SQL anomaly detection can raise a disruption and start the agents automatically.',
    poweredBy: 'Tiger Data',
    detail: <RiskSparkline />,
  },
];

export function PlatformSection() {
  return (
    <section id="platform" aria-labelledby="platform-title" className="bg-[#08131F] text-[#F5F1E8]">
      <div className={clsx(CONTAINER, 'py-24 lg:py-32')}>
        <SectionIntro
          id="platform-title"
          tone="dark"
          eyebrow="The platform"
          title="One command center for the whole chain."
          lede="Arrow connects live operations, disruption intelligence and cyber incident response in one interface. Agents do the digging; people make the call."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 xl:grid-cols-4 lg:mt-20">
          {PILLARS.map((pillar, index) => {
            const Icon = pillar.icon;
            return (
              <article key={pillar.name} className="flex flex-col rounded-[28px] border border-[#F5F1E8]/10 bg-[#0E1C2B] p-7 xl:p-6">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-full bg-[#F5F1E8]/8 text-[#8CC2F5]">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="font-mono text-xs text-[#F5F1E8]/45">{String(index + 1).padStart(2, '0')}</span>
                </div>
                <p className={clsx(EYEBROW, 'mt-8 text-[#8CC2F5]')}>{pillar.kicker}</p>
                {/* Sized so the longest name stays on one line in the four-column layout. */}
                <h3 className="mt-2 font-display text-[2.5rem] font-normal uppercase leading-none xl:text-[length:clamp(2rem,2.3vw,2.125rem)]">
                  {pillar.name}
                </h3>
                <p className="mt-4 text-[15px]/7 text-[#F5F1E8]/72">{pillar.body}</p>
                <div className="mt-6 pb-7">{pillar.detail}</div>
                <p className="mt-auto border-t border-[#F5F1E8]/10 pt-5 text-xs text-[#F5F1E8]/55">
                  <span className="mr-1.5">Powered by</span>
                  <span className="font-semibold text-[#F5F1E8]/90">{pillar.poweredBy}</span>
                </p>
              </article>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col gap-2 rounded-[22px] border border-[#F5F1E8]/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p className="flex items-center gap-3 text-[15px] font-semibold">
            <span aria-hidden="true" className="animate-soft-pulse size-2.5 shrink-0 rounded-full bg-[#22C55E]" />
            Real-time sync powered by SpacetimeDB
          </p>
          <p className="text-sm text-[#F5F1E8]/65">Approve a reroute in one window and every operator sees the change instantly.</p>
        </div>
      </div>
    </section>
  );
}
