import clsx from 'clsx';
import Link from 'next/link';
import type { ReactNode } from 'react';

type PillVariant = 'cream' | 'cream-outline' | 'ink';
type PillSize = 'sm' | 'md';

const VARIANTS: Record<PillVariant, string> = {
  cream: 'bg-[#F5F1E8] text-[#0B1724] hover:bg-white',
  'cream-outline': 'border border-[#F5F1E8]/75 text-[#F5F1E8] hover:border-[#F5F1E8] hover:bg-[#F5F1E8]/12',
  ink: 'bg-[#0B1724] text-[#F5F1E8] hover:bg-[#1A2B40]',
};

const SIZES: Record<PillSize, string> = {
  sm: 'h-10 gap-1.5 px-4 text-sm',
  md: 'h-12 gap-2 px-6 text-[15px]',
};

interface PillLinkProps {
  href: string;
  children: ReactNode;
  variant?: PillVariant;
  size?: PillSize;
  className?: string;
}

/** Rounded call-to-action link. In-page anchors render a plain `<a>`; routes use `next/link`. */
export function PillLink({ href, children, variant = 'cream', size = 'md', className }: PillLinkProps) {
  const classes = clsx(
    'inline-flex items-center justify-center whitespace-nowrap rounded-full font-semibold transition-colors duration-200 active:translate-y-px',
    VARIANTS[variant],
    SIZES[size],
    className
  );

  if (href.startsWith('#')) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
