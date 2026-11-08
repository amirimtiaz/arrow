'use client';

/**
 * 3D Silk Road globe (react-globe.gl / three.js). Loaded with ssr:false.
 *
 * Layers: countries (polygons, shaded blue by shipment activity), sea/rail/truck lanes (paths along real
 * waypoints), air lanes (arcs), arrowheads at every lane's destination, nodes (points + labels), activity pillars
 * rising from busy hubs, disruptions (pulsing rings + clickable "!" markers) and shipments (a custom points layer
 * drawn as ship/plane/train/truck badges, animated every frame between 2-second server ticks).
 *
 * Layer data and accessors are kept referentially stable between ticks: react-globe.gl rebuilds a layer whenever its
 * data or an accessor changes, which is what made the lanes and dashes stutter every two seconds.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import type { Disruption, NewsSignal, Node, Org, Route } from '@/module_bindings/ops/types';
import type { Network } from '@/lib/ops/hooks';
import { nodeKey, resolvedColor, routeKey, SHIPMENT_KEY } from '@/lib/ops/legend';
import { MODE, NODE_KIND, ROUTE_STATUS } from '@/lib/ops/status';
import type { MarkerStyle } from '@/lib/settings';
import { readCssVars, useTheme } from '@/lib/theme';
import {
  arrowHead,
  computeActivity,
  createVehicleAtlas,
  createVehicleMaterial,
  heatColor,
  routesSignature,
  VEHICLE_INDEX,
} from './globe-extras';
import { HubLiveCard } from './HubLiveCard';
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
  /** Country heatmap and hub pillars by shipment activity. */
  showActivity: boolean;
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
const GLOBE_RADIUS = 100;

export default function GlobeView(props: GlobeViewProps) {
  const { org, network, disruptions, focused, selectedRouteId, labelSize, shipSize, rotateSpeed, colors, markerStyle, showActivity } =
    props;
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

  // ── Lanes: only rebuilt when a lane's geometry or status changes, not on every tick ──
  const liveRoutes = useMemo(() => visibleRoutes(network.routes), [network.routes]);
  const routesSig = routesSignature(liveRoutes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const routes = useMemo(() => liveRoutes, [routesSig]);
  const routesByIdRef = useRef(network.routesById);
  const shipmentsByRouteRef = useRef(network.shipmentsByRoute);
  useEffect(() => {
    routesByIdRef.current = network.routesById;
    shipmentsByRouteRef.current = network.shipmentsByRoute;
  }, [network.routesById, network.shipmentsByRoute]);

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

  // ── Hubs ──
  const visibleNodesLive = useMemo(() => {
    const active = new Set(routes.flatMap((r) => [r.fromNodeId, r.toNodeId]));
    return network.nodes.filter((n) => !n.standby || active.has(n.id));
  }, [network.nodes, routes]);
  const nodesSig = visibleNodesLive.map((n) => `${n.id}:${n.status}:${n.kind}`).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visibleNodes = useMemo(() => visibleNodesLive, [nodesSig]);
  useEffect(() => {
    visibleNodesRef.current = visibleNodes;
  }, [visibleNodes]);

  const nodeColor = useCallback(
    (node: Node) => {
      if (!palette) return '#3b8bff';
      if (node.status === 'offline') return palette.danger;
      if (node.status === 'degraded') return palette.warning;
      return resolvedColor(nodeKey(node.kind), colors, palette);
    },
    [palette, colors]
  );

  // Icon markup for each hub kind and vehicle mode, captured once from the hidden lucide icons rendered below.
  const iconSourceRef = useRef<HTMLDivElement>(null);
  const [iconMarkup, setIconMarkup] = useState<{ kinds: Record<string, string>; modes: Record<string, string> }>({
    kinds: {},
    modes: {},
  });
  useLayoutEffect(() => {
    const source = iconSourceRef.current;
    if (!source) return;
    const kinds: Record<string, string> = {};
    const modes: Record<string, string> = {};
    source.querySelectorAll<HTMLElement>('[data-kind]').forEach((el) => (kinds[el.dataset.kind!] = el.innerHTML));
    source.querySelectorAll<HTMLElement>('[data-mode]').forEach((el) => (modes[el.dataset.mode!] = el.innerHTML));
    setIconMarkup({ kinds, modes });
  }, []);

  const nodeIcons = useMemo<NodeIconDatum[]>(
    () =>
      markerStyle === 'icons'
        ? visibleNodes.map((node) => ({ node, color: nodeColor(node), svg: iconMarkup.kinds[node.kind] ?? '' }))
        : [],
    [markerStyle, visibleNodes, nodeColor, iconMarkup]
  );

  const activeLive = useMemo(() => disruptions.filter((d) => d.status !== 'resolved'), [disruptions]);
  const activeSig = activeLive.map((d) => `${d.id}:${d.status}:${d.radiusKm}`).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const activeDisruptions = useMemo(() => activeLive, [activeSig]);
  const newSignalsLive = useMemo(() => props.signals.filter((s) => s.status === 'new'), [props.signals]);
  const signalsSig = newSignalsLive.map((s) => String(s.id)).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const newSignals = useMemo(() => newSignalsLive, [signalsSig]);
  // "!" for declared disruptions, "N" for undecided Grok news signals.
  // Hub icons go first so alert markers draw on top of them.
  const markers = useMemo(() => [...nodeIcons, ...activeDisruptions, ...newSignals], [nodeIcons, activeDisruptions, newSignals]);
  const shipmentColor = palette ? resolvedColor(SHIPMENT_KEY, colors, palette) : '#e7edf6';

  // ── Activity: countries shaded blue and hub pillars by shipments moving through them ──
  const activityLive = useMemo(() => computeActivity(network), [network]);
  const activityRef = useRef(activityLive);
  useEffect(() => {
    activityRef.current = activityLive;
  }, [activityLive]);
  const activitySig = activityLive.signature;
  const countryColors = useMemo(() => {
    const map = new Map<object, string>();
    // A one-country network (national or metro workspaces) would just turn the whole view blue; pillars still show.
    if (!palette || !showActivity || activityLive.byCountry.size < 2) return map;
    const a = activityLive;
    for (const [feature, count] of a.byCountry) map.set(feature, heatColor(palette['globe-land'], palette.accent, count / a.maxCountry));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activitySig, palette, showActivity]);
  const polygonCapColor = useCallback(
    (f: object) => countryColors.get(f) ?? palette?.['globe-land'] ?? '#1c2533',
    [countryColors, palette]
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
      if (d < 14 && (!best || d < best.d)) best = { id, d };
    }
    return best?.id ?? null;
  };

  // ── Hub hover: a live camera card that follows the pointer ──
  const [hoverNode, setHoverNode] = useState<Node | null>(null);
  const hoverCardRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const placeHoverCard = useCallback(() => {
    const card = hoverCardRef.current;
    const el = containerRef.current;
    if (!card || !el) return;
    const { x, y } = pointerRef.current;
    const w = card.offsetWidth || 284;
    const h = card.offsetHeight || 300;
    const left = x + 18 + w > el.clientWidth ? x - w - 18 : x + 18;
    const top = Math.max(8, Math.min(y + 18, el.clientHeight - h - 8));
    card.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }, []);
  useLayoutEffect(() => {
    if (hoverNode) placeHoverCard();
  }, [hoverNode, placeHoverCard]);
  const visibleNodesRef = useRef<Node[]>([]);
  /** Hover picking: the nearest hub within a few pixels of the pointer (hub dots are small and sit under vehicles). */
  const pickNode = (x: number, y: number): Node | null => {
    const globe = globeRef.current;
    if (!globe) return null;
    const camera = globe.camera().position;
    let best: { node: Node; d: number } | null = null;
    for (const node of visibleNodesRef.current) {
      const c = globe.getCoords(node.lat, node.lng, 0.01);
      if (c.x * camera.x + c.y * camera.y + c.z * camera.z <= 0) continue;
      const s = globe.getScreenCoords(node.lat, node.lng, 0.01);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < 16 && (!best || d < best.d)) best = { node, d };
    }
    return best?.node ?? null;
  };

  // Auto-rotate: a slow spin that pauses only while a delivery is followed or a hub card is open.
  const holdCamera = trackedShipmentId !== null || hoverNode !== null;
  useEffect(() => {
    const controls = globeRef.current?.controls();
    if (!controls) return;
    controls.autoRotate = rotateSpeed > 0 && !holdCamera;
    controls.autoRotateSpeed = rotateSpeed;
    controls.enableDamping = true;
  }, [ready, rotateSpeed, holdCamera]);

  // ── Shipments: vehicle badges animated every frame ──
  const shipmentsRef = useRef(new Map<number, AnimatedShipment>());
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

  const atlas = useMemo(
    () => (Object.keys(iconMarkup.modes).length ? createVehicleAtlas(iconMarkup.modes) : null),
    [iconMarkup]
  );
  useEffect(() => () => atlas?.dispose(), [atlas]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe || !palette || !atlas) return;
    const scene = globe.scene();
    const geometry = new THREE.BufferGeometry();
    const material = createVehicleMaterial(atlas, 10 + shipSize * 3.5, globe.renderer().getPixelRatio());
    const points = new THREE.Points(geometry, material);
    points.renderOrder = 10;
    points.frustumCulled = false;
    scene.add(points);

    const statusColors: Record<string, THREE.Color> = {
      delayed: new THREE.Color(palette.danger),
      held: new THREE.Color(palette.warning),
      rerouted: new THREE.Color(palette.cyan),
      in_transit: new THREE.Color(shipmentColor),
    };
    let capacity = 0;
    let positions = new Float32Array(0);
    let tints = new Float32Array(0);
    let icons = new Float32Array(0);
    let frame = 0;

    const animate = () => {
      const list = [...shipmentsRef.current.values()];
      if (list.length !== capacity) {
        capacity = list.length;
        positions = new Float32Array(capacity * 3);
        tints = new Float32Array(capacity * 3);
        icons = new Float32Array(capacity);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3));
        geometry.setAttribute('icon', new THREE.BufferAttribute(icons, 1));
      }
      const now = performance.now();
      const live = livePosRef.current;
      live.clear();
      list.forEach((s, i) => {
        const route = routesByIdRef.current.get(s.routeId);
        if (!route || route.status === 'standby') {
          // Park hidden vehicles inside the globe, where the depth test hides them.
          positions.set([0, 0, 0], i * 3);
          return;
        }
        const t = displayedProgress(s, movementFactor(s.status, route), now);
        const at = samplers.get(route).at(t);
        const altitude = route.mode === 'air' ? arcAltitudeFor(route) * Math.sin(Math.PI * t) + 0.012 : 0.014;
        live.set(s.id, { lat: at.lat, lng: at.lng, alt: altitude });
        const c = globe.getCoords(at.lat, at.lng, altitude);
        positions[i * 3] = c.x;
        positions[i * 3 + 1] = c.y;
        positions[i * 3 + 2] = c.z;
        const color = statusColors[s.status] ?? statusColors.in_transit;
        tints[i * 3] = color.r;
        tints[i * 3 + 1] = color.g;
        tints[i * 3 + 2] = color.b;
        icons[i] = VEHICLE_INDEX[route.mode] ?? 3;
      });
      if (capacity > 0) {
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.tint.needsUpdate = true;
        geometry.attributes.icon.needsUpdate = true;
      }

      // Tracking: ease the camera toward the vehicle, then pin the card to it.
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
  }, [ready, palette, shipSize, samplers, shipmentColor, atlas]);

  // ── Arrowheads at each lane's destination (fixed on-screen size; rebuilt only on zoom steps or lane changes) ──
  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe || !palette) return;
    const sizeDeg = 2.3 * (cameraAltitude / 2.4);
    const positions: number[] = [];
    const vertexColors: number[] = [];
    for (const route of routes) {
      if (route.waypoints.length < 2) continue;
      const k = isEmphasised(route) ? 1.3 : 1;
      const color = new THREE.Color(routeColor(route));
      for (const p of arrowHead(route, sizeDeg * k)) {
        const c = globe.getCoords(p.lat, p.lng, 0.007);
        positions.push(c.x, c.y, c.z);
        vertexColors.push(color.r, color.g, color.b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 8;
    globe.scene().add(mesh);
    return () => {
      globe.scene().remove(mesh);
      geometry.dispose();
      material.dispose();
    };
  }, [ready, palette, routes, cameraAltitude, routeColor, isEmphasised]);

  // ── Activity pillars: rise from busy hubs, height by shipments moving through them ──
  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe || !showActivity) return;
    const a = activityRef.current;
    const s = org.viewAltitude / 2.4;
    const radius = 0.32 * s + 0.025;
    const maxHeight = GLOBE_RADIUS * (0.13 * s + 0.003);

    const geometry = new THREE.CylinderGeometry(1, 1, 1, 18, 1, false).translate(0, 0.5, 0);
    const bottom = new THREE.Color('#1d4ed8');
    const top = new THREE.Color('#7dd3fc');
    const pos = geometry.getAttribute('position');
    const shade: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const c = bottom.clone().lerp(top, pos.getY(i));
      shade.push(c.r, c.g, c.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(shade, 3));
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.78 });

    const group = new THREE.Group();
    const up = new THREE.Vector3(0, 1, 0);
    const bars: { mesh: THREE.Mesh; target: number }[] = [];
    for (const node of visibleNodes) {
      const count = a.byNode.get(node.id) ?? 0;
      if (count <= 0) continue;
      const base = globe.getCoords(node.lat, node.lng, 0.005);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(base.x, base.y, base.z);
      mesh.quaternion.setFromUnitVectors(up, new THREE.Vector3(base.x, base.y, base.z).normalize());
      mesh.scale.set(radius, 0.001, radius);
      group.add(mesh);
      bars.push({ mesh, target: Math.max(0.6, maxHeight * Math.sqrt(count / a.maxNode)) });
    }
    globe.scene().add(group);

    // Pillars grow up from the ground when shown, and ease to new heights as activity changes.
    let frame = 0;
    const grow = () => {
      let moving = false;
      for (const bar of bars) {
        const h = bar.mesh.scale.y;
        const next = h + (bar.target - h) * 0.07;
        if (Math.abs(bar.target - next) > 0.01) moving = true;
        bar.mesh.scale.y = next;
      }
      if (moving) frame = requestAnimationFrame(grow);
    };
    frame = requestAnimationFrame(grow);

    return () => {
      cancelAnimationFrame(frame);
      globe.scene().remove(group);
      geometry.dispose();
      material.dispose();
    };
    // Rebuilt when the activity buckets change (activitySig), not on every tick.
  }, [ready, showActivity, activitySig, visibleNodes, org.viewAltitude]);

  // ── Disruption markers ("!") and hub icons ──
  const onFocusRef = useRef(props.onFocusDisruption);
  const onSelectRouteRef = useRef(props.onSelectRoute);
  const { onFocusDisruption, onSelectRoute } = props;
  useEffect(() => {
    onFocusRef.current = onFocusDisruption;
    onSelectRouteRef.current = onSelectRoute;
  }, [onFocusDisruption, onSelectRoute]);
  const markerElement = useCallback((d: object) => {
    if (isNodeIcon(d)) {
      const el = document.createElement('span');
      el.className = 'node-icon';
      el.style.color = d.color;
      // Static lucide SVG captured from our own render above (no user content).
      el.innerHTML = d.svg;
      el.setAttribute('aria-label', `${d.node.name} · ${NODE_KIND[d.node.kind]?.label ?? d.node.kind}`);
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

  const routeTooltip = useCallback((d: object) => {
    const stale = 'route' in d ? (d as PathDatum).route : (d as Route);
    const route = routesByIdRef.current.get(stale.id) ?? stale;
    const status = ROUTE_STATUS[route.status];
    const count = shipmentsByRouteRef.current.get(route.id)?.length ?? 0;
    return `<div style="font:12px Inter,sans-serif;padding:6px 8px;border-radius:8px;background:rgba(10,15,25,.92);color:#e7edf6;border:1px solid rgba(255,255,255,.12)">
        <b>${escapeHtml(route.label)}</b> · ${escapeHtml(route.mode.toUpperCase())}<br/>
        <span style="color:#94a3b8">${escapeHtml(route.lane)}</span><br/>
        ${escapeHtml(status?.label ?? route.status)} · ${count} shipments${route.note ? `<br/><span style="color:#94a3b8">${escapeHtml(route.note)}</span>` : ''}
      </div>`;
  }, []);

  // Stable accessors: a new function on every render would make react-globe.gl rebuild the layer.
  const pathPoints = useCallback((d: object) => (d as PathDatum).points, []);
  const pathPointAlt = useCallback((p: object) => (p as number[])[2], []);
  const pathColor = useCallback((d: object) => routeColor((d as PathDatum).route), [routeColor]);
  // Ground lanes are fat lines (width in px); air lanes are tubes (width in globe units),
  // so arcs scale with the camera altitude to look the same at every zoom.
  const pathStroke = useCallback((d: object) => (isEmphasised((d as PathDatum).route) ? 3.2 : 1.8), [isEmphasised]);
  const pathDashLength = useCallback((d: object) => dash((d as PathDatum).route).length, []);
  const pathDashGap = useCallback((d: object) => dash((d as PathDatum).route).gap, []);
  const pathDashAnimateTime = useCallback((d: object) => dash((d as PathDatum).route).time, []);
  const onPathClick = useCallback((d: object) => onSelectRouteRef.current((d as PathDatum).route.id), []);

  const arcStartLat = useCallback((d: object) => (d as Route).waypoints[0].lat, []);
  const arcStartLng = useCallback((d: object) => (d as Route).waypoints[0].lng, []);
  const arcEndLat = useCallback((d: object) => (d as Route).waypoints[(d as Route).waypoints.length - 1].lat, []);
  const arcEndLng = useCallback((d: object) => (d as Route).waypoints[(d as Route).waypoints.length - 1].lng, []);
  const arcAltitude = useCallback((d: object) => arcAltitudeFor(d as Route), []);
  const arcColor = useCallback((d: object) => routeColor(d as Route), [routeColor]);
  const arcStroke = useCallback(
    (d: object) => (isEmphasised(d as Route) ? 0.7 : 0.38) * Math.min(1, Math.max(cameraAltitude / 2.4, 0.08)),
    [isEmphasised, cameraAltitude]
  );
  const arcDashAnimateTime = useCallback((d: object) => ((d as Route).status === 'disrupted' ? 900 : 3600), []);
  const onArcClick = useCallback((d: object) => onSelectRouteRef.current((d as Route).id), []);

  const nodeLat = useCallback((d: object) => (d as Node).lat, []);
  const nodeLng = useCallback((d: object) => (d as Node).lng, []);
  const pointColor = useCallback((d: object) => nodeColor(d as Node), [nodeColor]);
  const pointRadius = useCallback((d: object) => ((d as Node).status === 'operational' ? 0.3 : 0.4) * scale, [scale]);
  const labelText = useCallback((d: object) => (d as Node).city.split(',')[0], []);
  const labelColor = useCallback(() => palette?.text ?? '#e7edf6', [palette]);

  const ringLat = useCallback((d: object) => (d as Disruption).lat, []);
  const ringLng = useCallback((d: object) => (d as Disruption).lng, []);
  const ringColor = useCallback(
    (d: object) => {
      const base = (d as Disruption).status === 'mitigating' ? (palette?.warning ?? '#f5a524') : (palette?.danger ?? '#f2555a');
      return (t: number) => withAlpha(base, 1 - t);
    },
    [palette]
  );
  const ringMaxRadius = useCallback((d: object) => Math.max(((d as Disruption).radiusKm / 111) * 2.2, 2.2 * scale), [scale]);
  const ringSpeed = useCallback((d: object) => Math.max(((d as Disruption).radiusKm / 111) * 1.6, 1.4 * scale), [scale]);
  const htmlLat = useCallback((d: object) => (isNodeIcon(d) ? d.node.lat : (d as Disruption | NewsSignal).lat), []);
  const htmlLng = useCallback((d: object) => (isNodeIcon(d) ? d.node.lng : (d as Disruption | NewsSignal).lng), []);
  const htmlAltitude = useCallback((d: object) => (isNodeIcon(d) ? 0.012 : 0.02), []);
  const polygonSideColor = useCallback(() => 'rgba(0,0,0,0)', []);
  const polygonStrokeColor = useCallback(() => palette?.['globe-border'] ?? '#2a3443', [palette]);
  const onGlobeClick = useCallback(() => onSelectRouteRef.current(null), []);
  const onZoom = useCallback(
    ({ altitude }: { altitude: number }) => setCameraAltitude((prev) => (Math.abs(prev - altitude) / prev > 0.15 ? altitude : prev)),
    []
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      aria-label="3D globe of supply-chain routes. Hover a hub for its live view; click a moving vehicle to track it."
      onPointerDown={(e) => {
        press.current = { x: e.clientX, y: e.clientY, moved: false };
      }}
      onPointerMove={(e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) pointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        if (e.buttons === 0) {
          const node = pickNode(pointerRef.current.x, pointerRef.current.y);
          if (node?.id !== hoverNode?.id) setHoverNode(node);
        }
        if (hoverNode) placeHoverCard();
        const p = press.current;
        if (!p || p.moved || e.buttons === 0 || Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
        p.moved = true;
        // Rotating the globe takes the camera back from tracking; the card stays on the vehicle.
        if (trackedRef.current !== null && followRef.current) {
          followRef.current = false;
          setFollowing(false);
        }
      }}
      onPointerLeave={() => setHoverNode(null)}
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
        {Object.entries(MODE).map(([mode, meta]) => (
          <span key={mode} data-mode={mode}>
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
          onZoom={onZoom}
          onGlobeClick={onGlobeClick}
          // Countries (shaded by activity)
          polygonsData={COUNTRIES}
          polygonCapColor={polygonCapColor}
          polygonSideColor={polygonSideColor}
          polygonStrokeColor={polygonStrokeColor}
          polygonAltitude={0.003}
          polygonsTransitionDuration={0}
          // Ground lanes
          pathsData={paths}
          pathPoints={pathPoints}
          pathPointAlt={pathPointAlt}
          pathColor={pathColor}
          pathStroke={pathStroke}
          pathDashLength={pathDashLength}
          pathDashGap={pathDashGap}
          pathDashAnimateTime={pathDashAnimateTime}
          pathTransitionDuration={0}
          pathLabel={routeTooltip}
          onPathClick={onPathClick}
          // Air lanes
          arcsData={arcs}
          arcStartLat={arcStartLat}
          arcStartLng={arcStartLng}
          arcEndLat={arcEndLat}
          arcEndLng={arcEndLng}
          arcAltitude={arcAltitude}
          arcColor={arcColor}
          arcStroke={arcStroke}
          arcDashLength={0.35}
          arcDashGap={0.12}
          arcDashAnimateTime={arcDashAnimateTime}
          arcsTransitionDuration={0}
          arcLabel={routeTooltip}
          onArcClick={onArcClick}
          // Nodes
          pointsData={markerStyle === 'icons' ? [] : visibleNodes}
          pointLat={nodeLat}
          pointLng={nodeLng}
          pointColor={pointColor}
          pointAltitude={0.008}
          pointRadius={pointRadius}
          pointsMerge={false}
          pointsTransitionDuration={0}
          labelsData={labelSize > 0 ? visibleNodes : []}
          labelLat={nodeLat}
          labelLng={nodeLng}
          labelText={labelText}
          labelSize={0.55 * labelSize * scale}
          labelDotRadius={0}
          labelColor={labelColor}
          labelAltitude={0.01}
          labelResolution={2}
          labelsTransitionDuration={0}
          // Disruptions
          ringsData={activeDisruptions}
          ringLat={ringLat}
          ringLng={ringLng}
          ringColor={ringColor}
          ringMaxRadius={ringMaxRadius}
          ringPropagationSpeed={ringSpeed}
          ringRepeatPeriod={1100}
          htmlElementsData={markers}
          htmlLat={htmlLat}
          htmlLng={htmlLng}
          htmlAltitude={htmlAltitude}
          htmlElement={markerElement}
          htmlTransitionDuration={0}
        />
      )}
      <HubLiveCard ref={hoverCardRef} node={hoverNode} network={network} />
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
