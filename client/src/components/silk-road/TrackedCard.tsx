'use client';

/**
 * Info card pinned to the delivery being tracked on Silk Road. The map views move it every frame (by setting the
 * wrapper's transform through the ref), so the card and its halo ride along with the dot. Content updates live.
 */
import clsx from 'clsx';
import { Crosshair, Snowflake, X } from 'lucide-react';
import { forwardRef } from 'react';
import { formatHours, formatUsd } from '@/lib/format';
import type { Network } from '@/lib/ops/hooks';
import { MODE, ROUTE_STATUS, SHIPMENT_STATUS } from '@/lib/ops/status';
import { StatusChip } from '@/components/ui/primitives';

interface TrackedCardProps {
  shipmentId: number;
  network: Network;
  /** Whether the camera is following the dot (dragging the map pauses it). */
  following: boolean;
  onRecenter(): void;
  onClose(): void;
}

export const TrackedCard = forwardRef<HTMLDivElement, TrackedCardProps>(function TrackedCard(
  { shipmentId, network, following, onRecenter, onClose },
  ref
) {
  const shipment = network.shipments.find((s) => s.id === shipmentId);
  const route = shipment ? network.routesById.get(shipment.routeId) : undefined;
  if (!shipment || !route) return null;

  const from = network.nodesById.get(route.fromNodeId)?.city.split(',')[0] ?? '';
  const to = network.nodesById.get(route.toNodeId)?.city.split(',')[0] ?? '';
  const status = SHIPMENT_STATUS[shipment.status] ?? SHIPMENT_STATUS.in_transit;
  const lane = ROUTE_STATUS[route.status];
  const ModeIcon = MODE[route.mode]?.icon;
  const remainingHours = Math.max(0, route.etaHours * (1 - shipment.progress));

  return (
    // Positioned by the map view; starts hidden until the first frame places it.
    <div ref={ref} className="pointer-events-none absolute top-0 left-0 z-[15]" style={{ display: 'none' }}>
      <span className="absolute -top-3 -left-3 size-6 animate-ping rounded-full border-2 border-accent opacity-70" aria-hidden />
      <span className="absolute -top-2.5 -left-2.5 size-5 rounded-full border-2 border-accent bg-accent/15" aria-hidden />
      <div
        role="dialog"
        aria-label={`Tracking delivery ${shipment.ref}`}
        className="pointer-events-auto absolute top-0 left-4 w-[260px] -translate-y-1/2 rounded-xl border border-line bg-panel/95 p-3 shadow-panel backdrop-blur"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] font-semibold text-muted">{shipment.ref}</p>
            <p className="flex items-center gap-1.5 truncate text-[14px] font-bold text-fg">
              {shipment.goods}
              {shipment.coldChain && <Snowflake className="size-3.5 shrink-0 text-cyan" aria-label="Cold chain" />}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Stop tracking"
            title="Stop tracking (Esc)"
            className="grid size-6 shrink-0 place-items-center rounded-md text-faint hover:bg-panel-hover hover:text-fg"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>

        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
          {ModeIcon && <ModeIcon className="size-3.5 shrink-0" aria-hidden />}
          <span className="truncate">
            {from} → {to}
          </span>
        </p>
        <p className="truncate text-[11px] text-faint">{route.label}</p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusChip meta={status} />
          {lane && route.status !== 'healthy' && <StatusChip meta={lane} label={`${lane.label} lane`} />}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-faint/30" aria-hidden>
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-700"
              style={{ width: `${shipment.progress * 100}%` }}
            />
          </div>
          <span className="text-[11px] font-semibold text-fg tabular-nums">{Math.round(shipment.progress * 100)}%</span>
        </div>

        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div>
            <dt className="text-muted">Value</dt>
            <dd className="font-semibold text-fg tabular-nums">{formatUsd(shipment.valueUsd)}</dd>
          </div>
          <div>
            <dt className="text-muted">Units</dt>
            <dd className="font-semibold text-fg tabular-nums">{shipment.units.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted">Priority</dt>
            <dd className="font-semibold text-fg capitalize">{shipment.priority}</dd>
          </div>
          <div>
            <dt className="text-muted">{shipment.delayHours > 0 ? 'Running late' : 'Time left'}</dt>
            <dd className={clsx('font-semibold tabular-nums', shipment.delayHours > 0 ? 'text-danger' : 'text-fg')}>
              {formatHours(shipment.delayHours > 0 ? shipment.delayHours : remainingHours)}
            </dd>
          </div>
        </dl>

        {!following && (
          <button
            type="button"
            onClick={onRecenter}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-[12px] font-semibold text-accent hover:bg-panel-hover"
          >
            <Crosshair className="size-3.5" aria-hidden />
            Follow again
          </button>
        )}
      </div>
    </div>
  );
});
