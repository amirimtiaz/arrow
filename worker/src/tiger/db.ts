/** Tiger Data (managed TimescaleDB) connection pool. Analytics/history only. */
import pg from 'pg';
import { config, tigerConfigured } from '../config';

let pool: pg.Pool | null = null;

export function tiger(): pg.Pool | null {
  if (!tigerConfigured) return null;
  if (!pool) {
    // Tiger Cloud requires TLS; strip sslmode from the URL and configure it explicitly.
    const url = new URL(config.tigerUrl);
    url.searchParams.delete('sslmode');
    pool = new pg.Pool({
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on('error', (err) => console.warn('[tiger] pool error:', err.message));
  }
  return pool;
}

export async function tigerHealthy(): Promise<boolean> {
  const db = tiger();
  if (!db) return false;
  try {
    await db.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
