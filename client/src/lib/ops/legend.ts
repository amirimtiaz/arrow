/**
 * Map legend entries whose colours a viewer can customise (Settings › Map › Legend colours). Each entry has a theme
 * colour (a CSS variable); a saved hex overrides it. Disruption and news markers keep their fixed alert colours.
 */
import { NODE_KIND, ROUTE_STATUS } from './status';

export const ROUTE_LEGEND = ['healthy', 'at_risk', 'disrupted', 'rerouted'] as const;
export const SHIPMENT_KEY = 'shipment';

export const routeKey = (status: string) => `route.${status}`;
export const nodeKey = (kind: string) => `node.${kind}`;

/** CSS variable (without --) that supplies an entry's default colour. */
export function defaultVar(key: string): string {
  if (key === SHIPMENT_KEY) return 'text';
  const [group, id] = key.split('.');
  if (group === 'route') return ROUTE_STATUS[id]?.cssVar ?? 'success';
  if (group === 'node') return NODE_KIND[id]?.cssVar ?? 'accent';
  return 'accent';
}

/** Colour for CSS/SVG: the custom hex, else the theme variable. */
export function cssColor(key: string, colors: Record<string, string>): string {
  return colors[key] ?? `var(--${defaultVar(key)})`;
}

/** Colour for WebGL, which needs a concrete value: the custom hex, else the resolved theme variable. */
export function resolvedColor(key: string, colors: Record<string, string>, palette: Record<string, string>): string {
  return colors[key] ?? palette[defaultVar(key)] ?? '#3b8bff';
}

export function legendLabel(key: string): string {
  if (key === SHIPMENT_KEY) return 'Shipment in transit';
  const [group, id] = key.split('.');
  if (group === 'route') return `${ROUTE_STATUS[id]?.label ?? id} route`;
  if (group === 'node') return NODE_KIND[id]?.label ?? id;
  return key;
}

/** Accepts #RGB or #RRGGBB (with or without #) and returns lowercase #rrggbb, or null if it isn't a hex colour. */
export function normaliseHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${[...raw].map((c) => c + c).join('')}`.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`.toLowerCase();
  return null;
}
