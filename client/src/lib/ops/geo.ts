/** Geometry helpers for drawing routes and moving shipments along them. */

export interface LatLng {
  lat: number;
  lng: number;
}

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in radians. */
export function angularDistance(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Spherical interpolation between two points (t in 0..1). */
export function slerp(a: LatLng, b: LatLng, t: number): LatLng {
  const d = angularDistance(a, b);
  if (d < 1e-9) return a;
  const sinD = Math.sin(d);
  const k1 = Math.sin((1 - t) * d) / sinD;
  const k2 = Math.sin(t * d) / sinD;
  const [lat1, lng1, lat2, lng2] = [toRad(a.lat), toRad(a.lng), toRad(b.lat), toRad(b.lng)];
  const x = k1 * Math.cos(lat1) * Math.cos(lng1) + k2 * Math.cos(lat2) * Math.cos(lng2);
  const y = k1 * Math.cos(lat1) * Math.sin(lng1) + k2 * Math.cos(lat2) * Math.sin(lng2);
  const z = k1 * Math.sin(lat1) + k2 * Math.sin(lat2);
  return { lat: toDeg(Math.atan2(z, Math.hypot(x, y))), lng: toDeg(Math.atan2(y, x)) };
}

export interface PathSampler {
  at(t: number): LatLng;
  length: number;
}

/** Precomputes cumulative segment lengths so position-at-progress is cheap. */
export function createPathSampler(points: LatLng[]): PathSampler {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + angularDistance(points[i - 1], points[i]));
  const total = cumulative[cumulative.length - 1] || 1;
  return {
    length: total,
    at(t: number) {
      if (points.length === 1) return points[0];
      const target = Math.min(Math.max(t, 0), 1) * total;
      let i = 1;
      while (i < cumulative.length - 1 && cumulative[i] < target) i++;
      const segStart = cumulative[i - 1];
      const segLength = cumulative[i] - segStart || 1;
      return slerp(points[i - 1], points[i], (target - segStart) / segLength);
    },
  };
}

/** Midpoint of a path (used for labels and disruption fallbacks). */
export function pathMidpoint(points: LatLng[]): LatLng {
  return createPathSampler(points).at(0.5);
}

/** Bounding box of points with padding, for fitting 2D maps. */
export function boundsOf(points: LatLng[], padDeg = 2) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return {
    minLat: Math.min(...lats) - padDeg,
    maxLat: Math.max(...lats) + padDeg,
    minLng: Math.min(...lngs) - padDeg,
    maxLng: Math.max(...lngs) + padDeg,
  };
}
