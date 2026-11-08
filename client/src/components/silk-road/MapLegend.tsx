'use client';

/**
 * Map legend card (Settings › Map › Legend). A draggable MapCard; colours and dot/icon style follow
 * Settings › Map › Legend colors.
 */
import clsx from 'clsx';
import { Layers } from 'lucide-react';
import { useMemo } from 'react';
import type { Network } from '@/lib/ops/hooks';
import { cssColor, nodeKey, ROUTE_LEGEND, routeKey, SHIPMENT_KEY } from '@/lib/ops/legend';
import { MODE, NODE_KIND, ROUTE_STATUS } from '@/lib/ops/status';
import { useSettings } from '@/lib/settings';
import { MapCard } from './MapCard';

export function MapLegend({ network }: { network: Network }) {
  const { settings, updateMap } = useSettings();
  const { showLegend, colors, markerStyle } = settings.map;

  const kinds = useMemo(
    () => [...new Set(network.nodes.filter((n) => !n.standby).map((n) => n.kind))].filter((k) => NODE_KIND[k]),
    [network.nodes]
  );
  const modes = useMemo(() => [...new Set(network.routes.filter((r) => r.status !== 'standby').map((r) => r.mode))], [network.routes]);

  if (!showLegend) return null;

  return (
    <MapCard
      id="legend"
      title="Legend"
      icon={Layers}
      width={214}
      anchor={{ left: 16, top: 16 }}
      onClose={() => updateMap({ showLegend: false })}
      closeTitle="Hide legend (turn it back on in Settings › Map)"
    >
      <ul className="space-y-1.5 px-3 py-2.5 text-[11px] text-muted">
        {ROUTE_LEGEND.map((status) => {
          const meta = ROUTE_STATUS[status];
          const color = cssColor(routeKey(status), colors);
          return (
            <li key={status} className="flex items-center gap-2">
              <span
                className={clsx('w-5 shrink-0', status === 'rerouted' ? 'border-t-2 border-dashed' : 'h-0.5 rounded')}
                style={status === 'rerouted' ? { borderColor: color } : { background: color }}
              />
              <meta.icon className="size-3 shrink-0" style={{ color }} aria-hidden />
              {meta.label} route
            </li>
          );
        })}
        {kinds.map((kind) => {
          const meta = NODE_KIND[kind];
          const color = cssColor(nodeKey(kind), colors);
          return (
            <li key={kind} className="flex items-center gap-2">
              <span className="grid w-5 shrink-0 place-items-center">
                {markerStyle === 'icons' ? (
                  <span
                    className="grid size-4 place-items-center rounded-full border-[1.5px] bg-panel"
                    style={{ borderColor: color, color }}
                  >
                    <meta.icon className="size-2.5" aria-hidden />
                  </span>
                ) : (
                  <span className="size-2 rounded-full" style={{ background: color }} />
                )}
              </span>
              {meta.label}
            </li>
          );
        })}
        <li className="flex items-center gap-2">
          <span className="grid w-5 shrink-0 place-items-center">
            <span className="size-2 rounded-full" style={{ background: cssColor(SHIPMENT_KEY, colors) }} />
          </span>
          Shipment{modes.length > 0 && ` (${modes.map((m) => MODE[m]?.label ?? m).join(', ')})`}
        </li>
        <li className="flex items-center gap-2">
          <span className="grid w-5 shrink-0 place-items-center">
            <span className="grid size-3.5 place-items-center rounded-full bg-danger text-[8px] font-black text-white">!</span>
          </span>
          Disruption zone
        </li>
        <li className="flex items-center gap-2">
          <span className="grid w-5 shrink-0 place-items-center">
            <span className="grid size-3.5 place-items-center rounded bg-violet text-[8px] font-black text-white">N</span>
          </span>
          Live news signal
        </li>
      </ul>
    </MapCard>
  );
}
