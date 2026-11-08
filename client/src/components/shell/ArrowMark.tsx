/** Arrow logo mark: two stacked chevron strokes forming a forward arrow. */
export function ArrowMark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <path d="M4 24 L17 8 L21 8 L8 24 Z" fill="currentColor" />
      <path d="M13 24 L26 8 L30 8 L17 24 Z" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
