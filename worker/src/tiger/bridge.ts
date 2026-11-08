/**
 * Tiger bridge: mirrors SpacetimeDB telemetry into Tiger hypertables and runs
 * z-score anomaly detection in SQL. A hit calls the report_disruption reducer,
 * which triggers the agent: Tiger actually enables detection.
 */
import type { Ops } from '../spacetime';
import { tiger } from './db';

export interface Anomaly {
  orgId: number;
  routeId: number;
  routeLabel: string;
  recentRisk: number;
  baselineMean: number;
  baselineSd: number;
  z: number;
  detectedAt: string;
  reported: boolean;
}

const FLUSH_MS = 5000;
const ANOMALY_MS = 15_000;
const Z_THRESHOLD = 3;
const COOLDOWN_MS = 10 * 60_000;

/** Latest minute vs a 24 h baseline from the continuous aggregate (excluding the last 10 min). */
const ANOMALY_SQL = `
  WITH recent AS (
    SELECT org_id, route_id, avg(risk_index) AS recent_risk
    FROM route_metrics
    WHERE time > now() - interval '1 minute'
    GROUP BY org_id, route_id
  ), baseline AS (
    SELECT route_id, avg(avg_risk) AS mean, stddev_samp(avg_risk) AS sd
    FROM route_risk_5m
    WHERE bucket > now() - interval '24 hours' AND bucket < now() - interval '10 minutes'
    GROUP BY route_id
    HAVING count(*) >= 12
  )
  SELECT r.org_id, r.route_id, r.recent_risk::float8, b.mean::float8, coalesce(b.sd, 0)::float8 AS sd,
         ((r.recent_risk - b.mean) / greatest(coalesce(b.sd, 0), 1.5))::float8 AS z
  FROM recent r JOIN baseline b USING (route_id)
  WHERE (r.recent_risk - b.mean) / greatest(coalesce(b.sd, 0), 1.5) > $1
  ORDER BY z DESC`;

export function startTigerBridge(ops: Ops) {
  const db = tiger();
  if (!db) return { stop: () => undefined };

  const startedAt = Date.now() * 1000;
  const telemetry: unknown[][] = [];
  const security: unknown[][] = [];
  const shipmentEvents: unknown[][] = [];
  const lastReported = new Map<number, number>();

  ops.db.telemetry.onInsert((_ctx, row) => {
    if (Number(row.ts.microsSinceUnixEpoch) < startedAt) return; // skip rows replayed on subscribe
    telemetry.push([
      new Date(Number(row.ts.microsSinceUnixEpoch / 1000n)),
      row.orgId,
      row.routeId,
      row.delayHours,
      row.riskIndex,
      row.costUsd,
      row.inTransitUnits,
    ]);
  });
  ops.db.securityEvent.onInsert((_ctx, row) => {
    if (Number(row.ts.microsSinceUnixEpoch) < startedAt) return;
    security.push([new Date(Number(row.ts.microsSinceUnixEpoch / 1000n)), row.orgId, row.kind, row.severity, row.source]);
  });
  ops.db.shipment.onUpdate((_ctx, before, after) => {
    if (before.status === after.status && before.routeId === after.routeId) return;
    const route = ops.db.route.id.find(after.routeId);
    const mid = route?.waypoints[Math.floor(route.waypoints.length / 2)];
    shipmentEvents.push([new Date(), after.orgId, after.id, `${before.status}→${after.status}`, mid?.lat ?? null, mid?.lng ?? null]);
  });

  const insert = async (table: string, columns: string[], rows: unknown[][]) => {
    if (rows.length === 0) return;
    const batch = rows.splice(0, rows.length);
    const values: unknown[] = [];
    const tuples = batch.map((row, i) => {
      values.push(...row);
      return `(${row.map((_, j) => `$${i * row.length + j + 1}`).join(',')})`;
    });
    await db.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${tuples.join(',')}`, values);
  };

  const flush = setInterval(async () => {
    try {
      await insert('route_metrics', ['time', 'org_id', 'route_id', 'delay_hours', 'risk_index', 'cost_usd', 'in_transit_units'], telemetry);
      await insert('security_events', ['time', 'org_id', 'kind', 'severity', 'source'], security);
      await insert('shipment_events', ['time', 'org_id', 'shipment_id', 'event', 'lat', 'lng'], shipmentEvents);
    } catch (err) {
      console.warn('[tiger] mirror failed:', (err as Error).message);
    }
  }, FLUSH_MS);

  const detect = setInterval(async () => {
    try {
      const { rows } = await db.query(ANOMALY_SQL, [Z_THRESHOLD]);
      for (const hit of rows) {
        const route = ops.db.route.id.find(hit.route_id);
        if (!route || route.status !== 'healthy') continue; // already explained by a known disruption
        const last = lastReported.get(route.id) ?? 0;
        if (Date.now() - last < COOLDOWN_MS) continue;
        lastReported.set(route.id, Date.now());

        const anomaly: Anomaly = {
          orgId: hit.org_id,
          routeId: route.id,
          routeLabel: route.label,
          recentRisk: round(hit.recent_risk),
          baselineMean: round(hit.mean),
          baselineSd: round(hit.sd),
          z: round(hit.z),
          detectedAt: new Date().toISOString(),
          reported: false,
        };

        const kind = route.mode === 'sea' ? 'port_congestion' : route.mode === 'air' ? 'weather' : 'accident';
        await ops.reducers.reportDisruption({
          orgId: route.orgId,
          routeId: route.id,
          kind,
          title: `Anomaly: risk spike on ${route.label}`,
          summary: `Tiger Data anomaly detection: risk index ${anomaly.recentRisk} vs 24 h baseline ${anomaly.baselineMean} ± ${anomaly.baselineSd} (z = ${anomaly.z}) on the ${route.lane} lane. Cause not yet confirmed.`,
          severity: anomaly.z > 8 ? 'high' : 'moderate',
          durationHours: Math.max(6, Math.round(route.baseEtaHours * 0.25)),
          source: 'anomaly',
        });
        anomaly.reported = true;
        // Logged in Tiger so the website's Analytics page can show detections without reaching this worker.
        await db.query(
          `INSERT INTO anomaly_log (time, org_id, route_id, route_label, recent_risk, baseline_mean, baseline_sd, z, reported)
           VALUES (now(), $1, $2, $3, $4, $5, $6, $7, $8)`,
          [anomaly.orgId, anomaly.routeId, anomaly.routeLabel, anomaly.recentRisk, anomaly.baselineMean, anomaly.baselineSd, anomaly.z, anomaly.reported]
        );
        console.log(`[tiger] anomaly on ${route.label} (z=${anomaly.z}) reported as a disruption`);
      }
    } catch (err) {
      console.warn('[tiger] anomaly detection failed:', (err as Error).message);
    }
  }, ANOMALY_MS);

  return {
    stop() {
      clearInterval(flush);
      clearInterval(detect);
    },
  };
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}
