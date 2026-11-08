/**
 * Worker configuration (from worker/.env). The worker never receives any
 * incident-response (arrow-ir) configuration: IR isolation is by design.
 */
import 'dotenv/config';

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  spacetimeHost: process.env.SPACETIME_HOST ?? 'ws://127.0.0.1:3000',
  opsDb: process.env.SPACETIME_OPS_DB ?? 'arrow-ops',
  tokenFile: process.env.AGENT_TOKEN_FILE ?? '.agent-token',

  nvidiaApiKey: (process.env.NVIDIA_API_KEY ?? '').trim(),
  nemotronBaseUrl: process.env.NEMOTRON_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
  nemotronModel: process.env.NEMOTRON_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
  llmTimeoutMs: num(process.env.NEMOTRON_TIMEOUT_MS, 90_000),
  maxConcurrentRuns: num(process.env.AGENT_MAX_CONCURRENT_RUNS, 2),

  tigerUrl: (process.env.TIGER_DATABASE_URL ?? '').trim(),
  httpPort: num(process.env.WORKER_PORT, 8787),
};

export const llmConfigured = config.nvidiaApiKey.length > 0;
export const tigerConfigured = config.tigerUrl.length > 0;
