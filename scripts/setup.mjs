#!/usr/bin/env node
/**
 * One-command local setup for Arrow (run from the repo root):
 *
 *   node scripts/setup.mjs                    publish arrow-ops + arrow-ir, regenerate bindings, authorise the agent
 *   node scripts/setup.mjs --authorize-agent  only authorise the worker identity
 *   node scripts/setup.mjs --reset            wipe both databases and republish (fresh demo)
 *
 * The first Control Tower admin is armed separately with scripts/ir-bootstrap.mjs,
 * so the agent worker never handles anything incident-response related.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const server = process.env.SPACETIME_SERVER ?? 'local';
const opsDb = process.env.SPACETIME_OPS_DB ?? 'arrow-ops';

function findCli() {
  if (process.env.SPACETIME_CLI) return process.env.SPACETIME_CLI;
  // On Windows the `spacetime` shim can fail inside sandboxes; prefer the versioned binary.
  const base = path.join(os.homedir(), 'AppData', 'Local', 'SpacetimeDB', 'bin');
  if (fs.existsSync(base)) {
    const versions = fs
      .readdirSync(base)
      .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
      .sort()
      .reverse();
    for (const v of versions) {
      const exe = path.join(base, v, 'spacetimedb-cli.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return 'spacetime';
}

const cli = findCli();
const run = (cmd, cmdArgs, opts = {}) => {
  console.log(`$ ${path.basename(cmd)} ${cmdArgs.join(' ')}`);
  return execFileSync(cmd, cmdArgs, { cwd: root, stdio: opts.capture ? 'pipe' : 'inherit', encoding: 'utf8', shell: opts.shell ?? false });
};

const irDb = process.env.SPACETIME_IR_DB ?? 'arrow-ir';

if (!args.has('--authorize-agent')) {
  const reset = args.has('--reset') ? ['--delete-data=always'] : [];
  run(cli, ['publish', opsDb, '--server', server, '--module-path', 'spacetime/ops', '--yes', ...reset]);
  run(cli, ['generate', '--lang', 'typescript', '--module-path', 'spacetime/ops', '--out-dir', 'client/src/module_bindings/ops', '--yes']);
  run(cli, ['generate', '--lang', 'typescript', '--module-path', 'spacetime/ops', '--out-dir', 'worker/src/module_bindings', '--yes']);

  // The isolated IR database is published from module code only; its first admin
  // is armed separately with `npm run ir:bootstrap` (the worker never gets IR access).
  run(cli, ['publish', irDb, '--server', server, '--module-path', 'spacetime/ir', '--yes', ...reset]);
  run(cli, ['generate', '--lang', 'typescript', '--module-path', 'spacetime/ir', '--out-dir', 'client/src/module_bindings/ir', '--yes']);
}

console.log('\nResolving the agent worker identity…');
const out = execFileSync('npx', ['tsx', 'src/print-identity.ts'], { cwd: path.join(root, 'worker'), encoding: 'utf8', shell: true });
const { identityHex, authorised } = JSON.parse(out.trim().split('\n').pop());
if (authorised && !args.has('--reset')) {
  console.log(`Agent identity ${identityHex.slice(0, 12)}… is already authorised.`);
} else {
  run(cli, ['call', opsDb, 'set_agent_identity', `"${identityHex}"`, '--server', server]);
  console.log(`Authorised agent identity ${identityHex.slice(0, 12)}…`);
}
console.log('\nDone. Start the worker (cd worker && npm start) and the client (cd client && npm run dev).');
