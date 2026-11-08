/**
 * Server-only Tiger Data (TimescaleDB) access for the Analytics API routes.
 * Reads TIGER_DATABASE_URL (or TIGER_HOST/PORT/USER/PASSWORD/DB) from the
 * server environment; never exposed to the browser.
 */
import 'server-only';
import pg from 'pg';

const env = (name: string) => (process.env[name] ?? '').trim();

function connectionString(): string {
  const url = env('TIGER_DATABASE_URL');
  if (url) return url;
  const host = env('TIGER_HOST');
  const password = env('TIGER_PASSWORD');
  if (!host || !password) return '';
  const user = env('TIGER_USER') || 'tsdbadmin';
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${env('TIGER_PORT') || '5432'}/${encodeURIComponent(env('TIGER_DB') || 'tsdb')}`;
}

const globalForTiger = globalThis as unknown as { tigerPool?: pg.Pool };

export class TigerNotConfigured extends Error {
  constructor() {
    super('tiger_not_configured');
  }
}

export function tiger(): pg.Pool {
  const raw = connectionString();
  if (!raw) throw new TigerNotConfigured();
  if (!globalForTiger.tigerPool) {
    // Tiger Cloud requires TLS; configure it explicitly instead of via sslmode.
    const url = new URL(raw);
    url.searchParams.delete('sslmode');
    globalForTiger.tigerPool = new pg.Pool({
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: false },
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalForTiger.tigerPool;
}
