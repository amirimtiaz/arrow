/** Tiny HTTP API for the Analytics page (proxied by Next.js at /api/worker/*). */
import http from 'node:http';
import { config, llmConfigured, tigerConfigured } from './config';
import { historySummary, riskSeries, securitySeries, TigerNotConfigured, topRoutes } from './tiger/analytics';
import type { Anomaly } from './tiger/bridge';

export function startHttp(getAnomalies: () => Anomaly[], getTigerHealthy: () => boolean) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const orgId = Number(url.searchParams.get('orgId') ?? 1);
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    try {
      switch (url.pathname) {
        case '/health':
          return send(200, {
            agent: llmConfigured ? 'ready' : 'not_configured',
            model: config.nemotronModel,
            tiger: tigerConfigured ? (getTigerHealthy() ? 'connected' : 'unreachable') : 'not_configured',
          });
        case '/analytics/risk':
          return send(200, { series: await riskSeries(orgId, clamp(url.searchParams.get('hours'), 1, 168, 24)) });
        case '/analytics/security':
          return send(200, { series: await securitySeries(orgId, clamp(url.searchParams.get('minutes'), 5, 10080, 60)) });
        case '/analytics/top-routes':
          return send(200, { routes: await topRoutes(orgId, clamp(url.searchParams.get('hours'), 1, 168, 24)) });
        case '/analytics/summary':
          return send(200, await historySummary(orgId));
        case '/analytics/anomalies':
          return send(200, { anomalies: getAnomalies().filter((a) => a.orgId === orgId) });
        default:
          return send(404, { error: 'not_found' });
      }
    } catch (err) {
      if (err instanceof TigerNotConfigured) return send(503, { error: 'tiger_not_configured' });
      console.warn('[http] error:', (err as Error).message);
      return send(500, { error: 'query_failed', message: (err as Error).message });
    }
  });
  server.listen(config.httpPort, '127.0.0.1', () => console.log(`[http] analytics API on http://127.0.0.1:${config.httpPort}`));
  return server;
}

function clamp(value: string | null, min: number, max: number, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}
