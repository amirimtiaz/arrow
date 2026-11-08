/**
 * Agent runner: an event-driven, multi-agent tool-calling loop.
 *
 *   disruption row appears → Disruption Analyst (plan → tools → findings)
 *     → handoff → Recovery Planner (score options → propose → brief)
 *     → handoff → Risk Auditor (independent critique: concur or challenge)
 *         ↳ if challenged → Recovery Planner revises or justifies (one round)
 *     → (cyber only) handoff → Cyber Triage (IR draft for the Control Tower)
 *   manager approves → action executes → Recovery Monitor (measure → verified briefing)
 *
 * Every plan, tool call (arguments, result, latency), handoff and error is
 * written to SpacetimeDB via log_agent_step so the UI streams the trace.
 * Arguments are schema-validated with one retry; failures end the run
 * visibly. Turn limits keep every run bounded.
 */
import { z } from 'zod';
import { config, llmConfigured } from '../config';
import type { ActionProposal, AgentRun, Disruption } from '../module_bindings/types';
import { waitFor, type Ops } from '../spacetime';
import type { HistoryProvider } from '../tiger/history';
import { chat, type Message, type ToolSpec } from './llm';
import {
  analystPrompt,
  askPrompt,
  auditorPrompt,
  CHAT_PERSONAS,
  cyberPrompt,
  dealPrompt,
  monitorPrompt,
  personaPrompt,
  plannerPrompt,
  revisionPrompt,
  type ChatPersonaKey,
} from './prompts';
import {
  ANALYST_TOOLS,
  ASK_TOOLS,
  AUDITOR_TOOLS,
  CYBER_TOOLS,
  MONITOR_TOOLS,
  PLANNER_TOOLS,
  REVISION_TOOLS,
  type ToolContext,
  type ToolDef,
} from './tools';

const TURN_LIMITS = { analyst: 6, planner: 6, auditor: 3, revision: 3, cyber: 3, monitor: 4, ask: 6 };

type StepKind = 'plan' | 'tool_call' | 'observation' | 'decision' | 'handoff' | 'message' | 'error';

interface StepInput {
  agent: string;
  tool?: string;
  title: string;
  input?: unknown;
  output?: unknown;
  latencyMs?: number;
}

type Logger = (kind: StepKind, step: StepInput) => Promise<void>;

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function makeLogger(ops: Ops, runId: bigint): Logger {
  return async (kind, step) => {
    await ops.reducers.logAgentStep({
      runId,
      agent: step.agent,
      kind,
      tool: step.tool ?? '',
      title: truncate(step.title, 230),
      inputJson: step.input === undefined ? '' : truncate(JSON.stringify(step.input), 15000),
      outputJson: step.output === undefined ? '' : truncate(JSON.stringify(step.output), 23000),
      latencyMs: Math.min(Math.round(step.latencyMs ?? 0), 4_000_000),
    });
  };
}

function toolSpecs(tools: ToolDef[]): ToolSpec[] {
  return tools.map((t) => {
    const { $schema: _schema, ...parameters } = z.toJSONSchema(t.schema) as Record<string, unknown>;
    return { type: 'function', function: { name: t.name, description: t.description, parameters } };
  });
}

interface AgentSpec {
  name: string;
  system: string;
  tools: ToolDef[];
  maxTurns: number;
}

/** One agent's plan/act/observe loop. Returns when a terminal tool runs or the model answers in text. */
async function runAgent(
  spec: AgentSpec,
  userPrompt: string,
  ctx: ToolContext,
  log: Logger
): Promise<{ terminal?: string; finalText: string }> {
  const messages: Message[] = [
    { role: 'system', content: spec.system },
    { role: 'user', content: userPrompt },
  ];
  const specs = toolSpecs(spec.tools);
  const byName = new Map(spec.tools.map((t) => [t.name, t]));
  const malformed = new Map<string, number>();
  let planned = false;

  for (let turn = 0; turn < spec.maxTurns; turn++) {
    const reply = await chat(messages, specs);

    if (reply.reasoning) {
      await log('observation', {
        agent: spec.name,
        title: 'Thinking',
        output: { text: truncate(reply.reasoning, 1800) },
        latencyMs: reply.latencyMs,
      });
    }
    if (reply.toolCalls.length === 0) {
      return { finalText: reply.content };
    }
    if (reply.content) {
      await log('observation', {
        agent: spec.name,
        title: truncate(reply.content.split('\n')[0], 200),
        output: { text: reply.content },
        latencyMs: reply.reasoning ? 0 : reply.latencyMs,
      });
    }

    messages.push({ role: 'assistant', content: reply.content || null, tool_calls: reply.toolCalls });
    let terminal: string | undefined;

    for (const call of reply.toolCalls) {
      const def = byName.get(call.function.name);
      let args: unknown;
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        args = undefined;
      }

      if (!def) {
        await log('error', { agent: spec.name, tool: call.function.name, title: `Unknown tool "${call.function.name}"`, input: args });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: `Unknown tool. Available: ${[...byName.keys()].join(', ')}` }),
        });
        continue;
      }

      const parsed = def.schema.safeParse(args ?? {});
      if (!parsed.success) {
        const attempts = (malformed.get(def.name) ?? 0) + 1;
        malformed.set(def.name, attempts);
        const details = z.prettifyError(parsed.error);
        await log('error', {
          agent: spec.name,
          tool: def.name,
          title: `Invalid arguments for ${def.name} (attempt ${attempts} of 2)`,
          input: args,
          output: { error: details },
        });
        if (attempts >= 2) throw new Error(`${def.name} was called with invalid arguments twice: ${details}`);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: 'invalid_arguments', details, hint: 'Fix the arguments to match the schema and call again.' }),
        });
        continue;
      }

      const started = Date.now();
      try {
        const { result, summary } = await def.run(parsed.data, ctx);
        const latencyMs = Date.now() - started;
        if (def.name === 'submit_plan') {
          const plan = parsed.data as { goal: string; steps: string[] };
          await log('plan', {
            agent: spec.name,
            tool: def.name,
            title: planned ? `Re-plan: ${plan.goal}` : `Plan: ${plan.goal}`,
            output: { steps: plan.steps },
          });
          planned = true;
        } else {
          await log(def.terminal ? 'decision' : 'tool_call', {
            agent: spec.name,
            tool: def.name,
            title: summary,
            input: parsed.data,
            output: result,
            latencyMs,
          });
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: truncate(JSON.stringify(result), 9000) });
        if (def.terminal) terminal = def.name;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await log('error', {
          agent: spec.name,
          tool: def.name,
          title: `${def.name} failed: ${truncate(message, 160)}`,
          input: parsed.data,
          latencyMs: Date.now() - started,
        });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: message }) });
      }
    }
    if (terminal) return { terminal, finalText: reply.content };
  }

  await log('error', { agent: spec.name, title: `${spec.name} reached its ${spec.maxTurns}-turn limit` });
  return { finalText: '' };
}

function orgInfo(ops: Ops, orgId: number) {
  const org = ops.db.org.id.find(orgId);
  if (!org) throw new Error(`Org ${orgId} not found`);
  return org;
}

const notConfigured =
  'NVIDIA_API_KEY is not configured on the agent worker, so no model could be called. Add the key to worker/.env and restart the worker.';

/** Event-driven pipeline for a new disruption. */
export async function handleDisruption(ops: Ops, d: Disruption, history: HistoryProvider): Promise<void> {
  try {
    await ops.reducers.startAgentRun({ disruptionId: d.id, model: config.nemotronModel });
  } catch (err) {
    console.log(`[agent] skip disruption ${d.id}: ${(err as Error).message}`);
    return;
  }
  const run = await waitFor(ops.db.agentRun, () =>
    [...ops.db.agentRun.iter()].find((r) => r.disruptionId === d.id && r.trigger === 'event')
  );
  const log = makeLogger(ops, run.id);
  const ctx: ToolContext = { ops, runId: run.id, orgId: d.orgId, disruptionId: d.id, history, notes: {} };
  console.log(`[agent] run #${run.id} for "${d.title}"`);

  try {
    if (!llmConfigured) throw new Error(notConfigured);
    const org = orgInfo(ops, d.orgId);

    const analyst = await runAgent(
      { name: 'Disruption Analyst', system: analystPrompt(org), tools: ANALYST_TOOLS, maxTurns: TURN_LIMITS.analyst },
      `Disruption event #${d.id} fired: "${d.title}" (${d.kind}, ${d.severity}). Investigate it now.`,
      ctx,
      log
    );
    const findings = ctx.notes.findings ?? (analyst.finalText || 'The analyst did not record findings.');
    await log('handoff', { agent: 'Disruption Analyst', title: 'Disruption Analyst → Recovery Planner', output: { summary: findings } });

    await runAgent(
      { name: 'Recovery Planner', system: plannerPrompt(org), tools: PLANNER_TOOLS, maxTurns: TURN_LIMITS.planner },
      `Findings from the Disruption Analyst:\n${findings}\n\nDisruption id: ${d.id}. Plan the recovery.`,
      ctx,
      log
    );

    if (ctx.notes.proposalTitle) await auditProposal(ctx, log, org);

    if (d.kind === 'cyber') {
      await log('handoff', {
        agent: 'Recovery Planner',
        title: 'Recovery Planner → Cyber Triage',
        output: { summary: 'Cyber incident: prepare an incident draft for the isolated Control Tower.' },
      });
      await runAgent(
        { name: 'Cyber Triage', system: cyberPrompt(org), tools: CYBER_TOOLS, maxTurns: TURN_LIMITS.cyber },
        `Cyber disruption #${d.id}: "${d.title}". ${d.summary}\n\nAnalyst findings:\n${findings}`,
        ctx,
        log
      );
    }

    const summary =
      ctx.notes.summary ??
      (ctx.notes.proposalTitle ? `Proposed for approval: ${ctx.notes.proposalTitle}.` : 'Investigation complete; no action was proposed.');
    await ops.reducers.finishAgentRun({ runId: run.id, status: 'completed', summary, answer: '', error: '' });
    console.log(`[agent] run #${run.id} completed`);
  } catch (err) {
    await failRun(ops, run, log, err);
  }
}

type OrgInfo = ReturnType<typeof orgInfo>;

/** Proposer/critic round: the Risk Auditor reviews; a challenge gets one revision from the planner. */
async function auditProposal(ctx: ToolContext, log: Logger, org: OrgInfo): Promise<void> {
  await log('handoff', {
    agent: 'Recovery Planner',
    title: 'Recovery Planner → Risk Auditor',
    output: { summary: `Independent review of "${ctx.notes.proposalTitle}" before it reaches a manager.` },
  });
  await runAgent(
    { name: 'Risk Auditor', system: auditorPrompt(org), tools: AUDITOR_TOOLS, maxTurns: TURN_LIMITS.auditor },
    `Review the pending proposal for disruption #${ctx.disruptionId}: "${ctx.notes.proposalTitle}".`,
    ctx,
    log
  );
  const audit = ctx.notes.audit;
  if (audit?.verdict !== 'challenge') return;

  await log('handoff', {
    agent: 'Risk Auditor',
    title: 'Risk Auditor → Recovery Planner (revise or justify)',
    output: { summary: `${audit.assessment}\n${audit.concerns.map((c) => `- ${c}`).join('\n')}` },
  });
  await runAgent(
    { name: 'Recovery Planner', system: revisionPrompt(org), tools: REVISION_TOOLS, maxTurns: TURN_LIMITS.revision },
    `The Risk Auditor challenged your proposal "${ctx.notes.proposalTitle}".\nAssessment: ${audit.assessment}\nConcerns:\n${audit.concerns
      .map((c) => `- ${c}`)
      .join('\n')}\nDisruption id: ${ctx.disruptionId}.`,
    ctx,
    log
  );
}

/**
 * After a manager approves and the action executes, the Recovery Monitor
 * measures whether it worked and posts a verified outcome (closing the loop).
 */
export async function handleExecuted(ops: Ops, proposal: ActionProposal, history: HistoryProvider, delayMs: number): Promise<void> {
  if (!llmConfigured) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const run = ops.db.agentRun.id.find(proposal.runId);
  if (!run) return;
  try {
    await ops.reducers.resumeAgentRun({ runId: run.id, agent: 'Recovery Monitor' });
  } catch (err) {
    console.log(`[agent] monitor skipped for run #${run.id}: ${(err as Error).message}`);
    return;
  }
  const log = makeLogger(ops, run.id);
  const ctx: ToolContext = {
    ops,
    runId: run.id,
    orgId: run.orgId,
    disruptionId: run.disruptionId,
    history,
    notes: {},
    proposalId: proposal.id,
  };
  try {
    const org = orgInfo(ops, run.orgId);
    await log('handoff', {
      agent: 'Recovery Monitor',
      title: `Approved by ${proposal.decidedByName} → Recovery Monitor`,
      output: { summary: `Verifying the outcome of "${proposal.title}".` },
    });
    await runAgent(
      { name: 'Recovery Monitor', system: monitorPrompt(org), tools: MONITOR_TOOLS, maxTurns: TURN_LIMITS.monitor },
      `"${proposal.title}" was approved by ${proposal.decidedByName} and executed. Verify the outcome now.`,
      ctx,
      log
    );
    const summary = [run.summary, ctx.notes.summary ? `Verified: ${ctx.notes.summary}` : ''].filter(Boolean).join(' ');
    await ops.reducers.finishAgentRun({ runId: run.id, status: 'completed', summary, answer: '', error: '' });
  } catch (err) {
    await failRun(ops, run, log, err);
  }
}

/** "Ask Arrow" questions: a tool-using copilot over live data. */
export async function handleAsk(ops: Ops, queued: AgentRun, history: HistoryProvider): Promise<void> {
  try {
    await ops.reducers.claimAgentRun({ runId: queued.id, model: config.nemotronModel });
  } catch {
    return; // already claimed
  }
  const log = makeLogger(ops, queued.id);
  const ctx: ToolContext = { ops, runId: queued.id, orgId: queued.orgId, disruptionId: 0n, history, notes: {} };
  console.log(`[agent] ask #${queued.id}: ${queued.prompt.slice(0, 80)}`);

  // "[[agents:analyst,auditor]] question": direct chat with named agents, or "[[agents:deal]] {...}" for Conquest GIS.
  const routed = queued.prompt.match(/^\[\[agents:([a-z,]+)\]\]\s*([\s\S]*)$/);
  if (routed) {
    await handleAgentChat(ops, queued, ctx, log, routed[1].split(','), routed[2].trim());
    return;
  }

  try {
    if (!llmConfigured) throw new Error(notConfigured);
    const org = orgInfo(ops, queued.orgId);
    const result = await runAgent(
      { name: 'Arrow Copilot', system: askPrompt(org), tools: ASK_TOOLS, maxTurns: TURN_LIMITS.ask },
      queued.prompt,
      ctx,
      log
    );
    const answer = result.finalText || 'I could not finish an answer within my step limit. Try a narrower question.';
    await log('message', { agent: 'Arrow Copilot', title: 'Answer', output: { text: answer } });
    await ops.reducers.finishAgentRun({
      runId: queued.id,
      status: 'completed',
      summary: truncate(answer.split('\n')[0], 200),
      answer,
      error: '',
    });
  } catch (err) {
    await failRun(ops, queued, log, err);
  }
}

/**
 * Direct agent chat: each named agent answers in turn (in pipeline order) over the same read-only tools, and each
 * reply is logged as its own `message` step so the UI shows one bubble per agent as soon as it is ready.
 */
async function handleAgentChat(ops: Ops, queued: AgentRun, ctx: ToolContext, log: Logger, keys: string[], question: string) {
  try {
    if (!llmConfigured) throw new Error(notConfigured);
    if (!question) throw new Error('The question is empty.');
    const org = orgInfo(ops, queued.orgId);
    const answers: string[] = [];

    if (keys.includes('deal')) {
      const result = await runAgent({ name: 'Deal Evaluator', system: dealPrompt(org), tools: [], maxTurns: 1 }, question, ctx, log);
      const text = result.finalText || 'No evaluation was returned. Try again.';
      await log('message', { agent: 'Deal Evaluator', title: 'Answer', output: { text } });
      answers.push(text);
    } else {
      const order = Object.keys(CHAT_PERSONAS) as ChatPersonaKey[];
      const chosen = order.filter((k) => keys.includes(k));
      if (chosen.length === 0) throw new Error('No known agents were selected.');
      for (const key of chosen) {
        const persona = CHAT_PERSONAS[key];
        const others = chosen.filter((k) => k !== key).map((k) => CHAT_PERSONAS[k].name);
        const result = await runAgent(
          { name: persona.name, system: personaPrompt(org, key, others), tools: ASK_TOOLS.filter((t) => t.name !== 'post_briefing'), maxTurns: 4 },
          question,
          ctx,
          log
        );
        const text = result.finalText || 'I could not finish within my step limit. Try a narrower question.';
        await log('message', { agent: persona.name, title: 'Answer', output: { text } });
        answers.push(`**${persona.name}:** ${text}`);
      }
    }

    const answer = answers.join('\n\n');
    await ops.reducers.finishAgentRun({
      runId: queued.id,
      status: 'completed',
      summary: truncate(answer.split('\n')[0], 200),
      answer: truncate(answer, 3900),
      error: '',
    });
  } catch (err) {
    await failRun(ops, queued, log, err);
  }
}

async function failRun(ops: Ops, run: AgentRun, log: Logger, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[agent] run #${run.id} failed: ${message}`);
  await log('error', { agent: run.activeAgent || 'Arrow Agent', title: `Run failed: ${truncate(message, 180)}` }).catch(() => undefined);
  await ops.reducers
    .finishAgentRun({ runId: run.id, status: 'failed', summary: '', answer: '', error: truncate(message, 1900) })
    .catch(() => undefined);
}
