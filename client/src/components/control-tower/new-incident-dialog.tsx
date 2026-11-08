'use client';

/**
 * Open an incident from a template (ransomware, exfiltration, BEC, blank) or
 * from an Arrow ops draft. Drafts are only a starting point: a signed-in IR
 * member reviews every field, then the incident (and its scope rows) is
 * created in one atomic reducer call. The ops draft is then marked handled
 * through the ops connection; if ops is offline, the incident still exists.
 */
import { FileInput, Plus, Siren, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { errorMessage, useToast } from '@/components/ui/toast';
import { useIr } from '@/lib/ir/client';
import { useOps } from '@/lib/ops/client';
import { useCt } from './context';
import { draftRef, type DraftScopeRow, type ParsedDraft } from './drafts';
import { formatCount } from './format';
import { Button, cx, ErrorNote, Field, inputClass, Modal, Select, StatusBadge } from './ui';
import {
  ATTACK_VECTORS,
  CATEGORIES,
  DATA_CLASSES,
  FUNCTIONAL_IMPACTS,
  INFORMATION_IMPACTS,
  PHASE_META,
  RECOVERABILITY,
  SCOPE_STATUS_META,
  SEVERITIES,
  SEVERITY_META,
  TEMPLATES,
  type IncidentTemplate,
  type TemplateTask,
} from './vocab';

const DETECTED_OPTIONS: [string, string][] = [
  ['0', 'Just now'],
  ['15', '15 minutes ago'],
  ['60', '1 hour ago'],
  ['240', '4 hours ago'],
  ['1440', '24 hours ago'],
];

interface FormState {
  template: string;
  title: string;
  severity: string;
  category: string;
  attackVector: string;
  functionalImpact: string;
  informationImpact: string;
  recoverability: string;
  summary: string;
  iocs: string;
  detected: string;
  scope: DraftScopeRow[];
  tasks: (TemplateTask & { keep: boolean })[];
}

function fromTemplate(t: IncidentTemplate): FormState {
  return {
    template: t.key,
    title: t.title,
    severity: t.severity,
    category: t.category,
    attackVector: t.attackVector,
    functionalImpact: t.functionalImpact,
    informationImpact: t.informationImpact,
    recoverability: t.recoverability,
    summary: t.summary,
    iocs: '',
    detected: '0',
    scope: [],
    tasks: t.tasks.map((task) => ({ ...task, keep: true })),
  };
}

function fromDraft(d: ParsedDraft): FormState {
  const tpl = TEMPLATES.find((t) => t.category === d.category) ?? TEMPLATES[TEMPLATES.length - 1];
  const minutesAgo = Math.max(0, Math.round((Date.now() - d.createdAtMs) / 60_000));
  return {
    template: 'ops_draft',
    title: d.title,
    severity: d.severity,
    category: d.category,
    attackVector: d.attackVector,
    functionalImpact: d.functionalImpact,
    informationImpact: d.informationImpact,
    recoverability: d.recoverability,
    summary: d.summary,
    iocs: d.iocs.join('\n'),
    detected: String(Math.min(minutesAgo, 1440)),
    scope: d.scope,
    tasks: tpl.tasks.map((task) => ({ ...task, keep: true })),
  };
}

export function NewIncidentDialog({ draft, onClose }: { draft?: ParsedDraft; onClose: () => void }) {
  const { conn } = useIr();
  const ops = useOps();
  const toast = useToast();
  const { select, setView, setTab } = useCt();
  const [form, setForm] = useState<FormState>(() => (draft ? fromDraft(draft) : fromTemplate(TEMPLATES[0])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const detectedOptions = DETECTED_OPTIONS.some(([v]) => v === form.detected)
    ? DETECTED_OPTIONS
    : [[form.detected, `${form.detected} minutes ago (from draft)`] as [string, string], ...DETECTED_OPTIONS];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!conn) return;
    setBusy(true);
    setError(null);
    const opsDraftRef = draft ? draftRef(draft.proposalId) : '';
    try {
      await conn.reducers.createIncident({
        title: form.title,
        severity: form.severity,
        category: form.category,
        attackVector: form.attackVector,
        functionalImpact: form.functionalImpact,
        informationImpact: form.informationImpact,
        recoverability: form.recoverability,
        summary: form.summary,
        iocs: form.iocs
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 50),
        detectedMinutesAgo: Number(form.detected) || 0,
        template: form.template,
        linkedDisruptionId: draft?.disruptionId ?? 0n,
        opsDraftRef,
        orgName: draft?.orgName ?? '',
        affectedNodes: draft?.affectedNodes ?? [],
        scope: form.scope.map((s) => ({ ...s, evidenceRef: 'Arrow ops draft' })),
        tasks: form.tasks.filter((t) => t.keep).map(({ title, phase }) => ({ title, phase })),
      });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      return;
    }

    // Find what we just created in the live cache (the reducer has no return value).
    const mine = [...conn.db.irIncidents.iter()]
      .filter((i) => (opsDraftRef ? i.opsDraftRef === opsDraftRef : i.title === form.title.trim()))
      .sort((a, b) => (a.createdAt.microsSinceUnixEpoch > b.createdAt.microsSinceUnixEpoch ? -1 : 1))[0];
    if (mine) {
      select(mine.id);
      setView('incident');
      setTab('scope');
    }
    toast({ title: `${mine?.ref ?? 'Incident'} opened`, description: 'Everyone on the team sees it now.', tone: 'success' });

    if (draft && mine) {
      if (ops.conn && ops.status === 'connected') {
        try {
          await ops.conn.reducers.acknowledgeIrDraft({ proposalId: draft.proposalId, incidentRef: mine.ref });
        } catch (err) {
          toast({
            title: 'Ops draft not marked as handled',
            description: `${errorMessage(err)} The incident is open regardless.`,
            tone: 'warning',
          });
        }
      } else {
        toast({
          title: 'Ops link offline',
          description: 'The incident is open. The ops draft will still show as pending there.',
          tone: 'warning',
        });
      }
    }
    setBusy(false);
    onClose();
  }

  return (
    <Modal
      title={draft ? 'Review the ops draft and open the incident' : 'New incident'}
      description={
        draft
          ? 'Drafted by the Arrow ops agent. Nothing is created until you review it and press “Open incident”.'
          : 'Pick a template to pre-fill the record and starter tasks. You can change everything later.'
      }
      onClose={onClose}
      width="max-w-3xl"
      tone={draft ? 'cyan' : undefined}
    >
      <form onSubmit={submit} className="space-y-5">
        {draft ? (
          <div className="rounded-xl border border-cyan/40 bg-cyan-soft p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-cyan">
              <FileInput className="size-4" aria-hidden /> From Arrow ops · disruption #{String(draft.disruptionId)}
              {draft.orgName ? ` · ${draft.orgName}` : ''}
            </p>
            {draft.rationale && <p className="mt-1 text-xs leading-relaxed text-muted">{draft.rationale}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Template">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={form.template === t.key}
                onClick={() => setForm(fromTemplate(t))}
                className={cx(
                  'rounded-xl border p-3 text-left transition-colors',
                  form.template === t.key ? 'border-accent bg-accent-soft' : 'border-line hover:bg-panel-hover'
                )}
              >
                <span className="block text-sm font-bold text-fg">{t.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">{t.description}</span>
              </button>
            ))}
          </div>
        )}

        <Field label="Title">
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            maxLength={160}
            required
            data-autofocus
          />
        </Field>

        <Field label="Severity">
          <div className="grid grid-cols-4 gap-2">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={form.severity === s}
                onClick={() => set('severity', s)}
                className={cx(
                  'rounded-lg border p-2',
                  form.severity === s ? 'border-accent bg-accent-soft' : 'border-line hover:bg-panel-hover'
                )}
              >
                <StatusBadge meta={SEVERITY_META[s]} size="sm" />
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Category">
            <Select value={form.category} onChange={(v) => set('category', v)} options={CATEGORIES} />
          </Field>
          <Field label="Attack vector (CISA)">
            <Select value={form.attackVector} onChange={(v) => set('attackVector', v)} options={ATTACK_VECTORS} />
          </Field>
          <Field label="Detected">
            <Select value={form.detected} onChange={(v) => set('detected', v)} options={detectedOptions} />
          </Field>
          <Field label="Functional impact">
            <Select value={form.functionalImpact} onChange={(v) => set('functionalImpact', v)} options={FUNCTIONAL_IMPACTS} />
          </Field>
          <Field label="Information impact">
            <Select value={form.informationImpact} onChange={(v) => set('informationImpact', v)} options={INFORMATION_IMPACTS} />
          </Field>
          <Field label="Recoverability">
            <Select value={form.recoverability} onChange={(v) => set('recoverability', v)} options={RECOVERABILITY} />
          </Field>
        </div>

        <Field label="Summary (what we know so far)">
          <textarea
            className={cx(inputClass, 'min-h-20 leading-relaxed')}
            value={form.summary}
            onChange={(e) => set('summary', e.target.value)}
            maxLength={4000}
          />
        </Field>
        <Field label="Indicators of compromise (one per line)">
          <textarea
            className={cx(inputClass, 'min-h-16 font-mono text-xs')}
            value={form.iocs}
            onChange={(e) => set('iocs', e.target.value)}
            placeholder={'185.220.101.47:443\n*.lockd file extension'}
          />
        </Field>

        {form.scope.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted">
              Affected data from the draft ({form.scope.length}) — remove anything that does not apply
            </p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {form.scope.map((s, i) => (
                <li key={`${s.asset}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <StatusBadge meta={SCOPE_STATUS_META[s.status]} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-fg">
                    {s.asset}
                    <span className="text-muted">
                      {' '}
                      · {DATA_CLASSES[s.dataClass]?.short ?? s.dataClass}
                      {s.records > 0n ? ` · ~${formatCount(s.records)} records` : ''} · {s.confidence}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 text-faint hover:bg-panel-hover hover:text-danger"
                    aria-label={`Remove ${s.asset}`}
                    onClick={() =>
                      set(
                        'scope',
                        form.scope.filter((_, j) => j !== i)
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {form.tasks.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted">Starter tasks</p>
            <ul className="grid gap-1">
              {form.tasks.map((t, i) => (
                <li key={t.title}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-panel-hover">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={t.keep}
                      onChange={(e) =>
                        set(
                          'tasks',
                          form.tasks.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x))
                        )
                      }
                    />
                    <span className={cx('flex-1', t.keep ? 'text-fg' : 'text-faint line-through')}>{t.title}</span>
                    <span className="text-[11px] text-faint">{PHASE_META[t.phase].short}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ErrorNote message={error} />
        <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
          <p className="text-xs text-faint">
            Opens in Detection &amp; Analysis. You become commander if you are an admin or incident commander.
          </p>
          <div className="flex gap-2">
            <Button icon={X} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" icon={draft ? Plus : Siren} busy={busy} disabled={!form.title.trim()}>
              Open incident
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
