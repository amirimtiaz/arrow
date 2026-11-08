'use client';

import clsx from 'clsx';
import { ArrowRight, Bot, Box, Keyboard, Loader2, Map as MapIcon, RefreshCw, Sparkles, TriangleAlert, WifiOff } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useCurrentOrg, useOps } from '@/lib/ops/client';
import { useDisruptions, useNetwork, useNewsSignals, useRunForDisruption } from '@/lib/ops/hooks';
import { DISRUPTION_KIND, MODE, ROUTE_STATUS, SEVERITY } from '@/lib/ops/status';
import { useSettings } from '@/lib/settings';
import { TopBarActions, TopBarTitle } from '@/components/shell/TopBarSlots';
import { Button, Dialog, StatusChip } from '@/components/ui/primitives';
import { AskArrow } from './AskArrow';
import { DeliverySearch } from './DeliverySearch';
import { KpiStrip } from './KpiStrip';
import { MapLegend } from './MapLegend';
import { NewsSignals } from './NewsSignals';
import { RiskCard } from './RiskCard';
import { ScenarioPanel } from './ScenarioPanel';
import { SilkRoadStateProvider, useFocusedDisruption, useSilkRoad } from './SilkRoadState';

const MapLoading = () => (
  <div className="absolute inset-0 grid place-items-center text-sm text-muted">
    <span className="flex items-center gap-2">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      Loading map…
    </span>
  </div>
);

const GlobeView = dynamic(() => import('./GlobeView'), { ssr: false, loading: MapLoading });
const FlatMapView = dynamic(() => import('./FlatMapView'), { ssr: false, loading: MapLoading });

function parseFocus(value: string | null): bigint | null {
  const match = value?.match(/^disruption:(\d+)$/);
  return match ? BigInt(match[1]) : null;
}

export function SilkRoadView() {
  const params = useSearchParams();
  const initialFocus = parseFocus(params.get('focus'));
  return (
    <SilkRoadStateProvider initialFocus={initialFocus}>
      <SilkRoadLayout />
    </SilkRoadStateProvider>
  );
}

function SilkRoadLayout() {
  const org = useCurrentOrg();
  const network = useNetwork();
  const { all } = useDisruptions();
  const signals = useNewsSignals();
  const focused = useFocusedDisruption();
  const { status, ready, error, retry, resetIdentity } = useOps();
  const ui = useSilkRoad();
  const { settings } = useSettings();
  const [showShortcuts, setShowShortcuts] = useState(false);

  useKeyboardShortcuts(setShowShortcuts);

  const mapProps = org && {
    org,
    network,
    disruptions: all,
    signals,
    focused,
    selectedRouteId: ui.selectedRouteId,
    labelSize: settings.map.labelSize,
    shipSize: settings.map.vehicleSize,
    rotateSpeed: settings.map.autoRotate,
    colors: settings.map.colors,
    markerStyle: settings.map.markerStyle,
    onSelectRoute: ui.setSelectedRouteId,
    trackedShipmentId: ui.trackedShipmentId,
    onTrackShipment: (id: number | null) => {
      ui.setTrackedShipmentId(id);
      if (id !== null) {
        const routeId = network.shipments.find((s) => s.id === id)?.routeId;
        if (routeId !== undefined) ui.setSelectedRouteId(routeId);
      }
    },
    onFocusDisruption: (id: bigint) => ui.setFocusId(id),
  };

  return (
    <div className="flex h-full">
      <SilkRoadTopBar />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background: 'var(--map-bg)' }}>
          {mapProps && (ui.viewMode === '3d' ? <GlobeView {...mapProps} /> : <FlatMapView {...mapProps} />)}

          {status === 'error' ? (
            <div className="absolute inset-0 z-20 grid place-items-center bg-bg/70 backdrop-blur-sm">
              <div className="max-w-sm rounded-2xl border border-line bg-panel p-6 text-center shadow-panel">
                <WifiOff className="mx-auto size-8 text-danger" aria-hidden />
                <h2 className="mt-3 text-base font-bold text-fg">Can&apos;t reach SpacetimeDB</h2>
                <p className="mt-1 text-sm text-muted">{error ?? 'The live backend is unavailable.'} Arrow retries automatically.</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button icon={RefreshCw} onClick={retry}>
                    Retry now
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={resetIdentity}
                    title="Use this if the server was reset and no longer accepts this browser's identity"
                  >
                    Reset identity
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            (!ready || !org) && <MapLoading />
          )}

          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-4">
            <div className="flex min-w-0 flex-col items-center gap-2">
              <div className="hidden xl:block">
                <KpiStrip />
              </div>
              <FocusCard />
            </div>
          </div>

          {/* Draggable cards; each starts in its own corner and remembers where it was moved. */}
          <MapLegend network={network} />
          <ScenarioPanel />
          {settings.map.showNews && <NewsSignals />}
          {settings.map.showRisk && <RiskCard />}

          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-line bg-panel/95 px-2.5 py-1.5 text-[11px] text-muted shadow-panel hover:text-fg"
          >
            <Keyboard className="size-3.5" aria-hidden />
            Press <kbd className="rounded border border-line px-1 font-mono">?</kbd> for shortcuts
          </button>
        </div>
      </div>
      {/* Ask Arrow slides over the right edge of the map. */}
      <div className="relative">
        <AskArrow />
      </div>

      <Dialog open={showShortcuts} onClose={() => setShowShortcuts(false)} title="Keyboard shortcuts" width="max-w-sm">
        <ul className="space-y-2 text-sm">
          {[
            ['A', 'Open Ask Arrow'],
            ['2 / 3', 'Switch between 2D map and 3D globe'],
            ['S', 'Show or hide the scenario window'],
            ['Esc', 'Close panels and dialogs'],
            ['?', 'Show this help'],
          ].map(([key, label]) => (
            <li key={key} className="flex items-center justify-between gap-4">
              <span className="text-muted">{label}</span>
              <kbd className="rounded-md border border-line bg-panel-2 px-2 py-0.5 font-mono text-xs text-fg">{key}</kbd>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}

function useKeyboardShortcuts(setShowShortcuts: (v: boolean) => void) {
  const ui = useSilkRoad();
  const { settings, updateScenarios } = useSettings();
  const showScenarioWindow = settings.scenarios.showWindow;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest('input, textarea, select, [contenteditable="true"]')) return;
      switch (e.key) {
        case '?':
          setShowShortcuts(true);
          break;
        case 'a':
        case 'A':
          e.preventDefault();
          ui.setAskOpen(true);
          break;
        case '2':
          ui.setViewMode('2d');
          break;
        case '3':
          ui.setViewMode('3d');
          break;
        case 's':
        case 'S':
          updateScenarios({ showWindow: !showScenarioWindow });
          break;
        case 'Escape':
          ui.setAskOpen(false);
          ui.setTrackedShipmentId(null);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ui, setShowShortcuts, updateScenarios, showScenarioWindow]);
}

/** Title + actions rendered into the shared top bar. */
function SilkRoadTopBar() {
  const org = useCurrentOrg();
  const network = useNetwork();
  const focused = useFocusedDisruption();
  const ui = useSilkRoad();
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const selected = ui.selectedRouteId !== null ? network.routesById.get(ui.selectedRouteId) : undefined;
  const subtitle = useMemo(() => {
    if (selected) {
      return `${selected.label} • ${MODE[selected.mode]?.label ?? selected.mode} • ${ROUTE_STATUS[selected.status]?.label ?? selected.status} • ${selected.lane}`;
    }
    if (focused && focused.status !== 'resolved') {
      const since = Math.max(0, Math.floor((now - Number(focused.createdAt.microsSinceUnixEpoch / 1000n)) / 1000));
      return `${focused.title} • T+${since}s • ${focused.status === 'mitigating' ? 'Mitigation underway' : 'Response orchestration'}`;
    }
    if (org) return `${org.name} • ${org.scope} network • Monitoring for ${Math.floor((now - startedAt) / 1000)}s`;
    return 'Connecting…';
  }, [selected, focused, org, now, startedAt]);

  return (
    <>
      <TopBarTitle>
        <div className="min-w-0">
          <p className="text-[15px] leading-tight font-extrabold text-accent">Silk Road</p>
          <p className="truncate text-[11.5px] text-muted" title={subtitle}>
            {subtitle}
          </p>
        </div>
      </TopBarTitle>
      <TopBarActions>
        <DeliverySearch />
        <button
          type="button"
          onClick={() => ui.setAskOpen(!ui.askOpen)}
          aria-pressed={ui.askOpen}
          className={clsx(
            'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold whitespace-nowrap',
            ui.askOpen ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-fg hover:bg-panel-hover'
          )}
        >
          <Sparkles className="size-3.5" aria-hidden />
          Ask Arrow
        </button>
        <div className="flex h-8 overflow-hidden rounded-lg border border-line bg-panel" role="group" aria-label="Map view">
          {(
            [
              ['2d', '2D', MapIcon],
              ['3d', '3D', Box],
            ] as const
          ).map(([mode, label, Icon]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={ui.viewMode === mode}
              onClick={() => ui.setViewMode(mode)}
              className={clsx(
                'flex items-center gap-1 px-2.5 text-[12px] font-bold',
                ui.viewMode === mode ? 'bg-accent text-white' : 'text-muted hover:text-fg'
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </TopBarActions>
    </>
  );
}

/**
 * Compact card for the disruption in focus (clicked "!" or the newest active one). The full agent trace and the
 * Approve/Reject decision live on the Current AI Agents tab; this links straight to it.
 */
function FocusCard() {
  const focused = useFocusedDisruption();
  const run = useRunForDisruption(focused?.id);
  if (!focused || focused.status === 'resolved') return null;

  const KindIcon = DISRUPTION_KIND[focused.kind]?.icon ?? TriangleAlert;
  const severity = SEVERITY[focused.severity] ?? SEVERITY.moderate;
  const agent =
    run?.status === 'running'
      ? { label: 'Agents working…', className: 'text-accent' }
      : run?.status === 'awaiting_approval'
        ? { label: 'Awaiting your approval', className: 'text-warning' }
        : run?.status === 'failed'
          ? { label: 'Agent run failed', className: 'text-danger' }
          : run
            ? { label: 'Agent response complete', className: 'text-success' }
            : { label: 'Agents starting…', className: 'text-muted' };

  return (
    <div className="pointer-events-auto flex max-w-[520px] items-center gap-3 rounded-xl border border-danger/40 bg-panel/95 py-2 pr-2 pl-3 shadow-panel backdrop-blur">
      <KindIcon className="size-4 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[13px] font-bold text-fg">
          <span className="truncate">{focused.title}</span>
          <StatusChip meta={severity} />
        </p>
        <p className={clsx('flex items-center gap-1 text-[11.5px] font-semibold', agent.className)}>
          <Bot className="size-3.5" aria-hidden />
          {agent.label}
        </p>
      </div>
      <Link
        href={`/app/agents?focus=disruption:${focused.id}`}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-[12px] font-semibold text-white hover:bg-accent-strong"
      >
        Open in AI Agents
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
