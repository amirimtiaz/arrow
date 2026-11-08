'use client';

import clsx from 'clsx';
import { ScrollText } from 'lucide-react';
import { formatClock, tsToDate } from '@/lib/format';
import { useFeed } from '@/lib/ops/hooks';
import { FEED_SEVERITY } from '@/lib/ops/status';
import { EmptyState, SectionLabel } from '@/components/ui/primitives';
import { useSilkRoad } from './SilkRoadState';

export const RISK_ALERT_THRESHOLD = 40;

/** System event log: on the Current AI Agents tab. Clicking a disruption event focuses it. */
export function EventLog() {
  const feed = useFeed();
  const { setFocusId } = useSilkRoad();
  const items = feed.slice(0, 40);

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel p-3"
      aria-label="System event log"
    >
      <SectionLabel icon={ScrollText} right={<span className="text-[11px] text-faint">{feed.length} events</span>}>
        System event log
      </SectionLabel>
      <ol className="scroll-thin mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {items.length === 0 && <EmptyState icon={ScrollText} title="No events yet" />}
        {items.map((item) => {
          const meta = FEED_SEVERITY[item.severity] ?? FEED_SEVERITY.info;
          const Icon = meta.icon;
          const disruptionId = item.link.startsWith('disruption:') ? BigInt(item.link.slice(11)) : null;
          return (
            <li key={String(item.id)}>
              <button
                type="button"
                disabled={disruptionId === null}
                onClick={() => disruptionId !== null && setFocusId(disruptionId)}
                className={clsx(
                  'flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-[12px] leading-snug',
                  disruptionId !== null ? 'hover:bg-panel-hover' : 'cursor-default'
                )}
              >
                <span className="shrink-0 pt-px font-mono text-[10px] text-faint">{formatClock(tsToDate(item.ts), 'UTC')} UTC</span>
                <Icon className={clsx('mt-px size-3.5 shrink-0', meta.text)} aria-label={meta.label} />
                <span className="min-w-0 text-fg/90">{item.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
