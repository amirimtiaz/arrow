import clsx from 'clsx';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { ArrowWordmark } from './arrow-mark';
import { PillLink } from './pill-link';
import { GUTTER } from './styles';

export const SECTION_LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'Plans', href: '#plans' },
  { label: 'Security', href: '#security' },
  { label: 'Contact', href: '#contact' },
] as const;

/** Transparent top bar laid over the hero photo. */
export function SiteHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-20 text-[#F5F1E8]">
      <nav aria-label="Primary" className={clsx(GUTTER, 'flex items-center justify-between gap-6 py-6 lg:py-7')}>
        <Link href="/" aria-label="Arrow home" className="rounded-md text-[1.45rem] leading-none">
          <ArrowWordmark />
        </Link>

        <div className="flex items-center gap-8 lg:gap-10">
          <ul className="hidden items-center gap-8 md:flex lg:gap-10">
            {SECTION_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="rounded-sm text-[15px] font-medium text-[#F5F1E8]/90 transition-colors hover:text-white">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <PillLink href="/app" variant="cream-outline" size="sm">
            Launch app
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </PillLink>
        </div>
      </nav>
    </header>
  );
}
