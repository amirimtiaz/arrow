/**
 * Real headlines for the Grok News Scout. Fetches Google News RSS (free, no
 * key) server-side for the workspace's key places over the last 7 days, so
 * Grok only ever analyzes articles that actually exist.
 *   GET /api/news?place=Suez%20Canal&place=Yantian…
 */
import { NextResponse, type NextRequest } from 'next/server';

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
}

const RISK_TERMS = '(strike OR storm OR typhoon OR hurricane OR closure OR closed OR congestion OR blockage OR cyberattack OR ransomware OR outage OR flood OR shutdown)';
const MAX_PLACES = 16;
const PLACES_PER_QUERY = 6;

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function tag(xml: string, name: string): string {
  return decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? '');
}

async function search(places: string[]): Promise<NewsArticle[]> {
  const q = `(${places.map((p) => `"${p}"`).join(' OR ')}) ${RISK_TERMS} when:7d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { 'user-agent': 'Arrow-NewsScout/1.0' }, signal: AbortSignal.timeout(12_000), cache: 'no-store' });
  if (!res.ok) throw new Error(`Google News responded ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => ({
    title: tag(item, 'title').replace(/\s+-\s+[^-]+$/, ''),
    url: tag(item, 'link'),
    source: tag(item, 'source'),
    publishedAt: new Date(tag(item, 'pubDate')).toISOString(),
  }));
}

export async function GET(request: NextRequest) {
  const places = [...new Set(request.nextUrl.searchParams.getAll('place').map((p) => p.trim().slice(0, 60)).filter(Boolean))].slice(0, MAX_PLACES);
  if (places.length === 0) return NextResponse.json({ error: 'Pass at least one ?place=' }, { status: 400 });

  const chunks: string[][] = [];
  for (let i = 0; i < places.length; i += PLACES_PER_QUERY) chunks.push(places.slice(i, i + PLACES_PER_QUERY));
  try {
    const results = await Promise.all(chunks.map(search));
    const seen = new Set<string>();
    const articles = results
      .flat()
      .filter((a) => a.url.startsWith('https://') && a.title && !seen.has(a.title) && seen.add(a.title))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 30);
    return NextResponse.json({ articles, places });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'News search failed' }, { status: 502 });
  }
}
