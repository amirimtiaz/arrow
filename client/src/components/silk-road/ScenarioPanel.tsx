'use client';

import clsx from 'clsx';
import { Dices, Radar, RotateCcw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useAgentService } from '@/lib/ops/agent';
import { useCurrentOrg, useMyProfile, useOps } from '@/lib/ops/client';
import { useDisruptions, useScenarioPresets } from '@/lib/ops/hooks';
import { DISRUPTION_KIND, SEVERITY } from '@/lib/ops/status';
import { useSettings } from '@/lib/settings';
import { errorMessage, useToast } from '@/components/ui/toast';
import { MapCard } from './MapCard';
import { useSilkRoad } from './SilkRoadState';

/**
 * Crisis scenarios card: trigger scenario presets (the agent reacts on its own). A draggable MapCard that starts in the
 * top-right corner. Settings › Scenarios decides whether it shows at all and which entries it lists.
 */
export function ScenarioPanel() {
  const { setFocusId } = useSilkRoad();
  const presets = useScenarioPresets();
  const { active } = useDisruptions();
  const org = useCurrentOrg();
  const profile = useMyProfile();
  const { conn } = useOps();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const service = useAgentService();
  const tigerReady = service.state === 'online' && service.tigerConnected;
  const { settings, updateScenarios } = useSettings();
  const hidden = new Set(settings.scenarios.hidden);
  const shownPresets = presets.filter((p) => !hidden.has(`${p.orgId}:${p.key}`));
  const showRandom = !hidden.has('random');
  const showCongestion = !hidden.has('congestion');
  const nothingListed = shownPresets.length === 0 && !showRandom && !showCongestion;

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

  if (!settings.scenarios.showWindow) return null;

  return (
    <MapCard
      id="scenarios"
      title="Crisis scenarios"
      icon={TriangleAlert}
      iconClassName="text-danger"
      width={260}
      anchor={{ right: 16, top: 16 }}
      badge={
        <span className={clsx('shrink-0 text-[11px] font-semibold', active.length ? 'text-danger' : 'text-muted')}>
          {active.length} active
        </span>
      }
      onClose={() => updateScenarios({ showWindow: false })}
      closeTitle="Hide scenarios (press S, or turn it back on in Settings › Scenarios)"
    >
      <div className="p-3">
        <ul className="space-y-1.5">
          {nothingListed && (
            <li className="rounded-lg border border-dashed border-line px-2.5 py-3 text-center text-[12px] text-muted">
              Every scenario is hidden. Pick which to list in Settings › Scenarios.
            </li>
          )}
          {shownPresets.map((p) => {
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
                  <span className={clsx('shrink-0 text-[10px] font-bold uppercase', isActive ? 'text-danger' : SEVERITY[p.severity]?.text)}>
                    {isActive ? 'Active' : p.tag}
                  </span>
                </button>
              </li>
            );
          })}
          {showRandom && (
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
          )}
          {showCongestion && (
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
          )}
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
                if (window.confirm(`Reset the ${org.name} demo workspace? Active disruptions, agent runs and the feed will be cleared.`)) {
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
    </MapCard>
  );
}
