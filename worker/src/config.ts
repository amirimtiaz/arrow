/**
 * Worker configuration (from worker/.env). The worker never receives any
 * incident-response (arrow-ir) configuration: IR isolation is by design.
 */
import 'dotenv/config';

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const env = (name: string) => (process.env[name] ?? '').trim();

/**
 * Tiger Data accepts either a full connection string (TIGER_DATABASE_URL) or
 * the individual fields shown in the Tiger console's "Connect" dialog.
 * Tiger Cloud *client credentials* (public/secret key) are for the Tiger REST
 * API / CLI, not for connecting to the database, so they are not used here.
 */
function tigerUrl(): string {
  const url = env('TIGER_DATABASE_URL');
  if (url) return url;
  const host = env('TIGER_HOST');
  const password = env('TIGER_PASSWORD');
  if (!host || !password) return '';
  const user = env('TIGER_USER') || 'tsdbadmin';
  const port = env('TIGER_PORT') || '5432';
  const db = env('TIGER_DB') || 'tsdb';
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(db)}?sslmode=require`;
}

export const config = {
  spacetimeHost: env('SPACETIME_HOST') || 'ws://127.0.0.1:3000',
  opsDb: env('SPACETIME_OPS_DB') || 'arrow-ops',
  tokenFile: env('AGENT_TOKEN_FILE'),

  nvidiaApiKey: env('NVIDIA_API_KEY'),
  nemotronBaseUrl: env('NEMOTRON_BASE_URL') || 'https://integrate.api.nvidia.com/v1',
  nemotronModel: env('NEMOTRON_MODEL') || 'nvidia/nemotron-3.5-super-vl-120b-a12b',
  /** Nemotron reasoning traces (chat_template_kwargs.enable_thinking); shown in the UI as "Thinking" steps. */
  nemotronThinking: env('NEMOTRON_THINKING') !== 'off',
  llmTimeoutMs: num(process.env.NEMOTRON_TIMEOUT_MS, 120_000),
  maxConcurrentRuns: Math.max(1, num(process.env.AGENT_MAX_CONCURRENT_RUNS, 2)),
  monitorDelayMs: num(process.env.AGENT_MONITOR_DELAY_MS, 20_000),

  tigerUrl: tigerUrl(),
};

export const llmConfigured = config.nvidiaApiKey.length > 0;
export const tigerConfigured = config.tigerUrl.length > 0;
