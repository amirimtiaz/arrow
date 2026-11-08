'use client';

/**
 * Stylized GIS view of one market, drawn as plain SVG (no tiles, no external APIs): street grid, highways, water,
 * parks, building footprints, a toggleable foot-traffic heatmap, competitor markers, deal-scored site pins and the
 * selected site's trade area. Drag to pan, scroll or use the buttons to zoom.
 */
import clsx from 'clsx';
import { Flame, Home, LocateFixed, Minus, Navigation, Plus, Store, Target } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { DEAL_META } from '@/lib/conquest/meta';
import { COMPETITION_RADIUS_MI, distanceMi, formatLatLng, toLatLng, unitsPerMile } from '@/lib/conquest/model';
import type { Market } from '@/lib/conquest/types';
import type { SiteRow } from './SiteList';

const WORLD = 1000;
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

interface View {
  cx: number;
  cy: number;
  zoom: number;
}
interface Size {
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Pixels per world unit: zoom 1 fits the whole market. */
const scaleFor = (size: Size, zoom: number) => (Math.min(size.w, size.h) / WORLD) * zoom;

function clampView(v: View, size: Size): View {
  const zoom = clamp(v.zoom, MIN_ZOOM, MAX_ZOOM);
  const s = scaleFor(size, zoom);
  const vw = size.w / s;
  const vh = size.h / s;
  return {
    zoom,
    cx: vw >= WORLD ? WORLD / 2 : clamp(v.cx, vw / 2, WORLD - vw / 2),
    cy: vh >= WORLD ? WORLD / 2 : clamp(v.cy, vh / 2, WORLD - vh / 2),
  };
}

/** Map colours derived from the theme tokens, so the map follows dark/light mode. */
const MAP_VARS = {
  '--cq-land': 'color-mix(in srgb, var(--bg) 72%, var(--panel))',
  '--cq-urban': 'color-mix(in srgb, var(--text) 3.5%, transparent)',
  '--cq-block': 'color-mix(in srgb, var(--text) 7%, transparent)',
  '--cq-minor': 'color-mix(in srgb, var(--text) 8%, transparent)',
  '--cq-arterial': 'color-mix(in srgb, var(--text) 18%, transparent)',
  '--cq-hwy': 'color-mix(in srgb, var(--warning) 60%, var(--bg))',
  '--cq-hwy-casing': 'color-mix(in srgb, var(--bg) 80%, var(--text))',
  '--cq-water': 'color-mix(in srgb, var(--cyan) 24%, var(--bg))',
  '--cq-water-edge': 'color-mix(in srgb, var(--cyan) 42%, var(--bg))',
  '--cq-park': 'color-mix(in srgb, var(--success) 15%, var(--bg))',
  '--cq-park-edge': 'color-mix(in srgb, var(--success) 32%, var(--bg))',
  '--cq-runway': 'color-mix(in srgb, var(--text) 22%, var(--bg))',
} as CSSProperties;

/* ---------------------------------------------------------------- static geometry helpers */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Extend polyline ends that touch the market edge so highways run off the map instead of stopping. */
function extendPolyline(points: [number, number][]): [number, number][] {
  const out = points.map((p) => [...p] as [number, number]);
  const extend = (a: [number, number], b: [number, number]): [number, number] => {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const len = Math.hypot(dx, dy) || 1;
    return [a[0] + (dx / len) * 700, a[1] + (dy / len) * 700];
  };
  const onEdge = ([x, y]: [number, number]) => x <= 0 || y <= 0 || x >= WORLD || y >= WORLD;
  if (out.length >= 2 && onEdge(out[0])) out.unshift(extend(out[0], out[1]));
  const n = out.length;
  if (n >= 2 && onEdge(out[n - 1])) out.push(extend(out[n - 1], out[n - 2]));
  return out;
}

function pointAlong(points: [number, number][], t: number): [number, number] {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let remaining = lengths.reduce((s, l) => s + l, 0) * t;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const f = lengths[i] ? remaining / lengths[i] : 0;
      return [points[i][0] + (points[i + 1][0] - points[i][0]) * f, points[i][1] + (points[i + 1][1] - points[i][1]) * f];
    }
    remaining -= lengths[i];
  }
  return points[points.length - 1];
}

function gridPath(step: number, from = -1200, to = 2200) {
  let d = '';
  const start = Math.ceil(from / step) * step;
  for (let v = start; v <= to; v += step) d += `M${v.toFixed(1)},${from}V${to}M${from},${v.toFixed(1)}H${to}`;
  return d;
}

interface Footprint {
  x: number;
  y: number;
  w: number;
  h: number;
}

function footprints(market: Market): Footprint[] {
  const rand = mulberry32(hash(market.plan + market.city));
  const block = unitsPerMile(market) / 4;
  const out: Footprint[] = [];
  for (const d of market.art.districts) {
    const n = Math.round(d.density * 80);
    for (let i = 0; i < n; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = d.r * 1.6 * Math.sqrt(rand());
      const x = d.x + Math.cos(angle) * radius;
      const y = d.y + Math.sin(angle) * radius;
      const bx = Math.floor(x / block) * block;
      const by = Math.floor(y / block) * block;
      const w = 2 + rand() * (block * 0.42);
      const h = 2 + rand() * (block * 0.42);
      out.push({ x: bx + 1.5 + rand() * Math.max(0, block - w - 3), y: by + 1.5 + rand() * Math.max(0, block - h - 3), w, h });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- component */

export function CityMap({
  market,
  rows,
  selectedId,
  hoverId,
  onSelect,
  onHover,
}: {
  market: Market;
  rows: SiteRow[];
  selectedId: string;
  hoverId: string | null;
  onSelect(id: string): void;
  onHover(id: string | null): void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ w: 800, h: 600 });
  const [rawView, setRawView] = useState<View>({ cx: 500, cy: 500, zoom: 1 });
  const [layers, setLayers] = useState({ heat: true, competitors: true, trade: true });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ px: number; py: number; cx: number; cy: number; moved: boolean; id: number } | null>(null);
  const suppressClick = useRef(false);

  const view = clampView(rawView, size);
  const s = scaleFor(size, view.zoom);
  const k = 1 / s; // world units per screen pixel
  const vw = size.w / s;
  const vh = size.h / s;
  const x0 = view.cx - vw / 2;
  const y0 = view.cy - vh / 2;
  const live = useRef({ size, view });
  useEffect(() => {
    live.current = { size, view };
  });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { size: sz, view: v } = live.current;
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const s0 = scaleFor(sz, v.zoom);
      const wx = v.cx - sz.w / s0 / 2 + px / s0;
      const wy = v.cy - sz.h / s0 / 2 + py / s0;
      const zoom = clamp(v.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), MIN_ZOOM, MAX_ZOOM);
      const s1 = scaleFor(sz, zoom);
      setRawView(clampView({ zoom, cx: wx - px / s1 + sz.w / s1 / 2, cy: wy - py / s1 + sz.h / s1 / 2 }, sz));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Bring a newly selected site into view (adjusting state during render, React's pattern for derived state).
  const [prevSelected, setPrevSelected] = useState(selectedId);
  if (prevSelected !== selectedId) {
    setPrevSelected(selectedId);
    const site = rows.find((r) => r.site.id === selectedId)?.site;
    if (site) {
      const inside = site.x > x0 + vw * 0.15 && site.x < x0 + vw * 0.85 && site.y > y0 + vh * 0.15 && site.y < y0 + vh * 0.85;
      if (!inside) setRawView(clampView({ ...view, cx: site.x, cy: site.y }, size));
    }
  }

  const art = market.art;
  const u = unitsPerMile(market);
  const minorGrid = useMemo(() => gridPath(u / 4), [u]);
  const majorGrid = useMemo(() => gridPath(u), [u]);
  const blocks = useMemo(() => footprints(market), [market]);
  const highways = useMemo(() => art.highways.map((h) => ({ ...h, line: extendPolyline(h.points) })), [art.highways]);

  const selected = rows.find((r) => r.site.id === selectedId)?.site;
  const competitorsInRing = useMemo(
    () => new Set(selected ? market.competitors.filter((c) => distanceMi(market, selected, c) <= COMPETITION_RADIUS_MI).map((c) => c.id) : []),
    [market, selected]
  );

  const zoomBy = (factor: number) => setRawView(clampView({ ...view, zoom: view.zoom * factor }, size));
  const reset = () => setRawView({ cx: 500, cy: 500, zoom: 1 });

  const toWorld = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: x0 + (e.clientX - rect.left) / s, y: y0 + (e.clientY - rect.top) / s };
  };
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    drag.current = { px: e.clientX, py: e.clientY, cx: view.cx, cy: view.cy, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    setCursor(toWorld(e));
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(d.id);
    }
    setRawView(clampView({ zoom: view.zoom, cx: d.cx - dx / s, cy: d.cy - dy / s }, size));
  };
  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (d?.moved) {
      suppressClick.current = true;
      if (e.currentTarget.hasPointerCapture(d.id)) e.currentTarget.releasePointerCapture(d.id);
      setTimeout(() => (suppressClick.current = false), 0);
    }
    drag.current = null;
    setDragging(false);
  };

  const pick = (id: string) => {
    if (!suppressClick.current) onSelect(id);
  };
  const onPinKey = (e: KeyboardEvent<SVGGElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id);
    }
  };

  // Scale bar: the first "nice" distance at least 64 px long.
  const scaleMi = [0.25, 0.5, 1, 2, 5, 10].find((mi) => mi * u * s >= 64) ?? 10;
  const scalePx = scaleMi * u * s;

  const label = (text: string, x: number, y: number, opts: { size?: number; italic?: boolean; spacing?: number; anchor?: 'start' | 'middle'; color?: string } = {}) => (
    <text
      x={x}
      y={y}
      fontSize={(opts.size ?? 10) * k}
      fontStyle={opts.italic ? 'italic' : undefined}
      letterSpacing={opts.spacing ? opts.spacing * k : undefined}
      textAnchor={opts.anchor ?? 'middle'}
      fill={opts.color ?? 'var(--faint)'}
      stroke="var(--cq-land)"
      strokeWidth={3 * k}
      paintOrder="stroke"
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      {text}
    </text>
  );

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden" style={MAP_VARS}>
      <svg
        className={clsx('block size-full touch-none select-none', dragging ? 'cursor-grabbing' : 'cursor-grab')}
        viewBox={`${x0} ${y0} ${vw} ${vh}`}
        role="img"
        aria-label={`Stylized map of ${market.city} with ${rows.length} candidate sites`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setCursor(null)}
      >
        <defs>
          <radialGradient id="cq-heat">
            <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.62} />
            <stop offset="40%" stopColor="var(--warning)" stopOpacity={0.36} />
            <stop offset="100%" stopColor="var(--warning)" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Base land, urban tint and building footprints */}
        <rect x={-2000} y={-2000} width={5000} height={5000} fill="var(--cq-land)" />
        {art.districts.map((d) => (
          <circle key={d.name} cx={d.x} cy={d.y} r={d.r * 1.9} fill="var(--cq-urban)" />
        ))}
        <path d={minorGrid} stroke="var(--cq-minor)" strokeWidth={0.7} vectorEffect="non-scaling-stroke" fill="none" />
        <g fill="var(--cq-block)">
          {blocks.map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} />
          ))}
        </g>

        {/* Parks, lakes, rivers */}
        {art.parks.map((p) => (
          <path key={p.name} d={p.d} fill="var(--cq-park)" stroke="var(--cq-park-edge)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {art.lakes.map((l) => (
          <path key={l.name} d={l.d} fill="var(--cq-water)" stroke="var(--cq-water-edge)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {art.rivers.map((r) => (
          <g key={r.name}>
            <path d={r.d} fill="none" stroke="var(--cq-water-edge)" strokeWidth={r.width + 3} strokeLinecap="round" />
            <path d={r.d} fill="none" stroke="var(--cq-water)" strokeWidth={r.width} strokeLinecap="round" />
          </g>
        ))}

        {/* Airport */}
        {art.airport && (
          <g transform={`translate(${art.airport.x},${art.airport.y})`}>
            <rect x={-70} y={-28} width={140} height={56} rx={6} fill="var(--cq-urban)" stroke="var(--cq-arterial)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <rect x={-62} y={-18} width={124} height={6} fill="var(--cq-runway)" />
            <rect x={-62} y={10} width={124} height={6} fill="var(--cq-runway)" />
            <rect x={-40} y={-4} width={70} height={4} fill="var(--cq-runway)" opacity={0.6} />
          </g>
        )}

        {/* Arterial grid and highways */}
        <path d={majorGrid} stroke="var(--cq-arterial)" strokeWidth={1.3} vectorEffect="non-scaling-stroke" fill="none" />
        {highways.map((h) => (
          <polyline
            key={`${h.name}-casing`}
            points={h.line.map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke="var(--cq-hwy-casing)"
            strokeWidth={6.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {highways.map((h) => (
          <polyline
            key={h.name}
            points={h.line.map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke="var(--cq-hwy)"
            strokeWidth={3.6}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          >
            <title>{h.name}</title>
          </polyline>
        ))}

        {/* Labels */}
        {art.arterials.map((a) =>
          a.axis === 'h' ? (
            <g key={a.name}>{label(a.name, x0 + 14 * k, a.at - 3 * k, { size: 9, anchor: 'start' })}</g>
          ) : (
            <g key={a.name} transform={`translate(${a.at - 3 * k},${y0 + 52 * k}) rotate(90)`}>
              {label(a.name, 0, 0, { size: 9, anchor: 'start' })}
            </g>
          )
        )}
        {art.parks.map((p) => (
          <g key={`${p.name}-label`}>{label(p.name, p.labelAt.x, p.labelAt.y, { size: 9, italic: true, color: 'var(--success)' })}</g>
        ))}
        {[...art.rivers, ...art.lakes].map((w) => (
          <g key={`${w.name}-label`}>
            {label(w.name, w.labelAt.x, w.labelAt.y, { size: 9.5, italic: true, color: 'var(--cyan)', anchor: w.labelAt.x < 40 ? 'start' : 'middle' })}
          </g>
        ))}
        {art.airport && <g>{label(art.airport.name, art.airport.x, art.airport.y + 44 * Math.min(1, k * 1.4), { size: 9, color: 'var(--muted)' })}</g>}
        {art.districts.map((d) => (
          <g key={`${d.name}-label`}>{label(d.name, d.x, d.y, { size: 10.5, spacing: 2.2, color: 'var(--muted)' })}</g>
        ))}
        {highways.map((h) => {
          const [x, y] = pointAlong(h.points, h.shieldAt ?? 0.5);
          const w = 10 + h.shield.length * 6.2;
          return (
            <g key={`${h.name}-shield`} transform={`translate(${x},${y}) scale(${k})`} style={{ pointerEvents: 'none' }}>
              <rect x={-w / 2} y={-8} width={w} height={16} rx={4} fill="var(--panel)" stroke="var(--cq-hwy)" strokeWidth={1.5} />
              <text y={3.6} textAnchor="middle" fontSize={10} fontWeight={800} fill="var(--text)">
                {h.shield}
              </text>
            </g>
          );
        })}

        {/* Foot-traffic heatmap */}
        {layers.heat && (
          <g style={{ pointerEvents: 'none', mixBlendMode: 'normal' }}>
            {market.heat.map((h, i) => (
              <circle key={i} cx={h.x} cy={h.y} r={h.r * 1.5} fill="url(#cq-heat)" opacity={0.35 + h.intensity * 0.65} />
            ))}
          </g>
        )}

        {/* Trade area around the selected site */}
        {layers.trade && selected && (
          <g style={{ pointerEvents: 'none' }}>
            <circle cx={selected.x} cy={selected.y} r={u * 2} fill="none" stroke="var(--accent)" strokeOpacity={0.45} strokeWidth={1.2} strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
            <circle cx={selected.x} cy={selected.y} r={u * COMPETITION_RADIUS_MI} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={1.6} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            {label(`${COMPETITION_RADIUS_MI} mi trade area`, selected.x, selected.y + u * COMPETITION_RADIUS_MI + 13 * k, { size: 9.5, color: 'var(--accent)' })}
            {label('2 mi', selected.x, selected.y + u * 2 + 13 * k, { size: 9, color: 'var(--accent)' })}
          </g>
        )}

        {/* Home base (Bronze: today's restaurant) */}
        {market.home && (
          <g transform={`translate(${market.home.x},${market.home.y}) scale(${k})`} style={{ pointerEvents: 'none' }}>
            <circle r={9} fill="var(--panel)" stroke="var(--accent)" strokeWidth={1.5} />
            <path d="M-4.5,0.5 L0,-4 L4.5,0.5 M-3,-0.5 V4 H3 V-0.5" fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" />
            <text x={market.home.x > 600 ? -13 : 13} y={3.5} textAnchor={market.home.x > 600 ? 'end' : 'start'} fontSize={10} fontWeight={600} fill="var(--muted)" stroke="var(--cq-land)" strokeWidth={3} paintOrder="stroke">
              {market.home.name}
            </text>
          </g>
        )}

        {/* Competitors */}
        {layers.competitors &&
          market.competitors.map((c) => {
            const inRing = competitorsInRing.has(c.id);
            return (
              <g key={c.id} transform={`translate(${c.x},${c.y}) scale(${k})`} opacity={inRing || !selected ? 1 : 0.6}>
                <title>{`${c.name} · ${c.category} · ${c.rating.toFixed(1)}★${selected ? ` · ${distanceMi(market, selected, c).toFixed(2)} mi from selected site` : ''}`}</title>
                <rect x={-5} y={-5} width={10} height={10} rx={1.5} transform="rotate(45)" fill="var(--violet)" stroke="var(--bg)" strokeWidth={1.6} />
                {inRing && <rect x={-8} y={-8} width={16} height={16} rx={2.5} transform="rotate(45)" fill="none" stroke="var(--violet)" strokeWidth={1} />}
              </g>
            );
          })}

        {/* Site pins (selected last so it draws on top) */}
        {[...rows]
          .sort((a, b) => Number(a.site.id === selectedId) - Number(b.site.id === selectedId) || Number(a.site.id === hoverId) - Number(b.site.id === hoverId))
          .map(({ site, deal }) => {
            const isSelected = site.id === selectedId;
            const isHover = site.id === hoverId;
            const meta = DEAL_META[deal.label];
            const pinScale = isSelected ? 1.25 : isHover ? 1.12 : 1;
            const showName = isSelected || isHover;
            const nameW = site.name.length * 6 + 18;
            return (
              <g
                key={site.id}
                transform={`translate(${site.x},${site.y}) scale(${k})`}
                role="button"
                tabIndex={0}
                aria-label={`${site.name}: ${deal.label} deal, score ${deal.score}`}
                aria-pressed={isSelected}
                className="cursor-pointer outline-none"
                onClick={() => pick(site.id)}
                onKeyDown={(e) => onPinKey(e, site.id)}
                onMouseEnter={() => onHover(site.id)}
                onMouseLeave={() => onHover(null)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {isSelected && <circle r={16} fill="var(--accent)" opacity={0.25} className="animate-soft-pulse" />}
                <ellipse cx={0} cy={0} rx={5} ry={2} fill="black" opacity={0.25} />
                <g transform={`scale(${pinScale})`}>
                  <path
                    d="M0,0 C-2,-6 -11,-12 -11,-21 A11,11 0 1 1 11,-21 C11,-12 2,-6 0,0 Z"
                    fill={`var(--${meta.cssVar})`}
                    stroke={isSelected ? 'var(--text)' : 'var(--bg)'}
                    strokeWidth={isSelected ? 2 : 1.6}
                  />
                  <text y={-17.5} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="white" style={{ pointerEvents: 'none' }}>
                    {deal.score}
                  </text>
                </g>
                {showName && (
                  <g transform={`translate(${16 * pinScale},${-34 * pinScale})`} style={{ pointerEvents: 'none' }}>
                    <rect x={0} y={-10} width={nameW} height={20} rx={6} fill="var(--panel)" stroke="var(--line)" strokeWidth={1} />
                    <text x={9} y={4} fontSize={11} fontWeight={600} fill="var(--text)">
                      {site.name}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
      </svg>

      {/* Layer toggles */}
      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5" role="group" aria-label="Map layers">
        <LayerToggle icon={Flame} label="Foot traffic" active={layers.heat} onClick={() => setLayers((l) => ({ ...l, heat: !l.heat }))} />
        <LayerToggle icon={Store} label="Competitors" active={layers.competitors} onClick={() => setLayers((l) => ({ ...l, competitors: !l.competitors }))} />
        <LayerToggle icon={Target} label="Trade area" active={layers.trade} onClick={() => setLayers((l) => ({ ...l, trade: !l.trade }))} />
      </div>

      {/* Zoom + north arrow */}
      <div className="absolute top-3 right-3 flex flex-col items-center gap-1.5">
        <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-panel">
          <MapButton label="Zoom in" onClick={() => zoomBy(1.4)} disabled={view.zoom >= MAX_ZOOM}>
            <Plus className="size-4" aria-hidden />
          </MapButton>
          <MapButton label="Zoom out" onClick={() => zoomBy(1 / 1.4)} disabled={view.zoom <= MIN_ZOOM}>
            <Minus className="size-4" aria-hidden />
          </MapButton>
          <MapButton label="Show the whole market" onClick={reset} disabled={view.zoom <= MIN_ZOOM}>
            <LocateFixed className="size-4" aria-hidden />
          </MapButton>
        </div>
        <span className="grid size-8 place-items-center rounded-full border border-line bg-panel text-[9px] font-bold text-muted shadow-panel" title="North is up">
          <Navigation className="size-3.5 text-accent" aria-hidden />N
        </span>
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-line bg-panel/95 px-2.5 py-2 text-[10.5px] text-muted shadow-panel backdrop-blur-sm">
        <p className="mb-1 font-bold tracking-wide text-faint uppercase">Deal strength</p>
        <ul className="space-y-0.5">
          {(['Strong', 'Fair', 'Weak'] as const).map((l) => {
            const meta = DEAL_META[l];
            const Icon = meta.icon;
            return (
              <li key={l} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: `var(--${meta.cssVar})` }} />
                <Icon className={clsx('size-3', meta.text)} aria-hidden />
                <span className="text-fg">{l}</span>
                <span className="text-faint">{l === 'Strong' ? '70+' : l === 'Fair' ? '50–69' : '<50'}</span>
              </li>
            );
          })}
          {layers.competitors && (
            <li className="flex items-center gap-1.5">
              <span className="ml-0.5 size-2 rotate-45 rounded-[1px] bg-violet" />
              <span className="ml-0.5 text-fg">Competitor</span>
            </li>
          )}
          {market.home && (
            <li className="flex items-center gap-1.5">
              <Home className="size-3 text-accent" aria-hidden />
              <span className="text-fg">Current location</span>
            </li>
          )}
        </ul>
        {layers.heat && (
          <div className="mt-1.5">
            <p className="font-semibold text-faint">Foot traffic</p>
            <div className="mt-0.5 flex items-center gap-1">
              <span>Low</span>
              <span className="h-1.5 w-16 rounded-full" style={{ background: 'linear-gradient(90deg, transparent, var(--warning), var(--danger))' }} />
              <span>High</span>
            </div>
          </div>
        )}
      </div>

      {/* Scale bar + cursor coordinates */}
      <div className="pointer-events-none absolute right-3 bottom-3 flex flex-col items-end gap-1 text-[10.5px] text-muted">
        <span className="rounded-md border border-line bg-panel/95 px-2 py-0.5 font-mono text-[10px] tabular-nums shadow-panel">
          {cursor ? formatLatLng(toLatLng(market, cursor)) : `${market.city} · drag to pan, scroll to zoom`}
        </span>
        <div className="flex items-center gap-2 rounded-md border border-line bg-panel/95 px-2 py-1 shadow-panel">
          <span className="relative h-1.5 border-x-2 border-b-2 border-fg" style={{ width: scalePx }} aria-hidden />
          <span className="font-semibold text-fg tabular-nums">{scaleMi} mi</span>
        </div>
      </div>
    </div>
  );
}

function LayerToggle({ icon: Icon, label, active, onClick }: { icon: typeof Flame; label: string; active: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold shadow-panel transition-colors',
        active ? 'border-accent/50 bg-accent-soft text-accent' : 'border-line bg-panel text-muted hover:text-fg'
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}

function MapButton({ label, onClick, disabled, children }: { label: string; onClick(): void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center border-b border-line text-muted last:border-b-0 hover:bg-panel-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
