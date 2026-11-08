/**
 * Benchmarks Nemotron models on Arrow's actual workload: one tool-calling turn
 * with the Disruption Analyst's tools. Reports latency and whether the model
 * produced valid, schema-correct tool calls.
 *
 *   npm run bench:models                 (uses NVIDIA_API_KEY from worker/.env)
 *   npm run bench:models -- nvidia/model-a nvidia/model-b
 */
import OpenAI from 'openai';
import { z } from 'zod';
import { analystPrompt } from './agent/prompts';
import { ANALYST_TOOLS } from './agent/tools';
import { config, llmConfigured } from './config';

const DEFAULT_MODELS = [
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia/nemotron-nano-3-30b-a3b',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
];
const RUNS = 3;

if (!llmConfigured) {
  console.error('Set NVIDIA_API_KEY in worker/.env first.');
  process.exit(1);
}

const client = new OpenAI({ apiKey: config.nvidiaApiKey, baseURL: config.nemotronBaseUrl, timeout: 120_000, maxRetries: 0 });
const tools = ANALYST_TOOLS.map((t) => {
  const { $schema: _schema, ...parameters } = z.toJSONSchema(t.schema) as Record<string, unknown>;
  return { type: 'function' as const, function: { name: t.name, description: t.description, parameters } };
});
const byName = new Map(ANALYST_TOOLS.map((t) => [t.name, t]));
const system = analystPrompt({
  name: 'Amazon',
  planLabel: 'Gold · Enterprise',
  scope: 'Global',
  industry: 'Global e-commerce & logistics',
});
const user = 'Disruption event #1 fired: "Suez Canal blocked" (blockage, high). Investigate it now.';

const models = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_MODELS;
console.log(`Benchmarking ${models.length} models × ${RUNS} runs on the Disruption Analyst's first turn…\n`);

for (const model of models) {
  const latencies: number[] = [];
  let valid = 0;
  let firstCall = '';
  let error = '';
  for (let i = 0; i < RUNS; i++) {
    const started = Date.now();
    try {
      // chat_template_kwargs is NVIDIA's extension for Nemotron's reasoning trace (not in the OpenAI types).
      const body = {
        model,
        messages: [
          { role: 'system' as const, content: system },
          { role: 'user' as const, content: user },
        ],
        tools,
        tool_choice: 'auto' as const,
        parallel_tool_calls: true,
        temperature: 0.3,
        max_tokens: config.nemotronThinking ? 8192 : 1024,
        chat_template_kwargs: { enable_thinking: config.nemotronThinking },
      };
      const res = await client.chat.completions.create(body);
      latencies.push(Date.now() - started);
      const calls = (res.choices[0]?.message.tool_calls ?? []).filter((c) => c.type === 'function');
      const ok =
        calls.length > 0 &&
        calls.every((c) => {
          const def = byName.get(c.function.name);
          try {
            return !!def && def.schema.safeParse(JSON.parse(c.function.arguments || '{}')).success;
          } catch {
            return false;
          }
        });
      if (ok) valid += 1;
      firstCall ||= calls.map((c) => c.function.name).join(', ');
    } catch (err) {
      error = err instanceof Error ? err.message.slice(0, 90) : String(err);
      break;
    }
  }
  const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  console.log(
    `${model.padEnd(42)} ${error ? `ERROR ${error}` : `avg ${String(avg).padStart(6)} ms · valid tool calls ${valid}/${RUNS} · first: ${firstCall || '(none)'}`}`
  );
}
console.log('\nPick the fastest model with 3/3 valid tool calls and set NEMOTRON_MODEL in worker/.env.');
