/**
 * Arrow worker (thin by design). It owns no state:
 *   - runs the Nemotron agents when disruption rows, approvals or Ask Arrow requests appear
 *   - mirrors telemetry to Tiger Data and runs SQL anomaly detection
 * It needs no inbound port (the website reads Tiger directly), so it can run
 * on any machine. Every state change goes through an arrow-ops reducer. It has
 * no access to the isolated incident-response database (arrow-ir).
 */
import { handleAsk, handleDisruption, handleExecuted } from './agent/runner';
import { config, llmConfigured, tigerConfigured } from './config';
import type { ActionProposal, AgentRun, Disruption } from './module_bindings/types';
import { connectOps, type Ops } from './spacetime';
import { startTigerBridge } from './tiger/bridge';
import { tigerHealthy } from './tiger/db';
import { createHistoryProvider } from './tiger/history';

const RECENT_MS = 10 * 60_000;
let tigerOk = false;

/** Small concurrency-limited queue so a burst of events never floods the model. */
function createQueue(limit: number) {
  let active = 0;
  const pending: (() => Promise<void>)[] = [];
  const pump = () => {
    while (active < limit && pending.length > 0) {
      const job = pending.shift()!;
      active += 1;
      job()
        .catch((err) => console.warn('[queue] job failed:', err))
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };
  return (job: () => Promise<void>) => {
    pending.push(job);
    pump();
  };
}

function ageMs(ts: { microsSinceUnixEpoch: bigint }) {
  return Date.now() - Number(ts.microsSinceUnixEpoch / 1000n);
}

async function start() {
  console.log(`[worker] connecting to ${config.spacetimeHost}/${config.opsDb}…`);
  let stopped = false;
  const timers: ReturnType<typeof setInterval>[] = [];
  let bridge: ReturnType<typeof startTigerBridge> | null = null;

  const restart = (err?: Error) => {
    if (stopped) return;
    stopped = true;
    timers.forEach(clearInterval);
    bridge?.stop();
    console.warn(`[worker] disconnected${err ? `: ${err.message}` : ''}; reconnecting in 3 s`);
    setTimeout(() => void start().catch(retryLater), 3000);
  };

  const { conn: ops, identityHex } = await connectOps(restart);
  console.log(`[worker] connected as ${identityHex}`);
  await waitForAuthorization(ops, identityHex);

  const history = createHistoryProvider(ops);
  const enqueue = createQueue(config.maxConcurrentRuns);
  const seen = new Set<string>();

  const onDisruption = (d: Disruption) => {
    if (d.status !== 'active' || ageMs(d.createdAt) > RECENT_MS || seen.has(`d${d.id}`)) return;
    const hasRun = [...ops.db.agentRun.iter()].some((r) => r.disruptionId === d.id && r.trigger === 'event');
    if (hasRun) return;
    seen.add(`d${d.id}`);
    enqueue(() => handleDisruption(ops, d, history));
  };
  const onAsk = (r: AgentRun) => {
    if (r.trigger !== 'ask' || r.status !== 'queued' || seen.has(`a${r.id}`)) return;
    seen.add(`a${r.id}`);
    enqueue(() => handleAsk(ops, r, history));
  };

  // After a manager approves, the Recovery Monitor verifies the outcome.
  const onExecuted = (before: ActionProposal, after: ActionProposal) => {
    if (before.status !== 'pending' || after.status !== 'executed' || !after.requiresApproval || seen.has(`p${after.id}`)) return;
    seen.add(`p${after.id}`);
    enqueue(() => handleExecuted(ops, after, history, config.monitorDelayMs));
  };


  ops.db.disruption.onInsert((_ctx, d) => onDisruption(d));
  ops.db.agentRun.onInsert((_ctx, r) => onAsk(r));
  ops.db.actionProposal.onUpdate((_ctx, before, after) => onExecuted(before, after));
  for (const d of ops.db.disruption.iter()) onDisruption(d);
  for (const r of ops.db.agentRun.iter()) onAsk(r);
  // A question still "running" at startup was orphaned by a worker restart: fail it visibly instead of a forever spinner.
  for (const r of ops.db.agentRun.iter()) {
    if (r.trigger !== 'ask' || r.status !== 'running') continue;
    ops.reducers
      .finishAgentRun({ runId: r.id, status: 'failed', summary: '', answer: '', error: 'The agent worker restarted while answering. Please ask again.' })
      .catch(() => undefined);
  }


  if (tigerConfigured) {
    bridge = startTigerBridge(ops);
    tigerOk = await tigerHealthy();
    timers.push(setInterval(async () => (tigerOk = await tigerHealthy()), 30_000));
  }

  const heartbeat = () =>
    ops.reducers
      .agentHeartbeat({
        status: llmConfigured ? 'ready' : 'not_configured',
        model: config.nemotronModel,
        message: llmConfigured
          ? `Nemotron agents online (${config.nemotronModel})`
          : 'NVIDIA_API_KEY is not set on the agent worker. Agent runs will fail visibly until it is added.',
        tigerConnected: tigerOk,
      })
      .catch((err) => console.warn('[worker] heartbeat failed:', err.message));
  await heartbeat();
  timers.push(setInterval(heartbeat, 10_000));
  console.log(
    `[worker] ready · Nemotron ${llmConfigured ? `${config.nemotronModel} (thinking ${config.nemotronThinking ? 'on' : 'off'})` : 'NOT configured'} · Tiger ${tigerConfigured ? 'configured' : 'not configured'}`
  );
}

/** The module owner must authorise this identity once (npm run setup does it). */
async function waitForAuthorization(ops: Ops, identityHex: string) {
  const authorised = () => ops.db.opsState.id.find(1)?.agentHex === identityHex;
  if (authorised()) return;
  console.warn(
    `[worker] this identity is not authorised as the Arrow agent yet.\n` +
      `         Run from the repo root:  node scripts/setup.mjs --authorize-agent\n` +
      `         (or: spacetime call ${config.opsDb} set_agent_identity '"${identityHex}"')`
  );
  await new Promise<void>((resolve) => {
    const check = () => authorised() && (clearInterval(timer), resolve());
    const timer = setInterval(check, 2000);
  });
  console.log('[worker] authorised as the Arrow agent');
}

function retryLater(err: unknown) {
  console.warn('[worker] start failed:', err instanceof Error ? err.message : err, '— retrying in 5 s');
  setTimeout(() => void start().catch(retryLater), 5000);
}

void start().catch(retryLater);
