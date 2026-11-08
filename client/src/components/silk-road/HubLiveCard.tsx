'use client';

/**
 * Hover card for a hub on the Silk Road: a simulated live camera view (a still with a slow pan, scanlines and a
 * running clock) plus the hub's live lane and shipment counts from SpacetimeDB. The parent positions it by setting
 * `transform` on the forwarded ref, so following the pointer never re-renders React.
 */
import clsx from 'clsx';
import Image from 'next/image';
import { forwardRef, useEffect, useMemo, useState } from 'react';
import type { Network } from '@/lib/ops/hooks';
import { NODE_KIND, ROUTE_STATUS } from '@/lib/ops/status';
import type { Node } from '@/module_bindings/ops/types';
import { hubPhoto } from './globe-extras';

const NODE_STATUS = {
  operational: ROUTE_STATUS.healthy,
  degraded: ROUTE_STATUS.at_risk,
  offline: ROUTE_STATUS.disrupted,
} as const;

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export const HubLiveCard = forwardRef<HTMLDivElement, { node: Node | null; network: Network }>(function HubLiveCard({ node, network }, ref) {
  const now = useClock();
  const stats = useMemo(() => {
    if (!node) return null;
    const inbound = network.routes.filter((r) => r.toNodeId === node.id && r.status !== 'standby');
    const outbound = network.routes.filter((r) => r.fromNodeId === node.id && r.status !== 'standby');
    const enRoute = inbound.reduce((n, r) => n + (network.shipmentsByRoute.get(r.id)?.length ?? 0), 0);
    const departing = outbound.reduce((n, r) => n + (network.shipmentsByRoute.get(r.id)?.length ?? 0), 0);
    const atRisk = [...inbound, ...outbound].filter((r) => r.status === 'disrupted' || r.status === 'at_risk').length;
    return { inbound: inbound.length, outbound: outbound.length, enRoute, departing, atRisk };
  }, [node, network]);

  const status = node ? (NODE_STATUS[node.status as keyof typeof NODE_STATUS] ?? NODE_STATUS.operational) : null;
  const kind = node ? NODE_KIND[node.kind] : undefined;

  return (
    <div
      ref={ref}
      aria-hidden={!node}
      className={clsx(
        'pointer-events-none absolute top-0 left-0 z-20 w-[284px] transition-opacity duration-150',
        node ? 'opacity-100' : 'opacity-0'
      )}
    >
      {node && stats && status && (
        <div className="overflow-hidden rounded-xl border border-line bg-panel/97 shadow-panel backdrop-blur">
          <div className="relative aspect-[16/10] overflow-hidden bg-black">
            <Image key={node.id} src={hubPhoto(node)} alt="" fill sizes="284px" className="live-cam-img object-cover" />
            <div className="live-cam-scan absolute inset-0" aria-hidden />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-2 text-[10px] font-bold tracking-wide text-white">
              <span className="flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5">
                <span className="rec-dot size-1.5 rounded-full bg-[#ff3b3b]" aria-hidden />
                LIVE
              </span>
              <span className="rounded bg-black/55 px-1.5 py-0.5 font-mono">CAM-{String(node.id).padStart(3, '0')}</span>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-linear-to-t from-black/75 to-transparent px-2 pt-6 pb-1.5 font-mono text-[10px] text-white/90">
              <span>{now.toLocaleTimeString([], { hour12: false })}</span>
              <span>{node.city.split(',')[0]}</span>
            </div>
          </div>
          <div className="p-2.5">
            <p className="truncate text-[13px] font-bold text-fg">{node.name}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              {kind && <kind.icon className="size-3" aria-hidden />}
              {kind?.label ?? node.kind} · {node.city}
              <span className={clsx('ml-auto flex items-center gap-1 font-semibold', status.text)}>
                <status.icon className="size-3" aria-hidden />
                {node.status === 'operational' ? 'Operational' : node.status === 'degraded' ? 'Degraded' : 'Offline'}
              </span>
            </p>
            <dl className="mt-2 grid grid-cols-4 gap-1 text-center">
              {[
                ['Inbound', stats.inbound],
                ['Outbound', stats.outbound],
                ['En route', stats.enRoute],
                ['Departing', stats.departing],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md bg-panel-2 px-1 py-1">
                  <dd className="text-[13px] font-bold text-fg tabular-nums">{value}</dd>
                  <dt className="text-[9.5px] text-muted">{label}</dt>
                </div>
              ))}
            </dl>
            {stats.atRisk > 0 && (
              <p className="mt-1.5 text-[10.5px] font-semibold text-warning">
                {stats.atRisk} lane{stats.atRisk === 1 ? '' : 's'} at risk or disrupted
              </p>
            )}
            <p className="mt-1.5 text-[9.5px] text-faint">Simulated camera feed · live lane counts</p>
          </div>
        </div>
      )}
    </div>
  );
});
