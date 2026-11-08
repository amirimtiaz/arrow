'use client';

/**
 * Gear menu in the top bar. A one-tab bar shows the open section; clicking it reveals every section side by side
 * (so the list of options below is never covered). Sections:
 *   Map: label size, vehicle size, auto-rotation, legend on/off and legend colours (a slide-over page with
 *        dots-or-icons and a hex colour picker per entry).
 *   Scenarios: show or hide the scenario window, and choose which scenarios it lists.
 * Everything is a per-browser preference (lib/settings.tsx).
 */
import clsx from 'clsx';
import {
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Dices,
  Map as MapIcon,
  Radar,
  RotateCcw,
  Settings,
  Shapes,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useNetwork, useScenarioPresets } from '@/lib/ops/hooks';
import { cssColor, defaultVar, legendLabel, nodeKey, normaliseHex, ROUTE_LEGEND, routeKey, SHIPMENT_KEY } from '@/lib/ops/legend';
import { DISRUPTION_KIND, NODE_KIND, ROUTE_STATUS } from '@/lib/ops/status';
import { DEFAULT_SETTINGS, useSettings, type MarkerStyle } from '@/lib/settings';
import { Dropdown } from '@/components/ui/primitives';

type TabId = 'map' | 'scenarios';
const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'map', label: 'Map', icon: MapIcon },
  { id: 'scenarios', label: 'Scenarios', icon: TriangleAlert },
];

export function SettingsMenu() {
  // Kept outside the dropdown so the last section stays selected between openings.
  const [tab, setTab] = useState<TabId>('map');

  return (
    <Dropdown
      width="w-[340px]"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Settings"
          title="Settings"
          className={clsx(
            'grid size-8 place-items-center rounded-lg border transition-colors',
            open ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line bg-panel text-muted hover:bg-panel-hover hover:text-fg'
          )}
        >
          <Settings className={clsx('size-4 transition-transform duration-300', open && 'rotate-90')} aria-hidden />
        </button>
      )}
    >
      {() => <SettingsPanel tab={tab} onTab={setTab} />}
    </Dropdown>
  );
}

function SettingsPanel({ tab, onTab }: { tab: TabId; onTab(tab: TabId): void }) {
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="p-1.5" role="dialog" aria-label="Settings">
      <div className="flex items-center gap-2 px-1">
        <div role="tablist" aria-label="Settings sections" className="flex items-center gap-1">
          {TABS.map((t) => {
            const active = t.id === tab;
            const visible = active || showAll;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-hidden={!visible}
                tabIndex={visible ? 0 : -1}
                onClick={() => {
                  if (!showAll) return setShowAll(true);
                  onTab(t.id);
                  setShowAll(false);
                }}
                title={!showAll ? 'Show all settings sections' : undefined}
                className={clsx(
                  'flex h-8 items-center gap-1.5 overflow-hidden rounded-lg border text-[13px] font-semibold whitespace-nowrap transition-all duration-200',
                  visible ? 'max-w-[160px] px-2.5 opacity-100' : 'pointer-events-none max-w-0 border-transparent px-0 opacity-0',
                  active ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line bg-panel-2 text-muted hover:text-fg'
                )}
              >
                <t.icon className="size-3.5 shrink-0" aria-hidden />
                {t.label}
                {active && <ChevronRight className={clsx('size-3.5 shrink-0 transition-transform', showAll && 'rotate-180')} aria-hidden />}
              </button>
            );
          })}
        </div>
        <span className="ml-auto text-[10px] font-bold tracking-[0.12em] text-faint uppercase">Settings</span>
      </div>

      <div className="mt-2 border-t border-line pt-2">{tab === 'map' ? <MapSection /> : <ScenarioSection />}</div>
    </div>
  );
}

/* ───────────────────────────── Map ───────────────────────────── */

function MapSection() {
  const [page, setPage] = useState<'main' | 'legend'>('main');
  const mainRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  // The two pages sit side by side; the box takes the height of the one on screen.
  useLayoutEffect(() => {
    const el = page === 'main' ? mainRef.current : legendRef.current;
    if (!el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [page]);

  return (
    <div className="overflow-hidden transition-[height] duration-300 ease-out" style={{ height }}>
      {/* Legend page on the left, main page on the right: opening Legend colours slides everything to the right. */}
      <div
        className="flex w-[200%] items-start transition-transform duration-300 ease-out"
        style={{ transform: page === 'main' ? 'translateX(-50%)' : 'translateX(0)' }}
      >
        <div ref={legendRef} className="w-1/2 px-1" aria-hidden={page !== 'legend'} inert={page !== 'legend'}>
          <LegendColorsPage onBack={() => setPage('main')} />
        </div>
        <div ref={mainRef} className="w-1/2 px-1" aria-hidden={page !== 'main'} inert={page !== 'main'}>
          <MapMainPage onOpenLegend={() => setPage('legend')} />
        </div>
      </div>
    </div>
  );
}

function MapMainPage({ onOpenLegend }: { onOpenLegend(): void }) {
  const { settings, updateMap } = useSettings();
  const map = settings.map;

  return (
    <div className="space-y-3 py-1">
      <SliderRow
        label="Label size"
        hint="Size of place names on the map"
        value={map.labelSize}
        min={0}
        max={1.5}
        step={0.1}
        format={(v) => (v === 0 ? 'Hidden' : `${v.toFixed(1)}×`)}
        onChange={(v) => updateMap({ labelSize: v })}
      />
      <SliderRow
        label="Vehicle size"
        hint="Size of the moving ship, plane, train and truck icons"
        value={map.vehicleSize}
        min={1}
        max={4}
        step={0.5}
        format={(v) => v.toFixed(1)}
        onChange={(v) => updateMap({ vehicleSize: v })}
      />
      <SliderRow
        label="Auto rotation"
        hint="Slowly spins the 3D globe; pauses while you drag or follow an alert. 0 keeps it still."
        value={map.autoRotate}
        min={0}
        max={2}
        step={0.05}
        format={(v) => (v === 0 ? 'Off' : `${v.toFixed(2)}×`)}
        onChange={(v) => updateMap({ autoRotate: v })}
      />

      <div className="border-t border-line pt-2">
        <SwitchRow
          label="Activity heatmap"
          hint={map.showActivity ? 'Countries shaded and hubs raised by shipment activity' : 'Hidden'}
          checked={map.showActivity}
          onChange={(v) => updateMap({ showActivity: v })}
        />
      </div>

      <div className="border-t border-line pt-2">
        <SwitchRow
          label="Legend"
          hint={map.showLegend ? 'Shown on the map. Drag it anywhere.' : 'Hidden'}
          checked={map.showLegend}
          onChange={(v) => updateMap({ showLegend: v })}
        />
        <button
          type="button"
          onClick={onOpenLegend}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-1.5 py-2 text-left hover:bg-panel-hover"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-fg">Legend colors</span>
            <span className="block text-[11px] text-muted">
              {map.markerStyle === 'icons' ? 'Hubs shown as icons' : 'Hubs shown as colored dots'}
              {Object.keys(map.colors).length > 0 && ` · ${Object.keys(map.colors).length} custom`}
            </span>
          </span>
          <ColorPreviewStrip colors={map.colors} />
          <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
        </button>
      </div>

      <div className="border-t border-line pt-2">
        <SwitchRow
          label="Live news"
          hint={map.showNews ? 'Grok news card on the map. Drag it anywhere.' : 'Hidden (no news scans while off)'}
          checked={map.showNews}
          onChange={(v) => updateMap({ showNews: v })}
        />
        <SwitchRow
          label="Supply chain risk monitor"
          hint={map.showRisk ? 'Live risk chart on the map. Drag it anywhere.' : 'Hidden (still on the Live Feed tab)'}
          checked={map.showRisk}
          onChange={(v) => updateMap({ showRisk: v })}
        />
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() =>
            updateMap({
              labelSize: DEFAULT_SETTINGS.map.labelSize,
              vehicleSize: DEFAULT_SETTINGS.map.vehicleSize,
              autoRotate: DEFAULT_SETTINGS.map.autoRotate,
            })
          }
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-muted hover:bg-panel-hover hover:text-fg"
        >
          <RotateCcw className="size-3" aria-hidden />
          Reset sizes and rotation
        </button>
        <button
          type="button"
          disabled={Object.keys(map.positions).length === 0}
          onClick={() => updateMap({ positions: {} })}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-muted hover:bg-panel-hover hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <RotateCcw className="size-3" aria-hidden />
          Put cards back in their corners
        </button>
      </div>
    </div>
  );
}

function ColorPreviewStrip({ colors }: { colors: Record<string, string> }) {
  return (
    <span className="flex shrink-0 -space-x-1" aria-hidden>
      {ROUTE_LEGEND.map((s) => (
        <span key={s} className="size-3 rounded-full ring-2 ring-panel" style={{ background: cssColor(routeKey(s), colors) }} />
      ))}
    </span>
  );
}

function LegendColorsPage({ onBack }: { onBack(): void }) {
  const { settings, updateMap } = useSettings();
  const network = useNetwork();
  const [editing, setEditing] = useState<string | null>(null);
  const style = settings.map.markerStyle;

  const presentKinds = [...new Set(network.nodes.map((n) => n.kind))].filter((k) => NODE_KIND[k]);
  const kinds = presentKinds.length > 0 ? presentKinds : Object.keys(NODE_KIND);
  const customCount = Object.keys(settings.map.colors).length;

  const row = (key: string, icon: LucideIcon, swatch: 'line' | 'dashed' | 'marker') => (
    <ColorRow
      key={key}
      colorKey={key}
      icon={icon}
      swatch={swatch}
      markerStyle={style}
      open={editing === key}
      onToggle={() => setEditing((k) => (k === key ? null : key))}
    />
  );

  return (
    <div className="py-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-0.5 rounded-md py-1 pr-1.5 pl-0.5 text-[12px] font-semibold text-accent hover:bg-panel-hover"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Map
        </button>
        <h3 className="ml-1 text-[13px] font-bold text-fg">Legend colors</h3>
      </div>

      <p className="mt-2 text-[11px] text-muted">Show hubs on the map as</p>
      <div
        className="mt-1 grid grid-cols-2 gap-1 rounded-lg border border-line bg-panel-2 p-0.5"
        role="radiogroup"
        aria-label="Hub markers"
      >
        {(
          [
            ['dots', 'Colored dots', CircleDot],
            ['icons', 'Icons', Shapes],
          ] as [MarkerStyle, string, LucideIcon][]
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={style === value}
            onClick={() => updateMap({ markerStyle: value })}
            className={clsx(
              'flex h-7 items-center justify-center gap-1.5 rounded-md text-[12px] font-semibold',
              style === value ? 'bg-accent text-white' : 'text-muted hover:text-fg'
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div className="scroll-thin mt-2 max-h-[min(52vh,420px)] overflow-y-auto pr-1">
        <GroupLabel>Routes</GroupLabel>
        {ROUTE_LEGEND.map((s) => row(routeKey(s), ROUTE_STATUS[s].icon, s === 'rerouted' ? 'dashed' : 'line'))}
        <GroupLabel>Hubs</GroupLabel>
        {kinds.map((k) => row(nodeKey(k), NODE_KIND[k].icon, 'marker'))}
        <GroupLabel>Shipments</GroupLabel>
        {row(SHIPMENT_KEY, CircleDot, 'marker')}
      </div>

      <button
        type="button"
        disabled={customCount === 0}
        onClick={() => updateMap({ colors: {} })}
        className="mt-2 flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-muted hover:bg-panel-hover hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <RotateCcw className="size-3" aria-hidden />
        Reset all colors
      </button>
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="mt-2 mb-0.5 px-1 text-[10px] font-bold tracking-[0.1em] text-faint uppercase first:mt-0">{children}</p>;
}

function ColorRow(props: {
  colorKey: string;
  icon: LucideIcon;
  swatch: 'line' | 'dashed' | 'marker';
  markerStyle: MarkerStyle;
  open: boolean;
  onToggle(): void;
}) {
  const { colorKey, icon: Icon, swatch, markerStyle, open, onToggle } = props;
  const { settings } = useSettings();
  const color = cssColor(colorKey, settings.map.colors);
  const custom = colorKey in settings.map.colors;
  const label = legendLabel(colorKey);

  return (
    <div>
      <div className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
        <span className="grid w-6 shrink-0 place-items-center" aria-hidden>
          {swatch === 'marker' ? (
            markerStyle === 'icons' && colorKey !== SHIPMENT_KEY ? (
              <span className="grid size-5 place-items-center rounded-full border-[1.5px] bg-panel" style={{ borderColor: color, color }}>
                <Icon className="size-3" />
              </span>
            ) : (
              <span className="size-2.5 rounded-full" style={{ background: color }} />
            )
          ) : (
            <span
              className={clsx('w-5', swatch === 'dashed' ? 'border-t-2 border-dashed' : 'h-0.5 rounded')}
              style={swatch === 'dashed' ? { borderColor: color } : { background: color }}
            />
          )}
        </span>
        {swatch !== 'marker' && <Icon className="size-3.5 shrink-0" style={{ color }} aria-hidden />}
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">
          {label}
          {custom && <span className="ml-1.5 text-[10px] font-semibold text-faint">custom</span>}
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`Change color for ${label}`}
          title="Change color"
          className={clsx(
            'size-6 shrink-0 rounded-md border-2 shadow-sm transition-transform hover:scale-110',
            open ? 'border-accent' : 'border-line-strong'
          )}
          style={{ background: color }}
        />
      </div>
      {open && <ColorEditor colorKey={colorKey} label={label} />}
    </div>
  );
}

/** Hex colour picker for one legend entry: the system colour picker plus a hex field and a reset. */
function ColorEditor({ colorKey, label }: { colorKey: string; label: string }) {
  const { settings, setColor } = useSettings();
  const custom = settings.map.colors[colorKey];
  const [fallback, setFallback] = useState('#3b8bff');
  const hex = custom ?? fallback;
  const [draft, setDraft] = useState(hex);

  // Resolve the theme default to a hex so the picker can start from it.
  useEffect(() => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(`--${defaultVar(colorKey)}`)
      .trim();
    const normalised = normaliseHex(value);
    if (normalised) setFallback(normalised);
  }, [colorKey]);

  useEffect(() => setDraft(hex), [hex]);
  const valid = normaliseHex(draft) !== null;

  return (
    <div className="mb-1.5 ml-9 flex items-center gap-2 rounded-lg border border-line bg-panel-2 p-2">
      <input
        type="color"
        value={hex}
        onChange={(e) => setColor(colorKey, e.target.value)}
        aria-label={`Pick a color for ${label}`}
        className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-line bg-transparent p-0.5"
      />
      <label className="flex min-w-0 flex-1 items-center rounded-md border border-line bg-panel px-2 focus-within:border-accent">
        <span className="font-mono text-[12px] text-faint">#</span>
        <input
          value={draft.replace(/^#/, '')}
          onChange={(e) => {
            const next = e.target.value.slice(0, 7);
            setDraft(next);
            const normalised = normaliseHex(next);
            if (normalised && next.replace(/^#/, '').length === 6) setColor(colorKey, normalised);
          }}
          onBlur={() => {
            const normalised = normaliseHex(draft);
            if (normalised) setColor(colorKey, normalised);
            else setDraft(hex);
          }}
          spellCheck={false}
          aria-label={`Hex color for ${label}`}
          aria-invalid={!valid}
          className={clsx(
            'h-7 w-full min-w-0 bg-transparent font-mono text-[12px] uppercase outline-none',
            valid ? 'text-fg' : 'text-danger'
          )}
        />
      </label>
      <button
        type="button"
        disabled={!custom}
        onClick={() => setColor(colorKey, null)}
        className="shrink-0 rounded-md px-1.5 py-1 text-[11px] font-semibold text-muted hover:bg-panel-hover hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent"
      >
        Default
      </button>
    </div>
  );
}

/* ─────────────────────────── Scenarios ─────────────────────────── */

function ScenarioSection() {
  const { settings, updateScenarios } = useSettings();
  const presets = useScenarioPresets();
  const { showWindow, hidden } = settings.scenarios;
  const hiddenSet = new Set(hidden);

  const toggle = (id: string, show: boolean) =>
    updateScenarios({ hidden: show ? hidden.filter((h) => h !== id) : [...new Set([...hidden, id])] });

  const entries: { id: string; label: string; icon: LucideIcon; tag: string }[] = [
    ...presets.map((p) => ({
      id: `${p.orgId}:${p.key}`,
      label: p.shortLabel,
      icon: DISRUPTION_KIND[p.kind]?.icon ?? TriangleAlert,
      tag: p.tag,
    })),
    { id: 'random', label: 'Random disruption', icon: Dices, tag: 'Generate' },
    { id: 'congestion', label: 'Simulate congestion', icon: Radar, tag: 'Tiger' },
  ];
  const shownCount = entries.filter((e) => !hiddenSet.has(e.id)).length;

  return (
    <div className="space-y-2 px-1 py-1">
      <SwitchRow
        label="Scenario window"
        hint={showWindow ? 'Shown on the map (press S to toggle)' : 'Hidden (press S to show)'}
        checked={showWindow}
        onChange={(v) => updateScenarios({ showWindow: v })}
      />

      <div className={clsx('border-t border-line pt-2 transition-opacity', !showWindow && 'opacity-55')}>
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] text-muted">
            Listed in the window <span className="font-semibold text-fg">{shownCount}</span> of {entries.length}
          </p>
          <button
            type="button"
            disabled={hidden.length === 0}
            onClick={() => updateScenarios({ hidden: [] })}
            className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-accent hover:bg-panel-hover disabled:text-faint disabled:hover:bg-transparent"
          >
            Show all
          </button>
        </div>
        <ul className="scroll-thin mt-1 max-h-[min(50vh,360px)] space-y-0.5 overflow-y-auto pr-1">
          {entries.map((e) => (
            <li key={e.id}>
              <SwitchRow
                compact
                icon={e.icon}
                label={e.label}
                hint={e.tag}
                checked={!hiddenSet.has(e.id)}
                onChange={(v) => toggle(e.id, v)}
              />
            </li>
          ))}
        </ul>
        {presets.length === 0 && <p className="px-1 pt-1 text-[11px] text-faint">This workspace has no scenario presets yet.</p>}
      </div>
    </div>
  );
}

/* ─────────────────────────── Controls ─────────────────────────── */

function SliderRow(props: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format(v: number): string;
  onChange(v: number): void;
}) {
  const id = `setting-${props.label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="px-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-semibold text-fg">
          {props.label}
        </label>
        <span className="text-[12px] font-bold text-accent tabular-nums">{props.format(props.value)}</span>
      </div>
      <p className="text-[11px] text-muted">{props.hint}</p>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-[var(--accent)]"
      />
    </div>
  );
}

function SwitchRow(props: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange(v: boolean): void;
  icon?: LucideIcon;
  compact?: boolean;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      onClick={() => props.onChange(!props.checked)}
      className={clsx(
        'flex w-full items-center gap-2.5 rounded-lg px-1.5 text-left hover:bg-panel-hover',
        props.compact ? 'py-1.5' : 'py-2'
      )}
    >
      {Icon && <Icon className={clsx('size-3.5 shrink-0', props.checked ? 'text-accent' : 'text-faint')} aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className={clsx('block truncate font-semibold text-fg', props.compact ? 'text-[12.5px]' : 'text-[13px]')}>{props.label}</span>
        {props.hint && <span className="block truncate text-[11px] text-muted">{props.hint}</span>}
      </span>
      <span
        aria-hidden
        className={clsx('relative h-5 w-9 shrink-0 rounded-full transition-colors', props.checked ? 'bg-accent' : 'bg-line-strong')}
      >
        <span
          className={clsx(
            'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform',
            props.checked && 'translate-x-4'
          )}
        />
      </span>
    </button>
  );
}
