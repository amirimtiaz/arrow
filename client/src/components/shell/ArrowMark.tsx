import { HalfArrow } from '@/components/brand/half-arrow';

/** Arrow logo mark in the app: the half arrow from the brand logo. */
export function ArrowMark({ className = 'size-6' }: { className?: string }) {
  return <HalfArrow className={className} />;
}
