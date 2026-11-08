/**
 * End-to-end test of the agent PLUMBING against a live local SpacetimeDB:
 * event → agent run → plan/tool steps → scored options → proposal →
 * manager approval → routes/shipments change → resolve → reset.
 *
 * The LLM is replaced by a scripted OpenAI-compatible mock server so the
 * test is deterministic and needs no API key. This file is TEST-ONLY: the
 * product always calls the real Nemotron endpoint (and fails visibly without
 * a key). Stop the background worker before running this test.
 *
 * Run: npx tsx test/agent-e2e.ts
 */
import assert from 'node:assert/strict';

const MOCK_PORT = 8799;
process.env.NEMOTRON_BASE_URL = `http://127.0.0.1:${MOCK_PORT}/v1`;
process.env.NVIDIA_API_KEY = 'test-only-key';
process.env.TIGER_DATABASE_URL = '';
process.env.TIGER_HOST = '';

import { mock, startMockLlm } from './mock-llm';

await startMockLlm(MOCK_PORT);

// ─────────────────────────── Live SpacetimeDB flow ───────────────────────────
const { connectOps, waitFor } = await import('../src/spacetime');
const { handleAsk, handleDisruption, handleExecuted } = await import('../src/agent/runner');
const { createHistoryProvider } = await import('../src/tiger/history');
const { DbConnection } = await import('../src/module_bindings');

const { conn: agent } = await connectOps(() => undefined);
const history = createHistoryProvider(agent);

// A separate, fresh identity acting as an operations manager.
const manager = await new Promise<InstanceType<typeof DbConnection>>((resolve, reject) => {
  DbConnection.builder()
    .withUri('ws://127.0.0.1:3000')
    .withDatabaseName('arrow-ops')
    .onConnect((c) =>
      c
        .subscriptionBuilder()
        .onApplied(() => resolve(c))
        .subscribeToAllTables()
    )
    .onConnectError((_c, e) => reject(e))
    .build();
});
await manager.reducers.joinWorkspace({ name: 'Test Manager', role: 'manager', orgId: 1 });

const EXPECTED: Record<string, string> = {
  'amz-ransomware-3pl': 'alternate_dc',
  'amz-suez-blockage': 'split_air_cape',
  'amz-typhoon-yantian': 'split_divert_hold',
};

await manager.reducers.resetOrg({ orgId: 1 });

for (const [scenarioKey, expectedStrategy] of Object.entries(EXPECTED)) {
  await manager.reducers.triggerScenario({ orgId: 1, scenarioKey });
  const d = await waitFor(agent.db.disruption, () =>
    [...agent.db.disruption.iter()].find((x) => x.scenarioKey === scenarioKey && x.status === 'active')
  );
  await handleDisruption(agent, d, history);

  const run = [...agent.db.agentRun.iter()].find((r) => r.disruptionId === d.id)!;
  const steps = [...agent.db.agentStep.iter()].filter((s) => s.runId === run.id);
  const kinds = new Set(steps.map((s) => s.kind));
  assert.equal(run.status, 'awaiting_approval', `${scenarioKey}: run should await approval (got ${run.status}: ${run.error})`);
  for (const k of ['plan', 'tool_call', 'handoff', 'decision']) assert.ok(kinds.has(k), `${scenarioKey}: missing ${k} step`);

  const proposal = [...agent.db.actionProposal.iter()].find((p) => p.runId === run.id && p.requiresApproval && p.status === 'pending')!;
  const option = agent.db.routeOption.id.find(proposal.optionId)!;
  assert.equal(option.strategy, expectedStrategy, `${scenarioKey}: proposed ${option.strategy}`);

  // Proposer/critic: the Risk Auditor always reviews; the Suez split is challenged and defended.
  const review = steps.find((s) => s.agent === 'Risk Auditor' && s.tool === 'review_proposal');
  assert.ok(review, `${scenarioKey}: Risk Auditor should review the proposal`);
  if (scenarioKey === 'amz-suez-blockage') {
    assert.ok(
      steps.some((s) => s.tool === 'keep_proposal'),
      'challenged proposal should be revised or justified'
    );
  }

  await manager.reducers.approveAction({ proposalId: proposal.id, note: 'e2e test' });
  await new Promise((r) => setTimeout(r, 300));
  const rerouted = [...agent.db.route.iter()].filter((r) => r.orgId === 1 && r.status === 'rerouted');
  assert.ok(rerouted.length > 0, `${scenarioKey}: approval should activate rerouted lanes`);
  assert.equal(agent.db.disruption.id.find(d.id)!.status, 'mitigating');

  // Recovery Monitor verifies the executed action and closes the loop.
  await handleExecuted(agent, agent.db.actionProposal.id.find(proposal.id)!, history, 2500);
  const monitored = agent.db.agentRun.id.find(run.id)!;
  const monitorSteps = [...agent.db.agentStep.iter()].filter((s) => s.runId === run.id && s.agent === 'Recovery Monitor');
  assert.ok(
    monitorSteps.some((s) => s.tool === 'measure_recovery'),
    `${scenarioKey}: monitor should measure recovery`
  );
  assert.equal(monitored.status, 'completed');
  assert.ok(monitored.summary.includes('Verified'), `${scenarioKey}: run summary should include the verified outcome`);

  if (scenarioKey === 'amz-ransomware-3pl') {
    const draft = [...agent.db.actionProposal.iter()].find((p) => p.runId === run.id && p.kind === 'ir_draft');
    assert.ok(draft, 'cyber run should produce an IR draft');
    assert.ok(
      steps.some((s) => s.kind === 'error' && s.title.includes('Invalid arguments')),
      'malformed call should be logged and retried'
    );
  }

  await manager.reducers.resolveDisruption({ disruptionId: d.id });
  await new Promise((r) => setTimeout(r, 300));
  const stillRerouted = [...agent.db.route.iter()].filter((r) => r.orgId === 1 && (r.status === 'rerouted' || r.status === 'disrupted'));
  assert.equal(stillRerouted.length, 0, `${scenarioKey}: resolve should restore lanes`);
  console.log(`✓ ${scenarioKey}: ${steps.length} steps, proposed "${option.label}", approved, executed and resolved`);
}

// Ask Arrow
await manager.reducers.askArrow({ orgId: 1, prompt: 'How are we doing?' });
const ask = await waitFor(agent.db.agentRun, () => [...agent.db.agentRun.iter()].find((r) => r.trigger === 'ask' && r.status === 'queued'));
await handleAsk(agent, ask, history);
const answered = agent.db.agentRun.id.find(ask.id)!;
assert.equal(answered.status, 'completed');
assert.ok(answered.answer.includes('active disruptions'), 'ask should return an answer built from tool output');
console.log(`✓ Ask Arrow answered: ${answered.answer}`);

// Grok News Scout: the browser submits findings (Puter.js); a person escalates one into a disruption.
const lane = [...agent.db.route.iter()].find((r) => r.orgId === 1 && r.status === 'healthy')!;
await manager.reducers.submitNewsScan({
  orgId: 1,
  trigger: 'manual',
  model: 'x-ai/grok-4.7 (test)',
  articleCount: 12,
  error: '',
  signals: [
    {
      headline: 'Test signal: congestion building on a monitored lane',
      summary: 'Scripted signal used only by the plumbing test.',
      region: 'Test region',
      kind: 'port_congestion',
      severity: 'warning',
      relevance: 0.8,
      lat: 22.5,
      lng: 114.2,
      routeIds: [lane.id],
      sources: ['https://example.com/test-article'],
    },
  ],
});
const signal = await waitFor(agent.db.newsSignal, () => [...agent.db.newsSignal.iter()].find((s) => s.orgId === 1 && s.status === 'new'));
await assert.rejects(
  manager.reducers.submitNewsScan({ orgId: 1, trigger: 'manual', model: 'x', articleCount: 0, error: '', signals: [{ ...signal, sources: [], routeIds: [] } as never] }),
  'signals without a cited article must be rejected'
);
await manager.reducers.escalateNewsSignal({ signalId: signal.id });
await new Promise((r) => setTimeout(r, 300));
const newsDisruption = [...agent.db.disruption.iter()].find((x) => x.source === 'news' && x.status === 'active');
assert.ok(newsDisruption, 'escalating a signal should open a news-sourced disruption');
await manager.reducers.resolveDisruption({ disruptionId: newsDisruption.id });
console.log('✓ Grok News Scout: submitted signal escalated into a disruption; uncited signals rejected');


