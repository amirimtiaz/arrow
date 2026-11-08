'use client';

import clsx from 'clsx';
import { ChevronDown, Layers } from 'lucide-react';
import { useMemo } from 'react';
import type { Network } from '@/lib/ops/hooks';
import { MODE, NODE_KIND, ROUTE_STATUS } from '@/lib/ops/status';
import { useSilkRoad } from './SilkRoadState';

/** Left overlay: network stats, view sliders and the legend. */
export function MapControls({ network }: { network: Network }) {
  const { controlsOpen, setControlsOpen, viewMode, labelSize, setLabelSize, shipSize, setShipSize, rotateSpeed, setRotateSpeed } =
    useSilkRoad();

  const stats = useMemo(() => {
    const active = network.routes.filter((r) => r.status !== 'standby');
    const kinds = new Set(network.nodes.filter((n) => !n.standby).map((n) => n.kind));
    return {
      routes: active.length,
      hubs: network.nodes.filter((n) => !n.standby && ['port', 'airport', 'warehouse'].includes(n.kind)).length,
      shipments: network.shipments.length,
      modes: [...new Set(active.map((r) => r.mode))],
      kinds: [...kinds],
    };
  }, [network]);

  return (
    <div className="pointer-events-auto flex w-[250px] flex-col gap-2">
      <button
        type="button"
        onClick={() => setControlsOpen(!controlsOpen)}
        aria-expanded={controlsOpen}
        className="flex h-9 w-fit items-center gap-1.5 rounded-lg border border-line bg-panel/95 px-3 text-[13px] font-semibold text-fg shadow-panel backdrop-blur hover:bg-panel-hover"
      >
        <ChevronDown className={clsx('size-3.5 transition-transform', !controlsOpen && '-rotate-90')} aria-hidden />
        Map Controls
      </button>

      {controlsOpen && (
        <div className="rounded-xl border border-line bg-panel/95 p-4 shadow-panel backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-fg">{viewMode === '3d' ? '3D Globe View' : '2D Map View'}</h2>
            <span className="rounded-md border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent uppercase">
              {viewMode === '3d' ? 'Globe' : 'Map'}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <Stat label="Active routes" value={stats.routes} />
            <Stat label="Hubs" value={stats.hubs} />
            <Stat label="Shipments" value={stats.shipments} />
            <Stat label="Modes" value={stats.modes.length} />
          </dl>

          <div className="mt-4 space-y-3">
            <Slider
              label="Label size"
              value={labelSize}
              min={0}
              max={1.5}
              step={0.1}
              format={(v) => `${v.toFixed(1)}×`}
              onChange={setLabelSize}
            />
            <Slider label="Shipment size" value={shipSize} min={1} max={4} step={0.5} format={(v) => v.toFixed(1)} onChange={setShipSize} />
            {viewMode === '3d' && (
              <Slider
                label="Auto-rotate"
                value={rotateSpeed}
                min={0}
                max={1.5}
                step={0.1}
                format={(v) => (v === 0 ? 'Off' : `${v.toFixed(1)}×`)}
                onChange={setRotateSpeed}
              />
            )}
          </div>

          <div className="mt-4 border-t border-line pt-3">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Layers className="size-3.5 text-accent" aria-hidden />
              Legend
            </h3>
            <ul className="mt-2 space-y-1.5 text-[11px] text-muted">
              {(['healthy', 'at_risk', 'disrupted', 'rerouted'] as const).map((status) => {
                const meta = ROUTE_STATUS[status];
                const Icon = meta.icon;
                return (
                  <li key={status} className="flex items-center gap-2">
                    <span
                      className={clsx('h-0.5 w-5 rounded', status === 'rerouted' && 'border-t-2 border-dashed bg-transparent')}
                      style={status === 'rerouted' ? { borderColor: 'var(--cyan)' } : { background: `var(--${meta.cssVar})` }}
                    />
                    <Icon className={clsx('size-3', meta.text)} aria-hidden />
                    {meta.label} route
                  </li>
                );
              })}
              {stats.kinds.map((kind) => {
                const meta = NODE_KIND[kind];
                if (!meta) return null;
                return (
                  <li key={kind} className="flex items-center gap-2">
                    <span className="ml-1.5 size-2 rounded-full" style={{ background: `var(--${meta.cssVar})` }} />
                    <meta.icon className="ml-1 size-3" aria-hidden />
                    {meta.label}
                  </li>
                );
              })}
              <li className="flex items-center gap-2">
                <span className="ml-1.5 size-2 rounded-full bg-fg" />
                <span className="ml-1">Shipment ({stats.modes.map((m) => MODE[m]?.label).join(', ')})</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="ml-1 grid size-3 place-items-center rounded-full bg-danger text-[8px] font-black text-white">!</span>
                <span className="ml-1">Disruption zone</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-bold text-fg tabular-nums">{value}</dd>
    </div>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format(v: number): string;
  onChange(v: number): void;
}) {
  const id = `slider-${props.label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <label htmlFor={id} className="text-muted">
          {props.label}
        </label>
        <span className="font-semibold text-accent tabular-nums">{props.format(props.value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--accent)]"
      />
    </div>
  );
}
