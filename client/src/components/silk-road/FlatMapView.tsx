'use client';

/** 2D Silk Road map (d3-geo + SVG) fitted to the workspace's network. */
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Disruption, Node, Route } from '@/module_bindings/ops/types';
import { NODE_KIND, ROUTE_STATUS } from '@/lib/ops/status';
import { COUNTRIES, displayedProgress, movementFactor, SamplerCache, visibleRoutes, type AnimatedShipment } from './map-data';
import type { GlobeViewProps } from './GlobeView';

const STATUS_STROKE: Record<string, string> = {
  healthy: 'var(--success)',
  at_risk: 'var(--warning)',
  disrupted: 'var(--danger)',
  rerouted: 'var(--cyan)',
};

export default function FlatMapView(props: GlobeViewProps) {
  const { network, disruptions, focused, selectedRouteId, labelSize, shipSize } = props;
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

  const projection = useMemo(() => {
    const p = geoNaturalEarth1();
    if (size.width === 0 || network.nodes.length === 0) return p;
    const pad = Math.min(size.width, size.height) * 0.1;
    const coordinates = network.nodes.map((n) => [n.lng, n.lat]);
    p.fitExtent(
      [
        [pad, pad],
        [size.width - pad, size.height - pad],
      ],
      { type: 'MultiPoint', coordinates }
    );
    return p;
  }, [size, network.nodes]);

  const path = useMemo(() => geoPath(projection), [projection]);
  const countryPaths = useMemo(() => COUNTRIES.map((f) => path(f) ?? ''), [path]);
  const affected = useMemo(() => new Set(focused?.affectedRouteIds ?? []), [focused]);

  // Animate shipment dots by writing directly to the SVG (no React re-render per frame).
  const dotsRef = useRef<SVGGElement>(null);
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
    let frame = 0;
    const animate = () => {
      const group = dotsRef.current;
      if (group) {
        const now = performance.now();
        const list = [...shipmentsRef.current.values()];
        while (group.childNodes.length < list.length) {
          group.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'circle'));
        }
        while (group.childNodes.length > list.length) group.lastChild?.remove();
        list.forEach((s, i) => {
          const circle = group.childNodes[i] as SVGCircleElement;
          const route = routesRef.current.get(s.routeId);
          if (!route || route.status === 'standby') {
            circle.setAttribute('r', '0');
            return;
          }
          const at = samplers.get(route).at(displayedProgress(s, movementFactor(s.status, route), now));
          const xy = projection([at.lng, at.lat]);
          if (!xy) return;
          circle.setAttribute('cx', xy[0].toFixed(1));
          circle.setAttribute('cy', xy[1].toFixed(1));
          circle.setAttribute('r', String(1.2 + shipSize * 0.7));
          circle.setAttribute(
            'fill',
            s.status === 'delayed'
              ? 'var(--danger)'
              : s.status === 'held'
                ? 'var(--warning)'
                : s.status === 'rerouted'
                  ? 'var(--cyan)'
                  : 'var(--text)'
          );
        });
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [projection, shipSize, samplers]);

  const lineFor = (route: Route) => path({ type: 'LineString', coordinates: route.waypoints.map((p) => [p.lng, p.lat]) }) ?? '';
  const emphasised = (route: Route) => route.id === selectedRouteId || affected.has(route.id) || route.status === 'disrupted';
  const activeDisruptions = disruptions.filter((d) => d.status !== 'resolved');

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden" aria-label="2D map of supply-chain routes">
      {size.width > 0 && (
        <svg width={size.width} height={size.height} className="block">
          <rect width={size.width} height={size.height} fill="var(--globe-ocean)" opacity={0.55} />
          <g>
            {countryPaths.map((d, i) => (
              <path key={i} d={d} fill="var(--globe-land)" stroke="var(--globe-border)" strokeWidth={0.6} />
            ))}
          </g>
          <g fill="none" strokeLinecap="round">
            {routes.map((route) => (
              <path
                key={route.id}
                d={lineFor(route)}
                stroke={STATUS_STROKE[route.status] ?? 'var(--success)'}
                strokeWidth={emphasised(route) ? 2.6 : 1.3}
                strokeDasharray={
                  route.status === 'rerouted' ? '6 4' : route.mode === 'air' ? '2 4' : route.status === 'disrupted' ? '5 3' : undefined
                }
                opacity={route.status === 'healthy' ? 0.75 : 1}
                className="cursor-pointer"
                onClick={() => props.onSelectRoute(route.id)}
              >
                <title>{`${route.label} · ${route.mode.toUpperCase()} · ${ROUTE_STATUS[route.status]?.label ?? route.status}`}</title>
              </path>
            ))}
          </g>
          <g>
            {nodes.map((node) => (
              <NodeDot key={node.id} node={node} projection={projection} labelSize={labelSize} />
            ))}
          </g>
          <g ref={dotsRef} />
          <g>
            {activeDisruptions.map((d) => (
              <DisruptionPin key={String(d.id)} disruption={d} projection={projection} onClick={() => props.onFocusDisruption(d.id)} />
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}

type Projector = (p: [number, number]) => [number, number] | null;

function NodeDot({ node, projection, labelSize }: { node: Node; projection: Projector; labelSize: number }) {
  const xy = projection([node.lng, node.lat]);
  if (!xy) return null;
  const color =
    node.status === 'offline'
      ? 'var(--danger)'
      : node.status === 'degraded'
        ? 'var(--warning)'
        : `var(--${NODE_KIND[node.kind]?.cssVar ?? 'accent'})`;
  return (
    <g transform={`translate(${xy[0]},${xy[1]})`}>
      <circle r={4} fill={color} stroke="var(--panel)" strokeWidth={1.5}>
        <title>{`${node.name} · ${NODE_KIND[node.kind]?.label ?? node.kind}`}</title>
      </circle>
      {labelSize > 0 && (
        <text x={7} y={3} fontSize={10 + labelSize * 4} fill="var(--muted)" className="pointer-events-none select-none">
          {node.city.split(',')[0]}
        </text>
      )}
    </g>
  );
}

function DisruptionPin({ disruption, projection, onClick }: { disruption: Disruption; projection: Projector; onClick(): void }) {
  const xy = projection([disruption.lng, disruption.lat]);
  if (!xy) return null;
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
