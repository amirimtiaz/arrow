import clsx from 'clsx';
import Image from 'next/image';
import Link from 'next/link';
import { HalfArrow } from '@/components/brand/half-arrow';
import { PillLink } from './pill-link';
import { GUTTER } from './styles';

/** Page sections, listed in the footer. */
export const SECTION_LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'Plans', href: '#plans' },
  { label: 'Security', href: '#security' },
  { label: 'Contact', href: '#contact' },
] as const;

/** Transparent top bar laid over the hero photo: the logo and the way into the app, nothing else in the sky. */
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

        <PillLink
          href="/app"
          variant="cream-outline"
          size="md"
          className="backdrop-blur-[2px] lg:h-[3.25rem] lg:px-7 lg:text-base"
          arrowShot={{ direction: 'forward', caption: 'Launching command center' }}
        >
          Launch app
          <HalfArrow className="size-[1.125rem]" />
        </PillLink>
      </nav>
    </header>
  );
}
