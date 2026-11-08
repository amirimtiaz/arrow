'use client';

/** Lessons learned, offline post-incident report export and the shift-handoff summary. */
import { ArrowRightLeft, Copy, FileCode2, FileDown, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { useIrStatus } from '@/lib/ir/client';
import { useCt } from './context';
import { TextBlock } from './details';
import { useNow } from './format';
import type { IncidentData } from './logic';
import { buildHandoff, buildReportHtml, buildReportMarkdown, downloadFile } from './report';
import { Button, SectionTitle } from './ui';

export function useReportExport(data: IncidentData | null) {
  const { me, markExported } = useCt();
  const status = useIrStatus();
  const toast = useToast();
  return (format: 'html' | 'md') => {
    if (!data) return;
    const meta = { generatedBy: me.name, generatedAtMs: Date.now(), auditSeq: status?.auditSeq, auditHead: status?.auditHead };
    const base = `${data.incident.ref}-post-incident-report`;
    if (format === 'html') downloadFile(`${base}.html`, buildReportHtml(data, meta), 'text/html;charset=utf-8');
    else downloadFile(`${base}.md`, buildReportMarkdown(data, meta), 'text/markdown;charset=utf-8');
    markExported(data.incident.ref);
    toast({ title: 'Report downloaded', description: 'Generated in this browser; nothing left the isolated network.', tone: 'success' });
  };
}

export function ReportPanel({ data }: { data: IncidentData }) {
  const { me, can, openDialog } = useCt();
  const status = useIrStatus();
  const toast = useToast();
  const now = useNow();
  const exportReport = useReportExport(data);
  const [showHandoff, setShowHandoff] = useState(false);
  const inc = data.incident;
  const handoff = showHandoff ? buildHandoff(data, now, me.role) : '';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <TextBlock
          label="Lessons learned"
          field="lessonsLearned"
          value={inc.lessonsLearned}
          incident={inc}
          editable={can('edit_incident') && inc.status !== 'closed'}
          placeholder="What worked? What slowed us down? What changes now (owner + date)?"
          rows={8}
        />

        <div>
          <SectionTitle
            icon={ArrowRightLeft}
            right={
              <Button size="sm" variant="ghost" onClick={() => setShowHandoff((v) => !v)}>
                {showHandoff ? 'Hide' : 'Generate'}
              </Button>
            }
          >
            Shift handoff summary
          </SectionTitle>
          {showHandoff ? (
            <div className="space-y-2">
              <pre className="rounded-lg border border-line bg-panel-2 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg">
                {handoff}
              </pre>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  icon={Copy}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(handoff);
                      toast({ title: 'Handoff copied', tone: 'success' });
                    } catch {
                      toast({ title: 'Copy failed', description: 'Select the text and copy it manually.', tone: 'warning' });
                    }
                  }}
                >
                  Copy
                </Button>
                {can('add_note') && (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={ArrowRightLeft}
                    onClick={() => openDialog({ kind: 'note', text: handoff, handoff: true })}
                  >
                    Post to timeline
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">
              A plain-text snapshot for the next shift: who leads, where it stands, open tasks and the next step.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-panel p-4">
          <SectionTitle icon={FileDown}>Post-incident report</SectionTitle>
          <p className="text-sm text-muted">
            Incident record, scope register, full timeline, tasks, lessons learned, chat log and the audit-chain head. Built in your
            browser; works offline.
          </p>
          <div className="mt-3 grid gap-2">
            <Button variant="secondary" icon={FileDown} onClick={() => exportReport('html')}>
              Download report (HTML, printable)
            </Button>
            <Button variant="ghost" icon={FileCode2} onClick={() => exportReport('md')}>
              Download as Markdown
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-panel p-4">
          <SectionTitle icon={ShieldCheck}>Integrity</SectionTitle>
          <p className="text-xs text-muted">Audit chain head (included in the report):</p>
          <p className="mt-1 font-mono text-xs break-all text-fg">
            #{status ? String(status.auditSeq) : '—'} {status?.auditHead ?? ''}
          </p>
        </div>
      </div>
    </div>
  );
}
