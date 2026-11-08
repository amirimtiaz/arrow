/**
 * Real-world shipping-lane waypoints (approximate) so sea routes and
 * reroutes trace believable paths on the globe.
 */
import type { Point } from './types';

/** South China Sea → Malacca Strait → Indian Ocean (south of Sri Lanka). */
export const SOUTH_CHINA_SEA_TO_INDIAN_OCEAN: Point[] = [
  [16.0, 112.5],
  [8.0, 108.0],
  [2.0, 104.6],
  [2.6, 101.2],
  [5.8, 97.2],
  [5.6, 80.6],
];

/** Indian Ocean → Bab-el-Mandeb → Red Sea → Suez → Mediterranean → Gibraltar. */
export const SUEZ_TO_GIBRALTAR: Point[] = [
  [12.2, 52.0],
  [12.6, 43.4],
  [20.5, 38.4],
  [27.5, 34.0],
  [29.9, 32.55],
  [31.4, 32.3],
  [33.8, 26.0],
  [36.4, 14.0],
  [37.6, 9.5],
  [35.95, -5.6],
];

/** Gibraltar → Portugal → Ushant → English Channel. */
export const GIBRALTAR_TO_CHANNEL: Point[] = [
  [37.0, -9.6],
  [43.5, -10.0],
  [48.4, -5.6],
  [50.1, -1.2],
  [51.1, 1.7],
];

/** Indian Ocean → Cape of Good Hope → West Africa → Ushant (Suez bypass). */
export const CAPE_OF_GOOD_HOPE: Point[] = [
  [-4.0, 68.0],
  [-20.0, 52.0],
  [-31.5, 33.0],
  [-35.2, 20.0],
  [-34.6, 17.6],
  [-26.0, 8.5],
  [-8.0, -2.0],
  [6.0, -16.0],
  [16.0, -20.5],
  [28.0, -16.8],
  [38.0, -12.0],
  [48.4, -5.6],
  [50.1, -1.2],
  [51.1, 1.7],
];

/** Asia (Pearl River Delta) → North Pacific → Southern California. */
export const TRANSPACIFIC_SOUTH: Point[] = [
  [23.6, 121.8],
  [30.0, 140.0],
  [38.0, 160.0],
  [41.0, -175.0],
  [39.5, -150.0],
  [35.0, -127.0],
];

/** East China Sea (Shanghai) → North Pacific → Southern California. */
export const TRANSPACIFIC_NORTH: Point[] = [
  [31.0, 127.0],
  [36.0, 145.0],
  [43.0, 165.0],
  [45.0, -170.0],
  [41.5, -148.0],
  [35.2, -126.0],
];

/** Shanghai → Panama Canal → Caribbean → US East Coast. */
export const PANAMA_TO_EAST_COAST: Point[] = [
  [28.0, 132.0],
  [21.0, 160.0],
  [15.0, -170.0],
  [11.0, -135.0],
  [8.0, -95.0],
  [7.6, -79.6],
  [9.3, -79.9],
  [12.5, -78.5],
  [19.8, -74.2],
  [24.5, -77.0],
  [29.5, -79.6],
];

/** Vietnam → Pacific → Southern California. */
export const VIETNAM_TO_CALIFORNIA: Point[] = [
  [12.5, 112.0],
  [20.0, 124.0],
  [30.0, 145.0],
  [38.0, 165.0],
  [40.0, -170.0],
  [38.0, -148.0],
  [34.5, -126.0],
];

/** Puerto Rico → Atlantic → Jacksonville. */
export const SAN_JUAN_TO_JACKSONVILLE: Point[] = [
  [19.6, -66.5],
  [23.5, -72.5],
  [27.5, -77.8],
  [30.2, -80.6],
];
