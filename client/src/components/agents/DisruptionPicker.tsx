'use client';

/**
 * "Following": which disruption the agent trace follows. Every entry carries a photo of what happened and a mini world
 * map whose pin grows and changes colour with the disruption's weight (severity, lanes hit, radius).
 */
import clsx from 'clsx';
import { geoEquirectangular, geoPath } from 'd3-geo';
import type { FeatureCollection } from 'geojson';
import { ChevronDown, CircleCheck, ShieldHalf, Siren, TriangleAlert, type LucideIcon } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import type { Disruption } from '@/module_bindings/ops/types';
import { timeAgo, tsToDate } from '@/lib/format';
import { disruptionPhoto } from '@/lib/ops/event-photos';
import { useDisruptions } from '@/lib/ops/hooks';
import { DISRUPTION_KIND, SEVERITY } from '@/lib/ops/status';
import { SectionLabel, StatusChip } from '@/components/ui/primitives';
import { COUNTRIES } from '@/components/silk-road/map-data';
import { useFocusedDisruption, useSilkRoad } from '@/components/silk-road/SilkRoadState';

/** Equirectangular in a 360×180 frame (x = lng + 180, y = 90 − lat), computed once for every mini map. */
const LAND_PATH =
  geoPath(geoEquirectangular().scale(180 / Math.PI).translate([180, 90]))
    .digits(1)({ type: 'FeatureCollection', features: COUNTRIES } as FeatureCollection) ?? '';
const LAND_ID = 'agents-mini-land';
/** Crop to 84°N … 58°S: Antarctica and the polar sea carry no lanes. */
const VIEW = { y: 6, h: 142 };
const MAP_W = 76;
const MAP_H = Math.round((MAP_W * VIEW.h) / 360);

const COLLAPSED = 3;

const SEVERITY_RANK: Record<string, number> = { low: 0, moderate: 1, high: 2, critical: 3 };

const STATUS: Record<string, { label: string; icon: LucideIcon; text: string }> = {
  active: { label: 'Active', icon: Siren, text: 'text-danger' },
  mitigating: { label: 'Mitigating', icon: ShieldHalf, text: 'text-warning' },
  resolved: { label: 'Resolved', icon: CircleCheck, text: 'text-success' },
};

/** 0…1: mostly severity, then how many lanes it hits and how wide it reaches. */
function weightOf(d: Disruption): number {
  const severity = (SEVERITY_RANK[d.severity] ?? 1) / 3;
  const lanes = Math.min(d.affectedRouteIds.length, 6) / 6;
  const radius = Math.min(Math.max(d.radiusKm, 0), 320) / 320;
  return 0.55 * severity + 0.25 * lanes + 0.2 * radius;
}

function formatLatLng(lat: number, lng: number): string {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`;
}

export function DisruptionPicker() {
  const { all } = useDisruptions();
  const focused = useFocusedDisruption();
  const { setFocusId } = useSilkRoad();
  const [expanded, setExpanded] = useState(false);
  const list = [...all]
    .sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || Number(b.id - a.id))
    .slice(0, 8);
  const shown = expanded ? list : list.filter((d, i) => i < COLLAPSED || d.id === focused?.id);
  const hidden = list.length - shown.length;

  return (
    <section aria-label="Disruptions" className="shrink-0">
      <SectionLabel
        icon={Siren}
        right={<span className="text-[11px] text-faint">{all.filter((d) => d.status !== 'resolved').length} active</span>}
      >
        Following
      </SectionLabel>
      {list.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-line px-3 py-3 text-[12px] text-muted">
          No disruptions yet. Trigger a scenario on Silk Road and the agents start on their own.
        </p>
      ) : (
        <>
          <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
            <defs>
              <path id={LAND_ID} d={LAND_PATH} />
            </defs>
          </svg>
          <ul className="mt-2 space-y-1.5">
            {shown.map((d) => (
              <li key={String(d.id)}>
                <DisruptionEntry d={d} selected={focused?.id === d.id} onSelect={() => setFocusId(d.id)} />
              </li>
            ))}
          </ul>
          {(hidden > 0 || expanded) && list.length > COLLAPSED && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-muted hover:bg-panel-hover hover:text-fg"
            >
              <ChevronDown className={clsx('size-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden />
              {expanded ? 'Show fewer' : `Show ${hidden} more`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function DisruptionEntry({ d, selected, onSelect }: { d: Disruption; selected: boolean; onSelect(): void }) {
  const kind = DISRUPTION_KIND[d.kind];
  const KindIcon = kind?.icon ?? TriangleAlert;
  const resolved = d.status === 'resolved';
  const status = STATUS[d.status] ?? STATUS.active;
  const StatusIcon = status.icon;
  const severity = SEVERITY[d.severity] ?? SEVERITY.moderate;
  const lanes = d.affectedRouteIds.length;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={clsx(
        'grid w-full grid-cols-[52px_minmax(0,1fr)_auto] grid-rows-[auto_1fr] gap-x-2 gap-y-1 rounded-lg border p-1.5 text-left transition-colors',
        selected ? 'border-accent/60 bg-accent-soft' : 'border-line bg-panel hover:bg-panel-hover'
      )}
    >
      <span className="relative row-span-2 min-h-[52px] overflow-hidden rounded-md bg-panel-2">
        <Image
          src={disruptionPhoto(d)}
          alt=""
          fill
          sizes="52px"
          className={clsx('object-cover', resolved && 'opacity-60 grayscale')}
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" aria-hidden />
        <span
          className="absolute bottom-1 left-1 grid size-[18px] place-items-center rounded bg-black/60 text-white"
          title={kind?.label ?? 'Disruption'}
        >
          <KindIcon className="size-3" aria-hidden />
        </span>
      </span>
      <span
        className={clsx('col-span-2 truncate pt-0.5 text-[12.5px] leading-tight font-semibold', resolved ? 'text-muted' : 'text-fg')}
      >
        {d.title}
      </span>
      <span className="flex min-w-0 flex-col justify-center gap-1">
        <span className="flex min-w-0 items-center gap-1 text-[10.5px] text-faint">
          <StatusIcon className={clsx('size-3 shrink-0', status.text)} aria-hidden />
          <span className={clsx('font-semibold', status.text)}>{status.label}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{timeAgo(tsToDate(d.createdAt))}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <StatusChip meta={severity} className={clsx('shrink-0', resolved && 'opacity-60')} />
          <span className="truncate text-[10px] text-muted tabular-nums">
            {lanes} lane{lanes === 1 ? '' : 's'} · {Math.round(d.radiusKm)} km
          </span>
        </span>
      </span>
      <span className="self-end">
        <MiniMap d={d} />
      </span>
    </button>
  );
}

/** Mini world map with a pin at the disruption; pin size and colour follow its weight. */
function MiniMap({ d }: { d: Disruption }) {
  const weight = weightOf(d);
  const resolved = d.status === 'resolved';
  const x = Math.min(360, Math.max(0, d.lng + 180));
  const y = Math.min(VIEW.y + VIEW.h, Math.max(VIEW.y, 90 - d.lat));
  const r = 10 + 12 * weight;
  const tone = resolved ? 'fill-faint' : weight >= 0.5 ? 'fill-danger' : weight >= 0.25 ? 'fill-warning' : 'fill-success';
  const where = formatLatLng(d.lat, d.lng);
  const label = `${where}. Weight ${Math.round(weight * 100)} of 100: ${SEVERITY[d.severity]?.label ?? d.severity} severity, ${d.affectedRouteIds.length} lanes, ${Math.round(d.radiusKm)} km radius.`;

  return (
    <span
      className="block shrink-0 overflow-hidden rounded border border-line bg-[var(--globe-ocean)]"
      style={{ width: MAP_W, height: MAP_H }}
      title={label}
    >
      <svg viewBox={`0 ${VIEW.y} 360 ${VIEW.h}`} width={MAP_W} height={MAP_H} role="img" aria-label={`Location ${label}`}>
        <use href={`#${LAND_ID}`} className="fill-[color-mix(in_srgb,var(--globe-land)_62%,var(--muted))]" />
        {!resolved && (
          <circle cx={x} cy={y} r={r} className={tone} opacity={0.5}>
            <animate attributeName="r" values={`${r};${r * 2.6}`} dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.55;0" dur="1.8s" repeatCount="indefinite" />
          </circle>
        )}
        <circle cx={x} cy={y} r={r * 1.7} className={tone} opacity={0.22} />
        <circle cx={x} cy={y} r={r} className={clsx(tone, 'stroke-[var(--globe-ocean)]')} strokeWidth={3} />
      </svg>
    </span>
  );
}
