'use client';

import clsx from 'clsx';
import { ChevronDown, Dices, Radar, RotateCcw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useAgentService } from '@/lib/ops/agent';
import { useCurrentOrg, useMyProfile, useOps } from '@/lib/ops/client';
import { useDisruptions, useScenarioPresets } from '@/lib/ops/hooks';
import { DISRUPTION_KIND, SEVERITY } from '@/lib/ops/status';
import { errorMessage, useToast } from '@/components/ui/toast';
import { useSilkRoad } from './SilkRoadState';

/** Top-right overlay: trigger scenario presets (the agent reacts on its own). */
export function ScenarioPanel() {
  const { scenariosOpen, setScenariosOpen, setFocusId } = useSilkRoad();
  const presets = useScenarioPresets();
  const { active } = useDisruptions();
  const org = useCurrentOrg();
  const profile = useMyProfile();
  const { conn } = useOps();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const service = useAgentService();
  const tigerReady = service.state === 'online' && service.tigerConnected;

  const activeKeys = new Set(active.map((d) => d.scenarioKey));
  const canTrigger = !!profile && profile.role !== 'executive';
  const canReset = profile?.role === 'manager';

  const run = async (key: string, action: () => Promise<void>, success: string) => {
    if (!conn) return;
    setBusy(key);
    try {
      await action();
      toast({ title: success, tone: 'success' });
    } catch (err) {
      toast({ title: 'Action failed', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="pointer-events-auto flex w-[260px] flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setScenariosOpen(!scenariosOpen)}
        aria-expanded={scenariosOpen}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-panel/95 px-3 text-[13px] font-semibold text-fg shadow-panel backdrop-blur hover:bg-panel-hover"
      >
        <ChevronDown className={clsx('size-3.5 transition-transform', !scenariosOpen && '-rotate-90')} aria-hidden />
        Crisis Scenarios
      </button>

      {scenariosOpen && (
        <div className="w-full rounded-xl border border-line bg-panel/95 p-3 shadow-panel backdrop-blur">
          <div className="flex items-center justify-between px-1">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-fg">
              <TriangleAlert className="size-4 text-danger" aria-hidden />
              Scenarios
            </h2>
            <span className={clsx('text-[11px] font-semibold', active.length ? 'text-danger' : 'text-muted')}>{active.length} active</span>
          </div>

          <ul className="mt-2 space-y-1.5">
            {presets.map((p) => {
              const isActive = activeKeys.has(p.key);
              const KindIcon = DISRUPTION_KIND[p.kind]?.icon ?? TriangleAlert;
              const activeRow = active.find((d) => d.scenarioKey === p.key);
              return (
                <li key={p.key}>
                  <button
                    type="button"
                    disabled={!canTrigger || busy !== null || (isActive && !activeRow)}
                    onClick={() =>
                      isActive && activeRow
                        ? setFocusId(activeRow.id)
                        : run(p.key, () => conn!.reducers.triggerScenario({ orgId: p.orgId, scenarioKey: p.key }), `Triggered: ${p.title}`)
                    }
                    title={isActive ? 'Active: click to focus' : p.summary}
                    className={clsx(
                      'flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                      isActive
                        ? 'border-danger/40 bg-danger-soft text-danger'
                        : 'border-line bg-panel-2 text-fg hover:border-line-strong hover:bg-panel-hover'
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <KindIcon className={clsx('size-3.5 shrink-0', isActive ? 'text-danger' : 'text-muted')} aria-hidden />
                      <span className="truncate font-medium">{p.shortLabel}</span>
                    </span>
                    <span
                      className={clsx('shrink-0 text-[10px] font-bold uppercase', isActive ? 'text-danger' : SEVERITY[p.severity]?.text)}
                    >
                      {isActive ? 'Active' : p.tag}
                    </span>
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                disabled={!canTrigger || busy !== null || !org}
                onClick={() => run('random', () => conn!.reducers.triggerRandomScenario({ orgId: org!.id }), 'Random disruption generated')}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-line-strong px-2.5 py-2 text-[13px] text-fg hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex items-center gap-2">
                  <Dices className="size-3.5 text-violet" aria-hidden />
                  Random disruption
                </span>
                <span className="text-[10px] font-bold text-violet uppercase">Generate</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                disabled={!canTrigger || busy !== null || !org || !tigerReady}
                onClick={() =>
                  run(
                    'congestion',
                    () => conn!.reducers.simulateCongestion({ orgId: org!.id }),
                    'Congestion build-up started. Tiger Data will decide.'
                  )
                }
                title={
                  tigerReady
                    ? 'Silently raises one lane’s telemetry. No disruption is declared; Tiger Data anomaly detection must catch it.'
                    : 'Requires the agent worker with Tiger Data connected'
                }
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-line-strong px-2.5 py-2 text-[13px] text-fg hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex items-center gap-2">
                  <Radar className="size-3.5 text-cyan" aria-hidden />
                  Simulate congestion
                </span>
                <span className="text-[10px] font-bold text-cyan uppercase">{tigerReady ? 'Tiger' : 'Needs Tiger'}</span>
              </button>
            </li>
          </ul>

          <div className="mt-2 flex items-center justify-between gap-2 px-1 pt-1">
            <p className="text-[11px] text-faint">
              {canTrigger ? 'The agent investigates automatically.' : 'Executives have a read-only view.'}
            </p>
            {canReset && org && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  if (
                    window.confirm(`Reset the ${org.name} demo workspace? Active disruptions, agent runs and the feed will be cleared.`)
                  ) {
                    void run('reset', () => conn!.reducers.resetOrg({ orgId: org.id }), 'Workspace reset');
                  }
                }}
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-muted hover:bg-panel-hover hover:text-fg"
              >
                <RotateCcw className="size-3" aria-hidden />
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
