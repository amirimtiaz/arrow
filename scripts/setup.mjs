#!/usr/bin/env node
/**
 * One-command setup for Arrow (run from the repo root).
 *
 * Local (default, `spacetime start` on :3000):
 *   node scripts/setup.mjs                     publish arrow-ops + arrow-ir, regenerate bindings, authorise the agent
 *   node scripts/setup.mjs --reset             wipe both databases and republish (fresh demo)
 *   node scripts/setup.mjs --authorize-agent   only authorise the worker identity
 *
 * SpacetimeDB Maincloud (run `spacetime login` first):
 *   node scripts/setup.mjs --cloud arrow-hackutd             ops + IR on Maincloud as arrow-hackutd-ops / arrow-hackutd-ir
 *   node scripts/setup.mjs --cloud arrow-hackutd --ir-local  ops on Maincloud, Control Tower stays on the local server
 *   node scripts/setup.mjs --cloud x --ops-db my-db          reuse a database already created on spacetimedb.com for ops
 *   node scripts/setup.mjs --use-local                       point client + worker back at the local server
 *
 * --cloud also writes worker/.env and client/.env.local so both apps connect to
 * the right server. The first Control Tower admin is armed separately with
 * scripts/ir-bootstrap.mjs, so the agent worker never handles anything IR-related.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
};

const LOCAL = { server: 'local', host: 'ws://127.0.0.1:3000' };
const MAINCLOUD = { server: 'maincloud', host: 'wss://maincloud.spacetimedb.com' };

const cloudPrefix = value('cloud');
if (flag('cloud') && !cloudPrefix) {
  console.error('Usage: node scripts/setup.mjs --cloud <unique-name-prefix>   (database names are global on Maincloud)');
  process.exit(1);
}
const target = cloudPrefix ? MAINCLOUD : LOCAL;
const irTarget = cloudPrefix && flag('ir-local') ? LOCAL : target;
const opsDb = value('ops-db') ?? (cloudPrefix ? `${cloudPrefix}-ops` : (process.env.SPACETIME_OPS_DB ?? 'arrow-ops'));
const irDb = value('ir-db') ?? (cloudPrefix ? `${cloudPrefix}-ir` : (process.env.SPACETIME_IR_DB ?? 'arrow-ir'));

function findCli() {
  if (process.env.SPACETIME_CLI) return process.env.SPACETIME_CLI;
  // On Windows the `spacetime` shim can fail inside sandboxes; prefer the versioned binary.
  const base = path.join(os.homedir(), 'AppData', 'Local', 'SpacetimeDB', 'bin');
  if (fs.existsSync(base)) {
    const versions = fs
      .readdirSync(base)
      .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const v of versions) {
      const exe = path.join(base, v, 'spacetimedb-cli.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return 'spacetime';
}

const cli = findCli();
const run = (cmd, cmdArgs) => {
  console.log(`$ ${path.basename(cmd)} ${cmdArgs.join(' ')}`);
  execFileSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit' });
};

/** Set KEY=value lines in an env file, keeping everything else (comments, secrets) intact. */
function writeEnv(file, entries) {
  const full = path.join(root, file);
  let text = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  for (const [key, val] of Object.entries(entries)) {
    const line = `${key}=${val}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
  }
  fs.writeFileSync(full, text);
  console.log(`Updated ${file}: ${Object.keys(entries).join(', ')}`);
}

function pointAppsAt(ops, ir) {
  writeEnv('worker/.env', { SPACETIME_HOST: ops.host, SPACETIME_OPS_DB: opsDb });
  writeEnv('client/.env.local', {
    NEXT_PUBLIC_SPACETIME_HOST: ops.host,
    NEXT_PUBLIC_OPS_DB: opsDb,
    NEXT_PUBLIC_IR_HOST: ir.host,
    NEXT_PUBLIC_IR_DB: irDb,
  });
}

if (flag('use-local')) {
  pointAppsAt(LOCAL, LOCAL);
  console.log('\nClient and worker now point at the local server. Restart both.');
  process.exit(0);
}

if (!flag('authorize-agent')) {
  const reset = flag('reset') ? ['--delete-data=always'] : [];
  run(cli, ['publish', opsDb, '--server', target.server, '--module-path', 'spacetime/ops', '--yes', ...reset]);
  run(cli, ['generate', '--lang', 'typescript', '--module-path', 'spacetime/ops', '--out-dir', 'client/src/module_bindings/ops', '--yes']);
  run(cli, ['generate', '--lang', 'typescript', '--module-path', 'spacetime/ops', '--out-dir', 'worker/src/module_bindings', '--yes']);

  // The isolated IR database is published from module code only; its first admin
  // is armed separately with `npm run ir:bootstrap` (the worker never gets IR access).
  run(cli, ['publish', irDb, '--server', irTarget.server, '--module-path', 'spacetime/ir', '--yes', ...reset]);
  run(cli, ['generate', '--lang', 'typescript', '--module-path', 'spacetime/ir', '--out-dir', 'client/src/module_bindings/ir', '--yes']);
  if (cloudPrefix) pointAppsAt(target, irTarget);
}

console.log('\nResolving the agent worker identity…');
const out = execFileSync('npx', ['tsx', 'src/print-identity.ts'], {
  cwd: path.join(root, 'worker'),
  encoding: 'utf8',
  shell: true,
  env: { ...process.env, SPACETIME_HOST: target.host, SPACETIME_OPS_DB: opsDb },
});
const { identityHex, authorised } = JSON.parse(out.trim().split('\n').pop());
if (authorised && !flag('reset')) {
  console.log(`Agent identity ${identityHex.slice(0, 12)}… is already authorised.`);
} else {
  run(cli, ['call', opsDb, 'set_agent_identity', `"${identityHex}"`, '--server', target.server]);
  console.log(`Authorised agent identity ${identityHex.slice(0, 12)}…`);
}

console.log(`\nDone. ops = ${opsDb} on ${target.server}, IR = ${irDb} on ${irTarget.server}.`);
console.log(`Arm the first Control Tower admin:  node scripts/ir-bootstrap.mjs --server ${irTarget.server} --db ${irDb}`);
console.log('Then (re)start the worker (npm run dev:worker) and the client (npm run dev:client).');
