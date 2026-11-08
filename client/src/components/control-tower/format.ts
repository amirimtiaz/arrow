'use client';

/** Time and number formatting for the Control Tower, plus a shared 1 s clock. */
import { useSyncExternalStore } from 'react';

interface TsLike {
  microsSinceUnixEpoch: bigint;
}

export function tsMs(ts: TsLike): number {
  return Number(ts.microsSinceUnixEpoch / 1000n);
}

export function optMs(ts: TsLike | undefined | null): number | null {
  return ts ? tsMs(ts) : null;
}

/** "3d 4h", "2h 14m", "6m 05s", "42s". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export function relativeTime(ms: number, now: number): string {
  const diff = now - ms;
  if (diff < 45_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`;
  return `${Math.round(diff / 86_400_000)} d ago`;
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatUtc(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function formatCount(n: bigint | number): string {
  return Number(n).toLocaleString('en-US');
}

/** Adds business days (Mon–Fri; public holidays are ignored) and returns the end of that day. */
export function addBusinessDays(fromMs: number, days: number): number {
  const d = new Date(fromMs);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

// Shared ticking clock (one interval for the whole page).
let nowValue = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    nowValue = Date.now();
    timer = setInterval(() => {
      nowValue = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  if (!nowValue) nowValue = Date.now();
  return nowValue;
}

function getServerSnapshot() {
  return 0;
}

/** Current time in ms, re-rendering once per second. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
