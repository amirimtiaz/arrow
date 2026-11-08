/**
 * Route history for the agent's query_route_history tool. Tiger Data is the
 * source of truth for history; without it the tool falls back to the last
 * few minutes of SpacetimeDB telemetry and says so in its `source` field.
 */
import type { Ops } from '../spacetime';
import { tiger } from './db';

export interface RouteHistoryRow {
  route_id: number;
  avg_risk: number;
  peak_risk: number;
  current_risk: number;
  avg_delay_hours: number;
  incidents: number;
  samples: number;
}

export interface HistoryResult {
  source: string;
  windowHours: number;
  routes: RouteHistoryRow[];
}

export interface HistoryProvider {
  routeHistory(orgId: number, routeIds: number[], hours: number): Promise<HistoryResult>;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Incidents = 5-minute buckets whose peak risk crossed the alert threshold (60). */
const HISTORY_SQL = `
  WITH window_rows AS (
    SELECT route_id, bucket, avg_risk, max_risk, avg_delay
    FROM route_risk_5m
    WHERE org_id = $1 AND route_id = ANY($2::int[]) AND bucket > now() - make_interval(hours => $3)
  ), episodes AS (
    SELECT route_id, count(*) FILTER (WHERE max_risk >= 60 AND (prev_max IS NULL OR prev_max < 60)) AS incidents
    FROM (
      SELECT route_id, max_risk, lag(max_risk) OVER (PARTITION BY route_id ORDER BY bucket) AS prev_max
      FROM window_rows
    ) t
    GROUP BY route_id
  ), latest AS (
    SELECT DISTINCT ON (route_id) route_id, risk_index AS current_risk
    FROM route_metrics
    WHERE org_id = $1 AND route_id = ANY($2::int[]) AND time > now() - interval '30 minutes'
    ORDER BY route_id, time DESC
  )
  SELECT w.route_id,
         avg(w.avg_risk)::float8 AS avg_risk,
         max(w.max_risk)::float8 AS peak_risk,
         coalesce(max(l.current_risk), 0)::float8 AS current_risk,
         avg(w.avg_delay)::float8 AS avg_delay,
         coalesce(max(e.incidents), 0)::int AS incidents,
         count(*)::int AS samples
  FROM window_rows w
  LEFT JOIN episodes e USING (route_id)
  LEFT JOIN latest l USING (route_id)
  GROUP BY w.route_id`;

export function createHistoryProvider(ops: Ops): HistoryProvider {
  const fallback = spacetimeHistory(ops);
  return {
    async routeHistory(orgId, routeIds, hours) {
      const db = tiger();
      if (!db || routeIds.length === 0) return fallback.routeHistory(orgId, routeIds, hours);
      try {
        const { rows } = await db.query(HISTORY_SQL, [orgId, routeIds, hours]);
        return {
          source: 'Tiger Data (route_risk_5m continuous aggregate)',
          windowHours: hours,
          routes: rows.map((r) => ({
            route_id: r.route_id,
            avg_risk: r1(r.avg_risk),
            peak_risk: r1(r.peak_risk),
            current_risk: r1(r.current_risk),
            avg_delay_hours: r1(r.avg_delay ?? 0),
            incidents: r.incidents,
            samples: r.samples,
          })),
        };
      } catch (err) {
        console.warn('[tiger] history query failed, using SpacetimeDB telemetry:', (err as Error).message);
        return fallback.routeHistory(orgId, routeIds, hours);
      }
    },
  };
}

function spacetimeHistory(ops: Ops): HistoryProvider {
  return {
    async routeHistory(orgId, routeIds) {
      const ids = new Set(routeIds);
      const rows = [...ops.db.telemetry.iter()].filter((t) => t.orgId === orgId && ids.has(t.routeId));
      const routes: RouteHistoryRow[] = routeIds.map((id) => {
        const mine = rows.filter((t) => t.routeId === id).sort((a, b) => (a.ts.microsSinceUnixEpoch < b.ts.microsSinceUnixEpoch ? -1 : 1));
        const risks = mine.map((t) => t.riskIndex);
        return {
          route_id: id,
          avg_risk: r1(risks.reduce((s, x) => s + x, 0) / Math.max(risks.length, 1)),
          peak_risk: r1(Math.max(0, ...risks)),
          current_risk: r1(risks.at(-1) ?? 0),
          avg_delay_hours: r1(mine.reduce((s, t) => s + t.delayHours, 0) / Math.max(mine.length, 1)),
          incidents: 0,
          samples: mine.length,
        };
      });
      return { source: 'SpacetimeDB telemetry (last ~10 min; Tiger Data not connected)', windowHours: 0.2, routes };
    },
  };
}
