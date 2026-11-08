'use client';

import { useEffect, useState } from 'react';

export type AnalyticsState<T> =
  { status: 'loading' } | { status: 'ok'; data: T } | { status: 'tiger_not_configured' } | { status: 'error'; message: string };

/** Polls a Tiger-backed analytics endpoint (`/api/analytics/<metric>`). */
export function useAnalytics<T>(path: string, intervalMs = 15_000): AnalyticsState<T> {
  // Results are keyed by path, so changing the query shows "loading" until fresh data lands.
  const [result, setResult] = useState<{ path: string; state: AnalyticsState<T> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const settle = (state: AnalyticsState<T>) => !cancelled && setResult({ path, state });
    const load = async () => {
      try {
        const res = await fetch(`/api/analytics${path}`, { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (res.status === 503 && body.error === 'tiger_not_configured') settle({ status: 'tiger_not_configured' });
        else if (!res.ok) settle({ status: 'error', message: body.message ?? `Analytics responded ${res.status}` });
        else settle({ status: 'ok', data: body as T });
      } catch {
        settle({ status: 'error', message: 'The analytics API is not reachable.' });
      }
    };
    void load();
    const id = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [path, intervalMs]);

  return result?.path === path ? result.state : { status: 'loading' };
}
