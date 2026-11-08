/** Deal-strength status vocabulary: always colour + icon + text (CLAUDE.md §8). */
import { BadgeCheck, Scale, TriangleAlert } from 'lucide-react';
import type { StatusMeta } from '@/lib/ops/status';
import type { DealLabel } from './model';

export const DEAL_META: Record<DealLabel, StatusMeta> = {
  Strong: { label: 'Strong', cssVar: 'success', text: 'text-success', soft: 'bg-success-soft', icon: BadgeCheck },
  Fair: { label: 'Fair', cssVar: 'warning', text: 'text-warning', soft: 'bg-warning-soft', icon: Scale },
  Weak: { label: 'Weak', cssVar: 'danger', text: 'text-danger', soft: 'bg-danger-soft', icon: TriangleAlert },
};
