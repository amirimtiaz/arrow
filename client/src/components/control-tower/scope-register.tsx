'use client';

/** Scope register: one row per affected data asset; status changes are live for everyone. */
import { BellRing, ChevronDown, Database, Plus } from 'lucide-react';
import type { Incident, ScopeItem } from '@/module_bindings/ir/types';
import { useIr } from '@/lib/ir/client';
import { useCt } from './context';
import { formatCount, relativeTime, tsMs, useNow } from './format';
import { scopeCounts } from './logic';
import { Button, cx, EmptyState, Pill, StatusBadge } from './ui';
import { DATA_CLASSES, SCOPE_STATUS_META, SCOPE_STATUSES, TONE_CLASSES } from './vocab';

function StatusSelect({ item, disabled }: { item: ScopeItem; disabled: boolean }) {
  const { conn } = useIr();
  const { run } = useCt();
  const meta = SCOPE_STATUS_META[item.status] ?? SCOPE_STATUS_META.unknown;
  const tone = TONE_CLASSES[meta.tone];
  const Icon = meta.icon;
  if (disabled) return <StatusBadge meta={meta} />;
  return (
    <span className={cx('relative inline-flex items-center rounded-md border', tone.bg, tone.border)}>
      <Icon className={cx('pointer-events-none absolute left-2 size-3.5', tone.text)} aria-hidden />
      <select
        aria-label={`Status of ${item.asset}`}
        value={item.status}
        onChange={(e) =>
          conn &&
          run(
            () => conn.reducers.updateScopeStatus({ scopeId: item.id, status: e.target.value, confidence: item.confidence, note: '' }),
            `“${item.asset}” → ${SCOPE_STATUS_META[e.target.value]?.label}`
          )
        }
        className={cx('h-8 cursor-pointer appearance-none bg-transparent pr-7 pl-7 text-xs font-semibold focus:outline-none', tone.text)}
      >
        {SCOPE_STATUSES.map((s) => (
          <option key={s} value={s} className="bg-panel text-fg">
            {SCOPE_STATUS_META[s].label}
          </option>
        ))}
      </select>
      <ChevronDown className={cx('pointer-events-none absolute right-1.5 size-3.5', tone.text)} aria-hidden />
    </span>
  );
}

export function ScopeRegister({ incident, scope }: { incident: Incident; scope: ScopeItem[] }) {
  const { conn } = useIr();
  const { can, run, openDialog } = useCt();
  const now = useNow();
  const closed = incident.status === 'closed';
  const canEdit = can('edit_scope') && !closed;
  const canFlag = can('scope_notification') && !closed;
  const counts = scopeCounts(scope);
  const rows = [...scope].sort((a, b) => Number(a.id - b.id));

  return (
    <section aria-label="Scope register">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {SCOPE_STATUSES.filter((s) => counts[s] > 0).map((s) => (
            <StatusBadge key={s} size="sm" meta={{ ...SCOPE_STATUS_META[s], label: `${counts[s]} ${SCOPE_STATUS_META[s].label}` }} />
          ))}
          {scope.some((s) => s.notificationRequired) && (
            <Pill tone="warning">
              <BellRing className="size-3" aria-hidden />
              {scope.filter((s) => s.notificationRequired).length} may need notification
            </Pill>
          )}
        </div>
        {canEdit && (
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => openDialog({ kind: 'scope' })}>
            Affected data
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No affected data recorded yet"
          action={
            canEdit ? (
              <Button variant="secondary" icon={Plus} onClick={() => openDialog({ kind: 'scope' })}>
                Affected data
              </Button>
            ) : undefined
          }
        >
          Record each affected data set and what the attacker did to it. This drives notifications and the final report.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-panel-2 text-left text-[11px] font-bold tracking-wider text-muted uppercase">
              <tr>
                <th className="px-3 py-2">Asset</th>
                <th className="px-3 py-2">Data class</th>
                <th className="px-3 py-2 text-right">Records</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Confidence</th>
                <th className="px-3 py-2">Notify?</th>
                <th className="px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((s) => {
                const dc = DATA_CLASSES[s.dataClass];
                return (
                  <tr key={String(s.id)} className="align-top hover:bg-panel-hover/50">
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-fg">{s.asset}</p>
                      <p className="text-xs text-muted">{[s.system, s.owner && `owner: ${s.owner}`].filter(Boolean).join(' · ') || '—'}</p>
                      {s.evidenceRef && <p className="mt-0.5 font-mono text-[11px] text-faint">evidence: {s.evidenceRef}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Pill tone={dc?.personal ? 'violet' : s.dataClass === 'pci' || s.dataClass === 'credentials' ? 'warning' : 'muted'}>
                        {dc?.short ?? s.dataClass}
                      </Pill>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-fg">{s.records > 0n ? formatCount(s.records) : '—'}</td>
                    <td className="px-3 py-2.5">
                      <StatusSelect item={s} disabled={!canEdit} />
                    </td>
                    <td className="px-3 py-2.5">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() =>
                            conn &&
                            run(() =>
                              conn.reducers.updateScopeStatus({
                                scopeId: s.id,
                                status: s.status,
                                confidence: s.confidence === 'confirmed' ? 'suspected' : 'confirmed',
                                note: '',
                              })
                            )
                          }
                          className={cx(
                            'h-8 rounded-md border px-2 text-xs font-semibold capitalize',
                            s.confidence === 'confirmed'
                              ? 'border-danger/40 bg-danger-soft text-danger'
                              : 'border-line text-muted hover:bg-panel-hover'
                          )}
                          title="Toggle suspected / confirmed"
                        >
                          {s.confidence}
                        </button>
                      ) : (
                        <span className="text-xs text-muted capitalize">{s.confidence}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <label className={cx('inline-flex items-center gap-2 text-xs', canFlag ? 'cursor-pointer' : '')}>
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={s.notificationRequired}
                          disabled={!canFlag}
                          onChange={(e) =>
                            conn && run(() => conn.reducers.setScopeNotification({ scopeId: s.id, required: e.target.checked, note: '' }))
                          }
                        />
                        <span className={s.notificationRequired ? 'font-semibold text-warning' : 'text-muted'}>
                          {s.notificationRequired ? 'May be required' : 'No'}
                        </span>
                      </label>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted">
                      {relativeTime(tsMs(s.updatedAt), now)}
                      <span className="block text-faint">{s.updatedByName}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
