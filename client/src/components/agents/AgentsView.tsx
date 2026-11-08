'use client';

/**
 * Current AI Agents tab: everything about the Nemotron agents in one place, moved off the Silk Road map so the map
 * can use the full screen. Left: which disruption to follow, its risk assessment and the agent roster. Centre: the
 * live agent trace (reasoning, options, decision with Approve/Reject, execution). Right: the system event log.
 * The header carries the agent status and Change Route.
 */
import clsx from 'clsx';
import { RefreshCw, Shuffle, Siren, TriangleAlert } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCurrentOrg } from '@/lib/ops/client';
import { timeAgo, tsToDate } from '@/lib/format';
import { useDisruptions, useOptions, useRunForDisruption } from '@/lib/ops/hooks';
import { DISRUPTION_KIND, SEVERITY } from '@/lib/ops/status';
import { TopBarActions, TopBarTitle } from '@/components/shell/TopBarSlots';
import { SectionLabel, StatusChip } from '@/components/ui/primitives';
import { AgentRoster, RiskAssessment } from '@/components/silk-road/AgentPanels';
import { AgentTrace } from '@/components/silk-road/AgentTrace';
import { EventLog } from '@/components/silk-road/BottomStrip';
import { SilkRoadStateProvider, useFocusedDisruption, useSilkRoad } from '@/components/silk-road/SilkRoadState';

function parseFocus(value: string | null): bigint | null {
  const match = value?.match(/^disruption:(\d+)$/);
  return match ? BigInt(match[1]) : null;
}

export function AgentsView() {
  const params = useSearchParams();
  return (
    <SilkRoadStateProvider initialFocus={parseFocus(params.get('focus'))}>
      <AgentsLayout />
    </SilkRoadStateProvider>
  );
}

function AgentsLayout() {
  const disruption = useFocusedDisruption();
  const run = useRunForDisruption(disruption?.id);

  return (
    <div className="flex h-full min-h-0 gap-3 p-3">
      <AgentsTopBar />
      <aside className="scroll-thin flex w-[360px] shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-elevated p-4">
        <DisruptionPicker />
        <RiskAssessment disruption={disruption} />
        <AgentRoster run={run} disruption={disruption} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col rounded-xl border border-line bg-elevated p-4" aria-label="Agent trace">
        <AgentTrace run={run} disruption={disruption} />
      </main>
      <aside className="flex w-[380px] shrink-0 flex-col [&>section]:flex-1">
        <EventLog />
      </aside>
    </div>
  );
}

/** Which disruption the trace follows: active ones first, then the most recent resolved ones. */
function DisruptionPicker() {
  const { all } = useDisruptions();
  const focused = useFocusedDisruption();
  const { setFocusId } = useSilkRoad();
  const list = [...all]
    .sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || Number(b.id - a.id))
    .slice(0, 8);

  return (
    <section aria-label="Disruptions">
      <SectionLabel
        icon={Siren}
        right={<span className="text-[11px] text-faint">{all.filter((d) => d.status !== 'resolved').length} active</span>}
      >
        Following
      </SectionLabel>
      {list.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-line px-3 py-3 text-[12px] text-muted">
          No disruptions yet. Trigger a scenario on Silk Road and the agents start on their own.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {list.map((d) => {
            const KindIcon = DISRUPTION_KIND[d.kind]?.icon ?? TriangleAlert;
            const selected = focused?.id === d.id;
            const resolved = d.status === 'resolved';
            return (
              <li key={String(d.id)}>
                <button
                  type="button"
                  onClick={() => setFocusId(d.id)}
                  aria-pressed={selected}
                  className={clsx(
                    'flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left',
                    selected ? 'border-accent/50 bg-accent-soft' : 'border-line bg-panel hover:bg-panel-hover'
                  )}
                >
                  <KindIcon className={clsx('size-3.5 shrink-0', resolved ? 'text-faint' : 'text-danger')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block truncate text-[12.5px] font-semibold', resolved ? 'text-muted' : 'text-fg')}>
                      {d.title}
                    </span>
                    <span className="block text-[10.5px] text-faint">
                      {resolved ? 'Resolved' : d.status === 'mitigating' ? 'Mitigating' : 'Active'} · {timeAgo(tsToDate(d.createdAt))}
                    </span>
                  </span>
                  {!resolved && <StatusChip meta={SEVERITY[d.severity] ?? SEVERITY.moderate} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Title plus the agent status and Change Route, moved here from the Silk Road header. */
function AgentsTopBar() {
  const org = useCurrentOrg();
  const focused = useFocusedDisruption();
  const run = useRunForDisruption(focused?.id);
  const options = useOptions(focused?.id);
  const ui = useSilkRoad();
  const agentActive = run?.status === 'running';
  const awaiting = run?.status === 'awaiting_approval';

  return (
    <>
      <TopBarTitle>
        <div className="min-w-0">
          <p className="text-[15px] leading-tight font-extrabold text-accent">Current AI Agents</p>
          <p className="truncate text-[11.5px] text-muted">
            {focused
              ? `Following: ${focused.title}`
              : `${org?.name ?? 'Workspace'} · Nemotron agents start on their own when a disruption appears`}
          </p>
        </div>
      </TopBarTitle>
      <TopBarActions>
        <span
          className={clsx(
            'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold whitespace-nowrap',
            agentActive
              ? 'border-accent/40 bg-accent-soft text-accent'
              : awaiting
                ? 'border-warning/40 bg-warning-soft text-warning'
                : 'border-line bg-panel text-muted'
          )}
        >
          <Shuffle className={clsx('size-3.5', agentActive && 'animate-soft-pulse')} aria-hidden />
          {agentActive ? 'Agent active' : awaiting ? 'Awaiting approval' : 'Agent idle'}
        </span>
        <button
          type="button"
          disabled={options.length === 0}
          onClick={() => ui.setTraceTab(awaiting ? 'decision' : 'options')}
          title={options.length === 0 ? 'No scored reroute options for the followed disruption yet' : 'Review reroute options'}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[12px] font-semibold whitespace-nowrap text-fg hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Change Route
        </button>
      </TopBarActions>
    </>
  );
}
