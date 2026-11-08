import clsx from 'clsx';
import type { CSSProperties } from 'react';
import { BANK_HEIGHT, CloudBank, SkyCloud } from './clouds';
import { SkyPhoto } from './sky-photo';
import { GUTTER } from './styles';

/** Darkens the nav strip, the left text column and the bottom edge; the open sky stays untouched. */
const HERO_SCRIM = [
  'linear-gradient(180deg, rgba(4,14,26,0.38) 0%, rgba(4,14,26,0) 18%)',
  'linear-gradient(90deg, rgba(4,18,34,0.58) 0%, rgba(4,18,34,0.26) 38%, rgba(4,18,34,0) 60%)',
  'linear-gradient(0deg, rgba(4,14,26,0.74) 0%, rgba(4,14,26,0.3) 26%, rgba(4,14,26,0) 50%)',
].join(', ');

/** Italic lines set straight onto the photo, with only a soft shadow for contrast. */
const HERO_TAGLINE =
  'text-lg/7 font-medium italic sm:text-xl/8 lg:text-[1.375rem]/8 [text-shadow:0_1px_18px_rgba(4,16,30,0.45),0_1px_3px_rgba(4,16,30,0.35)]';

/**
 * One gap between every line of the stack. It is set in vw because the photo scales with the width, so the stack
 * fills the open sky in the same proportion at every laptop size.
 */
const STACK_GAP = 'mt-[clamp(2.25rem,5vw,6rem)]';

/** Load-in stagger for the hero lines (see .hero-rise in globals.css). */
const rise = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

export function Hero() {
  return (
    <section
      data-scroll-scope
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-[#4F7F99] text-[#F5F1E8]"
    >
      <SkyPhoto
        alt="Three people beside a mountain river shade their eyes and look up into a clear blue sky; one holds a drone controller."
        positionClassName="object-[30%_0%] md:object-[0%_0%]"
        scrim={HERO_SCRIM}
        preload
      />

      {/* Clouds drift through the open sky on the right, each at its own scroll speed. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[-5] hidden md:block">
        <SkyCloud className="top-[13%] right-[6%] w-[min(28vw,440px)]" px={-160} py={-50} drift={30} />
        <SkyCloud className="top-[5%] right-[33%] w-[min(14vw,220px)] opacity-80" shape={1} px={120} py={-20} drift={36} flip />
        <SkyCloud className="top-[29%] right-[-5%] w-[min(19vw,300px)] opacity-75" shape={1} px={-70} py={-90} drift={26} />
      </div>

      <div className={clsx(GUTTER, 'relative z-[2] pt-[calc(5.5rem+3.5vw)]')} style={{ paddingBottom: `calc(${BANK_HEIGHT} + 2rem)` }}>
        <h1 id="hero-title" className="font-display font-normal uppercase leading-[0.88] [text-shadow:0_2px_30px_rgba(4,16,30,0.35)]">
          <span className="hero-rise block text-[length:clamp(3rem,7.6vw,9.25rem)]" style={rise(0)}>
            Arrow.
          </span>
          {/* One line at every width: sized in vw so it never wraps. The opening quote hangs into the margin. */}
          <span
            className={clsx(STACK_GAP, 'hero-rise block text-[length:7.1vw] whitespace-nowrap xl:text-[length:min(4.6vw,6.25rem)]')}
            style={rise(140)}
          >
            <span className="-ml-[0.32em]">“</span>Supply chains, in motion”
          </span>
        </h1>

        <p className={clsx(HERO_TAGLINE, STACK_GAP, 'hero-rise max-w-[24rem]')} style={rise(280)}>
          Centralized, digitized, and agentic supply chain intelligence for modern operations.
        </p>

        <p className={clsx(HERO_TAGLINE, STACK_GAP, 'hero-rise max-w-[26rem]')} style={rise(420)}>
          Supply chains run our world. Everything we use today was once a cog in a large supply chain. Modern supply chains are running on
          legacy commandments with no technological innovation; Arrow changes that by adding Agentic AI and live technological feedback for
          a fully digital data-backed supply chain.
        </p>
      </div>

      {/* The hero sinks into a cream cloud bank that becomes the next section. */}
      <CloudBank edge="bottom" seed={11} over="photo" />
    </section>
  );
}
