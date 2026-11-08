'use client';

/**
 * Regulatory notification clocks. INFORMATIONAL, NOT LEGAL ADVICE.
 *  - GDPR Art. 33: notify the supervisory authority within 72 hours of
 *    becoming aware of a personal-data breach (clock starts when PII/PHI is
 *    first recorded in scope).
 *  - SEC Form 8-K Item 1.05: disclose a material cybersecurity incident
 *    within four business days of determining it is material (clock starts
 *    when legal records the determination; public holidays ignored).
 */
import { Gavel, Scale, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Incident } from '@/module_bindings/ir/types';
import { useIr } from '@/lib/ir/client';
import { useCt } from './context';
import { addBusinessDays, formatDateTime, formatDuration, optMs, useNow } from './format';
import { Button, cx } from './ui';
import { TONE_CLASSES, type Tone } from './vocab';

function Clock({
  title,
  rule,
  startMs,
  deadlineMs,
  idle,
  now,
  action,
}: {
  title: string;
  rule: string;
  startMs: number | null;
  deadlineMs: number | null;
  idle: string;
  now: number;
  action?: ReactNode;
}) {
  const left = deadlineMs !== null ? deadlineMs - now : null;
  const tone: Tone = left === null ? 'muted' : left < 0 ? 'danger' : left < 24 * 3_600_000 ? 'warning' : 'accent';
  const t = TONE_CLASSES[tone];
  return (
    <div className={cx('rounded-lg border p-3', t.border, left === null ? 'bg-panel-2' : t.bg)}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
          <Timer className={cx('size-3.5', t.text)} aria-hidden />
          {title}
        </p>
        <span className="text-[10px] text-faint">{rule}</span>
      </div>
      {left === null ? (
        <p className="mt-1 text-xs text-muted">{idle}</p>
      ) : (
        <>
          <p className={cx('mt-1 font-mono text-lg font-bold', t.text)}>
            {left < 0 ? `Overdue ${formatDuration(-left)}` : `${formatDuration(left)} left`}
          </p>
          <p className="text-[11px] text-muted">
            Started {formatDateTime(startMs!)} · due {formatDateTime(deadlineMs!)}
          </p>
        </>
      )}
      {action}
    </div>
  );
}

export function RegulatoryClocks({ incident }: { incident: Incident }) {
  const { conn } = useIr();
  const { can, openDialog } = useCt();
  const now = useNow();
  const gdprStart = optMs(incident.personalDataAwareAt);
  const secStart = optMs(incident.materialityAt);
  const canRecord = can('materiality') && incident.status !== 'closed';

  return (
    <section aria-label="Regulatory clocks" className="rounded-xl border border-line bg-panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-muted uppercase">
          <Scale className="size-3.5" aria-hidden /> Notification clocks
        </h3>
        <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning">
          Informational, not legal advice
        </span>
      </div>
      <div className="grid gap-2">
        <Clock
          title="GDPR · 72 hours"
          rule="Art. 33, from awareness"
          startMs={gdprStart}
          deadlineMs={gdprStart !== null ? gdprStart + 72 * 3_600_000 : null}
          idle="Starts when personal data (PII/PHI) is recorded in scope."
          now={now}
        />
        <Clock
          title="SEC 8-K · 4 business days"
          rule="Item 1.05, from materiality"
          startMs={secStart}
          deadlineMs={secStart !== null ? addBusinessDays(secStart, 4) : null}
          idle="Starts when the incident is determined material."
          now={now}
          action={
            canRecord && conn ? (
              <Button
                size="sm"
                variant="ghost"
                icon={Gavel}
                className="mt-1.5 -ml-1"
                onClick={() =>
                  openDialog({
                    kind: 'confirm',
                    title: secStart ? 'Withdraw the materiality determination?' : 'Record that the incident is material?',
                    body: secStart
                      ? 'The SEC clock is cleared. The change is recorded in the timeline and audit log.'
                      : 'This starts the informational SEC 8-K Item 1.05 clock (four business days). Legal makes this call; it is recorded in the timeline and audit log.',
                    confirmLabel: secStart ? 'Withdraw determination' : 'Record determination',
                    tone: 'warning',
                    reasonLabel: 'Note (optional)',
                    onConfirm: (note) => conn.reducers.setMateriality({ incidentId: incident.id, determined: !secStart, note }),
                  })
                }
              >
                {secStart ? 'Withdraw determination' : 'Record materiality determination'}
              </Button>
            ) : null
          }
        />
      </div>
    </section>
  );
}
