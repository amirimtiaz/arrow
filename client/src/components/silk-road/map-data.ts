/** Shared map inputs for the 3D globe and the 2D map. */
import type { Feature, Geometry, MultiLineString } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countriesTopo from 'world-atlas/countries-110m.json';
import type { Route, Shipment } from '@/module_bindings/ops/types';
import { angularDistance, createPathSampler, type LatLng, type PathSampler } from '@/lib/ops/geo';

const topology = countriesTopo as unknown as Topology<{ countries: GeometryCollection }>;
export const COUNTRIES = (feature(topology, topology.objects.countries) as { features: Feature<Geometry>[] }).features;
/**
 * Every border and coastline as lines. The wrapping 2D map strokes these instead of the country polygons, so the
 * cut a polygon gets at ±180° (Russia, Fiji, Antarctica) never shows up as a line at the seam.
 */
export const BORDERS = mesh(topology, topology.objects.countries) as MultiLineString;

/** Routes that are drawn (standby lanes stay hidden until activated). */
export function visibleRoutes(routes: Route[]): Route[] {
  return routes.filter((r) => r.status !== 'standby');
}

export function arcAltitudeFor(route: Route): number {
  const a = route.waypoints[0];
  const b = route.waypoints[route.waypoints.length - 1];
  return 0.08 + 0.32 * (angularDistance(a, b) / Math.PI);
}

/** How fast a shipment visibly advances relative to its seeded speed. */
export function movementFactor(shipmentStatus: Shipment['status'], route: Route | undefined): number {
  if (!route) return 0;
  if (shipmentStatus === 'held') return 0;
  if (route.status === 'disrupted' && shipmentStatus !== 'rerouted') return 0;
  const statusFactor = route.status === 'at_risk' ? 0.6 : 1;
  const lengthFactor = route.etaHours > route.baseEtaHours ? route.baseEtaHours / route.etaHours : 1;
  return statusFactor * lengthFactor;
}

/** Caches a sampler per route geometry so animation frames stay cheap. */
export class SamplerCache {
  private cache = new Map<number, { key: string; sampler: PathSampler }>();

  get(route: Route): PathSampler {
    const key = route.waypoints.map((p) => `${p.lat},${p.lng}`).join(';');
    const hit = this.cache.get(route.id);
    if (hit && hit.key === key) return hit.sampler;
    const sampler = createPathSampler(route.waypoints as LatLng[]);
    this.cache.set(route.id, { key, sampler });
    return sampler;
  }
}

/** Server progress + time since the last tick (ticks are every 2 s). */
export interface AnimatedShipment {
  id: number;
  routeId: number;
  progress: number;
  speed: number;
  status: string;
  receivedAt: number;
}

export const TICK_MS = 2000;

export function displayedProgress(s: AnimatedShipment, factor: number, now: number): number {
  const elapsedTicks = Math.min((now - s.receivedAt) / TICK_MS, 1.25);
  const p = s.progress + s.speed * factor * elapsedTicks;
  return p - Math.floor(p);
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
