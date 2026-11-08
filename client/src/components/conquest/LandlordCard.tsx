'use client';

/**
 * The landlord behind a listing: past-tenant rating (computed from the rating counts), short reviews, and a message
 * thread with a tour request. The thread is stored in this browser (localStorage). Any reply is a clearly labelled
 * automatic acknowledgement, never presented as a person or an AI.
 */
import clsx from 'clsx';
import { CalendarClock, CalendarPlus, CheckCheck, Clock, MailCheck, MessageSquare, Send, Star, Trash2, UserRound } from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState, type FormEvent } from 'react';
import { formatClock } from '@/lib/format';
import { landlordRating } from '@/lib/conquest/model';
import { useThread } from '@/lib/conquest/thread';
import type { Landlord, Plan, Site } from '@/lib/conquest/types';
import { Button, SectionLabel } from '@/components/ui/primitives';

export function Stars({ value, size = 'size-3.5' }: { value: number; size?: string }) {
  const rounded = Math.round(value);
  return (
    <span className="inline-flex items-center gap-px text-warning" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={clsx(size, i > rounded && 'opacity-30')} fill={i <= rounded ? 'currentColor' : 'none'} aria-hidden />
      ))}
    </span>
  );
}

export function LandlordCard({ landlord, site, plan }: { landlord: Landlord; site: Site; plan: Plan }) {
  const rating = landlordRating(landlord);
  const max = Math.max(...landlord.ratingCounts);
  const thread = useThread(`${plan}:${site.id}`);
  const [open, setOpen] = useState(thread.messages.length > 0);
  const [tourOpen, setTourOpen] = useState(false);

  return (
    <section aria-label="Landlord">
      <SectionLabel icon={UserRound} right={<span className="text-[10.5px] text-faint">{landlord.responseTime}</span>}>
        Landlord
      </SectionLabel>
      <div className="mt-2 flex gap-3">
        <span className="relative size-14 shrink-0 overflow-hidden rounded-full border border-line bg-panel-2">
          <Image src={landlord.photo} alt={`${landlord.name}, ${landlord.company}`} fill sizes="56px" className="object-cover" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-tight font-bold text-fg">{landlord.name}</p>
          <p className="truncate text-[11.5px] text-muted">
            {landlord.title} · {landlord.company}
          </p>
          <p className="truncate text-[10.5px] text-faint">{landlord.portfolio}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11.5px]">
            <Stars value={rating.average} />
            <b className="text-fg tabular-nums">{rating.average.toFixed(1)}</b>
            <span className="text-faint">· {rating.count} past-tenant reviews</span>
          </p>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-0.5 text-[10.5px] text-muted">
        {[5, 4, 3, 2, 1].map((star) => {
          const n = landlord.ratingCounts[star - 1];
          return (
            <div key={star} className="contents">
              <span className="tabular-nums">{star}★</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-panel-2">
                <span className="block h-full rounded-full bg-warning" style={{ width: `${max ? (n / max) * 100 : 0}%` }} />
              </span>
              <span className="w-5 text-right tabular-nums">{n}</span>
            </div>
          );
        })}
      </div>

      <ul className="mt-2.5 space-y-1.5">
        {landlord.reviews.map((r) => (
          <li key={r.tenant} className="rounded-lg border border-line bg-panel px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[10.5px] font-semibold text-muted">{r.tenant}</span>
              <Stars value={r.stars} size="size-3" />
            </div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-fg">“{r.text}”</p>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[10px] text-faint">Simulated past-tenant reviews.</p>

      <div className="mt-2.5 flex gap-2">
        <Button
          variant="primary"
          size="sm"
          icon={MessageSquare}
          className="flex-1"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? 'Hide messages' : 'Message landlord'}
          {!open && thread.messages.length > 0 && (
            <span className="rounded-full bg-white/25 px-1.5 text-[10px]">{thread.messages.length}</span>
          )}
        </Button>
        <Button
          size="sm"
          icon={CalendarPlus}
          className="flex-1"
          onClick={() => {
            setOpen(true);
            setTourOpen(true);
          }}
        >
          Request a tour
        </Button>
      </div>

      {open && (
        <Thread
          landlord={landlord}
          site={site}
          thread={thread}
          tourOpen={tourOpen}
          setTourOpen={setTourOpen}
        />
      )}
    </section>
  );
}

const QUICK = ['Is the asking rent negotiable?', 'Can you share the last 3 years of CAM?', 'Could we get early access for build-out?'];

function tourSlots(now = new Date()) {
  const slots: Date[] = [];
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  while (slots.length < 6) {
    day.setDate(day.getDate() + 1);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    for (const hour of [10, 14]) {
      const slot = new Date(day);
      slot.setHours(hour);
      slots.push(slot);
    }
  }
  return slots;
}

const slotFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function Thread({
  landlord,
  site,
  thread,
  tourOpen,
  setTourOpen,
}: {
  landlord: Landlord;
  site: Site;
  thread: ReturnType<typeof useThread>;
  tourOpen: boolean;
  setTourOpen(open: boolean): void;
}) {
  const [draft, setDraft] = useState('');
  const [slot, setSlot] = useState<number | null>(null);
  const slots = useMemo(() => tourSlots(), []);
  const { messages, append, clear } = thread;
  const firstName = landlord.name.split(' ')[0];

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim().slice(0, 600);
    if (!text) return;
    const acknowledged = messages.some((m) => m.from === 'auto' && m.kind === 'message');
    append({ from: 'you', kind: 'message', text });
    setDraft('');
    if (!acknowledged) {
      window.setTimeout(
        () =>
          append({
            from: 'auto',
            kind: 'message',
            text: `Thanks, your message about ${site.name} reached ${landlord.company} leasing. ${landlord.responseTime.replace('Usually replies', 'They usually reply')}.`,
          }),
        900
      );
    }
  };

  const requestTour = () => {
    if (slot === null) return;
    const when = slotFormat.format(slots[slot]);
    append({ from: 'you', kind: 'tour', text: `Tour request: ${when} at ${site.address}` });
    setTourOpen(false);
    setSlot(null);
    window.setTimeout(
      () =>
        append({
          from: 'auto',
          kind: 'tour',
          text: `Tour request received for ${when}. The slot is held for you until ${landlord.company} leasing confirms it.`,
        }),
      900
    );
  };

  return (
    <div className="mt-2.5 rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <p className="text-[12px] font-bold text-fg">Thread with {firstName}</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-faint">Demo thread · saved on this device</span>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Clear this message thread on this device?')) clear();
              }}
              className="rounded p-0.5 text-faint hover:bg-panel-hover hover:text-danger"
              aria-label="Clear thread"
              title="Clear thread"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <ul className="scroll-thin max-h-64 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {messages.length === 0 && (
          <li className="text-center text-[11.5px] text-muted">
            No messages yet. Ask {firstName} about rent, CAM history or a tour.
          </li>
        )}
        {messages.map((m) =>
          m.from === 'you' ? (
            <li key={m.id} className="ml-8">
              <div className="rounded-xl rounded-tr-sm bg-accent px-3 py-2 text-[12px] text-white">
                {m.kind === 'tour' && <CalendarClock className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />}
                {m.text}
              </div>
              <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-faint">
                <CheckCheck className="size-3 text-success" aria-hidden />
                Delivered · {formatClock(new Date(m.ts))}
              </p>
            </li>
          ) : (
            <li key={m.id} className="mr-8">
              <div className="rounded-xl rounded-tl-sm border border-dashed border-line bg-panel-2 px-3 py-2 text-[12px] text-muted">
                <p className="mb-0.5 flex items-center gap-1 text-[9.5px] font-bold tracking-wide text-faint uppercase">
                  <MailCheck className="size-3" aria-hidden /> Auto-reply · automatic acknowledgement
                </p>
                {m.text}
              </div>
              <p className="mt-0.5 text-[10px] text-faint">{formatClock(new Date(m.ts))}</p>
            </li>
          )
        )}
      </ul>

      {tourOpen && (
        <div className="border-t border-line px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11.5px] font-semibold text-fg">
            <Clock className="size-3.5 text-accent" aria-hidden /> Pick a tour slot
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Tour slots">
            {slots.map((s, i) => (
              <button
                key={s.toISOString()}
                type="button"
                role="radio"
                aria-checked={slot === i}
                onClick={() => setSlot(i)}
                className={clsx(
                  'rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold',
                  slot === i ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-panel-2 text-muted hover:text-fg'
                )}
              >
                {slotFormat.format(s)}
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setTourOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" icon={CalendarPlus} disabled={slot === null} onClick={requestTour}>
              Request this slot
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={send} className="border-t border-line p-2.5">
        <div className="mb-1.5 flex flex-wrap gap-1">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setDraft(q)}
              className="rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[10.5px] text-muted hover:border-accent hover:text-fg"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={600}
            rows={2}
            placeholder={`Message ${firstName} about ${site.name}…`}
            className="min-h-[40px] flex-1 resize-none rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-[12px] text-fg outline-none placeholder:text-faint focus:border-accent"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send message"
            className="grid size-9 place-items-center rounded-lg bg-accent text-white hover:bg-accent-strong disabled:opacity-40"
          >
            <Send className="size-4" aria-hidden />
          </button>
        </div>
      </form>
    </div>
  );
}
