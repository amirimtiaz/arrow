'use client';

/** Deterministic deal-strength gauge (0–100) with its weighted factor breakdown. Computed in lib/conquest/model.ts. */
import { Gauge } from 'lucide-react';
import type { DealScore } from '@/lib/conquest/model';
import { DEAL_META } from '@/lib/conquest/meta';
import { ProgressBar, SectionLabel, StatusChip } from '@/components/ui/primitives';

const R = 50;
const ARC = Math.PI * R;

export function DealScoreCard({ deal }: { deal: DealScore }) {
  const meta = DEAL_META[deal.label];
  const ranked = [...deal.factors].sort((a, b) => b.points / b.weight - a.points / a.weight);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  return (
    <section aria-label="Deal strength">
      <SectionLabel icon={Gauge} right={<span className="text-[10.5px] text-faint">Scored in code, not by AI</span>}>
        Deal strength
      </SectionLabel>
      <div className="mt-2 flex items-center gap-3">
        <svg viewBox="0 0 120 70" className="w-[128px] shrink-0" role="img" aria-label={`Deal score ${deal.score} out of 100, ${deal.label}`}>
          <path d="M10,62 A50,50 0 0 1 110,62" fill="none" stroke="var(--panel-2)" strokeWidth={10} strokeLinecap="round" />
          <path
            d="M10,62 A50,50 0 0 1 110,62"
            fill="none"
            stroke={`var(--${meta.cssVar})`}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${(ARC * deal.score) / 100} ${ARC}`}
            style={{ transition: 'stroke-dasharray 600ms ease' }}
          />
          <text x={60} y={55} textAnchor="middle" fontSize={26} fontWeight={800} fill="var(--text)">
            {deal.score}
          </text>
          <text x={60} y={68} textAnchor="middle" fontSize={8.5} fill="var(--faint)">
            out of 100
          </text>
        </svg>
        <div className="min-w-0 space-y-1.5">
          <StatusChip meta={meta} label={`${deal.label} deal`} className="text-[11px]" />
          <p className="text-[11.5px] leading-snug text-muted">
            Best: <b className="text-fg">{best.label}</b> ({Math.round(best.points)}/{best.weight}).
            <br />
            Weakest: <b className="text-fg">{worst.label}</b> ({Math.round(worst.points)}/{worst.weight}).
          </p>
        </div>
      </div>
      <ul className="mt-2.5 space-y-2">
        {deal.factors.map((f) => {
          const share = f.points / f.weight;
          return (
            <li key={f.key}>
              <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
                <span className="font-semibold text-fg">{f.label}</span>
                <span className="shrink-0 text-muted tabular-nums">
                  <b className="text-fg">{f.points.toFixed(1)}</b> / {f.weight}
                </span>
              </div>
              <div className="mt-1">
                <ProgressBar value={share * 100} tone={share >= 0.7 ? 'success' : share >= 0.4 ? 'warning' : 'danger'} />
              </div>
              <p className="mt-0.5 text-[10.5px] text-faint">{f.detail}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
