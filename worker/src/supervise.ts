/**
 * Keeps the worker alive during a demo: restarts it with backoff if it ever
 * exits unexpectedly (e.g. a schema change mid-session). `npm start` runs this.
 */
import { spawn } from 'node:child_process';

let delay = 2000;
let stopping = false;

function launch() {
  const startedAt = Date.now();
  const child = spawn('npx', ['tsx', 'src/index.ts'], { stdio: 'inherit', shell: true });
  const stop = () => {
    stopping = true;
    child.kill('SIGINT');
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  child.on('exit', (code) => {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    if (stopping) process.exit(code ?? 0);
    // Reset the backoff after a healthy run; otherwise back off up to 15 s.
    delay = Date.now() - startedAt > 60_000 ? 2000 : Math.min(delay * 2, 15_000);
    console.warn(`[supervisor] worker exited (code ${code}); restarting in ${delay / 1000}s`);
    setTimeout(launch, delay);
  });
}

launch();
