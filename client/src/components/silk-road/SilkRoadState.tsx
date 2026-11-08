'use client';

/** UI state for the Silk Road view (focus, tabs, panels). Map display preferences live in lib/settings.tsx. */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Disruption } from '@/module_bindings/ops/types';
import { useDisruptions } from '@/lib/ops/hooks';

export type ViewMode = '3d' | '2d';
export type TraceTab = 'reasoning' | 'options' | 'decision' | 'execution';

interface SilkRoadState {
  viewMode: ViewMode;
  setViewMode(mode: ViewMode): void;
  focusId: bigint | null;
  setFocusId(id: bigint | null): void;
  selectedRouteId: number | null;
  setSelectedRouteId(id: number | null): void;
  /** Delivery the map camera follows, with its info card pinned to the dot (click a dot or a search result). */
  trackedShipmentId: number | null;
  setTrackedShipmentId(id: number | null): void;
  traceTab: TraceTab;
  setTraceTab(tab: TraceTab): void;
  askOpen: boolean;
  setAskOpen(v: boolean): void;
}

const Context = createContext<SilkRoadState | null>(null);

export function SilkRoadStateProvider({ children, initialFocus }: { children: ReactNode; initialFocus: bigint | null }) {
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const [focusId, setFocusId] = useState<bigint | null>(initialFocus);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [trackedShipmentId, setTrackedShipmentId] = useState<number | null>(null);
  const [traceTab, setTraceTab] = useState<TraceTab>('reasoning');
  const [askOpen, setAskOpen] = useState(false);

  const value = useMemo(
    () => ({
      viewMode,
      setViewMode,
      focusId,
      setFocusId,
      selectedRouteId,
      setSelectedRouteId,
      trackedShipmentId,
      setTrackedShipmentId,
      traceTab,
      setTraceTab,
      askOpen,
      setAskOpen,
    }),
    [viewMode, focusId, selectedRouteId, trackedShipmentId, traceTab, askOpen]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSilkRoad(): SilkRoadState {
  const value = useContext(Context);
  if (!value) throw new Error('useSilkRoad must be used inside SilkRoadStateProvider');
  return value;
}

/** The disruption the right panel follows: explicit focus, else the newest active one. */
export function useFocusedDisruption(): Disruption | undefined {
  const { focusId } = useSilkRoad();
  const { all, active } = useDisruptions();
  return useMemo(() => {
    if (focusId !== null) {
      const match = all.find((d) => d.id === focusId);
      if (match) return match;
    }
    return active[0];
  }, [focusId, all, active]);
}
