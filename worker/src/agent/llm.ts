/**
 * Nemotron via NVIDIA's OpenAI-compatible endpoint (build.nvidia.com).
 * Every call is real; on failure the error propagates and the run is marked
 * failed in the UI. Nothing is faked.
 */
import OpenAI from 'openai';
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { config } from '../config';

export type Message = ChatCompletionMessageParam;
export type ToolCall = ChatCompletionMessageFunctionToolCall;
export type ToolSpec = ChatCompletionTool;

export interface LlmTurn {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[];
  latencyMs: number;
}

let client: OpenAI | null = null;

function llm(): OpenAI {
  client ??= new OpenAI({
    apiKey: config.nvidiaApiKey || 'missing',
    baseURL: config.nemotronBaseUrl,
    timeout: config.llmTimeoutMs,
    maxRetries: 1,
  });
  return client;
}

/** Some reasoning models inline <think>…</think>; split it from the answer. */
function splitThinking(text: string): { content: string; reasoning: string } {
  const match = text.match(/<think>([\s\S]*?)<\/think>/i);
  if (!match) return { content: text.trim(), reasoning: '' };
  return { content: text.replace(match[0], '').trim(), reasoning: match[1].trim() };
}

export async function chat(messages: Message[], tools: ToolSpec[]): Promise<LlmTurn> {
  const started = Date.now();
  const response = await llm().chat.completions.create({
    model: config.nemotronModel,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? 'auto' : undefined,
    temperature: 0.2,
    max_tokens: 2048,
  });
  const choice = response.choices[0];
  if (!choice) throw new Error('Nemotron returned no choices');
  const message = choice.message as typeof choice.message & { reasoning_content?: string | null };
  const { content, reasoning } = splitThinking(message.content ?? '');
  return {
    content,
    reasoning: (message.reasoning_content ?? '').trim() || reasoning,
    toolCalls: (message.tool_calls ?? []).filter((c): c is ToolCall => c.type === 'function'),
    latencyMs: Date.now() - started,
  };
}
