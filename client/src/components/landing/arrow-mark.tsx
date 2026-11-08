import clsx from 'clsx';

/** Arrow's mark: a swept arrowhead pointing up and to the right. Inherits `currentColor`. */
export function ArrowMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d="M1.5 21.5 38.5 2.5 27.5 21.5 20 15.5Z" />
    </svg>
  );
}

/** Mark plus the "Arrow" wordmark. */
export function ArrowWordmark({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <ArrowMark className="h-[0.95em] w-auto" />
      <span className="font-semibold tracking-[-0.02em]">Arrow</span>
    </span>
  );
}
