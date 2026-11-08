import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import { PillLink } from './pill-link';
import { SkyPhoto } from './sky-photo';
import { GUTTER } from './styles';

/** Darkens the nav strip, the left text column and the bottom edge; the open sky stays untouched. */
const HERO_SCRIM = [
  'linear-gradient(180deg, rgba(4,14,26,0.38) 0%, rgba(4,14,26,0) 18%)',
  'linear-gradient(90deg, rgba(4,18,34,0.5) 0%, rgba(4,18,34,0.16) 40%, rgba(4,18,34,0) 62%)',
  'linear-gradient(0deg, rgba(4,14,26,0.74) 0%, rgba(4,14,26,0.3) 26%, rgba(4,14,26,0) 50%)',
].join(', ');

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-[#4F7F99] text-[#F5F1E8]"
    >
      <SkyPhoto
        alt="Three people beside a mountain river shade their eyes and look up into a blue sky; one holds a drone controller."
        positionClassName="object-[30%_0%] md:object-[0%_0%]"
        scrim={HERO_SCRIM}
        preload
      />

      <div className={clsx(GUTTER, 'flex flex-1 flex-col justify-between gap-16 pb-14 pt-[calc(5.5rem+3.5vw)] sm:pb-16 lg:pb-[4.5vw]')}>
        <h1
          id="hero-title"
          className="font-display text-[length:clamp(3rem,7.6vw,9.25rem)] font-normal uppercase leading-[0.88] [text-shadow:0_2px_30px_rgba(4,16,30,0.25)]"
        >
          <span className="block">Arrow.</span>
          <span className="block">Supply chains,</span>
          <span className="block">In motion.</span>
        </h1>

        <div>
          <p className="max-w-[22rem] text-lg/7 font-medium sm:text-xl/8 lg:text-[1.375rem]/8">
            Centralized, digitized, and agentic supply chain intelligence for modern operations.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 sm:gap-4">
            <PillLink href="/app">
              See platform
              <ArrowRight aria-hidden="true" className="size-4" />
            </PillLink>
            <PillLink href="/app/control-tower" variant="cream-outline">
              Open Control Tower
            </PillLink>
          </div>
        </div>
      </div>
    </section>
  );
}
