/**
 * The half arrow from the Arrow logo: a shaft and a swept, notched head split along the shaft, with the upper half
 * solid and the lower half muted. Inherits `currentColor`.
 *
 * `data-arrow-glyph` marks it as the arrow the page transition launches from and lands on (see arrow-transition.tsx).
 */
export function HalfArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" data-arrow-glyph="" className={className}>
      <rect x="1.5" y="11" width="12.6" height="2" rx="1" />
      <path d="M22.5 12 11 4.5 14.6 12Z" />
      <path d="M22.5 12 14.6 12 11 19.5Z" opacity="0.45" />
    </svg>
  );
}
