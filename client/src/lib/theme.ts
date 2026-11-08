'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/** Current theme plus a setter that persists the choice. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'dark' as Theme);
  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('arrow-theme', next);
    } catch {
      /* not persisted */
    }
  }, []);
  return [theme, setTheme];
}

/** Resolve CSS custom properties to concrete colors (for canvas / WebGL). */
export function readCssVars<T extends string>(names: readonly T[]): Record<T, string> {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(names.map((n) => [n, style.getPropertyValue(`--${n}`).trim()])) as Record<T, string>;
}
