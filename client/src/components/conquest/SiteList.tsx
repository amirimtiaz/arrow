'use client';

/** Candidate sites for the market, sortable, with photo, size, asking rent and a deal-strength badge. */
import clsx from 'clsx';
import { Building2, MapPin } from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { formatInt } from '@/lib/format';
import { DEAL_META } from '@/lib/conquest/meta';
import type { DealScore, Projection } from '@/lib/conquest/model';
import type { Market, Site } from '@/lib/conquest/types';
import { EmptyState, SectionLabel, StatusChip } from '@/components/ui/primitives';

export interface SiteRow {
  site: Site;
  deal: DealScore;
  projection: Projection;
}

const SORTS = [
  { key: 'score', label: 'Deal' },
  { key: 'rent', label: 'Rent' },
  { key: 'cost', label: '5-yr cost' },
] as const;
type SortKey = (typeof SORTS)[number]['key'];

export function SiteList({
  market,
  rows,
  selectedId,
  onSelect,
  onHover,
}: {
  market: Market;
  rows: SiteRow[];
  selectedId: string;
  onSelect(id: string): void;
  onHover(id: string | null): void;
}) {
  const [sort, setSort] = useState<SortKey>('score');
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        sort === 'score'
          ? b.deal.score - a.deal.score
          : sort === 'rent'
            ? a.site.rentPsf - b.site.rentPsf
            : a.projection.total5y - b.projection.total5y
      ),
    [rows, sort]
  );
  const counts = useMemo(() => {
    const c = { Strong: 0, Fair: 0, Weak: 0 };
    rows.forEach((r) => (c[r.deal.label] += 1));
    return c;
  }, [rows]);

  return (
    <>
      <div className="border-b border-line p-3">
        <SectionLabel icon={Building2} right={<span className="text-[11px] text-faint">{rows.length} listed</span>}>
          Candidate sites
        </SectionLabel>
        <p className="mt-1 text-[11.5px] text-muted">
          {market.city} · {market.region}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex gap-1.5 text-[10.5px] font-semibold">
            {(['Strong', 'Fair', 'Weak'] as const).map((label) => {
              const meta = DEAL_META[label];
              const Icon = meta.icon;
              return (
                <span key={label} className={clsx('inline-flex items-center gap-0.5', meta.text)}>
                  <Icon className="size-3" aria-hidden />
                  {counts[label]} {label}
                </span>
              );
            })}
          </div>
          <div className="flex rounded-lg border border-line bg-panel p-0.5" role="group" aria-label="Sort sites">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={sort === s.key}
                onClick={() => setSort(s.key)}
                className={clsx(
                  'rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold',
                  sort === s.key ? 'bg-accent-soft text-accent' : 'text-muted hover:text-fg'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon={MapPin} title="No candidate sites">
          There are no listings for this market yet.
        </EmptyState>
      ) : (
        <ul className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2" onMouseLeave={() => onHover(null)}>
          {sorted.map(({ site, deal }) => {
            const selected = site.id === selectedId;
            return (
              <li key={site.id}>
                <button
                  type="button"
                  onClick={() => onSelect(site.id)}
                  onMouseEnter={() => onHover(site.id)}
                  onFocus={() => onHover(site.id)}
                  onBlur={() => onHover(null)}
                  aria-pressed={selected}
                  className={clsx(
                    'flex w-full gap-2.5 rounded-lg border p-2 text-left transition-colors',
                    selected ? 'border-accent/60 bg-accent-soft' : 'border-line bg-panel hover:bg-panel-hover'
                  )}
                >
                  <span className="relative h-[58px] w-[76px] shrink-0 overflow-hidden rounded-md bg-panel-2">
                    <Image src={site.photo} alt="" fill sizes="76px" className="object-cover" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] leading-tight font-semibold text-fg">{site.name}</span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-faint">{site.address}</span>
                    <span className="mt-1 flex items-center justify-between gap-1.5">
                      <span className="text-[11px] text-muted tabular-nums">
                        {formatInt(site.sqft)} sf · <b className="text-fg">${site.rentPsf.toFixed(2)}</b>/sf/yr
                      </span>
                      <StatusChip meta={DEAL_META[deal.label]} label={`${deal.label} ${deal.score}`} className="shrink-0" />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
