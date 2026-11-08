'use client';

/**
 * Live briefing feed: "no digging" status updates for every employee.
 * Anyone can escalate an item to executives ("bottom data to the top") or
 * export the feed as CSV for a report.
 */
import clsx from 'clsx';
import { Briefcase, Download, Rss, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { tsToDate } from '@/lib/format';
import { useCurrentOrg } from '@/lib/ops/client';
import { useDisruptions, useFeed } from '@/lib/ops/hooks';
import { TopBarTitle } from '@/components/shell/TopBarSlots';
import { Button, EmptyState, Panel } from '@/components/ui/primitives';
import { FeedRow } from './FeedRow';
import { RiskColumn } from './RiskColumn';

const SEVERITIES = ['all', 'critical', 'warning', 'info', 'success'] as const;
export function FeedView() {
  const feed = useFeed();
  const org = useCurrentOrg();
  const { all: disruptions } = useDisruptions();
  const disruptionsById = useMemo(() => new Map(disruptions.map((d) => [String(d.id), d])), [disruptions]);
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

      {/* Feed in the middle; the live risk monitor stands tall beside it on wide screens. */}
      <div className="mx-auto flex max-w-[1340px] items-start justify-center gap-5 p-5">
        <div className="min-w-0 max-w-4xl flex-1 space-y-4">
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
                <FeedRow
                  key={String(item.id)}
                  item={item}
                  disruption={item.link.startsWith('disruption:') ? disruptionsById.get(item.link.slice(11)) : undefined}
                />
              ))}
            </ol>
          )}
        </div>
        <aside className="sticky top-5 hidden h-[calc(100vh-6rem)] w-[290px] shrink-0 xl:block">
          <RiskColumn />
        </aside>
      </div>
    </div>
  );
}

