import clsx from 'clsx';
import { ArrowRight, Check } from 'lucide-react';
import { PillLink } from './pill-link';
import { SectionIntro } from './section-intro';
import { CONTAINER, EYEBROW } from './styles';

interface Plan {
  tier: 'Bronze' | 'Silver' | 'Gold';
  name: string;
  audience: string;
  example: string;
  exampleNote: string;
  /** Medal swatch for the tier badge. */
  metal: string;
  features: string[];
  featured?: boolean;
}

const PLANS: Plan[] = [
  {
    tier: 'Bronze',
    name: 'Essentials',
    audience: 'For local businesses',
    example: 'Maple & Main Kitchen',
    exampleNote: 'a family restaurant in Richardson, TX',
    metal: 'linear-gradient(135deg, #E7B07A 0%, #9A5B2A 100%)',
    features: [
      'Silk Road map of local supplier and delivery lanes',
      'Plain-language disruption briefings',
      'Agent-recommended fixes you approve in one click',
      'One live view shared by owners and staff',
    ],
  },
  {
    tier: 'Silver',
    name: 'National',
    audience: 'For national networks',
    example: 'CVS Health',
    exampleNote: 'national pharmacy network',
    metal: 'linear-gradient(135deg, #F4F6F9 0%, #98A3B3 100%)',
    features: [
      'Everything in Essentials',
      'Regional distribution centers and store networks',
      'Cold-chain lanes and priority-aware routing',
      'Tiger Data history and anomaly detection',
      'Cyber Control Tower for incident response',
    ],
  },
  {
    tier: 'Gold',
    name: 'Enterprise',
    audience: 'For global operations',
    example: 'Amazon',
    exampleNote: 'global multimodal network',
    metal: 'linear-gradient(135deg, #F8DC85 0%, #B8871F 100%)',
    features: [
      'Everything in National',
      'Global sea, air, rail and truck network',
      'Multi-agent investigation and recovery planning',
      'Isolated, self-hosted Control Tower deployment',
      'Executive escalation and post-incident reports',
    ],
    featured: true,
  },
];

function PlanCard({ plan }: { plan: Plan }) {
  const dark = plan.featured === true;

  return (
    <article
      aria-labelledby={`plan-${plan.tier.toLowerCase()}`}
      className={clsx(
        'flex flex-col rounded-[28px] p-8 lg:p-9',
        dark ? 'bg-[#0B1724] text-[#F5F1E8] [--accent:#F5F1E8]' : 'bg-white text-[#0B1724] ring-1 ring-[#0B1724]/10'
      )}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="size-9 rounded-full ring-1 ring-black/10" style={{ backgroundImage: plan.metal }} />
        <p className={clsx(EYEBROW, dark ? 'text-[#F5F1E8]/70' : 'text-[#0B1724]/60')}>{plan.tier}</p>
      </div>

      <h3 id={`plan-${plan.tier.toLowerCase()}`} className="mt-6 font-display text-[3.25rem] font-normal uppercase leading-none">
        <span className="sr-only">{plan.tier} · </span>
        {plan.name}
      </h3>
      <p className={clsx('mt-2 text-[15px] font-medium', dark ? 'text-[#F5F1E8]/70' : 'text-[#0B1724]/70')}>{plan.audience}</p>

      <div className={clsx('mt-6 rounded-2xl px-4 py-3.5', dark ? 'bg-[#F5F1E8]/8' : 'bg-[#F5F1E8]')}>
        <p className={clsx('text-[11px] font-semibold uppercase tracking-[0.14em]', dark ? 'text-[#F5F1E8]/60' : 'text-[#0B1724]/55')}>
          Example workspace
        </p>
        <p className="mt-1 text-[15px]/6">
          <span className="font-semibold">{plan.example}</span>
          <span className={dark ? 'text-[#F5F1E8]/75' : 'text-[#0B1724]/75'}>, {plan.exampleNote}</span>
        </p>
      </div>

      <ul className="mt-7 space-y-3 text-[15px]/6">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-3">
            <Check aria-hidden="true" className={clsx('mt-[3px] size-4 shrink-0', dark ? 'text-[#8CC2F5]' : 'text-[#1D5FBF]')} />
            <span className={dark ? 'text-[#F5F1E8]/85' : 'text-[#0B1724]/85'}>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-10">
        <PillLink href="/app" variant={dark ? 'cream' : 'ink'} className="w-full">
          Launch app
          <ArrowRight aria-hidden="true" className="size-4" />
        </PillLink>
      </div>
    </article>
  );
}

export function PlansSection() {
  return (
    <section id="plans" aria-labelledby="plans-title" className="bg-[#F5F1E8] text-[#0B1724] [--accent:#1D5FBF]">
      <div className={clsx(CONTAINER, 'py-24 lg:py-32')}>
        <SectionIntro
          id="plans-title"
          tone="light"
          eyebrow="Plans"
          title={
            <>
              From Main Street
              <br />
              to global.
            </>
          }
          lede="The same platform scales from one kitchen's suppliers to a national pharmacy network to a global multimodal supply chain."
        />

        <div className="mt-14 grid gap-5 lg:mt-20 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <PlanCard key={plan.tier} plan={plan} />
          ))}
        </div>

        <p className="mt-8 text-sm text-[#0B1724]/65">
          Demo workspaces use simulated data. Arrow is not affiliated with or endorsed by Amazon or CVS Health.
        </p>
      </div>
    </section>
  );
}
