/**
 * TEST-ONLY scripted stand-in for the Nemotron chat-completions endpoint.
 * It lets the agent plumbing (tools, reducers, UI trace, approvals) be tested
 * deterministically without an API key. The product never uses it.
 *
 * Standalone: npx tsx test/mock-llm.ts   (listens on 127.0.0.1:8799)
 */
import http from 'node:http';

type Msg = { role: string; content?: string | null; tool_calls?: { id: string; function: { name: string } }[]; tool_call_id?: string };

// ─────────────────────────── Scripted mock LLM ───────────────────────────
let callCounter = 0;
const call = (name: string, args: unknown) => ({
  id: `call_${++callCounter}`,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

function lastToolResult(messages: Msg[], name: string): any {
  const ids = new Map<string, string>();
  for (const m of messages) for (const c of m.tool_calls ?? []) ids.set(c.id, c.function.name);
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'tool' && ids.get(m.tool_call_id!) === name) return JSON.parse(m.content ?? '{}');
  }
  return undefined;
}

function script(messages: Msg[]) {
  const system = messages[0]?.content ?? '';
  const called = new Set<string>();
  for (const m of messages) for (const c of m.tool_calls ?? []) called.add(c.function.name);

  if (system.startsWith('You are the Disruption Analyst')) {
    if (!called.has('submit_plan'))
      return {
        tool_calls: [
          call('submit_plan', {
            goal: 'Assess impact of the disruption',
            steps: ['get_disruption', 'list_affected_shipments', 'query_route_history', 'check_vendor_risk', 'handoff_to_planner'],
          }),
        ],
      };
    if (!called.has('get_disruption')) return { tool_calls: [call('get_disruption', {}), call('list_affected_shipments', { limit: 5 })] };
    if (!called.has('query_route_history')) return { tool_calls: [call('query_route_history', {}), call('check_vendor_risk', {})] };
    const s = lastToolResult(messages, 'list_affected_shipments');
    return { tool_calls: [call('handoff_to_planner', { findings: `${s.shipments} shipments worth $${s.value_usd} are affected.` })] };
  }
  if (system.startsWith('You are the Recovery Planner')) {
    if (!called.has('submit_plan'))
      return {
        tool_calls: [
          call('submit_plan', {
            goal: 'Pick the best response',
            steps: ['evaluate_route_alternatives', 'propose_action', 'post_briefing', 'finish_run'],
          }),
        ],
      };
    if (!called.has('evaluate_route_alternatives')) return { tool_calls: [call('evaluate_route_alternatives', {})] };
    if (!called.has('propose_action')) {
      const best = lastToolResult(messages, 'evaluate_route_alternatives').options[0];
      return {
        tool_calls: [
          call('propose_action', {
            option_key: best.option_key,
            kind: 'reroute',
            title: best.label,
            rationale: `Best score ${best.score} with expected impact $${best.expected_impact_usd}.`,
          }),
        ],
      };
    }
    if (!called.has('post_briefing'))
      return { tool_calls: [call('post_briefing', { text: 'Test briefing: a response is waiting for manager approval.' })] };
    return { tool_calls: [call('finish_run', { summary: 'Proposed the top-ranked option for approval.' })] };
  }
  if (system.startsWith('You are the Cyber Triage')) {
    if (!called.has('get_ir_hints')) return { tool_calls: [call('get_ir_hints', {})] };
    // Deliberately malformed first attempt to exercise schema validation + retry.
    if (!messages.some((m) => m.role === 'tool' && (m.content ?? '').includes('invalid_arguments'))) {
      return { tool_calls: [call('draft_ir_incident', { title: 'Ransomware', severity: 'SEV9' })] };
    }
    return {
      tool_calls: [
        call('draft_ir_incident', {
          title: 'Ransomware at partner warehouse',
          summary: 'Partner WMS encrypted; customer data exfiltration suspected.',
          severity: 'SEV1',
          category: 'ransomware',
          attack_vector: 'email_phishing',
          functional_impact: 'high',
          information_impact: 'privacy_breach',
          recoverability: 'supplemented',
          iocs: ['Encrypted files with .lockd extension'],
          scope: [
            {
              asset: 'WMS database',
              system: 'Partner WMS',
              data_class: 'operational',
              status: 'encrypted_ransomware',
              confidence: 'confirmed',
              records: 0,
            },
          ],
        }),
      ],
    };
  }
  // Copilot
  if (!called.has('get_network_overview')) return { tool_calls: [call('get_network_overview', {})] };
  const o = lastToolResult(messages, 'get_network_overview');
  return { content: `There are ${o.active_disruptions.length} active disruptions and $${o.value_in_transit_usd} in transit.` };
}

export const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const { messages } = JSON.parse(body) as { messages: Msg[] };
    const reply = script(messages);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'mock',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'mock-nemotron',
        choices: [
          {
            index: 0,
            finish_reason: reply.tool_calls ? 'tool_calls' : 'stop',
            message: { role: 'assistant', content: reply.content ?? '', tool_calls: reply.tool_calls },
          },
        ],
      })
    );
  });
});

export function startMockLlm(port = 8799): Promise<void> {
  return new Promise((resolve) => mock.listen(port, '127.0.0.1', () => resolve()));
}

if (process.argv[1]?.endsWith('mock-llm.ts')) {
  await startMockLlm();
  console.log('[mock-llm] TEST-ONLY scripted LLM on http://127.0.0.1:8799/v1');
}
