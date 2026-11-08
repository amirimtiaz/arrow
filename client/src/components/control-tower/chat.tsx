'use client';

/**
 * Out-of-band incident chat over SpacetimeDB subscriptions. Corporate email
 * and Slack are assumed compromised; every message here is attributed,
 * timestamped and part of the audit trail.
 */
import { Eye, MessagesSquare, Send } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Incident } from '@/module_bindings/ir/types';
import { useIr, useIrRows } from '@/lib/ir/client';
import { useCt } from './context';
import { formatTime, formatUtc, tsMs } from './format';
import { Button, cx, inputClass, Pill } from './ui';
import { ROLE_META, roleLabel } from './vocab';

export const CHAT_INPUT_ID = 'ir-chat-input';

export function ChatPanel({ incident }: { incident: Incident | null }) {
  const { conn } = useIr();
  const { me, can, run } = useCt();
  const all = useIrRows('irMessages');
  const members = useIrRows('irMembers');
  const [channel, setChannel] = useState<'incident' | 'team'>('incident');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const effective = incident ? channel : 'team';
  const channelId = effective === 'incident' && incident ? incident.id : 0n;
  const messages = all
    .filter((m) => m.incidentId === channelId)
    .sort((a, b) => (a.ts.microsSinceUnixEpoch < b.ts.microsSinceUnixEpoch ? -1 : 1));
  const online = members.filter((m) => m.status === 'active' && m.online).length;
  const myHex = me.identity.toHexString();
  const lastId = messages.length ? String(messages[messages.length - 1].id) : '';

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, channelId]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!conn || !body) return;
    setSending(true);
    const ok = await run(() => conn.reducers.sendMessage({ incidentId: channelId, text: body }));
    setSending(false);
    if (ok) setText('');
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Incident chat">
      <header className="border-b border-line px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
            <MessagesSquare className="size-4 text-accent" aria-hidden /> Response chat
          </h2>
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="size-2 rounded-full bg-success" aria-hidden />
            {online} online
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-faint">Out-of-band: not corporate email or Slack. Logged to the audit trail.</p>
        <div
          className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-line bg-panel-2 p-0.5"
          role="tablist"
          aria-label="Chat channel"
        >
          {(
            [
              ['incident', incident ? `${incident.ref} room` : 'Incident room'],
              ['team', 'Team channel'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={effective === key}
              disabled={key === 'incident' && !incident}
              onClick={() => setChannel(key)}
              className={cx(
                'h-8 truncate rounded-md px-2 text-xs font-semibold disabled:opacity-40',
                effective === key ? 'bg-panel text-fg shadow-panel' : 'text-muted hover:text-fg'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 scroll-thin" aria-live="polite">
        {messages.length === 0 && (
          <p className="pt-8 text-center text-xs text-faint">
            No messages yet. Say what you are working on so the team does not duplicate effort.
          </p>
        )}
        {messages.map((m) => {
          const ms = tsMs(m.ts);
          if (m.kind === 'system') {
            return (
              <p key={String(m.id)} className="rounded-md bg-panel-2 px-2.5 py-1.5 text-center text-[11px] text-muted">
                <span className="font-mono text-faint">{formatTime(ms)}</span> · {m.text}
              </p>
            );
          }
          const mine = m.senderHex === myHex;
          return (
            <div key={String(m.id)} className={cx('flex flex-col', mine ? 'items-end' : 'items-start')}>
              <div className="mb-0.5 flex items-center gap-1.5 text-[11px]">
                <span className="font-semibold text-fg">{mine ? 'You' : m.senderName}</span>
                <Pill tone={ROLE_META[m.senderRole]?.tone ?? 'muted'} className="px-1 py-0 text-[10px]">
                  {roleLabel(m.senderRole)}
                </Pill>
                <time className="font-mono text-faint" title={formatUtc(ms)}>
                  {formatTime(ms)}
                </time>
              </div>
              <p
                className={cx(
                  'max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words',
                  mine ? 'bg-accent text-white' : 'border border-line bg-panel-2 text-fg'
                )}
              >
                {m.text}
              </p>
            </div>
          );
        })}
      </div>

      <footer className="border-t border-line p-3">
        {can('chat') ? (
          <form onSubmit={send} className="flex items-end gap-2">
            <textarea
              id={CHAT_INPUT_ID}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder={effective === 'incident' && incident ? `Message ${incident.ref} room…` : 'Message the whole team…'}
              aria-label="Message"
              className={cx(inputClass, 'min-h-11 resize-none')}
            />
            <Button
              type="submit"
              variant="primary"
              icon={Send}
              busy={sending}
              disabled={!text.trim()}
              aria-label="Send message"
              className="h-11"
            />
          </form>
        ) : (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Eye className="size-4" aria-hidden /> Read-only: executive viewers can follow the chat but not post.
          </p>
        )}
      </footer>
    </section>
  );
}
