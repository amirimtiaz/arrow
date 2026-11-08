'use client';

import clsx from 'clsx';
import { Box, Keyboard, Loader2, Map as MapIcon, RefreshCw, Shuffle, Sparkles, WifiOff } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useCurrentOrg, useOps } from '@/lib/ops/client';
import { useDisruptions, useNetwork, useNewsSignals, useOptions, useRunForDisruption } from '@/lib/ops/hooks';
import { MODE, ROUTE_STATUS } from '@/lib/ops/status';
import { TopBarActions, TopBarTitle } from '@/components/shell/TopBarSlots';
import { Button, Dialog } from '@/components/ui/primitives';
import { AskArrow } from './AskArrow';
import { BottomStrip } from './BottomStrip';
import { KpiStrip } from './KpiStrip';
import { MapControls } from './MapControls';
import { RightPanel } from './RightPanel';
import { NewsSignals } from './NewsSignals';
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
  const [showShortcuts, setShowShortcuts] = useState(false);

  useKeyboardShortcuts(setShowShortcuts);

  const mapProps = org && {
    org,
    network,
    disruptions: all,
    signals,
    focused,
    selectedRouteId: ui.selectedRouteId,
    labelSize: ui.labelSize,
    shipSize: ui.shipSize,
    rotateSpeed: ui.rotateSpeed,
    onSelectRoute: ui.setSelectedRouteId,
    onFocusDisruption: (id: bigint) => {
      ui.setFocusId(id);
      ui.setTraceTab('reasoning');
    },
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

          <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-between gap-4 p-4">
            <MapControls network={network} />
            <div className="hidden xl:block">
              <KpiStrip />
            </div>
            <div className="flex flex-col items-end gap-2">
              <ScenarioPanel />
              <NewsSignals />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-line bg-panel/95 px-2.5 py-1.5 text-[11px] text-muted shadow-panel hover:text-fg"
          >
            <Keyboard className="size-3.5" aria-hidden />
            Press <kbd className="rounded border border-line px-1 font-mono">?</kbd> for shortcuts
          </button>
        </div>
        <BottomStrip />
      </div>
      <div className="relative flex">
        <RightPanel />
        <AskArrow />
      </div>

      <Dialog open={showShortcuts} onClose={() => setShowShortcuts(false)} title="Keyboard shortcuts" width="max-w-sm">
        <ul className="space-y-2 text-sm">
          {[
            ['A', 'Open Ask Arrow'],
            ['2 / 3', 'Switch between 2D map and 3D globe'],
            ['C', 'Toggle map controls'],
            ['S', 'Toggle crisis scenarios'],
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
        case 'c':
        case 'C':
          ui.setControlsOpen(!ui.controlsOpen);
          break;
        case 's':
        case 'S':
          ui.setScenariosOpen(!ui.scenariosOpen);
          break;
        case 'Escape':
          ui.setAskOpen(false);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ui, setShowShortcuts]);
}

/** Title + actions rendered into the shared top bar. */
function SilkRoadTopBar() {
  const org = useCurrentOrg();
  const network = useNetwork();
  const focused = useFocusedDisruption();
  const run = useRunForDisruption(focused?.id);
  const options = useOptions(focused?.id);
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

  const agentActive = run?.status === 'running';
  const awaiting = run?.status === 'awaiting_approval';

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
        <span
          className={clsx(
            'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold whitespace-nowrap',
            agentActive
              ? 'border-accent/40 bg-accent-soft text-accent'
              : awaiting
                ? 'border-warning/40 bg-warning-soft text-warning'
                : 'border-line bg-panel text-muted'
          )}
        >
          <Shuffle className={clsx('size-3.5', agentActive && 'animate-soft-pulse')} aria-hidden />
          {agentActive ? 'Agent active' : awaiting ? 'Awaiting approval' : 'Agent idle'}
        </span>
        <button
          type="button"
          disabled={options.length === 0}
          onClick={() => ui.setTraceTab(awaiting ? 'decision' : 'options')}
          title={options.length === 0 ? 'No scored reroute options for the focused disruption yet' : 'Review reroute options'}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[12px] font-semibold whitespace-nowrap text-fg hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Change Route
        </button>
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
