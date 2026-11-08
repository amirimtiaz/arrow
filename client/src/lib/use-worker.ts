'use client';

import { useEffect, useState } from 'react';

export type WorkerState<T> =
  { status: 'loading' } | { status: 'ok'; data: T } | { status: 'tiger_not_configured' } | { status: 'error'; message: string };

/** Polls a worker analytics endpoint (proxied by Next.js at /api/worker/*). */
export function useWorker<T>(path: string, intervalMs = 15_000): WorkerState<T> {
  // Results are keyed by path, so changing the query shows "loading" until fresh data lands.
  const [result, setResult] = useState<{ path: string; state: WorkerState<T> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const settle = (state: WorkerState<T>) => !cancelled && setResult({ path, state });
    const load = async () => {
      try {
        const res = await fetch(`/api/worker${path}`, { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (res.status === 503 && body.error === 'tiger_not_configured') settle({ status: 'tiger_not_configured' });
        else if (!res.ok) settle({ status: 'error', message: body.message ?? `Worker responded ${res.status}` });
        else settle({ status: 'ok', data: body as T });
      } catch {
        settle({ status: 'error', message: 'The analytics worker is not reachable. Start it with `cd worker && npm start`.' });
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
