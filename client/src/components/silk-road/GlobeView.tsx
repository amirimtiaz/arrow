'use client';

/**
 * 3D Silk Road globe (react-globe.gl / three.js). Loaded with ssr:false.
 *
 * Layers: countries (polygons), sea/rail/truck lanes (paths along real
 * waypoints), air lanes (arcs), nodes (points + labels), disruptions
 * (pulsing rings + clickable "!" markers) and shipments (a custom
 * THREE.Points layer animated every frame between 2-second server ticks).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import type { Disruption, NewsSignal, Node, Org, Route } from '@/module_bindings/ops/types';
import type { Network } from '@/lib/ops/hooks';
import { NODE_KIND, ROUTE_STATUS } from '@/lib/ops/status';
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
  onSelectRoute(id: number | null): void;
  onFocusDisruption(id: bigint): void;
}

interface PathDatum {
  route: Route;
  points: [number, number, number][];
}

export default function GlobeView(props: GlobeViewProps) {
  const { org, network, disruptions, focused, selectedRouteId, labelSize, shipSize, rotateSpeed } = props;
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
    (route: Route) => (palette ? (palette[ROUTE_STATUS[route.status]?.cssVar as keyof Palette] ?? palette.success) : '#22c55e'),
    [palette]
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
      return palette[(NODE_KIND[node.kind]?.cssVar ?? 'accent') as keyof Palette] ?? palette.accent;
    },
    [palette]
  );

  const activeDisruptions = useMemo(() => disruptions.filter((d) => d.status !== 'resolved'), [disruptions]);
  // "!" for declared disruptions, "N" for undecided Grok news signals.
  const markers = useMemo(
    () => [...activeDisruptions, ...props.signals.filter((s) => s.status === 'new')],
    [activeDisruptions, props.signals]
  );

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

  // Auto-rotate pauses while an active disruption is focused, so the camera stays on it.
  const holdCamera = !!focused && focused.status !== 'resolved';
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
      in_transit: new THREE.Color(palette.text),
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
      list.forEach((s, i) => {
        const route = routesRef.current.get(s.routeId);
        if (!route || route.status === 'standby') {
          positions.set([0, 0, 0], i * 3);
          return;
        }
        const t = displayedProgress(s, movementFactor(s.status, route), now);
        const at = samplers.get(route).at(t);
        const altitude = route.mode === 'air' ? arcAltitudeFor(route) * Math.sin(Math.PI * t) + 0.01 : 0.012;
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
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    };
  }, [ready, palette, shipSize, samplers]);

  // ── Disruption markers ("!") ──
  const onFocusRef = useRef(props.onFocusDisruption);
  const { onFocusDisruption } = props;
  useEffect(() => {
    onFocusRef.current = onFocusDisruption;
  }, [onFocusDisruption]);
  const markerElement = useCallback((d: object) => {
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
    <div ref={containerRef} className="absolute inset-0" aria-label="3D globe of supply-chain routes">
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
          pointsData={visibleNodes}
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
          htmlLat={(d: object) => (d as Disruption | NewsSignal).lat}
          htmlLng={(d: object) => (d as Disruption | NewsSignal).lng}
          htmlAltitude={0.02}
          htmlElement={markerElement}
          htmlTransitionDuration={0}
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
