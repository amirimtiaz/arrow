'use client';

/**
 * Live briefing feed: "no digging" status updates for every employee.
 * Anyone can escalate an item to executives ("bottom data to the top") or
 * export the feed as CSV for a report.
 */
import clsx from 'clsx';
import { ArrowUpRight, Briefcase, Download, Globe2, Megaphone, Rss, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { FeedItem } from '@/module_bindings/ops/types';
import { timeAgo, tsToDate } from '@/lib/format';
import { useCurrentOrg, useMyProfile, useOps } from '@/lib/ops/client';
import { useFeed } from '@/lib/ops/hooks';
import { FEED_SEVERITY } from '@/lib/ops/status';
import { TopBarTitle } from '@/components/shell/TopBarSlots';
import { Button, EmptyState, Panel, StatusChip } from '@/components/ui/primitives';
import { errorMessage, useToast } from '@/components/ui/toast';

const SEVERITIES = ['all', 'critical', 'warning', 'info', 'success'] as const;
const CATEGORY_LABEL: Record<string, string> = {
  system: 'System',
  scenario: 'Disruption',
  agent: 'Agent',
  action: 'Action',
  cyber: 'Cyber',
  briefing: 'Briefing',
};

export function FeedView() {
  const feed = useFeed();
  const org = useCurrentOrg();
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>('all');
  const [executiveOnly, setExecutiveOnly] = useState(false);
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return feed.filter(
      (f) =>
        (severity === 'all' || f.severity === severity) &&
        (!executiveOnly || f.audience === 'executive' || f.escalated) &&
        (!q || f.text.toLowerCase().includes(q) || f.author.toLowerCase().includes(q))
    );
  }, [feed, severity, executiveOnly, query]);

  const exportCsv = () => {
    const header = ['time_utc', 'severity', 'category', 'audience', 'author', 'escalated', 'text'];
    const rows = items.map((f) => [
      tsToDate(f.ts).toISOString(),
      f.severity,
      f.category,
      f.audience,
      f.author,
      String(f.escalated),
      f.text,
    ]);
    const csv = [header, ...rows].map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `arrow-feed-${org?.slug ?? 'workspace'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <TopBarTitle>
        <div className="min-w-0">
          <p className="text-[15px] leading-tight font-extrabold text-accent">Live Feed</p>
          <p className="truncate text-[11.5px] text-muted">What changed, why it matters, what is recommended · {org?.name ?? '…'}</p>
        </div>
      </TopBarTitle>

      <div className="mx-auto max-w-4xl space-y-4 p-5">
        <Panel className="flex flex-wrap items-center gap-3 p-3">
          <label className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5">
            <Search className="size-4 text-faint" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the feed"
              className="h-full flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-faint"
              aria-label="Search the feed"
            />
          </label>
          <div className="flex rounded-lg border border-line bg-panel-2 p-0.5" role="group" aria-label="Filter by severity">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={severity === s}
                onClick={() => setSeverity(s)}
                className={clsx(
                  'rounded-md px-2.5 py-1 text-[12px] font-semibold capitalize',
                  severity === s ? 'bg-accent text-white' : 'text-muted hover:text-fg'
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={executiveOnly}
            onClick={() => setExecutiveOnly(!executiveOnly)}
            className={clsx(
              'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold',
              executiveOnly ? 'border-violet/50 bg-violet-soft text-violet' : 'border-line text-muted hover:text-fg'
            )}
          >
            <Briefcase className="size-4" aria-hidden />
            Executive view
          </button>
          <Button icon={Download} onClick={exportCsv} disabled={items.length === 0}>
            Export CSV
          </Button>
        </Panel>

        {items.length === 0 ? (
          <Panel>
            <EmptyState icon={Rss} title={feed.length === 0 ? 'The feed is quiet' : 'No items match these filters'}>
              {feed.length === 0
                ? 'Trigger a scenario on the Silk Road. Agents and people post updates here as they happen.'
                : 'Try clearing the search or filters.'}
            </EmptyState>
          </Panel>
        ) : (
          <ol className="space-y-2">
            {items.map((item) => (
              <FeedRow key={String(item.id)} item={item} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const meta = FEED_SEVERITY[item.severity] ?? FEED_SEVERITY.info;
  const profile = useMyProfile();
  const { conn } = useOps();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const disruptionLink = item.link.startsWith('disruption:') ? `/app?focus=${item.link}` : null;

  const escalate = async () => {
    if (!conn) return;
    setBusy(true);
    try {
      await conn.reducers.escalateFeedItem({ feedItemId: item.id });
      toast({ title: 'Escalated to executives', tone: 'success' });
    } catch (err) {
      toast({ title: 'Could not escalate', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      <Panel className="flex gap-3 p-3.5">
        <span className={clsx('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', meta.soft, meta.text)}>
          <meta.icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            <StatusChip meta={meta} />
            <span className="rounded-md bg-panel-2 px-1.5 py-0.5 font-semibold">{CATEGORY_LABEL[item.category] ?? item.category}</span>
            {(item.audience === 'executive' || item.escalated) && (
              <span className="flex items-center gap-1 rounded-md bg-violet-soft px-1.5 py-0.5 font-semibold text-violet">
                <Briefcase className="size-3" aria-hidden />
                Executive
              </span>
            )}
            <span>{item.author}</span>·<time dateTime={tsToDate(item.ts).toISOString()}>{timeAgo(tsToDate(item.ts))}</time>
          </div>
          <p className="mt-1 text-[13.5px] leading-relaxed text-fg">{item.text}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {disruptionLink && (
              <Link
                href={disruptionLink}
                className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11.5px] font-semibold text-muted hover:text-fg"
              >
                <Globe2 className="size-3.5" aria-hidden />
                View on Silk Road
              </Link>
            )}
            {!item.escalated && item.audience !== 'executive' && profile && (
              <button
                type="button"
                disabled={busy}
                onClick={escalate}
                className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11.5px] font-semibold text-muted hover:text-fg disabled:opacity-50"
              >
                <ArrowUpRight className="size-3.5" aria-hidden />
                Escalate to executives
              </button>
            )}
            {item.category === 'briefing' && (
              <span className="flex items-center gap-1 text-[11px] text-faint">
                <Megaphone className="size-3" aria-hidden />
                Shared with all employees
              </span>
            )}
          </div>
        </div>
      </Panel>
    </li>
  );
}
