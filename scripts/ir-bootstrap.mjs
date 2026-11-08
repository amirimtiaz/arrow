#!/usr/bin/env node
/**
 * Arms the one-time bootstrap code that creates the FIRST Control Tower admin.
 *
 *   node scripts/ir-bootstrap.mjs [--db arrow-ir] [--server local] [--print-only]
 *
 * 1. Generates a strong random code with Node's crypto (16 Crockford base32
 *    symbols = 80 bits), e.g. 7KQ2-MX9D-...
 * 2. Hashes the normalised code with SHA-256.
 * 3. Calls the owner-only reducer `set_bootstrap_code_hash(hash)` through the
 *    SpacetimeDB CLI. Run it as the identity that published arrow-ir.
 * 4. Prints the code. Only the hash is stored on the server.
 *
 * Then open /app/control-tower, choose "First-time setup", enter the code and
 * your name. The code works once and only while the team has no members.
 *
 * CLI: set SPACETIME_CLI to the CLI binary; otherwise the newest
 * %LOCALAPPDATA%\SpacetimeDB\bin\<version>\spacetimedb-cli.exe is used if it
 * exists, else `spacetime` on PATH.
 */
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function findCli() {
  if (process.env.SPACETIME_CLI) return process.env.SPACETIME_CLI;
  const base = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'SpacetimeDB', 'bin') : '';
  if (base && existsSync(base)) {
    const versions = readdirSync(base)
      .filter((v) => /^\d+\.\d+\.\d+$/.test(v) && existsSync(join(base, v, 'spacetimedb-cli.exe')))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    if (versions.length) return join(base, versions[0], 'spacetimedb-cli.exe');
  }
  return 'spacetime';
}

/** Must match normalizeCode in spacetime/ir/src/core.ts. */
function normalizeCode(code) {
  return code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

function generateCode() {
  const symbols = Array.from(randomBytes(16), (b) => ALPHABET[b & 31]).join('');
  return symbols.match(/.{4}/g).join('-');
}

const db = arg('db', 'arrow-ir');
const server = arg('server', 'local');
const printOnly = process.argv.includes('--print-only');

const code = generateCode();
const hash = createHash('sha256').update(normalizeCode(code), 'utf8').digest('hex');

if (printOnly) {
  console.log(`Bootstrap code: ${code}`);
  console.log(`SHA-256 hash:   ${hash}`);
  console.log(`\nArm it yourself (as the database owner):\n  spacetime call ${db} set_bootstrap_code_hash '"${hash}"' --server ${server}`);
  process.exit(0);
}

const cli = findCli();
const result = spawnSync(cli, ['call', db, 'set_bootstrap_code_hash', JSON.stringify(hash), '--server', server, '--yes'], {
  encoding: 'utf8',
});
if (result.error || result.status !== 0) {
  const detail = result.error ? result.error.message : (result.stderr || result.stdout || '').trim();
  console.error(`Could not arm the bootstrap code via "${cli}".\n${detail}`);
  console.error('\nCommon causes: the team already has an admin (bootstrap is closed), you are not the');
  console.error('identity that published arrow-ir, or the SpacetimeDB server is not running.');
  process.exit(1);
}

console.log('');
console.log('  Control Tower bootstrap code (works ONCE, only while the team has no members):');
console.log('');
console.log(`      ${code}`);
console.log('');
console.log(`  Database: ${db} on ${server}. The server stored only its SHA-256 hash.`);
console.log('  Open /app/control-tower → "First-time setup", enter this code and your name.');
console.log('  Do not paste it into chat or email; share it in person if someone else is the admin.');
console.log('');
