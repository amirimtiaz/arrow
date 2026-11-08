/** Analytics queries served to the Analytics page (all real Tiger queries). */
import { tiger } from './db';

function db() {
  const pool = tiger();
  if (!pool) throw new TigerNotConfigured();
  return pool;
}

export class TigerNotConfigured extends Error {
  constructor() {
    super('tiger_not_configured');
  }
}

export async function riskSeries(orgId: number, hours: number) {
  const bucket = hours > 48 ? '1 hour' : hours > 6 ? '15 minutes' : '5 minutes';
  const { rows } = await db().query(
    `SELECT time_bucket($3::interval, bucket) AS t,
            avg(avg_risk)::float8 AS avg_risk,
            max(max_risk)::float8 AS max_risk,
            avg(avg_delay)::float8 AS avg_delay
     FROM route_risk_5m
     WHERE org_id = $1 AND bucket > now() - make_interval(hours => $2)
     GROUP BY 1 ORDER BY 1`,
    [orgId, hours, bucket]
  );
  return rows.map((r) => ({ t: new Date(r.t).getTime(), avgRisk: r.avg_risk, maxRisk: r.max_risk, avgDelay: r.avg_delay }));
}

export async function securitySeries(orgId: number, minutes: number) {
  const bucket = minutes > 180 ? '1 hour' : '1 minute';
  const { rows } = await db().query(
    `SELECT time_bucket($3::interval, time) AS t,
            count(*)::int AS total,
            count(*) FILTER (WHERE severity IN ('high', 'critical'))::int AS high
     FROM security_events
     WHERE org_id = $1 AND time > now() - make_interval(mins => $2)
     GROUP BY 1 ORDER BY 1`,
    [orgId, minutes, bucket]
  );
  return rows.map((r) => ({ t: new Date(r.t).getTime(), total: r.total, high: r.high }));
}

export async function topRoutes(orgId: number, hours: number) {
  const { rows } = await db().query(
    `SELECT route_id, avg(avg_risk)::float8 AS avg_risk, max(max_risk)::float8 AS peak_risk, avg(avg_delay)::float8 AS avg_delay
     FROM route_risk_5m
     WHERE org_id = $1 AND bucket > now() - make_interval(hours => $2)
     GROUP BY route_id ORDER BY peak_risk DESC LIMIT 8`,
    [orgId, hours]
  );
  return rows.map((r) => ({ routeId: r.route_id, avgRisk: r.avg_risk, peakRisk: r.peak_risk, avgDelay: r.avg_delay }));
}

export async function historySummary(orgId: number) {
  const { rows } = await db().query(`SELECT count(*)::int AS samples, min(time) AS since FROM route_metrics WHERE org_id = $1`, [orgId]);
  return { samples: rows[0].samples as number, since: rows[0].since ? new Date(rows[0].since).toISOString() : null };
}
