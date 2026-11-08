import clsx from 'clsx';
import type { CSSProperties } from 'react';
import { BANK_HEIGHT, CloudBank } from './clouds';
import { SectionIntro } from './section-intro';
import { CONTAINER } from './styles';

/** From xl the steps descend like a staircase, one tread per stage. */
const STEP_DROP = ['', 'xl:mt-14', 'xl:mt-28', 'xl:mt-42'] as const;

const STEPS = [
  {
    name: 'Detect',
    text: 'A scenario, a Tiger Data anomaly or a cyber alert opens a disruption. No prompt needed.',
  },
  {
    name: 'Investigate',
    text: 'A Nemotron agent plans, calls tools and streams every step to a visible trace.',
  },
  {
    name: 'Decide',
    text: 'Cost, delay and risk are scored in code, not by the model. A manager approves or rejects.',
  },
  {
    name: 'Execute',
    text: 'The approved action updates live state, and every operator sees the reroute at once.',
  },
] as const;

export function HowItWorks() {
  return (
    <section data-scroll-scope aria-labelledby="how-title" className="relative border-t border-[#F5F1E8]/10 bg-[#08131F] text-[#F5F1E8]">
      <div className={clsx(CONTAINER, 'pt-24 lg:pt-32')} style={{ paddingBottom: `calc(${BANK_HEIGHT} + 4rem)` }}>
        <SectionIntro id="how-title" tone="dark" eyebrow="How it works" title="From alert to action." />

        <ol className="mt-14 grid items-start gap-12 md:grid-cols-2 md:gap-x-8 xl:grid-cols-4 lg:mt-20">
          {STEPS.map((step, index) => {
            const last = index === STEPS.length - 1;
            return (
              <li
                key={step.name}
                data-reveal="left"
                style={{ '--reveal-delay': `${index * 150}ms` } as CSSProperties}
                className={clsx('relative border-t border-[#F5F1E8]/20 pt-9', STEP_DROP[index])}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    'absolute -top-[6px] left-0 size-[11px] rounded-full ring-4 ring-[#08131F]',
                    last ? 'bg-[#22D3EE]' : 'bg-[#F5F1E8]'
                  )}
                />
                <p className="font-mono text-xs tracking-[0.2em] text-[#8CC2F5]">{String(index + 1).padStart(2, '0')}</p>
                <h3 className="mt-3 font-display text-[length:clamp(2.5rem,3.4vw,3.25rem)] font-normal uppercase leading-none">
                  {step.name}
                </h3>
                <p className="mt-4 max-w-xs text-[15px]/7 text-[#F5F1E8]/70">{step.text}</p>
              </li>
            );
          })}
        </ol>
      </div>
      {/* Clouds rise from the bottom into the cream Plans section. */}
      <CloudBank edge="bottom" seed={37} over="navy" />
    </section>
  );
}
