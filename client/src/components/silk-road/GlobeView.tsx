'use client';

/**
 * 3D Silk Road globe (react-globe.gl / three.js). Loaded with ssr:false.
 *
 * Layers: countries (polygons), sea/rail/truck lanes (paths along real
 * waypoints), air lanes (arcs), nodes (points + labels), disruptions
 * (pulsing rings + clickable "!" markers) and shipments (a custom
 * THREE.Points layer animated every frame between 2-second server ticks).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import type { Disruption, NewsSignal, Node, Org, Route } from '@/module_bindings/ops/types';
import type { Network } from '@/lib/ops/hooks';
import { nodeKey, resolvedColor, routeKey, SHIPMENT_KEY } from '@/lib/ops/legend';
import { NODE_KIND, ROUTE_STATUS } from '@/lib/ops/status';
import type { MarkerStyle } from '@/lib/settings';
import { readCssVars, useTheme } from '@/lib/theme';
import {
  arcAltitudeFor,
  COUNTRIES,
  displayedProgress,
  escapeHtml,
  movementFactor,
  SamplerCache,
  visibleRoutes,
  type AnimatedShipment,
} from './map-data';
import { TrackedCard } from './TrackedCard';

const COLOR_VARS = [
  'globe-ocean',
  'globe-land',
  'globe-border',
  'globe-atmosphere',
  'success',
  'warning',
  'danger',
  'cyan',
  'accent',
  'violet',
  'faint',
  'text',
  'muted',
] as const;
type Palette = Record<(typeof COLOR_VARS)[number], string>;

export interface GlobeViewProps {
  org: Org;
  network: Network;
  disruptions: Disruption[];
  signals: NewsSignal[];
  focused: Disruption | undefined;
  selectedRouteId: number | null;
  labelSize: number;
  shipSize: number;
  rotateSpeed: number;
  /** Custom legend colours (Settings › Map › Legend colors); missing keys use the theme. */
  colors: Record<string, string>;
  /** Draw hubs as coloured dots or as small icons. */
  markerStyle: MarkerStyle;
  onSelectRoute(id: number | null): void;
  onFocusDisruption(id: bigint): void;
  /** Delivery the camera follows, with its info card on the dot. */
  trackedShipmentId: number | null;
  onTrackShipment(id: number | null): void;
}

interface PathDatum {
  route: Route;
  points: [number, number, number][];
}

/** A hub drawn as an HTML icon (icon marker style). New objects whenever colour or icon changes, so the globe redraws them. */
interface NodeIconDatum {
  node: Node;
  color: string;
  svg: string;
}

const isNodeIcon = (d: object): d is NodeIconDatum => 'svg' in d && 'node' in d;

export default function GlobeView(props: GlobeViewProps) {
  const { org, network, disruptions, focused, selectedRouteId, labelSize, shipSize, rotateSpeed, colors, markerStyle } = props;
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const [cameraAltitude, setCameraAltitude] = useState(org.viewAltitude);
  const [theme] = useTheme();
  // Theme colors are CSS variables; resolve them for WebGL whenever the theme flips.
  // (This component only renders on the client, so reading computed styles is safe.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palette = useMemo<Palette | null>(() => readCssVars(COLOR_VARS), [theme]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Scale marker sizes to the workspace's zoom level (global vs metro).
  const scale = Math.max(org.viewAltitude / 2.4, 0.12);
  const affected = useMemo(() => new Set(focused?.affectedRouteIds ?? []), [focused]);

  const globeMaterial = useMemo(() => {
    const material = new THREE.MeshPhongMaterial({ color: new THREE.Color(palette?.['globe-ocean'] ?? '#0e1520') });
    material.shininess = theme === 'dark' ? 4 : 10;
    return material;
  }, [palette, theme]);

  const routes = useMemo(() => visibleRoutes(network.routes), [network.routes]);
  const paths = useMemo<PathDatum[]>(
    () =>
      routes
        .filter((r) => r.mode !== 'air')
        .map((route) => ({ route, points: route.waypoints.map((p) => [p.lat, p.lng, 0.004] as [number, number, number]) })),
    [routes]
  );
  const arcs = useMemo(() => routes.filter((r) => r.mode === 'air'), [routes]);

  const routeColor = useCallback(
    (route: Route) => (palette ? resolvedColor(routeKey(route.status), colors, palette) : '#22c55e'),
    [palette, colors]
  );
  const isEmphasised = useCallback(
    (route: Route) => route.id === selectedRouteId || affected.has(route.id) || route.status === 'disrupted',
    [selectedRouteId, affected]
  );

  const visibleNodes = useMemo(() => {
    const active = new Set(routes.flatMap((r) => [r.fromNodeId, r.toNodeId]));
    return network.nodes.filter((n) => !n.standby || active.has(n.id));
  }, [network.nodes, routes]);

  const nodeColor = useCallback(
    (node: Node) => {
      if (!palette) return '#3b8bff';
      if (node.status === 'offline') return palette.danger;
      if (node.status === 'degraded') return palette.warning;
      return resolvedColor(nodeKey(node.kind), colors, palette);
    },
    [palette, colors]
  );

  // Icon markup for each hub kind, captured once from the hidden lucide icons rendered below.
  const iconSourceRef = useRef<HTMLDivElement>(null);
  const [iconMarkup, setIconMarkup] = useState<Record<string, string>>({});
  useLayoutEffect(() => {
    const source = iconSourceRef.current;
    if (!source) return;
    const markup: Record<string, string> = {};
    source.querySelectorAll<HTMLElement>('[data-kind]').forEach((el) => (markup[el.dataset.kind!] = el.innerHTML));
    setIconMarkup(markup);
  }, []);

  const nodeIcons = useMemo<NodeIconDatum[]>(
    () => (markerStyle === 'icons' ? visibleNodes.map((node) => ({ node, color: nodeColor(node), svg: iconMarkup[node.kind] ?? '' })) : []),
    [markerStyle, visibleNodes, nodeColor, iconMarkup]
  );

  const activeDisruptions = useMemo(() => disruptions.filter((d) => d.status !== 'resolved'), [disruptions]);
  // "!" for declared disruptions, "N" for undecided Grok news signals.
  // Hub icons go first so alert markers draw on top of them.
  const markers = useMemo(
    () => [...nodeIcons, ...activeDisruptions, ...props.signals.filter((s) => s.status === 'new')],
    [nodeIcons, activeDisruptions, props.signals]
  );
  const shipmentColor = palette ? resolvedColor(SHIPMENT_KEY, colors, palette) : '#e7edf6';

  // Fly to the workspace when it changes, then to the focused disruption.
  useEffect(() => {
    if (!ready) return;
    globeRef.current?.pointOfView({ lat: org.viewLat, lng: org.viewLng, altitude: org.viewAltitude }, 1200);
  }, [ready, org.id, org.viewLat, org.viewLng, org.viewAltitude]);

  const focusedId = focused?.id;
  useEffect(() => {
    if (!ready || focusedId === undefined || !focused) return;
    // Zoom to the disruption's footprint: metro incidents get close, ocean blockages stay wide.
    const altitude = Math.min(org.viewAltitude, Math.max(0.3, (focused.radiusKm / 111) * 0.6));
    globeRef.current?.pointOfView({ lat: focused.lat, lng: focused.lng, altitude }, 1400);
    // Only re-fly when the focused disruption changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusedId]);

  // ── Tracking: the camera follows the clicked delivery and its card rides on the dot ──
  const { trackedShipmentId, onTrackShipment } = props;
  const trackedRef = useRef<number | null>(trackedShipmentId);
  const followRef = useRef(true);
  const altitudeTargetRef = useRef<number | null>(null);
  const [following, setFollowing] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);
  /** Where each delivery was drawn this frame (for clicking and tracking). */
  const livePosRef = useRef(new Map<number, { lat: number; lng: number; alt: number }>());
  useEffect(() => {
    trackedRef.current = trackedShipmentId;
    followRef.current = true;
    setFollowing(true);
    // Move in a little closer when tracking starts; the user's own zoom is kept after that.
    const altitude = globeRef.current?.pointOfView().altitude ?? 2;
    altitudeTargetRef.current = trackedShipmentId === null ? null : Math.min(altitude, 1.1);
  }, [trackedShipmentId]);
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  /** Click picking: the nearest visible delivery dot within a few pixels of the pointer. */
  const pickShipment = (clientX: number, clientY: number): number | null => {
    const globe = globeRef.current;
    const el = containerRef.current;
    if (!globe || !el) return null;
    const rect = el.getBoundingClientRect();
    const camera = globe.camera().position;
    let best: { id: number; d: number } | null = null;
    for (const [id, p] of livePosRef.current) {
      const c = globe.getCoords(p.lat, p.lng, p.alt);
      if (c.x * camera.x + c.y * camera.y + c.z * camera.z <= 0) continue; // far side of the globe
      const s = globe.getScreenCoords(p.lat, p.lng, p.alt);
      const d = Math.hypot(s.x - (clientX - rect.left), s.y - (clientY - rect.top));
      if (d < 12 && (!best || d < best.d)) best = { id, d };
    }
    return best?.id ?? null;
  };

  // Auto-rotate pauses while an active disruption is focused or a delivery is tracked, so the camera stays on it.
  const holdCamera = (!!focused && focused.status !== 'resolved') || trackedShipmentId !== null;
  useEffect(() => {
    const controls = globeRef.current?.controls();
    if (!controls) return;
    controls.autoRotate = rotateSpeed > 0 && !holdCamera;
    controls.autoRotateSpeed = rotateSpeed;
    controls.enableDamping = true;
  }, [ready, rotateSpeed, holdCamera]);

  // ── Shipments: custom points layer animated every frame ──
  const shipmentsRef = useRef(new Map<number, AnimatedShipment>());
  const routesRef = useRef(network.routesById);
  useEffect(() => {
    routesRef.current = network.routesById;
  }, [network.routesById]);
  const samplers = useMemo(() => new SamplerCache(), []);

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
    const globe = globeRef.current;
    if (!ready || !globe || !palette) return;
    const scene = globe.scene();
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size: 2.2 + shipSize * 1.4,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.renderOrder = 10;
    scene.add(points);

    const statusColors: Record<string, THREE.Color> = {
      delayed: new THREE.Color(palette.danger),
      held: new THREE.Color(palette.warning),
      rerouted: new THREE.Color(palette.cyan),
      in_transit: new THREE.Color(shipmentColor),
    };
    let capacity = 0;
    let positions = new Float32Array(0);
    let colors = new Float32Array(0);
    let frame = 0;

    const animate = () => {
      const list = [...shipmentsRef.current.values()];
      if (list.length !== capacity) {
        capacity = list.length;
        positions = new Float32Array(capacity * 3);
        colors = new Float32Array(capacity * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      const now = performance.now();
      const live = livePosRef.current;
      live.clear();
      list.forEach((s, i) => {
        const route = routesRef.current.get(s.routeId);
        if (!route || route.status === 'standby') {
          positions.set([0, 0, 0], i * 3);
          return;
        }
        const t = displayedProgress(s, movementFactor(s.status, route), now);
        const at = samplers.get(route).at(t);
        const altitude = route.mode === 'air' ? arcAltitudeFor(route) * Math.sin(Math.PI * t) + 0.01 : 0.012;
        live.set(s.id, { lat: at.lat, lng: at.lng, alt: altitude });
        const c = globe.getCoords(at.lat, at.lng, altitude);
        positions[i * 3] = c.x;
        positions[i * 3 + 1] = c.y;
        positions[i * 3 + 2] = c.z;
        const color = statusColors[s.status] ?? statusColors.in_transit;
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      });
      if (capacity > 0) {
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        geometry.computeBoundingSphere();
      }

      // Tracking: ease the camera toward the dot, then pin the card to it.
      const tracked = trackedRef.current !== null ? live.get(trackedRef.current) : undefined;
      if (tracked && followRef.current) {
        const pov = globe.pointOfView();
        const dLng = ((((tracked.lng - pov.lng) % 360) + 540) % 360) - 180;
        const altTarget = altitudeTargetRef.current;
        const altitude = altTarget ? pov.altitude + (altTarget - pov.altitude) * 0.08 : pov.altitude;
        if (altTarget && Math.abs(altTarget - altitude) < 0.005) altitudeTargetRef.current = null;
        globe.pointOfView({ lat: pov.lat + (tracked.lat - pov.lat) * 0.08, lng: pov.lng + dLng * 0.08, altitude }, 0);
      }
      const card = cardRef.current;
      if (card) {
        let shown = false;
        if (tracked) {
          const c = globe.getCoords(tracked.lat, tracked.lng, tracked.alt);
          const cam = globe.camera().position;
          if (c.x * cam.x + c.y * cam.y + c.z * cam.z > 0) {
            const s = globe.getScreenCoords(tracked.lat, tracked.lng, tracked.alt);
            card.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
            shown = true;
          }
        }
        card.style.display = shown ? 'block' : 'none';
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    };
  }, [ready, palette, shipSize, samplers, shipmentColor]);

  // ── Disruption markers ("!") ──
  const onFocusRef = useRef(props.onFocusDisruption);
  const { onFocusDisruption } = props;
  useEffect(() => {
    onFocusRef.current = onFocusDisruption;
  }, [onFocusDisruption]);
  const markerElement = useCallback((d: object) => {
    if (isNodeIcon(d)) {
      const el = document.createElement('span');
      el.className = 'node-icon';
      el.style.color = d.color;
      // Static lucide SVG captured from our own render above (no user content).
      el.innerHTML = d.svg;
      el.title = `${d.node.name} · ${NODE_KIND[d.node.kind]?.label ?? d.node.kind}`;
      return el;
    }
    if ('headline' in d) {
      const signal = d as NewsSignal;
      const el = document.createElement('span');
      el.className = 'news-marker';
      el.textContent = 'N';
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', `Live news signal: ${signal.headline}`);
      el.title = `Live news (Grok): ${signal.headline}`;
      return el;
    }
    const disruption = d as Disruption;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'disruption-marker';
    el.textContent = '!';
    el.dataset.mitigating = String(disruption.status === 'mitigating');
    el.setAttribute('aria-label', `Disruption: ${disruption.title}`);
    el.title = disruption.title;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onFocusRef.current(disruption.id);
    });
    return el;
  }, []);

  const routeTooltip = useCallback(
    (d: object) => {
      const route = 'route' in d ? (d as PathDatum).route : (d as Route);
      const status = ROUTE_STATUS[route.status];
      const count = network.shipmentsByRoute.get(route.id)?.length ?? 0;
      return `<div style="font:12px Inter,sans-serif;padding:6px 8px;border-radius:8px;background:rgba(10,15,25,.92);color:#e7edf6;border:1px solid rgba(255,255,255,.12)">
        <b>${escapeHtml(route.label)}</b> · ${escapeHtml(route.mode.toUpperCase())}<br/>
        <span style="color:#94a3b8">${escapeHtml(route.lane)}</span><br/>
        ${escapeHtml(status?.label ?? route.status)} · ${count} shipments${route.note ? `<br/><span style="color:#94a3b8">${escapeHtml(route.note)}</span>` : ''}
      </div>`;
    },
    [network.shipmentsByRoute]
  );

  const nodeTooltip = useCallback((d: object) => {
    const node = d as Node;
    return `<div style="font:12px Inter,sans-serif;padding:6px 8px;border-radius:8px;background:rgba(10,15,25,.92);color:#e7edf6;border:1px solid rgba(255,255,255,.12)">
      <b>${escapeHtml(node.name)}</b><br/><span style="color:#94a3b8">${escapeHtml(NODE_KIND[node.kind]?.label ?? node.kind)} · ${escapeHtml(node.city)}</span>
      ${node.status !== 'operational' ? `<br/><span style="color:#f2555a">${escapeHtml(node.status.toUpperCase())}</span>` : ''}
    </div>`;
  }, []);

  // Ground lanes are fat lines (width in px); air lanes are tubes (width in globe units),
  // so arcs scale with the camera altitude to look the same at every zoom.
  const pathStrokeFor = (route: Route) => (isEmphasised(route) ? 3.2 : 1.7);
  const arcStrokeFor = (route: Route) => (isEmphasised(route) ? 0.7 : 0.35) * Math.min(1, Math.max(cameraAltitude / 2.4, 0.08));

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      aria-label="3D globe of supply-chain routes. Click a moving delivery to track it."
      onPointerDown={(e) => {
        press.current = { x: e.clientX, y: e.clientY, moved: false };
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p || p.moved || e.buttons === 0 || Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
        p.moved = true;
        // Rotating the globe takes the camera back from tracking; the card stays on the dot.
        if (trackedRef.current !== null && followRef.current) {
          followRef.current = false;
          setFollowing(false);
        }
      }}
      onClick={(e) => {
        const p = press.current;
        press.current = null;
        if (p?.moved) return;
        const id = pickShipment(e.clientX, e.clientY);
        if (id !== null) onTrackShipment(id);
      }}
    >
      <div ref={iconSourceRef} hidden>
        {Object.entries(NODE_KIND).map(([kind, meta]) => (
          <span key={kind} data-kind={kind}>
            <meta.icon strokeWidth={2.4} />
          </span>
        ))}
      </div>
      {size.width > 0 && palette && (
        <Globe
          ref={globeRef}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          globeMaterial={globeMaterial}
          showAtmosphere
          atmosphereColor={palette['globe-atmosphere']}
          atmosphereAltitude={0.16}
          onGlobeReady={() => setReady(true)}
          onZoom={({ altitude }) => setCameraAltitude((prev) => (Math.abs(prev - altitude) / prev > 0.15 ? altitude : prev))}
          onGlobeClick={() => props.onSelectRoute(null)}
          // Countries
          polygonsData={COUNTRIES}
          polygonCapColor={() => palette['globe-land']}
          polygonSideColor={() => 'rgba(0,0,0,0)'}
          polygonStrokeColor={() => palette['globe-border']}
          polygonAltitude={0.003}
          polygonsTransitionDuration={0}
          // Ground lanes
          pathsData={paths}
          pathPoints={(d: object) => (d as PathDatum).points}
          pathPointAlt={(p: object) => (p as number[])[2]}
          pathColor={(d: object) => routeColor((d as PathDatum).route)}
          pathStroke={(d: object) => pathStrokeFor((d as PathDatum).route)}
          pathDashLength={(d: object) => dash((d as PathDatum).route).length}
          pathDashGap={(d: object) => dash((d as PathDatum).route).gap}
          pathDashAnimateTime={(d: object) => dash((d as PathDatum).route).time}
          pathTransitionDuration={0}
          pathLabel={routeTooltip}
          onPathClick={(d: object) => props.onSelectRoute((d as PathDatum).route.id)}
          // Air lanes
          arcsData={arcs}
          arcStartLat={(d: object) => (d as Route).waypoints[0].lat}
          arcStartLng={(d: object) => (d as Route).waypoints[0].lng}
          arcEndLat={(d: object) => (d as Route).waypoints[(d as Route).waypoints.length - 1].lat}
          arcEndLng={(d: object) => (d as Route).waypoints[(d as Route).waypoints.length - 1].lng}
          arcAltitude={(d: object) => arcAltitudeFor(d as Route)}
          arcColor={(d: object) => routeColor(d as Route)}
          arcStroke={(d: object) => arcStrokeFor(d as Route)}
          arcDashLength={0.35}
          arcDashGap={0.12}
          arcDashAnimateTime={(d: object) => ((d as Route).status === 'disrupted' ? 900 : 3200)}
          arcsTransitionDuration={0}
          arcLabel={routeTooltip}
          onArcClick={(d: object) => props.onSelectRoute((d as Route).id)}
          // Nodes
          pointsData={markerStyle === 'icons' ? [] : visibleNodes}
          pointLat={(d: object) => (d as Node).lat}
          pointLng={(d: object) => (d as Node).lng}
          pointColor={(d: object) => nodeColor(d as Node)}
          pointAltitude={0.008}
          pointRadius={(d: object) => ((d as Node).status === 'operational' ? 0.26 : 0.36) * scale}
          pointsMerge={false}
          pointsTransitionDuration={0}
          pointLabel={nodeTooltip}
          labelsData={labelSize > 0 ? visibleNodes : []}
          labelLat={(d: object) => (d as Node).lat}
          labelLng={(d: object) => (d as Node).lng}
          labelText={(d: object) => (d as Node).city.split(',')[0]}
          labelSize={0.55 * labelSize * scale}
          labelDotRadius={0}
          labelColor={() => palette.muted}
          labelAltitude={0.01}
          labelResolution={2}
          labelsTransitionDuration={0}
          // Disruptions
          ringsData={activeDisruptions}
          ringLat={(d: object) => (d as Disruption).lat}
          ringLng={(d: object) => (d as Disruption).lng}
          ringColor={(d: object) => {
            const base = (d as Disruption).status === 'mitigating' ? palette.warning : palette.danger;
            return (t: number) => withAlpha(base, 1 - t);
          }}
          ringMaxRadius={(d: object) => Math.max(((d as Disruption).radiusKm / 111) * 2.2, 2.2 * scale)}
          ringPropagationSpeed={(d: object) => Math.max(((d as Disruption).radiusKm / 111) * 1.6, 1.4 * scale)}
          ringRepeatPeriod={1100}
          htmlElementsData={markers}
          htmlLat={(d: object) => (isNodeIcon(d) ? d.node.lat : (d as Disruption | NewsSignal).lat)}
          htmlLng={(d: object) => (isNodeIcon(d) ? d.node.lng : (d as Disruption | NewsSignal).lng)}
          htmlAltitude={(d: object) => (isNodeIcon(d) ? 0.012 : 0.02)}
          htmlElement={markerElement}
          htmlTransitionDuration={0}
        />
      )}
      {trackedShipmentId !== null && (
        <TrackedCard
          ref={cardRef}
          shipmentId={trackedShipmentId}
          network={network}
          following={following}
          onRecenter={() => {
            followRef.current = true;
            setFollowing(true);
          }}
          onClose={() => onTrackShipment(null)}
        />
      )}
    </div>
  );
}

function dash(route: Route): { length: number; gap: number; time: number } {
  switch (route.status) {
    case 'disrupted':
      return { length: 0.06, gap: 0.035, time: 900 };
    case 'rerouted':
      return { length: 0.025, gap: 0.015, time: 2600 };
    case 'at_risk':
      return { length: 0.2, gap: 0.04, time: 5000 };
    default:
      return { length: 1, gap: 0, time: 0 };
  }
}

function withAlpha(color: string, alpha: number): string {
  const c = new THREE.Color(color);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${Math.max(0, alpha).toFixed(3)})`;
}
