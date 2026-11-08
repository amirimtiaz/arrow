import clsx from 'clsx';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { ArrowWordmark } from './arrow-mark';
import { SkyCloud } from './clouds';
import { PillLink } from './pill-link';
import { SECTION_LINKS } from './site-header';
import { SkyPhoto } from './sky-photo';
import { EYEBROW, GUTTER } from './styles';

/** Soft shade behind the headline, then a deep fade at the bottom so the footer reads over the photo. */
const CLOSING_SCRIM = [
  'radial-gradient(70% 38% at 50% 20%, rgba(4,18,34,0.3) 0%, rgba(4,18,34,0) 70%)',
  'linear-gradient(0deg, rgba(4,12,22,0.94) 0%, rgba(4,12,22,0.72) 24%, rgba(4,12,22,0.18) 48%, rgba(4,12,22,0) 62%)',
].join(', ');

const APP_LINKS = [
  { label: 'Launch app', href: '/app' },
  { label: 'Control Tower', href: '/app/control-tower' },
] as const;

const FOOTER_LINK = 'rounded-sm text-[15px] text-[#F5F1E8]/80 transition-colors hover:text-white';
const FOOTER_HEADING = clsx(EYEBROW, 'text-[#F5F1E8]/55');

function ClosingCallToAction() {
  const lineClass =
    'font-display text-[length:clamp(3rem,7.2vw,8.75rem)] font-normal uppercase leading-[0.88] [text-shadow:0_2px_30px_rgba(4,16,30,0.25)]';

  return (
    <section aria-labelledby="closing-title" className={clsx(GUTTER, 'pt-[calc(4rem+7vw)]')}>
      <h2 id="closing-title" className="sr-only">
        Arrow. Decisions in motion.
      </h2>
      {/* Visual headline with the CTA set inline, Zipline-style; the sr-only h2 carries the heading text. */}
      <div className="mx-auto w-fit max-w-full">
        <div className="flex flex-wrap items-center gap-x-[0.35em] gap-y-3 text-[length:clamp(3rem,7.2vw,8.75rem)]">
          <p aria-hidden="true" className={lineClass}>
            Arrow.
          </p>
          <PillLink href="/app" size="sm">
            Launch app
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </PillLink>
        </div>
        <p aria-hidden="true" className={lineClass}>
          Decisions in motion.
        </p>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    // On narrow screens the stacked footer runs up over the people, so it gets its own fade there.
    <footer className={clsx(GUTTER, 'bg-linear-to-b from-[#040C16]/0 via-[#040C16]/60 to-[#040C16]/85 pb-8 pt-16 md:bg-none')}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-10 border-t border-[#F5F1E8]/20 pt-10 lg:grid-cols-[1.5fr_1fr_1fr_1.6fr]">
        <div className="col-span-2 lg:col-span-1">
          <Link href="/" aria-label="Arrow home" className="inline-block rounded-md text-[1.35rem] leading-none">
            <ArrowWordmark />
          </Link>
          <p className="mt-4 max-w-xs text-[15px]/6 text-[#F5F1E8]/70">Centralized, digitized, and agentic supply chain intelligence.</p>
        </div>

        <nav aria-label="Page sections">
          <h2 className={FOOTER_HEADING}>Explore</h2>
          <ul className="mt-4 space-y-2.5">
            {SECTION_LINKS.filter((link) => link.href !== '#contact').map((link) => (
              <li key={link.href}>
                <a href={link.href} className={FOOTER_LINK}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="App">
          <h2 className={FOOTER_HEADING}>App</h2>
          <ul className="mt-4 space-y-2.5">
            {APP_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={FOOTER_LINK}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div id="contact" className="col-span-2 lg:col-span-1">
          <h2 className={FOOTER_HEADING}>Contact</h2>
          <p className="mt-4 max-w-sm text-[15px]/6 text-[#F5F1E8]/80">
            Want a walkthrough? Find the Arrow team at HackUTD 2026, or open the live demo and trigger a scenario yourself.
          </p>
        </div>
      </div>

      <div className="mt-12 flex flex-col gap-2 text-xs text-[#F5F1E8]/60 sm:flex-row sm:items-center sm:justify-between">
        <p>Built at HackUTD 2026 · Simulated data</p>
        <p>Photo: cottonbro studio on Pexels</p>
      </div>
    </footer>
  );
}

/** Closing call to action and site footer, set over the same sky photo as the hero (mirrored for variety). */
export function Closing() {
  return (
    <div
      data-scroll-scope
      className="relative isolate flex min-h-[100svh] flex-col justify-between overflow-hidden bg-[#4F7F99] text-[#F5F1E8] md:min-h-[max(100svh,72vw)]"
    >
      <SkyPhoto alt="" positionClassName="object-[60%_0%] md:object-[50%_0%]" scrim={CLOSING_SCRIM} mirrored />
      {/* Night-navy from the section above dissolves into the sky, and clouds drift out of it as you arrive. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[-6] h-[30vw] max-h-[420px] bg-linear-to-b from-[#08131F] via-[#08131F]/55 to-transparent"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[-5] hidden md:block">
        <SkyCloud className="top-[9%] left-[4%] w-[min(24vw,380px)]" px={140} py={60} drift={32} />
        <SkyCloud className="top-[4%] right-[10%] w-[min(17vw,270px)] opacity-85" shape={1} px={-110} py={40} drift={27} flip />
        <SkyCloud className="top-[24%] right-[-3%] w-[min(21vw,330px)] opacity-75" px={-60} py={90} drift={38} />
      </div>
      <ClosingCallToAction />
      <SiteFooter />
    </div>
  );
}
