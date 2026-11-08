'use client';

/** Incident record (NIST SP 800-61 / CISA fields): classification, IOCs, summary, people and times. */
import { Crown, Globe2, Pencil, Plus, Save, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { Incident } from '@/module_bindings/ir/types';
import { useIr } from '@/lib/ir/client';
import { useCt } from './context';
import { formatDateTime, formatUtc, optMs, tsMs } from './format';
import { Button, cx, Field, inputClass, SectionTitle, Select } from './ui';
import { ATTACK_VECTORS, CATEGORIES, FUNCTIONAL_IMPACTS, INFORMATION_IMPACTS, labelOf, RECOVERABILITY } from './vocab';

const CLASSIFICATION = [
  ['category', 'Category', CATEGORIES],
  ['attackVector', 'Attack vector (CISA)', ATTACK_VECTORS],
  ['functionalImpact', 'Functional impact', FUNCTIONAL_IMPACTS],
  ['informationImpact', 'Information impact', INFORMATION_IMPACTS],
  ['recoverability', 'Recoverability', RECOVERABILITY],
] as const;

/** Read view + explicit Edit for long text, so remote edits never clobber a half-typed draft. */
export function TextBlock({
  label,
  value,
  field,
  incident,
  editable,
  placeholder,
  rows = 5,
}: {
  label: string;
  value: string;
  field: 'summary' | 'lessonsLearned' | 'title';
  incident: Incident;
  editable: boolean;
  placeholder: string;
  rows?: number;
}) {
  const { conn } = useIr();
  const { run } = useCt();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!conn || draft === null) return;
    setBusy(true);
    const ok = await run(() => conn.reducers.updateIncident({ incidentId: incident.id, field, value: draft }), `${label} saved`);
    setBusy(false);
    if (ok) setDraft(null);
  }

  return (
    <div>
      <SectionTitle
        right={
          editable && draft === null ? (
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setDraft(value)}>
              Edit
            </Button>
          ) : null
        }
      >
        {label}
      </SectionTitle>
      {draft === null ? (
        <p
          className={cx(
            'rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
            value ? 'text-fg' : 'text-faint'
          )}
        >
          {value || placeholder}
        </p>
      ) : (
        <div className="space-y-2">
          <textarea
            className={cx(inputClass, 'leading-relaxed')}
            rows={rows}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={field === 'lessonsLearned' ? 8000 : 4000}
            placeholder={placeholder}
            autoFocus
            aria-label={label}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" icon={X} onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" icon={Save} busy={busy} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function IocEditor({ incident, editable }: { incident: Incident; editable: boolean }) {
  const { conn } = useIr();
  const { run } = useCt();
  const [value, setValue] = useState('');

  async function add() {
    const v = value.trim();
    if (!conn || !v || incident.iocs.includes(v)) return;
    const ok = await run(() => conn.reducers.setIocs({ incidentId: incident.id, iocs: [...incident.iocs, v] }), 'Indicator added');
    if (ok) setValue('');
  }

  return (
    <div>
      <SectionTitle>Indicators of compromise ({incident.iocs.length})</SectionTitle>
      <ul className="space-y-1">
        {incident.iocs.map((ioc) => (
          <li key={ioc} className="flex items-center gap-2 rounded-md border border-line bg-panel-2 px-2.5 py-1.5">
            <code className="min-w-0 flex-1 font-mono text-xs break-all text-fg">{ioc}</code>
            {editable && (
              <button
                type="button"
                className="rounded p-0.5 text-faint hover:text-danger"
                aria-label={`Remove ${ioc}`}
                onClick={() =>
                  conn && run(() => conn.reducers.setIocs({ incidentId: incident.id, iocs: incident.iocs.filter((i) => i !== ioc) }))
                }
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
        {incident.iocs.length === 0 && <li className="text-sm text-faint">None recorded yet.</li>}
      </ul>
      {editable && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            className={cx(inputClass, 'font-mono text-xs')}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={300}
            placeholder="IP, domain, hash, file name…"
            aria-label="New indicator of compromise"
          />
          <Button type="submit" icon={Plus} disabled={!value.trim()}>
            Add
          </Button>
        </form>
      )}
    </div>
  );
}

export function IncidentDetails({ incident }: { incident: Incident }) {
  const { conn } = useIr();
  const { can, run, openDialog } = useCt();
  const open = incident.status !== 'closed';
  const editable = can('edit_incident') && open;

  const times: [string, number | null][] = [
    ['Detected', tsMs(incident.detectedAt)],
    ['Reported', tsMs(incident.reportedAt)],
    ['Contained', optMs(incident.containedAt)],
    ['Closed', optMs(incident.closedAt)],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-5">
        <div>
          <SectionTitle>Classification (CISA / US-CERT)</SectionTitle>
          <div className="grid gap-3">
            {CLASSIFICATION.map(([field, label, options]) => (
              <Field key={field} label={label}>
                {editable ? (
                  <Select
                    value={incident[field]}
                    options={options}
                    onChange={(v) =>
                      conn && run(() => conn.reducers.updateIncident({ incidentId: incident.id, field, value: v }), `${label} updated`)
                    }
                  />
                ) : (
                  <p className="text-sm text-fg">{labelOf(options, incident[field])}</p>
                )}
              </Field>
            ))}
          </div>
        </div>
        <IocEditor incident={incident} editable={editable} />
      </div>

      <div className="space-y-5">
        <TextBlock
          label="Summary"
          field="summary"
          value={incident.summary}
          incident={incident}
          editable={editable}
          placeholder="What happened, what is affected, what we are doing."
        />

        <div>
          <SectionTitle>People</SectionTitle>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Incident commander</dt>
            <dd className="flex items-center gap-2 text-fg">
              <Crown className="size-4 text-accent" aria-hidden />
              {incident.commanderName || <span className="text-warning">Unassigned</span>}
              {can('assign_commander') && open && (
                <Button size="sm" variant="ghost" onClick={() => openDialog({ kind: 'commander' })}>
                  Change
                </Button>
              )}
            </dd>
            <dt className="text-muted">Reported by</dt>
            <dd className="text-fg">{incident.reporterName}</dd>
            <dt className="text-muted">Last update</dt>
            <dd className="text-fg">
              {formatDateTime(tsMs(incident.updatedAt))} · {incident.updatedByName}
            </dd>
          </dl>
        </div>

        <div>
          <SectionTitle>Timestamps</SectionTitle>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
            {times.map(([label, ms]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className={ms ? 'font-mono text-xs text-fg' : 'text-faint'}>
                  {ms ? `${formatDateTime(ms)} · ${formatUtc(ms)}` : 'Not yet'}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <SectionTitle>Supply-chain link (from Arrow ops)</SectionTitle>
          {incident.linkedDisruptionId > 0n ? (
            <div className="space-y-2 rounded-lg border border-cyan/40 bg-cyan-soft p-3 text-sm">
              <p className="text-fg">
                Disruption #{String(incident.linkedDisruptionId)}
                {incident.orgName ? ` · ${incident.orgName}` : ''}
              </p>
              {incident.affectedNodes.length > 0 && (
                <p className="text-xs text-muted">Affected nodes: {incident.affectedNodes.join(', ')}</p>
              )}
              <Link
                href={`/app?focus=disruption:${incident.linkedDisruptionId}`}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan/50 px-3 text-sm font-semibold text-cyan hover:bg-panel-hover"
              >
                <Globe2 className="size-4" aria-hidden /> Show blast radius on Silk Road
              </Link>
              <p className="text-[11px] text-faint">
                One-way and human-gated: ops can only draft; it never holds Control Tower credentials.
              </p>
            </div>
          ) : (
            <p className="text-sm text-faint">Not linked to an ops disruption.</p>
          )}
        </div>
      </div>
    </div>
  );
}
