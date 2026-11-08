'use client';

/**
 * Landlord message threads for Conquest GIS, kept in this browser's localStorage (one thread per workspace tier and
 * site). Replies are only ever clearly labelled automatic acknowledgements; nothing pretends to be a person or an AI.
 */
import { useCallback, useSyncExternalStore } from 'react';

export interface ThreadMessage {
  id: string;
  from: 'you' | 'auto';
  kind: 'message' | 'tour';
  text: string;
  /** Epoch ms. */
  ts: number;
}

const PREFIX = 'arrow-conquest-thread:';
const EMPTY: ThreadMessage[] = [];
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: ThreadMessage[] }>();

function read(key: string): ThreadMessage[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PREFIX + key);
  } catch {
    raw = null;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  let value: ThreadMessage[] = EMPTY;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        value = parsed.filter(
          (m): m is ThreadMessage =>
            typeof m === 'object' && m !== null && typeof m.text === 'string' && typeof m.ts === 'number' && (m.from === 'you' || m.from === 'auto')
        );
      }
    } catch {
      value = EMPTY;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

function write(key: string, messages: ThreadMessage[]) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(messages.slice(-100)));
  } catch {
    // Storage full or blocked (private mode): the thread simply will not persist.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith(PREFIX)) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

let counter = 0;
function newId() {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

export function useThread(key: string) {
  const messages = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY
  );
  const append = useCallback(
    (message: Omit<ThreadMessage, 'id' | 'ts'>) => {
      const next = [...read(key), { ...message, id: newId(), ts: Date.now() }];
      write(key, next);
    },
    [key]
  );
  const clear = useCallback(() => write(key, []), [key]);
  return { messages, append, clear };
}
