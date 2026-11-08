'use client';

/**
 * 2D Silk Road map (d3-geo + SVG) fitted to the workspace's network. Explore it like the globe: scroll to zoom around
 * the pointer, drag to pan, double-click to zoom in.
 *
 * The world wraps horizontally like a cylinder: Mercator is rectangular, so the map is drawn as side-by-side copies one
 * world-width apart and panning never reaches an edge. The pan offset is folded back into a single world-width after
 * every move, which keeps the numbers small and is invisible because the copies are identical. Hubs, pins, news markers
 * and shipments are placed in screen space (repeated in every visible copy) so they keep their size at every zoom.
 */
import clsx from 'clsx';
import { geoMercator, geoPath } from 'd3-geo';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Disruption, Node, Route } from '@/module_bindings/ops/types';
import { cssColor, nodeKey, routeKey, SHIPMENT_KEY } from '@/lib/ops/legend';
import { MODE, NODE_KIND, ROUTE_STATUS } from '@/lib/ops/status';
import type { MarkerStyle } from '@/lib/settings';
import { BORDERS, COUNTRIES, displayedProgress, movementFactor, SamplerCache, visibleRoutes, type AnimatedShipment } from './map-data';
import type { GlobeViewProps } from './GlobeView';
import { TrackedCard } from './TrackedCard';

interface View {
  k: number;
  x: number;
  y: number;
}

/** Where one copy of the world sits in projected pixels (at zoom 1, before panning). */
interface World {
  width: number;
  left: number;
  top: number;
  bottom: number;
}

type XY = [number, number];

const IDENTITY: View = { k: 1, x: 0, y: 0 };
const MAX_ZOOM = 16;
/** Pointer travel (px) before a press counts as a drag rather than a click. */
const DRAG_SLOP = 4;
/** Markers this far outside the viewport are still drawn, so they slide in rather than pop in. */
const MARKER_MARGIN = 48;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Screen positions of a projected point in every world copy that is (nearly) on screen. */
function copiesOf(xy: XY, view: View, world: World, width: number, margin = MARKER_MARGIN): XY[] {
  if (world.width <= 0) return [[xy[0] * view.k + view.x, xy[1] * view.k + view.y]];
  const first = Math.ceil(((-margin - view.x) / view.k - xy[0]) / world.width);
  const last = Math.floor(((width + margin - view.x) / view.k - xy[0]) / world.width);
  const out: XY[] = [];
  for (let i = first; i <= last; i++) out.push([(xy[0] + i * world.width) * view.k + view.x, xy[1] * view.k + view.y]);
  return out;
}

export default function FlatMapView(props: GlobeViewProps) {
  const { network, disruptions, focused, selectedRouteId, labelSize, shipSize, colors, markerStyle } = props;
  const shipmentFill = cssColor(SHIPMENT_KEY, colors);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) })
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const routes = useMemo(() => visibleRoutes(network.routes), [network.routes]);
  const nodes = useMemo(() => {
    const active = new Set(routes.flatMap((r) => [r.fromNodeId, r.toNodeId]));
    return network.nodes.filter((n) => !n.standby || active.has(n.id));
  }, [network.nodes, routes]);

  // Refit only when the hubs themselves change (live updates hand us new arrays every tick), so zoom and pan persist.
  const hubSignature = network.nodes.map((n) => `${n.id}:${n.lat}:${n.lng}`).join('|');
  const projection = useMemo(() => {
    const p = geoMercator();
    if (size.width === 0 || !hubSignature) return p;
    const pad = Math.min(size.width, size.height) * 0.1;
    const coordinates = hubSignature.split('|').map((h) => {
      const [, lat, lng] = h.split(':').map(Number);
      return [lng, lat];
    });
    p.fitExtent(
      [
        [pad, pad],
        [size.width - pad, size.height - pad],
      ],
      { type: 'MultiPoint', coordinates }
    );
    return p;
  }, [size, hubSignature]);

  const path = useMemo(() => geoPath(projection), [projection]);
  // Mercator's world is a square, 2π·scale on a side, centred on the projection's translate.
  const world = useMemo<World>(() => {
    const s = projection.scale();
    const [tx, ty] = projection.translate();
    return { width: 2 * Math.PI * s, left: tx - Math.PI * s, top: ty - Math.PI * s, bottom: ty + Math.PI * s };
  }, [projection]);

  // ── Pan & zoom ──
  const [view, setView] = useState<View>(IDENTITY);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  /**
   * Horizontally the world repeats, so any offset is valid: fold it into one world-width (invisible, because the copies
   * are identical). Vertically keep the map covering the view so no space shows beyond the poles.
   */
  const clampView = useCallback(
    (v: View): View => {
      const { height: h } = size;
      const worldHeight = world.bottom - world.top;
      const minZoom = worldHeight > 0 ? Math.min(1, h / worldHeight) : 0.5;
      const k = clamp(v.k, minZoom, MAX_ZOOM);
      const period = world.width * k;
      const x = period > 0 ? ((((v.x + period / 2) % period) + period) % period) - period / 2 : v.x;
      const top = world.top * k;
      const bottom = world.bottom * k;
      const y = bottom - top <= h ? (h - top - bottom) / 2 : clamp(v.y, h - bottom, -top);
      return { k, x, y };
    },
    [size, world]
  );

  // The fitted view of the whole network. A new fit (workspace switch or resize) starts from it again.
  const home = useMemo(() => clampView(IDENTITY), [clampView]);
  useEffect(() => setView(home), [home]);

  /** Zoom by a factor around a point given in container pixels. */
  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) =>
      setView((v) => {
        const target = clampView({ ...v, k: v.k * factor });
        const ratio = target.k / v.k;
        return clampView({ k: target.k, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio });
      }),
    [clampView]
  );

  // Wheel zoom needs a non-passive listener so the page never scrolls instead.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-delta * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const press = useRef<{ x: number; y: number; vx: number; vy: number; dragging: boolean } | null>(null);
  const justDragged = useRef(false);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    press.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, dragging: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.dragging) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      p.dragging = true;
      setDragging(true);
      // Dragging takes the camera back from tracking; the card stays on the dot.
      if (trackedRef.current !== null && followRef.current) {
        followRef.current = false;
        setFollowing(false);
      }
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setView((v) => clampView({ k: v.k, x: p.vx + dx, y: p.vy + dy }));
  };
  const endPress = () => {
    if (press.current?.dragging) {
      // Swallow the click the browser fires right after a drag, but never a later one.
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 0);
    }
    press.current = null;
    setDragging(false);
  };

  /** World copies (by index) that overlap the viewport. */
  const copyIndices = useMemo(() => {
    if (world.width <= 0 || size.width === 0) return [0];
    const visibleLeft = -view.x / view.k;
    const visibleRight = (size.width - view.x) / view.k;
    const first = Math.floor((visibleLeft - world.left) / world.width);
    const last = Math.floor((visibleRight - world.left) / world.width);
    const out: number[] = [];
    for (let i = first; i <= last; i++) out.push(i);
    return out;
  }, [world, view, size.width]);

  /** Screen positions of a lng/lat in every visible copy. */
  const screenCopies = useCallback(
    (lng: number, lat: number): XY[] => {
      const xy = projection([lng, lat]);
      return xy ? copiesOf(xy as XY, view, world, size.width) : [];
    },
    [projection, view, world, size.width]
  );

  const affected = useMemo(() => new Set(focused?.affectedRouteIds ?? []), [focused]);

  // The land and lanes are built once per fit/style and reused in every copy.
  const land = useMemo(
    () => (
      <>
        {/* Fills get a hairline in the land colour so neighbouring copies meet without an anti-aliasing seam. */}
        {COUNTRIES.map((f, i) => (
          <path
            key={i}
            d={path(f) ?? ''}
            fill="var(--globe-land)"
            stroke="var(--globe-land)"
            strokeWidth={0.8}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={path(BORDERS) ?? ''} fill="none" stroke="var(--globe-border)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
      </>
    ),
    [path]
  );

  const { onSelectRoute } = props;
  const lanes = useMemo(
    () => (
      <g fill="none" strokeLinecap="round">
        {routes.map((route) => {
          const emphasised = route.id === selectedRouteId || affected.has(route.id) || route.status === 'disrupted';
          return (
            <path
              key={route.id}
              d={path({ type: 'LineString', coordinates: route.waypoints.map((p) => [p.lng, p.lat]) }) ?? ''}
              stroke={cssColor(routeKey(route.status), colors)}
              strokeWidth={emphasised ? 2.6 : 1.3}
              vectorEffect="non-scaling-stroke"
              strokeDasharray={
                route.status === 'rerouted' ? '6 4' : route.mode === 'air' ? '2 4' : route.status === 'disrupted' ? '5 3' : undefined
              }
              opacity={route.status === 'healthy' ? 0.75 : 1}
              markerEnd={`url(#arrow-head-${ROUTE_STATUS[route.status] ? route.status : 'healthy'})`}
              className="cursor-pointer"
              onClick={() => onSelectRoute(route.id)}
            >
              <title>{`${route.label} · ${route.mode.toUpperCase()} · ${ROUTE_STATUS[route.status]?.label ?? route.status}`}</title>
            </path>
          );
        })}
      </g>
    ),
    [routes, path, selectedRouteId, affected, colors, onSelectRoute]
  );

  // ── Shipments: animated every frame by writing straight to the SVG, repeated in every visible copy ──
  const dotsRef = useRef<SVGGElement>(null);
  const shipmentsRef = useRef(new Map<number, AnimatedShipment>());
  const routesRef = useRef(network.routesById);
  useEffect(() => {
    routesRef.current = network.routesById;
  }, [network.routesById]);
  const samplers = useMemo(() => new SamplerCache(), []);
  const widthRef = useRef(size.width);
  const heightRef = useRef(size.height);
  useEffect(() => {
    widthRef.current = size.width;
    heightRef.current = size.height;
  }, [size.width, size.height]);

  // ── Tracking: the camera follows the clicked delivery and its card rides on the dot ──
  const { trackedShipmentId, onTrackShipment } = props;
  const trackedRef = useRef<number | null>(trackedShipmentId);
  const followRef = useRef(true);
  const zoomTargetRef = useRef<number | null>(null);
  const [following, setFollowing] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const clampRef = useRef(clampView);
  useEffect(() => {
    clampRef.current = clampView;
  }, [clampView]);
  useEffect(() => {
    trackedRef.current = trackedShipmentId;
    followRef.current = true;
    setFollowing(true);
    // Move in a little closer when tracking starts; the user's own zoom is kept after that.
    zoomTargetRef.current = trackedShipmentId === null ? null : Math.max(viewRef.current.k, 2.5);
  }, [trackedShipmentId]);
  const recenter = () => {
    followRef.current = true;
    setFollowing(true);
  };

  useEffect(() => {
    const now = performance.now();
    const next = new Map<number, AnimatedShipment>();
    for (const s of network.shipments) {
      const prev = shipmentsRef.current.get(s.id);
      const changed = !prev || prev.progress !== s.progress || prev.routeId !== s.routeId || prev.status !== s.status;
      next.set(s.id, {
        id: s.id,
        routeId: s.routeId,
        progress: s.progress,
        speed: s.speed,
        status: s.status,
        receivedAt: changed ? now : prev.receivedAt,
      });
    }
    shipmentsRef.current = next;
  }, [network.shipments]);

  useEffect(() => {
    let frame = 0;
    // Vehicles are badges: a status-coloured disc with the ship / plane / train / truck glyph in white.
    const r = 4 + shipSize * 1.5;
    const radius = String(r);
    const icon = r * 1.25;
    const NS = 'http://www.w3.org/2000/svg';
    const animate = () => {
      const group = dotsRef.current;
      if (group) {
        const now = performance.now();
        let v = viewRef.current;
        const width = widthRef.current;
        const height = heightRef.current;
        let trackedXY: XY | null = null;
        const positions: { id: number; xy: XY; fill: string; mode: string }[] = [];
        for (const s of shipmentsRef.current.values()) {
          const route = routesRef.current.get(s.routeId);
          if (!route || route.status === 'standby') continue;
          const at = samplers.get(route).at(displayedProgress(s, movementFactor(s.status, route), now));
          const xy = projection([at.lng, at.lat]) as XY | null;
          if (!xy) continue;
          if (s.id === trackedRef.current) trackedXY = xy;
          const fill =
            s.status === 'delayed'
              ? 'var(--danger)'
              : s.status === 'held'
                ? 'var(--warning)'
                : s.status === 'rerouted'
                  ? 'var(--cyan)'
                  : shipmentFill;
          positions.push({ id: s.id, xy, fill, mode: route.mode });
        }

        // Ease the camera toward the tracked dot (the nearest of its wrapped copies) until the user drags away.
        if (trackedXY && followRef.current && width > 0) {
          const zoomTarget = zoomTargetRef.current;
          const k = zoomTarget ? v.k + (zoomTarget - v.k) * 0.12 : v.k;
          if (zoomTarget && Math.abs(zoomTarget - k) < 0.01) zoomTargetRef.current = null;
          const period = world.width * k;
          let tx = width / 2 - trackedXY[0] * k;
          if (period > 0) tx += Math.round((v.x - tx) / period) * period;
          const ty = height / 2 - trackedXY[1] * k;
          const next = clampRef.current({ k, x: v.x + (tx - v.x) * 0.12, y: v.y + (ty - v.y) * 0.12 });
          if (Math.abs(next.x - v.x) > 0.05 || Math.abs(next.y - v.y) > 0.05 || next.k !== v.k) {
            v = next;
            viewRef.current = next;
            setView(next);
          }
        }

        const dots: { id: number; x: number; y: number; fill: string; mode: string }[] = [];
        for (const p of positions) {
          for (const [x, y] of copiesOf(p.xy, v, world, width, 8)) dots.push({ id: p.id, x, y, fill: p.fill, mode: p.mode });
        }
        while (group.childNodes.length < dots.length) {
          const badge = document.createElementNS(NS, 'g');
          badge.style.cursor = 'pointer';
          const circle = document.createElementNS(NS, 'circle');
          circle.setAttribute('stroke', 'rgba(8,15,26,0.85)');
          circle.setAttribute('stroke-width', '1.5');
          circle.setAttribute('pointer-events', 'all');
          const glyph = document.createElementNS(NS, 'use');
          glyph.setAttribute('pointer-events', 'none');
          glyph.style.color = '#ffffff';
          badge.append(circle, glyph);
          group.appendChild(badge);
        }
        while (group.childNodes.length > dots.length) group.lastChild?.remove();
        dots.forEach((d, i) => {
          const badge = group.childNodes[i] as SVGGElement;
          badge.setAttribute('transform', `translate(${d.x.toFixed(1)} ${d.y.toFixed(1)})`);
          badge.dataset.id = String(d.id);
          const circle = badge.firstChild as SVGCircleElement;
          circle.setAttribute('r', radius);
          circle.setAttribute('fill', d.fill);
          const glyph = badge.lastChild as SVGUseElement;
          const href = `#arrow-veh-${MODE[d.mode] ? d.mode : 'truck'}`;
          if (glyph.getAttribute('href') !== href) glyph.setAttribute('href', href);
          glyph.setAttribute('x', (-icon / 2).toFixed(1));
          glyph.setAttribute('y', (-icon / 2).toFixed(1));
          glyph.setAttribute('width', icon.toFixed(1));
          glyph.setAttribute('height', icon.toFixed(1));
        });

        // Pin the info card to the copy of the tracked dot nearest the centre.
        const card = cardRef.current;
        if (card) {
          const copies = trackedXY ? copiesOf(trackedXY, v, world, width, 0) : [];
          const spot = copies.sort((a, b) => Math.abs(a[0] - width / 2) - Math.abs(b[0] - width / 2))[0];
          if (spot && spot[1] >= 0 && spot[1] <= height) {
            card.style.display = 'block';
            card.style.transform = `translate(${spot[0].toFixed(1)}px, ${spot[1].toFixed(1)}px)`;
          } else {
            card.style.display = 'none';
          }
        }
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [projection, world, shipSize, samplers, shipmentFill]);

  const activeDisruptions = disruptions.filter((d) => d.status !== 'resolved');
  const zoomCenter = (factor: number) => zoomAt(factor, size.width / 2, size.height / 2);
  const moved = view.k !== home.k || view.x !== home.x || view.y !== home.y;

  return (
    <div
      ref={containerRef}
      className={clsx('absolute inset-0 touch-none overflow-hidden select-none', dragging ? 'cursor-grabbing' : 'cursor-grab')}
      aria-label="2D map of supply-chain routes. Scroll to zoom, drag to pan; the world wraps around."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onClickCapture={(e) => {
        // A drag that ends over a lane or pin must not also select it.
        if (justDragged.current) {
          justDragged.current = false;
          e.stopPropagation();
        }
      }}
      onDoubleClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        zoomAt(2, e.clientX - rect.left, e.clientY - rect.top);
      }}
    >
      {size.width > 0 && (
        <svg width={size.width} height={size.height} className="block">
          <rect width={size.width} height={size.height} fill="var(--globe-ocean)" opacity={0.55} />
          {/* Arrowheads at each lane's destination, sized in screen pixels whatever the zoom. */}
          <defs>
            {['healthy', 'at_risk', 'disrupted', 'rerouted'].map((status) => (
              <marker
                key={status}
                id={`arrow-head-${status}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerUnits="userSpaceOnUse"
                markerWidth={9 / view.k}
                markerHeight={9 / view.k}
                orient="auto"
              >
                <path d="M0,0 L10,5 L0,10 z" fill={cssColor(routeKey(status), colors)} />
              </marker>
            ))}
          </defs>
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {copyIndices.map((i) => (
              <g key={i} transform={`translate(${i * world.width},0)`}>
                {land}
                {lanes}
              </g>
            ))}
          </g>
          <g>
            {nodes.flatMap((node) =>
              screenCopies(node.lng, node.lat).map((xy, i) => (
                <NodeDot key={`${node.id}:${i}`} node={node} xy={xy} labelSize={labelSize} colors={colors} markerStyle={markerStyle} />
              ))
            )}
          </g>
          <defs>
            {Object.entries(MODE).map(([mode, meta]) => (
              <symbol key={mode} id={`arrow-veh-${mode}`} viewBox="0 0 24 24">
                <meta.icon strokeWidth={2.4} />
              </symbol>
            ))}
          </defs>
          <g
            ref={dotsRef}
            onClick={(e) => {
              const id = ((e.target as Element).closest('[data-id]') as SVGElement | null)?.dataset.id;
              if (id) onTrackShipment(Number(id));
            }}
          />
          <g>
            {activeDisruptions.flatMap((d) =>
              screenCopies(d.lng, d.lat).map((xy, i) => (
                <DisruptionPin key={`${d.id}:${i}`} disruption={d} xy={xy} onClick={() => props.onFocusDisruption(d.id)} />
              ))
            )}
            {props.signals
              .filter((s) => s.status === 'new')
              .flatMap((s) =>
                screenCopies(s.lng, s.lat).map((xy, i) => (
                  <g
                    key={`n${s.id}:${i}`}
                    transform={`translate(${xy[0]},${xy[1]})`}
                    role="img"
                    aria-label={`Live news signal: ${s.headline}`}
                  >
                    <rect x={-9} y={-9} width={18} height={18} rx={5} fill="var(--violet)" />
                    <text textAnchor="middle" y={4} fontSize={11} fontWeight={800} fill="#fff">
                      N
                    </text>
                    <title>{`Live news (Grok): ${s.headline}`}</title>
                  </g>
                ))
              )}
          </g>
        </svg>
      )}

      {trackedShipmentId !== null && (
        <TrackedCard
          ref={cardRef}
          shipmentId={trackedShipmentId}
          network={network}
          following={following}
          onRecenter={recenter}
          onClose={() => onTrackShipment(null)}
        />
      )}

      {/* Zoom controls (scroll and drag work too). */}
      <div
        className="absolute bottom-14 left-1/2 z-10 flex -translate-x-1/2 items-center overflow-hidden rounded-lg border border-line bg-panel/95 text-muted shadow-panel"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => zoomCenter(1 / 1.5)}
          aria-label="Zoom out"
          title="Zoom out"
          className="grid size-8 place-items-center hover:bg-panel-hover hover:text-fg"
        >
          <Minus className="size-3.5" aria-hidden />
        </button>
        <span className="min-w-[44px] border-x border-line text-center text-[11px] font-semibold text-fg tabular-nums">
          {Math.round(view.k * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomCenter(1.5)}
          aria-label="Zoom in"
          title="Zoom in"
          className="grid size-8 place-items-center hover:bg-panel-hover hover:text-fg"
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setView(home)}
          disabled={!moved}
          aria-label="Reset view"
          title="Back to the whole network"
          className="grid size-8 place-items-center border-l border-line hover:bg-panel-hover hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <RotateCcw className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function NodeDot(props: { node: Node; xy: XY; labelSize: number; colors: Record<string, string>; markerStyle: MarkerStyle }) {
  const { node, xy, labelSize, colors, markerStyle } = props;
  const color =
    node.status === 'offline' ? 'var(--danger)' : node.status === 'degraded' ? 'var(--warning)' : cssColor(nodeKey(node.kind), colors);
  const title = `${node.name} · ${NODE_KIND[node.kind]?.label ?? node.kind}`;
  const Icon = NODE_KIND[node.kind]?.icon;
  return (
    <g transform={`translate(${xy[0]},${xy[1]})`}>
      {markerStyle === 'icons' && Icon ? (
        <g>
          <circle r={9} fill="var(--panel)" stroke={color} strokeWidth={1.5} />
          <Icon x={-5.5} y={-5.5} width={11} height={11} color={color} strokeWidth={2.4} aria-hidden />
          <title>{title}</title>
        </g>
      ) : (
        <circle r={4} fill={color} stroke="var(--panel)" strokeWidth={1.5}>
          <title>{title}</title>
        </circle>
      )}
      {labelSize > 0 && (
        <text
          x={markerStyle === 'icons' ? 12 : 7}
          y={3}
          fontSize={10 + labelSize * 4}
          fill="var(--muted)"
          className="pointer-events-none select-none"
        >
          {node.city.split(',')[0]}
        </text>
      )}
    </g>
  );
}

function DisruptionPin({ disruption, xy, onClick }: { disruption: Disruption; xy: XY; onClick(): void }) {
  const color = disruption.status === 'mitigating' ? 'var(--warning)' : 'var(--danger)';
  return (
    <g transform={`translate(${xy[0]},${xy[1]})`} className="cursor-pointer" onClick={onClick} role="button" aria-label={disruption.title}>
      <circle r={16} fill={color} opacity={0.18} className="animate-soft-pulse" />
      <circle r={11} fill={color} />
      <text textAnchor="middle" y={5} fontSize={14} fontWeight={800} fill="#fff">
        !
      </text>
      <title>{disruption.title}</title>
    </g>
  );
}
