import clsx from 'clsx';
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
        alt="Three people beside a mountain river shade their eyes and look up into a clear blue sky; one holds a drone controller."
        positionClassName="object-[30%_0%] md:object-[0%_0%]"
        scrim={HERO_SCRIM}
        preload
      />

      <div className={clsx(GUTTER, 'pt-[calc(5.5rem+3.5vw)] pb-14')}>
        {/* Side by side from xl: the body text sits level with the middle of the two headline lines. */}
        <div className="flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between xl:gap-14">
          <h1 id="hero-title" className="font-display font-normal uppercase leading-[0.88] [text-shadow:0_2px_30px_rgba(4,16,30,0.35)]">
            <span className="block text-[length:clamp(3rem,7.6vw,9.25rem)]">Arrow.</span>
            {/* One line at every width: sized in vw so it never wraps. The opening quote hangs into the margin. */}
            <span className="mt-[0.32em] block text-[length:7.1vw] whitespace-nowrap xl:text-[length:min(4.6vw,6.25rem)]">
              <span className="-ml-[0.32em]">“</span>Supply chains, in motion”
            </span>
          </h1>

          <p className="max-w-[27rem] rounded-2xl bg-[#071422]/40 p-5 text-[15px]/7 text-[#F5F1E8] ring-1 ring-white/10 backdrop-blur-md sm:text-base/7 xl:shrink-0">
            Supply chains run our world. Everything we use today was once a cog in a large supply chain. Modern supply chains are running on
            legacy commandments with no technological innovation; Arrow changes that by adding Agentic AI and live technological feedback
            for a fully digital data-backed supply chain.
          </p>
        </div>

        <p className="mt-8 max-w-[24rem] text-lg/7 font-medium italic sm:text-xl/8 lg:text-[1.375rem]/8 [text-shadow:0_1px_18px_rgba(4,16,30,0.45)]">
          Centralized, digitized, and agentic supply chain intelligence for modern operations.
        </p>
      </div>
    </section>
  );
}
