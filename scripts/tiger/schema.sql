-- Arrow · Tiger Data schema (analytics + history only; SpacetimeDB owns state).
-- Applied by `npm run tiger:setup` in worker/. Safe to run repeatedly.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS route_metrics (
  time             timestamptz      NOT NULL,
  org_id           integer          NOT NULL,
  route_id         integer          NOT NULL,
  delay_hours      double precision NOT NULL DEFAULT 0,
  risk_index       double precision NOT NULL,
  cost_usd         double precision NOT NULL DEFAULT 0,
  in_transit_units integer          NOT NULL DEFAULT 0
);
SELECT create_hypertable('route_metrics', by_range('time'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS route_metrics_org_route_time ON route_metrics (org_id, route_id, time DESC);

CREATE TABLE IF NOT EXISTS shipment_events (
  time        timestamptz NOT NULL,
  org_id      integer     NOT NULL,
  shipment_id integer     NOT NULL,
  event       text        NOT NULL,
  lat         double precision,
  lng         double precision
);
SELECT create_hypertable('shipment_events', by_range('time'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS shipment_events_org_time ON shipment_events (org_id, time DESC);

CREATE TABLE IF NOT EXISTS security_events (
  time     timestamptz NOT NULL,
  org_id   integer     NOT NULL,
  kind     text        NOT NULL,
  severity text        NOT NULL,
  source   text        NOT NULL
);
SELECT create_hypertable('security_events', by_range('time'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS security_events_org_time ON security_events (org_id, time DESC);

-- 5-minute route risk rollup used by charts, the agent's history tool and
-- anomaly detection. Real-time so the newest raw rows are included too.
CREATE MATERIALIZED VIEW IF NOT EXISTS route_risk_5m
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket('5 minutes', time) AS bucket,
       org_id,
       route_id,
       avg(risk_index)       AS avg_risk,
       max(risk_index)       AS max_risk,
       avg(delay_hours)      AS avg_delay,
       avg(cost_usd)         AS avg_cost,
       max(in_transit_units) AS units
FROM route_metrics
GROUP BY bucket, org_id, route_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('route_risk_5m',
  start_offset      => INTERVAL '8 days',
  end_offset        => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists     => TRUE);

-- Anomalies detected by the worker's z-score SQL (shown on the Analytics page).
CREATE TABLE IF NOT EXISTS anomaly_log (
  time          timestamptz      NOT NULL,
  org_id        integer          NOT NULL,
  route_id      integer          NOT NULL,
  route_label   text             NOT NULL,
  recent_risk   double precision NOT NULL,
  baseline_mean double precision NOT NULL,
  baseline_sd   double precision NOT NULL,
  z             double precision NOT NULL,
  reported      boolean          NOT NULL
);
SELECT create_hypertable('anomaly_log', by_range('time'), if_not_exists => TRUE);
