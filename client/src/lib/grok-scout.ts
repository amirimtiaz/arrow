'use client';

/**
 * Grok News Scout (browser side). Grok runs through Puter.js ("user-pays":
 * the signed-in Puter user covers usage, so Arrow needs no xAI key). To keep
 * it factual, Grok never searches on its own: it only reads real headlines
 * fetched from Google News by /api/news, and every signal must cite them.
 */
import type { Node, Org, Route } from '@/module_bindings/ops/types';
import type { NewsArticle } from '@/app/api/news/route';
import { safeJson } from './format';

export const GROK_MODEL = 'x-ai/grok-4.7';
const KINDS = ['weather', 'port_congestion', 'strike', 'blockage', 'cyber', 'geopolitical', 'accident'];
const SEVERITIES = ['watch', 'warning', 'critical'];

export interface SignalInput {
  headline: string;
  summary: string;
  region: string;
  kind: string;
  severity: string;
  relevance: number;
  lat: number;
  lng: number;
  routeIds: number[];
  sources: string[];
}

export interface ScanResult {
  articles: NewsArticle[];
  signals: SignalInput[];
}

type PuterModule = typeof import('@heyputer/puter.js');
let puterPromise: Promise<PuterModule['puter']> | null = null;

/** Puter touches `window` on import, so it is loaded lazily in the browser only. */
function loadPuter() {
  puterPromise ??= import('@heyputer/puter.js').then((m) => m.puter);
  return puterPromise;
}

export async function isPuterSignedIn(): Promise<boolean> {
  try {
    return (await loadPuter()).auth.isSignedIn();
  } catch {
    return false;
  }
}

/** Places worth watching for this workspace: hubs, plus canals named in lanes. */
export function watchPlaces(nodes: Node[], routes: Route[]): string[] {
  const places = new Set<string>();
  for (const r of routes) {
    if (/suez/i.test(r.lane)) places.add('Suez Canal');
    if (/panama/i.test(r.lane)) places.add('Panama Canal');
    if (/malacca|asia–europe/i.test(r.lane)) places.add('Strait of Malacca');
  }
  for (const n of nodes) {
    if (n.standby) continue;
    if (n.kind === 'port') places.add(n.name.replace(/\s*\(.*\)$/, ''));
    else if (['airport', 'warehouse', 'kitchen'].includes(n.kind)) places.add(n.city.split(',')[0]);
  }
  return [...places].slice(0, 16);
}

export async function fetchArticles(places: string[]): Promise<NewsArticle[]> {
  const query = places.map((p) => `place=${encodeURIComponent(p)}`).join('&');
  const res = await fetch(`/api/news?${query}`, { cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `News search failed (${res.status})`);
  return body.articles as NewsArticle[];
}

function lanesBrief(org: Org, nodes: Node[], routes: Route[]): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return routes
    .filter((r) => r.status !== 'standby')
    .map((r) => `#${r.id} ${byId.get(r.fromNodeId)?.city ?? '?'} → ${byId.get(r.toNodeId)?.city ?? '?'} (${r.mode}, ${r.lane})`)
    .join('\n');
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : ((c as { text?: string }).text ?? ''))).join('');
  return '';
}

/** Ask Grok which real articles threaten which lanes. Must be called from a click the first time (Puter sign-in popup). */
export async function analyzeWithGrok(org: Org, nodes: Node[], routes: Route[], articles: NewsArticle[]): Promise<SignalInput[]> {
  if (articles.length === 0) return [];
  const puter = await loadPuter();
  const list = articles.map((a, i) => `[${i}] ${a.publishedAt.slice(0, 10)} · ${a.source} · ${a.title}`).join('\n');
  const prompt = `You are the Grok News Scout for Arrow, a supply-chain command center for ${org.name} (${org.industry}).
Below are REAL news headlines from the last 7 days and the workspace's lanes. Identify at most 5 headlines that describe an event likely to disrupt specific lanes in the next 7 days (weather, port congestion or closure, strikes, canal or strait blockages, cyberattacks on logistics, geopolitical incidents, road or rail closures). Ignore routine business news.

Headlines:
${list}

Lanes (id · origin → destination · mode · corridor):
${lanesBrief(org, nodes, routes)}

Reply with JSON only:
{"signals":[{"article":0,"headline":"short neutral headline","summary":"1-2 sentences: what is happening and which lanes it threatens","region":"…","kind":"weather|port_congestion|strike|blockage|cyber|geopolitical|accident","severity":"watch|warning|critical","relevance":0.0,"lat":0.0,"lng":0.0,"route_ids":[0]}]}
"article" is the [index] of the headline you rely on. lat/lng = where the event is. Use "critical" only if a lane is closed or about to close. If nothing qualifies, return {"signals":[]}.`;

  const response = await puter.ai.chat(prompt, { model: GROK_MODEL, temperature: 0.2, max_tokens: 2000 });
  const text = messageText(response.message?.content);
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const parsed = safeJson<{ signals?: Record<string, unknown>[] }>(json, {});
  const validRoutes = new Set(routes.map((r) => r.id));

  return (parsed.signals ?? [])
    .map((s): SignalInput | null => {
      const article = articles[Number(s.article)];
      const lat = Number(s.lat);
      const lng = Number(s.lng);
      if (!article || !Number.isFinite(lat) || !Number.isFinite(lng)) return null; // must cite a real article
      return {
        headline: String(s.headline ?? article.title).slice(0, 200),
        summary: String(s.summary ?? '').slice(0, 800),
        region: String(s.region ?? '').slice(0, 80),
        kind: KINDS.includes(String(s.kind)) ? String(s.kind) : 'geopolitical',
        severity: SEVERITIES.includes(String(s.severity)) ? String(s.severity) : 'watch',
        relevance: Math.min(1, Math.max(0, Number(s.relevance) || 0)),
        lat: Math.min(90, Math.max(-90, lat)),
        lng: Math.min(180, Math.max(-180, lng)),
        routeIds: (Array.isArray(s.route_ids) ? s.route_ids : []).map(Number).filter((id) => validRoutes.has(id)).slice(0, 6),
        sources: [article.url],
      };
    })
    .filter((s): s is SignalInput => !!s && s.relevance >= 0.25)
    .slice(0, 5);
}
