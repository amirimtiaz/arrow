/**
 * Analytics API backed by live Tiger Data queries (hypertables + the
 * route_risk_5m continuous aggregate). GET /api/analytics/<metric>?orgId=1
 *   risk · security · top-routes · summary · anomalies
 */
import { NextResponse, type NextRequest } from 'next/server';
import { tiger, TigerNotConfigured } from '@/lib/server/tiger';

function clamp(value: string | null, min: number, max: number, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

type Handler = (orgId: number, params: URLSearchParams) => Promise<unknown>;

const METRICS: Record<string, Handler> = {
  async risk(orgId, params) {
    const hours = clamp(params.get('hours'), 1, 168, 24);
    const bucket = hours > 48 ? '1 hour' : hours > 6 ? '15 minutes' : '5 minutes';
    const { rows } = await tiger().query(
      `SELECT time_bucket($3::interval, bucket) AS t, avg(avg_risk)::float8 AS avg_risk, max(max_risk)::float8 AS max_risk, avg(avg_delay)::float8 AS avg_delay
       FROM route_risk_5m WHERE org_id = $1 AND bucket > now() - make_interval(hours => $2) GROUP BY 1 ORDER BY 1`,
      [orgId, hours, bucket]
    );
    return { series: rows.map((r) => ({ t: new Date(r.t).getTime(), avgRisk: r.avg_risk, maxRisk: r.max_risk, avgDelay: r.avg_delay })) };
  },
  async security(orgId, params) {
    const minutes = clamp(params.get('minutes'), 5, 10080, 60);
    const bucket = minutes > 180 ? '1 hour' : '1 minute';
    const { rows } = await tiger().query(
      `SELECT time_bucket($3::interval, time) AS t, count(*)::int AS total, count(*) FILTER (WHERE severity IN ('high', 'critical'))::int AS high
       FROM security_events WHERE org_id = $1 AND time > now() - make_interval(mins => $2) GROUP BY 1 ORDER BY 1`,
      [orgId, minutes, bucket]
    );
    return { series: rows.map((r) => ({ t: new Date(r.t).getTime(), total: r.total, high: r.high })) };
  },
  async 'top-routes'(orgId, params) {
    const hours = clamp(params.get('hours'), 1, 168, 24);
    const { rows } = await tiger().query(
      `SELECT route_id, avg(avg_risk)::float8 AS avg_risk, max(max_risk)::float8 AS peak_risk, avg(avg_delay)::float8 AS avg_delay
       FROM route_risk_5m WHERE org_id = $1 AND bucket > now() - make_interval(hours => $2)
       GROUP BY route_id ORDER BY peak_risk DESC LIMIT 8`,
      [orgId, hours]
    );
    return { routes: rows.map((r) => ({ routeId: r.route_id, avgRisk: r.avg_risk, peakRisk: r.peak_risk, avgDelay: r.avg_delay })) };
  },
  async summary(orgId) {
    const { rows } = await tiger().query(`SELECT count(*)::int AS samples, min(time) AS since FROM route_metrics WHERE org_id = $1`, [orgId]);
    return { samples: rows[0].samples as number, since: rows[0].since ? new Date(rows[0].since).toISOString() : null };
  },
  async anomalies(orgId) {
    const { rows } = await tiger().query(
      `SELECT time, route_id, route_label, recent_risk, baseline_mean, baseline_sd, z, reported
       FROM anomaly_log WHERE org_id = $1 ORDER BY time DESC LIMIT 20`,
      [orgId]
    );
    return {
      anomalies: rows.map((r) => ({
        routeId: r.route_id,
        routeLabel: r.route_label,
        recentRisk: r.recent_risk,
        baselineMean: r.baseline_mean,
        baselineSd: r.baseline_sd,
        z: r.z,
        detectedAt: new Date(r.time).toISOString(),
        reported: r.reported,
      })),
    };
  },
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ metric: string }> }) {
  const { metric } = await params;
  const handler = METRICS[metric];
  if (!handler) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const orgId = clamp(request.nextUrl.searchParams.get('orgId'), 1, 1000, 1);
  try {
    return NextResponse.json(await handler(orgId, request.nextUrl.searchParams), { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    if (err instanceof TigerNotConfigured) return NextResponse.json({ error: 'tiger_not_configured' }, { status: 503 });
    return NextResponse.json({ error: 'query_failed', message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
