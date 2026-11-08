'use client';

/**
 * A small factory for live SpacetimeDB data in React.
 *
 * Each call creates an independent connection (own identity token, own
 * subscriptions), which is how the ops workspace and the isolated IR
 * Control Tower stay separate in the same browser tab. Table changes are
 * batched per microtask, so a reducer that touches hundreds of rows causes
 * one re-render.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

interface TableHandle {
  iter(): Iterable<unknown>;
  onInsert(cb: (...args: unknown[]) => void): void;
  onDelete(cb: (...args: unknown[]) => void): void;
  onUpdate?(cb: (...args: unknown[]) => void): void;
}

interface SubscriptionHandle {
  unsubscribe(): void;
}

interface SubscriptionBuilderLike {
  onApplied(cb: () => void): SubscriptionBuilderLike;
  onError(cb: (ctx: unknown) => void): SubscriptionBuilderLike;
  subscribe(queries: unknown): SubscriptionHandle;
}

export interface LiveConnection {
  db: object;
  reducers: object;
  subscriptionBuilder(): SubscriptionBuilderLike;
  disconnect(): void;
}

interface IdentityLike {
  toHexString(): string;
}

interface BuilderLike<Conn> {
  withUri(uri: string): BuilderLike<Conn>;
  withDatabaseName(name: string): BuilderLike<Conn>;
  withToken(token?: string): BuilderLike<Conn>;
  onConnect(cb: (conn: Conn, identity: IdentityLike, token: string) => void): BuilderLike<Conn>;
  onConnectError(cb: (ctx: unknown, error: Error) => void): BuilderLike<Conn>;
  onDisconnect(cb: (ctx: unknown, error?: Error) => void): BuilderLike<Conn>;
  build(): Conn;
}

type DbOf<Conn extends LiveConnection> = Conn['db'];
type TableKey<Conn extends LiveConnection> = keyof DbOf<Conn> & string;
export type RowOf<Conn extends LiveConnection, K extends TableKey<Conn>> = DbOf<Conn>[K] extends { iter(): Iterable<infer R> } ? R : never;

function querySql(query: unknown): string {
  if (typeof query === 'string') return query;
  const builder = query as { toSql?: () => string };
  return builder.toSql ? builder.toSql() : JSON.stringify(query);
}

class ChangeHub {
  private versions = new Map<string, number>();
  private listeners = new Map<string, Set<() => void>>();
  private pending = new Set<string>();
  private scheduled = false;

  bump(name: string) {
    this.pending.add(name);
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      const names = [...this.pending];
      this.pending.clear();
      for (const n of names) {
        this.versions.set(n, (this.versions.get(n) ?? 0) + 1);
        this.listeners.get(n)?.forEach((l) => l());
      }
    });
  }

  bumpAll(names: string[]) {
    names.forEach((n) => this.bump(n));
  }

  subscribe(name: string, listener: () => void) {
    const set = this.listeners.get(name) ?? new Set();
    set.add(listener);
    this.listeners.set(name, set);
    return () => set.delete(listener);
  }

  version(name: string) {
    return this.versions.get(name) ?? 0;
  }
}

export interface LiveClientState<Conn extends LiveConnection> {
  conn: Conn | null;
  status: ConnectionStatus;
  identityHex: string | null;
  error: string | null;
  /** True once the current subscription set has been applied. */
  ready: boolean;
  hub: ChangeHub;
  retry(): void;
  /** Forget this browser's identity for this database and reconnect as a new one. */
  resetIdentity(): void;
}

interface LiveClientOptions<Conn extends LiveConnection> {
  dbName: string;
  uri: string;
  tokenKey: string;
  builder: () => BuilderLike<Conn>;
  tables: TableKey<Conn>[];
}

export function createLiveClient<Conn extends LiveConnection>(options: LiveClientOptions<Conn>) {
  const Context = createContext<LiveClientState<Conn> | null>(null);

  function readToken(): string | undefined {
    try {
      return localStorage.getItem(options.tokenKey) ?? undefined;
    } catch {
      return undefined;
    }
  }

  function writeToken(token: string | null) {
    try {
      if (token) localStorage.setItem(options.tokenKey, token);
      else localStorage.removeItem(options.tokenKey);
    } catch {
      /* storage unavailable: identity lasts for this session only */
    }
  }

  function Provider({ children, queries }: { children: ReactNode; queries: (conn: Conn) => unknown[] }) {
    const hub = useMemo(() => new ChangeHub(), []);
    const [conn, setConn] = useState<Conn | null>(null);
    const [status, setStatus] = useState<ConnectionStatus>('connecting');
    const [identityHex, setIdentityHex] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const retriedWithoutToken = useRef(false);

    useEffect(() => {
      let disposed = false;
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      setStatus((s) => (s === 'connected' ? 'reconnecting' : 'connecting'));

      const connection = options
        .builder()
        .withUri(options.uri)
        .withDatabaseName(options.dbName)
        .withToken(readToken())
        .onConnect((c, identity, token) => {
          if (disposed) return;
          writeToken(token);
          for (const name of options.tables) {
            const table = (c.db as Record<string, TableHandle>)[name];
            const bump = () => hub.bump(name);
            table.onInsert(bump);
            table.onDelete(bump);
            table.onUpdate?.(bump);
          }
          setIdentityHex(identity.toHexString());
          setError(null);
          setStatus('connected');
          setConn(c);
        })
        .onConnectError((_ctx, err) => {
          if (disposed) return;
          // Keep the saved identity through outages; a rejected token is reset explicitly by the user.
          const message = err?.message || 'Could not reach SpacetimeDB';
          if (/unauthori[sz]ed|invalid token|401|403/i.test(message) && readToken() && !retriedWithoutToken.current) {
            retriedWithoutToken.current = true;
            writeToken(null);
            setAttempt((a) => a + 1);
            return;
          }
          setError(message);
          setStatus('error');
          retryTimer = setTimeout(() => setAttempt((a) => a + 1), 4000);
        })
        .onDisconnect((_ctx, err) => {
          if (disposed) return;
          setStatus('error');
          setReady(false);
          setError(err?.message || 'Disconnected from SpacetimeDB');
          retryTimer = setTimeout(() => setAttempt((a) => a + 1), 3000);
        })
        .build();

      return () => {
        disposed = true;
        if (retryTimer) clearTimeout(retryTimer);
        setConn(null);
        try {
          connection.disconnect();
        } catch {
          /* already closed */
        }
      };
    }, [hub, attempt]);

    // (Re)subscribe whenever the query set changes; swap handles without a gap.
    const queryList = useMemo(() => (conn ? queries(conn) : []), [conn, queries]);
    const queryKey = useMemo(() => queryList.map(querySql).join('|'), [queryList]);
    const handleRef = useRef<SubscriptionHandle | null>(null);

    useEffect(() => {
      if (!conn || queryList.length === 0) return;
      let active = true;
      const previous = handleRef.current;
      const handle = conn
        .subscriptionBuilder()
        .onApplied(() => {
          if (!active) return;
          previous?.unsubscribe();
          setReady(true);
          hub.bumpAll(options.tables);
        })
        .onError(() => {
          if (active) setError('Subscription failed. Check that the module is published.');
        })
        .subscribe(queryList);
      handleRef.current = handle;
      return () => {
        active = false;
      };
      // queryKey captures queryList content.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conn, queryKey, hub]);

    const retry = useCallback(() => setAttempt((a) => a + 1), []);
    const resetIdentity = useCallback(() => {
      writeToken(null);
      retriedWithoutToken.current = true;
      setReady(false);
      setAttempt((a) => a + 1);
    }, []);

    const value = useMemo<LiveClientState<Conn>>(
      () => ({ conn, status, identityHex, error, ready, hub, retry, resetIdentity }),
      [conn, status, identityHex, error, ready, hub, retry, resetIdentity]
    );
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useClient(): LiveClientState<Conn> {
    const value = useContext(Context);
    if (!value) throw new Error(`useClient for ${options.dbName} must be used inside its Provider`);
    return value;
  }

  /** Live rows of one table. Re-renders once per transaction that touches it. */
  function useRows<K extends TableKey<Conn>>(name: K): RowOf<Conn, K>[] {
    const { conn, hub } = useClient();
    const subscribe = useCallback((cb: () => void) => hub.subscribe(name, cb), [hub, name]);
    const getVersion = useCallback(() => hub.version(name), [hub, name]);
    const version = useSyncExternalStore(subscribe, getVersion, () => -1);
    return useMemo(() => {
      if (!conn) return [];
      const table = (conn.db as Record<string, TableHandle>)[name];
      return Array.from(table.iter()) as RowOf<Conn, K>[];
      // version invalidates the snapshot when the table changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conn, name, version]);
  }

  return { Provider, useClient, useRows };
}
