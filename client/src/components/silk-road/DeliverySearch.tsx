'use client';

/**
 * Delivery search (Silk Road header, left of Ask Arrow). Opening it takes a snapshot of the deliveries on the map so
 * the list holds still while you read it; only Refresh pulls in newer data. Sort by Recent (newest orders first) or
 * Risk (riskiest first). Clicking a delivery closes the list and starts tracking its dot on the map.
 */
import clsx from 'clsx';
import { Menu, PackageSearch, RefreshCw, Search, Snowflake, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatClock, formatHours, formatUsd } from '@/lib/format';
import { useNetwork, type Network } from '@/lib/ops/hooks';
import { MODE, riskLevel, ROUTE_STATUS, SHIPMENT_STATUS } from '@/lib/ops/status';
import { StatusChip } from '@/components/ui/primitives';
import { useSilkRoad } from './SilkRoadState';

type SortKey = 'recent' | 'risk';

interface DeliveryRow {
  id: number;
  ref: string;
  goods: string;
  units: number;
  valueUsd: number;
  priority: string;
  coldChain: boolean;
  status: string;
  progress: number;
  delayHours: number;
  routeId: number;
  routeLabel: string;
  lane: string;
  mode: string;
  routeStatus: string;
  from: string;
  to: string;
  /** 0–100: the lane's risk plus the delivery's own trouble (status, delay, priority). */
  risk: number;
}

/** Risk score weights (max 100): lane risk 55, delivery status 15, lane status 15, lateness 10, priority 5. */
const STATUS_RISK: Record<string, number> = { delayed: 15, held: 10, rerouted: 4 };
const ROUTE_RISK: Record<string, number> = { disrupted: 15, at_risk: 8, rerouted: 3 };

/** Freeze the current deliveries into plain rows (the snapshot). */
function snapshotRows(network: Network): DeliveryRow[] {
  return network.shipments.flatMap((s) => {
    const route = network.routesById.get(s.routeId);
    if (!route || route.status === 'standby') return [];
    const risk = Math.min(
      100,
      route.risk * 55 +
        (STATUS_RISK[s.status] ?? 0) +
        (ROUTE_RISK[route.status] ?? 0) +
        Math.min(10, s.delayHours / 4) +
        (s.priority === 'critical' || s.priority === 'high' ? 5 : 0)
    );
    return [
      {
        id: s.id,
        ref: s.ref,
        goods: s.goods,
        units: s.units,
        valueUsd: s.valueUsd,
        priority: s.priority,
        coldChain: s.coldChain,
        status: s.status,
        progress: s.progress,
        delayHours: s.delayHours,
        routeId: route.id,
        routeLabel: route.label,
        lane: route.lane,
        mode: route.mode,
        routeStatus: route.status,
        from: network.nodesById.get(route.fromNodeId)?.city.split(',')[0] ?? '',
        to: network.nodesById.get(route.toNodeId)?.city.split(',')[0] ?? '',
        risk,
      },
    ];
  });
}

export function DeliverySearch() {
  const network = useNetwork();
  const ui = useSilkRoad();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<{ takenAt: number; rows: DeliveryRow[] } | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const takeSnapshot = () => setSnapshot({ takenAt: Date.now(), rows: snapshotRows(network) });

  const toggle = () => {
    if (!open) takeSnapshot();
    setOpen(!open);
    setSortOpen(false);
  };

  // Close on outside click or Escape; focus the search box when opened.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const rows = useMemo(() => {
    if (!snapshot) return [];
    const q = query.trim().toLowerCase();
    const matched = q
      ? snapshot.rows.filter((r) =>
          [r.ref, r.goods, r.routeLabel, r.lane, r.from, r.to, r.status, MODE[r.mode]?.label ?? r.mode].join(' ').toLowerCase().includes(q)
        )
      : snapshot.rows;
    return [...matched].sort((a, b) => (sort === 'recent' ? b.id - a.id : b.risk - a.risk || b.valueUsd - a.valueUsd));
  }, [snapshot, query, sort]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={clsx(
          'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold whitespace-nowrap',
          open ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-fg hover:bg-panel-hover'
        )}
      >
        <Search className="size-3.5" aria-hidden />
        Search
      </button>

      {open && snapshot && (
        <div
          role="dialog"
          aria-label="Search deliveries"
          className="absolute top-full right-0 z-50 mt-2 flex max-h-[min(72vh,640px)] w-[420px] flex-col rounded-xl border border-line bg-panel shadow-panel"
        >
          <div className="flex items-center gap-1.5 border-b border-line p-2.5">
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5 focus-within:border-accent">
              <Search className="size-3.5 shrink-0 text-faint" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search deliveries, goods, lanes, cities"
                aria-label="Search deliveries"
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-faint"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-faint hover:text-fg">
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </label>
            <button
              type="button"
              onClick={takeSnapshot}
              aria-label="Refresh"
              title="Refresh: load the latest deliveries"
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-panel-2 text-muted hover:bg-panel-hover hover:text-fg"
            >
              <RefreshCw className="size-3.5" aria-hidden />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setSortOpen(!sortOpen)}
                aria-expanded={sortOpen}
                aria-label={`Sort: ${sort === 'recent' ? 'Recent' : 'Risk'}`}
                title="Sort"
                className={clsx(
                  'grid size-8 shrink-0 place-items-center rounded-lg border',
                  sortOpen
                    ? 'border-accent/50 bg-accent-soft text-accent'
                    : 'border-line bg-panel-2 text-muted hover:bg-panel-hover hover:text-fg'
                )}
              >
                <Menu className="size-4" aria-hidden />
              </button>
              {sortOpen && (
                <div
                  role="menu"
                  className="absolute top-full right-0 z-10 mt-1 w-28 rounded-lg border border-line bg-panel p-1 shadow-panel"
                >
                  {(
                    [
                      ['recent', 'Recent'],
                      ['risk', 'Risk'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={sort === key}
                      onClick={() => {
                        setSort(key);
                        setSortOpen(false);
                      }}
                      className={clsx(
                        'block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] font-semibold',
                        sort === key ? 'bg-accent-soft text-accent' : 'text-fg hover:bg-panel-hover'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5 text-[11px] text-muted">
            <span>
              Snapshot {formatClock(new Date(snapshot.takenAt))} · {rows.length}
              {query ? ` of ${snapshot.rows.length}` : ''} deliveries
            </span>
            <span className="font-semibold text-fg">{sort === 'recent' ? 'Recent' : 'Risk'}</span>
          </p>

          <ul className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {rows.length === 0 && (
              <li className="flex flex-col items-center gap-1.5 px-4 py-8 text-center text-[12px] text-muted">
                <PackageSearch className="size-6 text-faint" aria-hidden />
                {snapshot.rows.length === 0 ? 'No deliveries on the map right now.' : 'No deliveries match your search.'}
              </li>
            )}
            {rows.map((r) => (
              <DeliveryItem
                key={r.id}
                row={r}
                selected={ui.trackedShipmentId === r.id}
                onSelect={() => {
                  ui.setSelectedRouteId(r.routeId);
                  ui.setTrackedShipmentId(r.id);
                  setOpen(false);
                }}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DeliveryItem({ row, selected, onSelect }: { row: DeliveryRow; selected: boolean; onSelect(): void }) {
  const ModeIcon = MODE[row.mode]?.icon;
  const status = SHIPMENT_STATUS[row.status] ?? SHIPMENT_STATUS.in_transit;
  const level = riskLevel(row.risk);
  const lane = ROUTE_STATUS[row.routeStatus];
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        title="Track this delivery on the map"
        className={clsx(
          'w-full rounded-lg border px-2.5 py-2 text-left',
          selected ? 'border-accent/50 bg-accent-soft' : 'border-line bg-panel-2 hover:bg-panel-hover'
        )}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-semibold text-muted">{row.ref}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{row.goods}</span>
          {row.coldChain && <Snowflake className="size-3.5 shrink-0 text-cyan" aria-label="Cold chain" />}
          <StatusChip meta={level.meta} label={`Risk ${Math.round(row.risk)}`} />
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted">
          {ModeIcon && <ModeIcon className="size-3.5 shrink-0" aria-hidden />}
          <span className="truncate">
            {row.from} → {row.to}
          </span>
          {lane && row.routeStatus !== 'healthy' && <span className={clsx('shrink-0 font-semibold', lane.text)}>· {lane.label} lane</span>}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <StatusChip meta={status} />
          <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-faint/30" aria-hidden>
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(row.progress * 100)}%` }} />
          </div>
          <span className="shrink-0 text-[11px] text-muted tabular-nums">{Math.round(row.progress * 100)}%</span>
        </div>
        <p className="mt-1 text-[11px] text-faint">
          {row.units.toLocaleString()} units · {formatUsd(row.valueUsd)} · {row.priority} priority
          {row.delayHours > 0 && ` · ${formatHours(row.delayHours)} late`}
        </p>
      </button>
    </li>
  );
}
