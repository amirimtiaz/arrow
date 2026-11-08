/**
 * Connection to arrow-ops as the privileged "agent" identity. The token is
 * persisted to a local file so the identity is stable across restarts (the
 * module owner authorises this identity once with set_agent_identity).
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { DbConnection } from './module_bindings';

export type Ops = DbConnection;

const tokenPath = path.resolve(process.cwd(), config.tokenFile);

function readToken(): string | undefined {
  try {
    return fs.readFileSync(tokenPath, 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

function saveToken(token: string) {
  try {
    fs.writeFileSync(tokenPath, token, { mode: 0o600 });
  } catch (err) {
    console.warn('[spacetime] could not persist agent token:', err);
  }
}

export interface OpsConnection {
  conn: Ops;
  identityHex: string;
}

/** Connects, subscribes to every public ops table and resolves once data is applied. */
export function connectOps(onDisconnect: (err?: Error) => void): Promise<OpsConnection> {
  return new Promise((resolve, reject) => {
    let settled = false;
    DbConnection.builder()
      .withUri(config.spacetimeHost)
      .withDatabaseName(config.opsDb)
      .withToken(readToken())
      .onConnect((conn, identity, token) => {
        saveToken(token);
        conn
          .subscriptionBuilder()
          .onApplied(() => {
            settled = true;
            resolve({ conn, identityHex: identity.toHexString() });
          })
          .onError(() => {
            if (!settled) reject(new Error('Subscription to arrow-ops failed. Is the module published?'));
          })
          .subscribeToAllTables();
      })
      .onConnectError((_ctx, err) => {
        if (!settled) reject(err);
      })
      .onDisconnect((_ctx, err) => onDisconnect(err))
      .build();
  });
}

/** Resolves when `find()` returns a value, re-checking on every table change. */
export function waitFor<T>(
  table: {
    onInsert(cb: () => void): void;
    onUpdate?(cb: () => void): void;
    removeOnInsert(cb: () => void): void;
    removeOnUpdate?(cb: () => void): void;
  },
  find: () => T | undefined,
  timeoutMs = 10_000
): Promise<T> {
  const immediate = find();
  if (immediate !== undefined) return Promise.resolve(immediate);
  return new Promise((resolve, reject) => {
    const check = () => {
      const value = find();
      if (value !== undefined) {
        cleanup();
        resolve(value);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for SpacetimeDB to reflect the change'));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      table.removeOnInsert(check);
      table.removeOnUpdate?.(check);
    };
    table.onInsert(check);
    table.onUpdate?.(check);
  });
}
