'use client';

/**
 * Grok News Scout panel. Grok 4.7 (free via Puter.js; the signed-in Puter
 * user covers usage) reads REAL headlines from the last 7 days and flags the
 * ones that threaten this workspace's lanes. It runs on click and then
 * automatically every 30 minutes while someone signed in to Puter has Silk
 * Road open. A person decides: escalate (opens a disruption → the Nemotron
 * agents investigate) or dismiss. News is real; the network is simulated.
 */
import clsx from 'clsx';
import { ExternalLink, Loader2, Newspaper, RefreshCw, Siren, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NewsSignal } from '@/module_bindings/ops/types';
import { safeJson, timeAgo, tsToDate, tsToMs } from '@/lib/format';
import { analyzeWithGrok, fetchArticles, GROK_MODEL, isPuterSignedIn, watchPlaces } from '@/lib/grok-scout';
import { useCurrentOrg, useMyProfile, useOps } from '@/lib/ops/client';
import { useLatestNewsScan, useNetwork, useNewsSignals } from '@/lib/ops/hooks';
import { useSettings } from '@/lib/settings';
import { errorMessage, useToast } from '@/components/ui/toast';
import { MapCard } from './MapCard';
import { useSilkRoad } from './SilkRoadState';

const AUTO_SCAN_MS = 30 * 60_000;
const MODEL_LABEL = `${GROK_MODEL} via Puter`;

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'text-danger bg-danger-soft',
  warning: 'text-warning bg-warning-soft',
  watch: 'text-violet bg-violet-soft',
};

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

type Stage = 'idle' | 'reading' | 'thinking' | 'saving';

export function NewsSignals() {
  const { updateMap } = useSettings();
  const signals = useNewsSignals().filter((s) => s.status !== 'dismissed');
  const scan = useLatestNewsScan();
  const network = useNetwork();
  const org = useCurrentOrg();
  const profile = useMyProfile();
  const { conn } = useOps();
  const toast = useToast();
  const [stage, setStage] = useState<Stage>('idle');
  const [signedIn, setSignedIn] = useState(false);
  const running = useRef(false);
  const canScan = !!profile && profile.role !== 'executive' && !!org && !!conn;

  const runScan = useCallback(
    async (trigger: 'manual' | 'auto') => {
      if (!conn || !org || running.current) return;
      running.current = true;
      let articleCount = 0;
      try {
        setStage('reading');
        const articles = await fetchArticles(watchPlaces(network.nodes, network.routes));
        articleCount = articles.length;
        setStage('thinking');
        const found = await analyzeWithGrok(org, network.nodes, network.routes, articles);
        setStage('saving');
        await conn.reducers.submitNewsScan({ orgId: org.id, trigger, model: MODEL_LABEL, articleCount, signals: found, error: '' });
        setSignedIn(await isPuterSignedIn());
        if (trigger === 'manual') {
          toast({
            title: `Grok reviewed ${articleCount} headlines`,
            description: `${found.length} relevant signals found.`,
            tone: 'success',
          });
        }
      } catch (err) {
        const message = errorMessage(err) || 'Scan failed';
        await conn.reducers
          .submitNewsScan({ orgId: org.id, trigger, model: MODEL_LABEL, articleCount, signals: [], error: message })
          .catch(() => undefined);
        if (trigger === 'manual') toast({ title: 'News scan failed', description: message, tone: 'error' });
      } finally {
        running.current = false;
        setStage('idle');
      }
    },
    [conn, org, network.nodes, network.routes, toast]
  );

  // Automation: rescan every 30 min while a signed-in Puter user has Silk Road open.
  const lastScanMs = scan ? tsToMs(scan.startedAt) : 0;
  useEffect(() => {
    if (!canScan) return;
    let cancelled = false;
    const check = async () => {
      const ok = await isPuterSignedIn();
      if (cancelled) return;
      setSignedIn(ok);
      if (ok && Date.now() - lastScanMs > AUTO_SCAN_MS) void runScan('auto');
    };
    void check();
    const id = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [canScan, lastScanMs, runScan]);

  const busy = stage !== 'idle';
  const status: Record<Stage, string> = {
    reading: 'Fetching real headlines…',
    thinking: 'Grok is analyzing headlines…',
    saving: 'Saving signals…',
    idle:
      scan?.status === 'failed'
        ? `Last scan failed: ${scan.error}`
        : scan?.finishedAt
          ? `${timeAgo(tsToDate(scan.finishedAt))} · ${scan.searchCalls} headlines · ${scan.signalCount} signals`
          : 'Not scanned yet',
  };

  return (
    <MapCard
      id="news"
      title="Live news"
      icon={Newspaper}
      iconClassName="text-violet"
      width={260}
      anchor={{ right: 16, bottom: 16 }}
      badge={<span className="shrink-0 rounded-md bg-violet-soft px-1.5 py-0.5 text-[10px] font-bold text-violet">Grok bot</span>}
      onClose={() => updateMap({ showNews: false })}
      closeTitle="Hide live news (turn it back on in Settings › Map)"
    >
      <div className="px-3 pt-2 pb-3">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
          <span className="min-w-0 truncate" title={status[stage]}>
            {status[stage]}
          </span>
          <button
            type="button"
            onClick={() => runScan('manual')}
            disabled={!canScan || busy}
            title={signedIn ? 'Scan real headlines with Grok now' : 'Scan with Grok (free via Puter: sign in to Puter the first time)'}
            className="flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-0.5 font-semibold text-fg hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <RefreshCw className="size-3" aria-hidden />}
            Scan
          </button>
        </div>

        {signals.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-line p-2 text-[11.5px] text-faint">
            No live signals. Grok reads this week&apos;s real headlines about your ports, hubs and canals and flags storms, strikes,
            closures and cyberattacks.
          </p>
        ) : (
          <ul className="scroll-thin mt-2 max-h-[190px] space-y-1.5 overflow-y-auto pr-0.5">
            {signals.slice(0, 6).map((s) => (
              <SignalRow key={String(s.id)} signal={s} />
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-[10px] text-faint">
          Grok 4.7 via Puter (free) · real headlines · {signedIn ? 'auto-scans every 30 min' : 'click Scan to sign in to Puter'} · network
          data simulated
        </p>
      </div>
    </MapCard>
  );
}

function SignalRow({ signal }: { signal: NewsSignal }) {
  const profile = useMyProfile();
  const { conn } = useOps();
  const toast = useToast();
  const { setFocusId } = useSilkRoad();
  const [busy, setBusy] = useState(false);
  const sources = safeJson<string[]>(signal.sourcesJson, []).filter((u) => /^https?:\/\//.test(u));
  const canAct = !!profile && profile.role !== 'executive' && signal.status === 'new';

  const act = async (escalate: boolean) => {
    if (!conn) return;
    setBusy(true);
    try {
      if (escalate) await conn.reducers.escalateNewsSignal({ signalId: signal.id });
      else await conn.reducers.dismissNewsSignal({ signalId: signal.id });
      toast({ title: escalate ? 'Escalated: the agents will investigate' : 'Signal dismissed', tone: escalate ? 'success' : 'info' });
    } catch (err) {
      toast({ title: 'Action failed', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-line bg-panel-2 p-2">
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className={clsx('rounded px-1 py-0.5 font-bold uppercase', SEVERITY_STYLE[signal.severity] ?? SEVERITY_STYLE.watch)}>
          {signal.severity}
        </span>
        <span className="truncate text-faint">
          {signal.region} · {Math.round(signal.relevance * 100)}% relevant
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-snug font-semibold text-fg">{signal.headline}</p>
      {signal.summary && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{signal.summary}</p>}
      {sources.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-x-2 text-[10.5px]">
          {sources.slice(0, 3).map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-accent hover:underline"
            >
              {domain(url) === 'news.google.com' ? 'Read article' : domain(url)}
              <ExternalLink className="size-2.5" aria-hidden />
            </a>
          ))}
        </p>
      )}
      {signal.status === 'escalated' ? (
        <button
          type="button"
          onClick={() => setFocusId(signal.disruptionId)}
          className="mt-1.5 text-[11px] font-semibold text-accent hover:underline"
        >
          Escalated by {signal.decidedByName} · view disruption
        </button>
      ) : (
        canAct && (
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              disabled={busy || signal.routeIds.length === 0}
              onClick={() => act(true)}
              title={
                signal.routeIds.length === 0
                  ? 'This signal is not mapped to any of your lanes'
                  : 'Open a disruption; the Nemotron agents investigate'
              }
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
            >
              <Siren className="size-3" aria-hidden />
              Escalate
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(false)}
              className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-muted hover:text-fg disabled:opacity-50"
            >
              <X className="size-3" aria-hidden />
              Dismiss
            </button>
          </div>
        )
      )}
    </li>
  );
}
