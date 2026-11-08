'use client';

/**
 * Per-viewer app settings (gear menu in the top bar): how the Silk Road map draws and which crisis scenarios the
 * scenario window offers. These are display preferences for one browser, so they live in localStorage; nothing here
 * touches SpacetimeDB or changes what other viewers see.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type MarkerStyle = 'dots' | 'icons';

export interface MapSettings {
  /** Size of place names on the map; 0 hides them. */
  labelSize: number;
  /** Size of the moving shipment dots. */
  vehicleSize: number;
  /** Globe auto-rotation speed; 0 (the default) keeps the globe still. */
  autoRotate: number;
  /** Show the movable legend over the map. */
  showLegend: boolean;
  /** Show the Live news card (Grok News Scout) on the map. */
  showNews: boolean;
  /** Show the live supply chain risk monitor card on the map. */
  showRisk: boolean;
  /** Draw hubs as coloured dots or as small icons. */
  markerStyle: MarkerStyle;
  /** Custom hex colours keyed by legend entry (see lib/ops/legend.ts); missing keys use the theme colour. */
  colors: Record<string, string>;
  /** Where each map card was dragged to (px from the map's top-left); missing cards sit in their default corner. */
  positions: Record<string, { x: number; y: number }>;
  /** Map cards folded down to their header. */
  collapsed: Record<string, boolean>;
}

export interface ScenarioSettings {
  /** Show the crisis scenario window on the map. */
  showWindow: boolean;
  /** Scenario entries hidden from the window: `${orgId}:${key}` for presets, or 'random' / 'congestion'. */
  hidden: string[];
}

export interface AppSettings {
  map: MapSettings;
  scenarios: ScenarioSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  map: {
    labelSize: 0.6,
    vehicleSize: 2,
    autoRotate: 0,
    showLegend: true,
    showNews: true,
    showRisk: true,
    markerStyle: 'dots',
    colors: {},
    positions: {},
    collapsed: {},
  },
  scenarios: { showWindow: true, hidden: [] },
};

const STORAGE_KEY = 'arrow-settings-v1';

interface SettingsApi {
  settings: AppSettings;
  updateMap(patch: Partial<MapSettings>): void;
  updateScenarios(patch: Partial<ScenarioSettings>): void;
  /** Set a legend colour (hex), or null to go back to the theme default. */
  setColor(key: string, hex: string | null): void;
  /** Save where a map card was dragged to, or null to send it back to its default corner. */
  setCardPosition(id: string, pos: { x: number; y: number } | null): void;
  setCardCollapsed(id: string, collapsed: boolean): void;
}

const Context = createContext<SettingsApi | null>(null);

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<AppSettings> & { map?: { legendPos?: { x: number; y: number } | null } };
    const positions = { ...saved.map?.positions };
    // Older saves kept only the legend position.
    if (saved.map?.legendPos && !positions.legend) positions.legend = saved.map.legendPos;
    return {
      map: { ...DEFAULT_SETTINGS.map, ...saved.map, colors: { ...saved.map?.colors }, positions, collapsed: { ...saved.map?.collapsed } },
      scenarios: { ...DEFAULT_SETTINGS.scenarios, ...saved.scenarios, hidden: [...(saved.scenarios?.hidden ?? [])] },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const loaded = useRef(false);

  // Read saved settings after mount so server and first client render match.
  useEffect(() => {
    setSettings(load());
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* private mode or storage blocked: settings just won't persist */
    }
  }, [settings]);

  const updateMap = useCallback((patch: Partial<MapSettings>) => setSettings((s) => ({ ...s, map: { ...s.map, ...patch } })), []);
  const updateScenarios = useCallback(
    (patch: Partial<ScenarioSettings>) => setSettings((s) => ({ ...s, scenarios: { ...s.scenarios, ...patch } })),
    []
  );
  const setColor = useCallback(
    (key: string, hex: string | null) =>
      setSettings((s) => {
        const colors = { ...s.map.colors };
        if (hex) colors[key] = hex;
        else delete colors[key];
        return { ...s, map: { ...s.map, colors } };
      }),
    []
  );

  const setCardPosition = useCallback(
    (id: string, pos: { x: number; y: number } | null) =>
      setSettings((s) => {
        const positions = { ...s.map.positions };
        if (pos) positions[id] = pos;
        else delete positions[id];
        return { ...s, map: { ...s.map, positions } };
      }),
    []
  );
  const setCardCollapsed = useCallback(
    (id: string, collapsed: boolean) =>
      setSettings((s) => ({ ...s, map: { ...s.map, collapsed: { ...s.map.collapsed, [id]: collapsed } } })),
    []
  );

  const value = useMemo(
    () => ({ settings, updateMap, updateScenarios, setColor, setCardPosition, setCardCollapsed }),
    [settings, updateMap, updateScenarios, setColor, setCardPosition, setCardCollapsed]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSettings(): SettingsApi {
  const value = useContext(Context);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}
