/**
 * One-time Tiger Data setup: applies scripts/tiger/schema.sql and backfills
 * ~7 days of synthetic history so charts and baselines are meaningful from
 * the first minute. Run with `npm run tiger:setup` (add --force to re-backfill).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tigerConfigured } from '../config';
import { connectOps } from '../spacetime';
import { tiger } from './db';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(here, '../../../scripts/tiger/schema.sql');

/** Spikes baked into history so "past incidents" exist (route index, days ago, hours). */
const HISTORICAL_SPIKES = [
  { routeIndex: 4, daysAgo: 5.2, hours: 6 },
  { routeIndex: 0, daysAgo: 3.4, hours: 4 },
  { routeIndex: 9, daysAgo: 1.7, hours: 3 },
];

async function main() {
  if (!tigerConfigured) {
    console.error('TIGER_DATABASE_URL is not set in worker/.env');
    process.exit(1);
  }
  const db = tiger()!;
  const force = process.argv.includes('--force');

  console.log('[tiger] applying schema…');
  const statements = fs
    .readFileSync(schemaPath, 'utf8')
    .split(/;\s*\n/)
    .map((s) => s.replace(/--.*$/gm, '').trim())
    .filter(Boolean);
  for (const sql of statements) await db.query(sql);

  const { rows } = await db.query('SELECT count(*)::int AS n FROM route_metrics');
  if (rows[0].n > 10_000 && !force) {
    console.log(`[tiger] route_metrics already has ${rows[0].n} rows; skipping backfill (use --force to redo)`);
    await finish(db);
    return;
  }
  if (force) {
    await db.query('TRUNCATE route_metrics, security_events, shipment_events');
  }

  console.log('[tiger] reading the network from SpacetimeDB…');
  const { conn } = await connectOps(() => undefined);
  const routes = [...conn.db.route.iter()].filter((r) => r.status !== 'standby').sort((a, b) => a.id - b.id);
  const shipments = [...conn.db.shipment.iter()];
  const orgs = [...conn.db.org.iter()];

  for (const org of orgs) {
    const mine = routes.filter((r) => r.orgId === org.id);
    const units = mine.map((r) => shipments.filter((s) => s.routeId === r.id).reduce((sum, s) => sum + s.units, 0));
    const spikes = HISTORICAL_SPIKES.filter((s) => s.routeIndex < mine.length);
    console.log(`[tiger] backfilling ${org.name}: ${mine.length} routes × 7 days`);
    await db.query(
      `INSERT INTO route_metrics (time, org_id, route_id, delay_hours, risk_index, cost_usd, in_transit_units)
       SELECT t, $1, r.route_id,
              greatest(0, (random() * 0.6) + CASE WHEN spike.route_id IS NOT NULL THEN 6 ELSE 0 END),
              least(100, greatest(0,
                r.base_risk * 100
                + 3.5 * sin(extract(epoch FROM t) / 86400.0 * 2 * pi())
                + (random() - 0.5) * 4
                + CASE WHEN spike.route_id IS NOT NULL THEN 48 + random() * 20 ELSE 0 END)),
              r.base_cost * (0.97 + random() * 0.06),
              r.units
       FROM unnest($2::int[], $3::float8[], $4::float8[], $5::int[]) AS r(route_id, base_risk, base_cost, units)
       CROSS JOIN generate_series(now() - interval '7 days', now() - interval '2 minutes', interval '5 minutes') AS t
       LEFT JOIN LATERAL (
         SELECT s.route_id FROM unnest($6::int[], $7::float8[], $8::float8[]) AS s(route_id, days_ago, hours)
         WHERE s.route_id = r.route_id
           AND t BETWEEN now() - make_interval(secs => s.days_ago * 86400)
                     AND now() - make_interval(secs => s.days_ago * 86400) + make_interval(secs => s.hours * 3600)
         LIMIT 1
       ) spike ON TRUE`,
      [
        org.id,
        mine.map((r) => r.id),
        mine.map((r) => r.baseRisk),
        mine.map((r) => r.baseCostUsd),
        units,
        spikes.map((s) => mine[s.routeIndex].id),
        spikes.map((s) => s.daysAgo),
        spikes.map((s) => s.hours),
      ]
    );

    const rate = org.plan === 'gold' ? 0.55 : org.plan === 'silver' ? 0.35 : 0.12;
    await db.query(
      `INSERT INTO security_events (time, org_id, kind, severity, source)
       SELECT t + (random() * interval '30 seconds'), $1,
              (ARRAY['failed_login','phishing_reported','port_scan','mfa_denied'])[1 + floor(random() * 4)::int],
              CASE WHEN random() < 0.8 THEN 'low' ELSE 'medium' END,
              'Backfill'
       FROM generate_series(now() - interval '7 days', now() - interval '2 minutes', interval '30 seconds') AS t
       WHERE random() < $2`,
      [org.id, rate / 15]
    );
  }
  await finish(db);
  process.exit(0);
}

async function finish(db: NonNullable<ReturnType<typeof tiger>>) {
  console.log('[tiger] refreshing continuous aggregate route_risk_5m…');
  await db.query(`CALL refresh_continuous_aggregate('route_risk_5m', now() - interval '8 days', now() - interval '5 minutes')`);
  const { rows } = await db.query('SELECT count(*)::int AS n, min(time) AS since FROM route_metrics');
  console.log(`[tiger] ready: ${rows[0].n} route_metrics rows since ${rows[0].since?.toISOString?.() ?? rows[0].since}`);
  await db.end();
}

main().catch((err) => {
  console.error('[tiger] setup failed:', err);
  process.exit(1);
});
