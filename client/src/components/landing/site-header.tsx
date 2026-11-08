import clsx from 'clsx';
import Image from 'next/image';
import Link from 'next/link';
import { HalfArrow } from '@/components/brand/half-arrow';
import { PillLink } from './pill-link';
import { GUTTER } from './styles';

export const SECTION_LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'Plans', href: '#plans' },
  { label: 'Security', href: '#security' },
  { label: 'Contact', href: '#contact' },
] as const;

/** Cumulus silhouette in a 120×60 box: a flat base, six puffs of different sizes on top and a lumpy underside. */
const CLOUD_PARTS = (
  <>
    <rect x="10" y="28" width="100" height="22" rx="11" />
    <circle cx="13" cy="40" r="8.5" />
    <circle cx="24" cy="33" r="12" />
    <circle cx="42" cy="25" r="15" />
    <circle cx="64" cy="21" r="17.5" />
    <circle cx="86" cy="26" r="14" />
    <circle cx="102" cy="35" r="10" />
    <circle cx="34" cy="48" r="6" />
    <circle cx="58" cy="49.5" r="6.5" />
    <circle cx="82" cy="48" r="6" />
  </>
);

/**
 * A slightly translucent, volumetric cloud behind a header link. One gradient spans every part (userSpaceOnUse), so
 * the puffs merge without seams; a blurred blue-grey underside and soft highlights on the crowns give it depth, and
 * the whole group fades together so overlaps don't stack into darker patches.
 */
function CloudShape({ id }: { id: string }) {
  return (
    <svg
      viewBox="0 0 120 60"
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute -top-4 left-1/2 h-[49px] w-[98px] -translate-x-1/2 overflow-visible drop-shadow-[0_8px_14px_rgba(4,16,30,0.28)] lg:-top-5 lg:h-[58px] lg:w-[116px]"
    >
      <defs>
        <linearGradient id={`${id}-fill`} gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="56">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#F4F8FC" />
          <stop offset="1" stopColor="#D3E0EE" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>{CLOUD_PARTS}</clipPath>
        <filter id={`${id}-soft`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="0.45" />
        </filter>
        <filter id={`${id}-haze`} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <g className="opacity-[0.86] transition-opacity duration-200 group-hover:opacity-100">
        <g filter={`url(#${id}-soft)`} fill={`url(#${id}-fill)`}>
          {CLOUD_PARTS}
        </g>
        <g clipPath={`url(#${id}-clip)`}>
          <ellipse cx="60" cy="55" rx="54" ry="8" fill="#AFC4DC" opacity="0.55" filter={`url(#${id}-haze)`} />
          <ellipse cx="62" cy="11" rx="10" ry="4.5" fill="#FFFFFF" filter={`url(#${id}-haze)`} />
          <ellipse cx="40" cy="16" rx="7" ry="3.5" fill="#FFFFFF" opacity="0.9" filter={`url(#${id}-haze)`} />
          <ellipse cx="87" cy="18" rx="6" ry="3" fill="#FFFFFF" opacity="0.85" filter={`url(#${id}-haze)`} />
        </g>
      </g>
    </svg>
  );
}

/** Each cloud floats on its own slow beat: [duration s, delay s]. */
const CLOUD_DRIFT = [
  [6.4, 0],
  [7.2, -2.1],
  [6.8, -4.3],
  [7.6, -1.2],
] as const;

/** Transparent top bar laid over the hero photo. */
export function SiteHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-20 text-[#F5F1E8]">
      <nav aria-label="Primary" className={clsx(GUTTER, 'flex items-center justify-between gap-6 py-5 lg:py-6')}>
        <Link href="/" aria-label="Arrow home" className="shrink-0 rounded-md">
          {/* White logo on a transparent background, keyed out of the brand banner (960×261). */}
          <Image
            src="/images/arrow-logo.png"
            alt=""
            width={960}
            height={261}
            sizes="(min-width: 1024px) 206px, 162px"
            loading="eager"
            className="h-11 w-auto drop-shadow-[0_2px_12px_rgba(4,16,30,0.35)] lg:h-14"
          />
        </Link>

        <div className="flex flex-1 items-center justify-end gap-6 lg:gap-10">
          {/* The clouds spread evenly across the open sky between the logo and the button, at a fixed size. */}
          <ul className="ml-auto hidden max-w-[780px] flex-1 items-center justify-evenly gap-2 md:flex">
            {SECTION_LINKS.map((link, i) => (
              <li
                key={link.href}
                className="nav-cloud"
                style={{ animationDuration: `${CLOUD_DRIFT[i]?.[0] ?? 7}s`, animationDelay: `${CLOUD_DRIFT[i]?.[1] ?? 0}s` }}
              >
                <a
                  href={link.href}
                  className="group relative inline-flex h-9 w-[84px] items-center justify-center rounded-full text-[14px] font-semibold text-[#0B1724] transition-transform duration-200 hover:-translate-y-0.5 lg:w-[100px] lg:text-[15px]"
                >
                  <CloudShape id={`nav-cloud-${i}`} />
                  <span className="relative">{link.label}</span>
                </a>
              </li>
            ))}
          </ul>
          <PillLink href="/app" variant="cream-outline" size="sm" arrowShot={{ direction: 'forward', caption: 'Launching command center' }}>
            Launch app
            <HalfArrow className="size-4" />
          </PillLink>
        </div>
      </nav>
    </header>
  );
}
