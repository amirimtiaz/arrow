/**
 * Extra Silk Road layers shared by the 3D globe and the 2D map: arrowheads at the end of every lane, vehicle icons
 * for moving shipments, and the activity heatmap (countries shaded blue, hubs raised as pillars by how many
 * shipments move through them). Everything here is derived from the live SpacetimeDB network; nothing is stored.
 */
import { geoCentroid, geoContains, geoDistance } from 'd3-geo';
import type { Feature, Geometry } from 'geojson';
import * as THREE from 'three';
import type { Network } from '@/lib/ops/hooks';
import type { LatLng } from '@/lib/ops/geo';
import type { Route } from '@/module_bindings/ops/types';
import { COUNTRIES } from './map-data';

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Initial great-circle bearing from a to b, in degrees clockwise from north. */
export function bearing(a: LatLng, b: LatLng): number {
  const [φ1, φ2, Δλ] = [toRad(a.lat), toRad(b.lat), toRad(b.lng - a.lng)];
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** The point `distDeg` degrees of arc from p along `bearingDeg`. */
export function offsetPoint(p: LatLng, bearingDeg: number, distDeg: number): LatLng {
  const [φ1, λ1, θ, δ] = [toRad(p.lat), toRad(p.lng), toRad(bearingDeg), toRad(distDeg)];
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: toDeg(φ2), lng: ((toDeg(λ2) + 540) % 360) - 180 };
}

/**
 * Arrowhead at the end of a lane, pointing the way cargo arrives: [tip, left, right]. The tip stops just short of the
 * destination hub so the hub marker stays readable. Air lanes point along the great circle from the origin.
 */
export function arrowHead(route: Route, sizeDeg: number): [LatLng, LatLng, LatLng] {
  const pts = route.waypoints;
  const end = pts[pts.length - 1];
  const prev = route.mode === 'air' || pts.length < 2 ? pts[0] : pts[pts.length - 2];
  const back = bearing(end, prev);
  const tip = offsetPoint(end, back, sizeDeg * 0.3);
  const base = offsetPoint(end, back, sizeDeg * 1.3);
  return [tip, offsetPoint(base, back + 90, sizeDeg * 0.48), offsetPoint(base, back - 90, sizeDeg * 0.48)];
}

/** Changes only when a lane's geometry or status changes, so map layers aren't rebuilt on every 2-second tick. */
export function routesSignature(routes: Route[]): string {
  return routes
    .map((r) => {
      const a = r.waypoints[0];
      const b = r.waypoints[r.waypoints.length - 1];
      return `${r.id}:${r.status}:${r.mode}:${r.waypoints.length}:${a?.lat},${a?.lng}:${b?.lat},${b?.lng}`;
    })
    .join('|');
}

/* ── Activity heatmap ─────────────────────────────────────────────────────────── */

const COUNTRY_ALIASES: Record<string, string> = {
  USA: 'United States of America',
  US: 'United States of America',
  'United States': 'United States of America',
  UK: 'United Kingdom',
  'Hong Kong': 'China',
  Czechia: 'Czech Republic',
};

type CountryFeature = Feature<Geometry, { name?: string }>;
const FEATURES = COUNTRIES as CountryFeature[];
const BY_NAME = new Map(FEATURES.map((f) => [f.properties?.name ?? '', f]));
const CENTROIDS = FEATURES.map((f) => ({ f, c: geoCentroid(f) }));
const countryCache = new Map<string, CountryFeature | null>();

/** The country polygon a hub sits in: by name first, then by containment, then the nearest country (small islands, ports). */
function countryOf(name: string, lat: number, lng: number): CountryFeature | null {
  const cacheKey = `${name}|${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = countryCache.get(cacheKey);
  if (cached !== undefined) return cached;
  let hit = BY_NAME.get(COUNTRY_ALIASES[name] ?? name) ?? FEATURES.find((f) => geoContains(f, [lng, lat])) ?? null;
  if (!hit) {
    let best: { f: CountryFeature; d: number } | null = null;
    for (const { f, c } of CENTROIDS) {
      const d = geoDistance(c, [lng, lat]);
      if (!best || d < best.d) best = { f, d };
    }
    hit = best && best.d < 0.14 ? best.f : null;
  }
  countryCache.set(cacheKey, hit);
  return hit;
}

export interface Activity {
  /** Shipments moving into or out of each hub. */
  byNode: Map<number, number>;
  maxNode: number;
  byCountry: Map<object, number>;
  maxCountry: number;
  /** Changes only when the shading or pillar heights would visibly change. */
  signature: string;
}

export function computeActivity(network: Network): Activity {
  const byNode = new Map<number, number>();
  for (const s of network.shipments) {
    const route = network.routesById.get(s.routeId);
    if (!route || route.status === 'standby') continue;
    byNode.set(route.fromNodeId, (byNode.get(route.fromNodeId) ?? 0) + 1);
    byNode.set(route.toNodeId, (byNode.get(route.toNodeId) ?? 0) + 1);
  }
  const byCountry = new Map<object, number>();
  for (const [id, count] of byNode) {
    const node = network.nodesById.get(id);
    if (!node) continue;
    const country = countryOf(node.country, node.lat, node.lng);
    if (country) byCountry.set(country, (byCountry.get(country) ?? 0) + count);
  }
  const maxNode = Math.max(1, ...byNode.values());
  const maxCountry = Math.max(1, ...byCountry.values());
  const signature = [...byNode.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, n]) => `${id}:${Math.round((n / maxNode) * 12)}`)
    .join(',');
  return { byNode, maxNode, byCountry, maxCountry, signature };
}

/** Activity → blue: the land colour for none, deepening to a bright blue for the busiest country. */
export function heatColor(base: string, heat: string, t: number): string {
  if (t <= 0) return base;
  const c = new THREE.Color(base).lerp(new THREE.Color(heat), 0.18 + 0.52 * Math.sqrt(Math.min(1, t)));
  return `#${c.getHexString()}`;
}

/* ── Vehicle icons ───────────────────────────────────────────────────────────── */

export const VEHICLE_MODES = ['sea', 'air', 'rail', 'truck'] as const;
export const VEHICLE_INDEX: Record<string, number> = { sea: 0, air: 1, rail: 2, truck: 3 };
const CELL = 128;

/**
 * One texture with a white ship, plane, train and truck side by side, drawn from the lucide icon markup the
 * component renders off-screen. Drawn asynchronously; the texture updates itself once the icons have loaded.
 */
export function createVehicleAtlas(markup: Record<string, string>): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * VEHICLE_MODES.length;
  canvas.height = CELL;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const ctx = canvas.getContext('2d');
  if (!ctx) return texture;
  VEHICLE_MODES.forEach((mode, i) => {
    let svg = markup[mode];
    if (!svg) return;
    svg = svg.replace(/currentColor/g, '#ffffff').replace(/stroke-width="[^"]*"/, 'stroke-width="2.6"');
    if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    svg = svg.replace(/width="[^"]*"/, `width="${CELL}"`).replace(/height="[^"]*"/, `height="${CELL}"`);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, i * CELL, 0, CELL, CELL);
      texture.needsUpdate = true;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  return texture;
}

/**
 * Points drawn as round badges: a status-coloured disc with a dark rim and the vehicle glyph in white, always facing
 * the camera at a fixed pixel size.
 */
export function createVehicleMaterial(atlas: THREE.Texture, sizePx: number, pixelRatio: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { atlas: { value: atlas }, size: { value: sizePx * pixelRatio } },
    vertexShader: /* glsl */ `
      attribute vec3 tint;
      attribute float icon;
      uniform float size;
      varying vec3 vTint;
      varying float vIcon;
      void main() {
        vTint = tint;
        vIcon = icon;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D atlas;
      varying vec3 vTint;
      varying float vIcon;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c);
        if (r > 0.5) discard;
        float alpha = smoothstep(0.5, 0.46, r);
        vec3 col = mix(vTint, vec3(0.03, 0.06, 0.11), smoothstep(0.37, 0.41, r));
        vec2 local = gl_PointCoord * 1.5 - 0.25;
        if (local.x > 0.0 && local.x < 1.0 && local.y > 0.0 && local.y < 1.0) {
          float glyph = texture2D(atlas, vec2((vIcon + local.x) / 4.0, 1.0 - local.y)).a;
          col = mix(col, vec3(1.0), glyph);
        }
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

/* ── Hub live-camera photos ──────────────────────────────────────────────────── */

const HUB_PHOTOS: Record<string, string[]> = {
  port: ['/images/app/hubs/port-1.jpg', '/images/app/hubs/port-2.jpg', '/images/app/hubs/port-3.jpg'],
  airport: ['/images/app/hubs/airport-1.jpg', '/images/app/hubs/airport-2.jpg', '/images/app/hubs/airport-3.jpg'],
  warehouse: ['/images/app/hubs/warehouse-1.jpg', '/images/app/hubs/warehouse-2.jpg', '/images/app/hubs/dc-1.jpg'],
  factory: ['/images/app/hubs/factory-1.jpg', '/images/app/hubs/factory-2.jpg'],
  supplier: ['/images/app/hubs/factory-2.jpg', '/images/app/hubs/factory-1.jpg'],
  store: ['/images/app/hubs/store-1.jpg', '/images/app/hubs/pharmacy-1.jpg', '/images/app/hubs/dc-1.jpg'],
  kitchen: ['/images/app/hubs/kitchen-1.jpg'],
};

/** A camera still for a hub, chosen by kind (and a pharmacy shot for pharmacy stores). Stable per hub. */
export function hubPhoto(node: { id: number; kind: string; name: string }): string {
  if (node.kind === 'store' && /pharm|cvs/i.test(node.name)) return '/images/app/hubs/pharmacy-1.jpg';
  if (node.kind === 'store' && /delivery station/i.test(node.name)) return node.id % 2 ? '/images/app/hubs/dc-1.jpg' : '/images/app/hubs/warehouse-2.jpg';
  const list = HUB_PHOTOS[node.kind] ?? HUB_PHOTOS.warehouse;
  return list[node.id % list.length];
}
