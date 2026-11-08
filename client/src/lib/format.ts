/** Formatting helpers shared across the app. */

interface TimestampLike {
  microsSinceUnixEpoch: bigint;
}

export function tsToDate(ts: TimestampLike): Date {
  return new Date(Number(ts.microsSinceUnixEpoch / 1000n));
}

export function tsToMs(ts: TimestampLike): number {
  return Number(ts.microsSinceUnixEpoch / 1000n);
}

const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const usdFull = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatUsd(value: number, compact = true): string {
  if (!Number.isFinite(value)) return '—';
  return compact && Math.abs(value) >= 10_000 ? usdCompact.format(value) : usdFull.format(value);
}

export function formatInt(value: number): string {
  return integer.format(value);
}

export function formatPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

export function timeAgo(date: Date, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatClock(date: Date, timeZone?: string): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone });
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Parse JSON without throwing (agent payloads are untrusted text). */
export function safeJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
