/**
 * Post-incident report and shift-handoff summary, generated entirely in the
 * browser (no network) so they work on an isolated laptop. The HTML export is
 * a single self-contained file; every value is HTML-escaped.
 */
import { formatCount, formatDuration, formatUtc, optMs, tsMs } from './format';
import { nextStep, scopeCounts, type IncidentData } from './logic';
import {
  ATTACK_VECTORS,
  CATEGORIES,
  DATA_CLASSES,
  FUNCTIONAL_IMPACTS,
  INCIDENT_STATUS_META,
  INFORMATION_IMPACTS,
  labelOf,
  PHASE_META,
  RECOVERABILITY,
  roleLabel,
  SCOPE_STATUS_META,
  SEVERITY_META,
} from './vocab';

export interface ReportMeta {
  generatedBy: string;
  generatedAtMs: number;
  auditSeq?: bigint;
  auditHead?: string;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function when(ms: number | null) {
  return ms === null ? '—' : formatUtc(ms);
}

function facts(d: IncidentData) {
  const inc = d.incident;
  return [
    ['Incident', `${inc.ref} — ${inc.title}`],
    ['Severity', SEVERITY_META[inc.severity]?.label ?? inc.severity],
    ['Status', INCIDENT_STATUS_META[inc.status]?.label ?? inc.status],
    ['Phase (NIST SP 800-61)', PHASE_META[inc.phase]?.label ?? inc.phase],
    ['Incident commander', inc.commanderName || 'Unassigned'],
    ['Reported by', inc.reporterName],
    ['Category', labelOf(CATEGORIES, inc.category)],
    ['Attack vector (CISA)', labelOf(ATTACK_VECTORS, inc.attackVector)],
    ['Functional impact', labelOf(FUNCTIONAL_IMPACTS, inc.functionalImpact)],
    ['Information impact', labelOf(INFORMATION_IMPACTS, inc.informationImpact)],
    ['Recoverability', labelOf(RECOVERABILITY, inc.recoverability)],
    ['Detected', when(tsMs(inc.detectedAt))],
    ['Reported', when(tsMs(inc.reportedAt))],
    ['Contained', when(optMs(inc.containedAt))],
    ['Closed', when(optMs(inc.closedAt))],
    ['Linked ops disruption', inc.linkedDisruptionId > 0n ? `#${inc.linkedDisruptionId}${inc.orgName ? ` (${inc.orgName})` : ''}` : 'None'],
    ['Affected supply-chain nodes', inc.affectedNodes.join(', ') || 'None recorded'],
  ] as const;
}

const sortByTs = <T extends { ts: { microsSinceUnixEpoch: bigint } }>(rows: T[]) =>
  [...rows].sort((a, b) => (a.ts.microsSinceUnixEpoch < b.ts.microsSinceUnixEpoch ? -1 : 1));

export function buildReportMarkdown(d: IncidentData, meta: ReportMeta): string {
  const inc = d.incident;
  const lines: string[] = [];
  lines.push(`# Post-incident report: ${inc.ref}`, '');
  lines.push('_Simulated data (Arrow demo). Generated offline in the Arrow Control Tower._', '');
  lines.push('| Field | Value |', '|---|---|');
  for (const [k, v] of facts(d)) lines.push(`| ${k} | ${v.replace(/\|/g, '\\|')} |`);
  lines.push('', '## Summary', '', inc.summary || '_No summary recorded._', '');
  lines.push('## Indicators of compromise', '');
  lines.push(...(inc.iocs.length ? inc.iocs.map((i) => `- \`${i}\``) : ['_None recorded._']), '');
  lines.push('## Scope register (affected data)', '');
  if (d.scope.length) {
    lines.push(
      '| Asset | System | Data class | Records | Status | Confidence | Notification may be required |',
      '|---|---|---|---|---|---|---|'
    );
    for (const s of d.scope) {
      lines.push(
        `| ${s.asset} | ${s.system || '—'} | ${DATA_CLASSES[s.dataClass]?.short ?? s.dataClass} | ${s.records > 0n ? formatCount(s.records) : '—'} | ${
          SCOPE_STATUS_META[s.status]?.label ?? s.status
        } | ${s.confidence} | ${s.notificationRequired ? 'Yes' : 'No'} |`
      );
    }
  } else lines.push('_No affected data recorded._');
  lines.push('', '## Timeline', '');
  for (const e of sortByTs(d.events))
    lines.push(`- **${formatUtc(tsMs(e.ts))}** — ${e.actorName}${e.actorRole ? ` (${roleLabel(e.actorRole)})` : ''}: ${e.text}`);
  lines.push('', '## Tasks', '');
  lines.push(
    ...(d.tasks.length
      ? d.tasks.map(
          (t) =>
            `- [${t.status === 'done' ? 'x' : ' '}] ${t.title} — ${t.assigneeName || 'unassigned'} (${PHASE_META[t.phase]?.short ?? t.phase})`
        )
      : ['_No tasks._'])
  );
  lines.push('', '## Lessons learned', '', inc.lessonsLearned || '_Not written yet._', '');
  lines.push('## Communications log (out-of-band chat)', '');
  for (const m of sortByTs(d.messages)) lines.push(`- ${formatUtc(tsMs(m.ts))} ${m.senderName}: ${m.text}`);
  lines.push('', '## Integrity', '');
  lines.push(
    meta.auditHead
      ? `Audit chain head at export: entry #${meta.auditSeq} \`${meta.auditHead}\`. Keep this value somewhere separate; any later rewrite of the log changes it.`
      : 'Audit chain head unavailable.'
  );
  lines.push('', `Generated ${formatUtc(meta.generatedAtMs)} by ${meta.generatedBy}.`, '');
  return lines.join('\n');
}

export function buildReportHtml(d: IncidentData, meta: ReportMeta): string {
  const inc = d.incident;
  const row = (cells: string[], tag = 'td') => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
  const scopeRows = d.scope
    .map((s) =>
      row([
        esc(s.asset),
        esc(s.system || '—'),
        esc(DATA_CLASSES[s.dataClass]?.label ?? s.dataClass),
        s.records > 0n ? formatCount(s.records) : '—',
        esc(SCOPE_STATUS_META[s.status]?.label ?? s.status),
        esc(s.confidence),
        s.notificationRequired ? 'Yes' : 'No',
      ])
    )
    .join('');
  const events = sortByTs(d.events)
    .map((e) => `<li><b>${esc(formatUtc(tsMs(e.ts)))}</b> — ${esc(e.actorName)}: ${esc(e.text)}</li>`)
    .join('');
  const tasks = d.tasks
    .map(
      (t) =>
        `<li>${t.status === 'done' ? '&#9745;' : '&#9744;'} ${esc(t.title)} <span class="m">— ${esc(t.assigneeName || 'unassigned')}</span></li>`
    )
    .join('');
  const chat = sortByTs(d.messages)
    .map((m) => `<li><span class="m">${esc(formatUtc(tsMs(m.ts)))}</span> <b>${esc(m.senderName)}</b>: ${esc(m.text)}</li>`)
    .join('');
  const para = (text: string, empty: string) =>
    text.trim()
      ? text
          .split(/\n{2,}/)
          .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
          .join('')
      : `<p class="m">${empty}</p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(inc.ref)} post-incident report</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#0f1b2d;max-width:960px;margin:32px auto;padding:0 20px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-bottom:1px solid #dde7f3;padding-bottom:4px}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #dde7f3;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f3f7fc}.m{color:#55657a}.badge{display:inline-block;background:#fdecec;color:#b42318;border-radius:6px;padding:2px 8px;font-weight:600;font-size:12px}
code{background:#f3f7fc;padding:1px 4px;border-radius:4px;word-break:break-all}ul{padding-left:20px}
@media print{body{margin:0}}
</style></head><body>
<p class="badge">Simulated data · Arrow demo</p>
<h1>${esc(inc.ref)} — ${esc(inc.title)}</h1>
<p class="m">Post-incident report generated offline in the Arrow Control Tower on ${esc(formatUtc(meta.generatedAtMs))} by ${esc(meta.generatedBy)}.</p>
<h2>Incident record</h2><table>${facts(d)
    .map(([k, v]) => row([`<b>${esc(k)}</b>`, esc(v)]))
    .join('')}</table>
<h2>Summary</h2>${para(inc.summary, 'No summary recorded.')}
<h2>Indicators of compromise</h2>${inc.iocs.length ? `<ul>${inc.iocs.map((i) => `<li><code>${esc(i)}</code></li>`).join('')}</ul>` : '<p class="m">None recorded.</p>'}
<h2>Scope register (affected data)</h2>${
    d.scope.length
      ? `<table>${row(['Asset', 'System', 'Data class', 'Records', 'Status', 'Confidence', 'Notification may be required'], 'th')}${scopeRows}</table>`
      : '<p class="m">No affected data recorded.</p>'
  }
<h2>Timeline</h2><ul>${events || '<li class="m">No events.</li>'}</ul>
<h2>Tasks</h2><ul>${tasks || '<li class="m">No tasks.</li>'}</ul>
<h2>Lessons learned</h2>${para(inc.lessonsLearned, 'Not written yet.')}
<h2>Communications log (out-of-band chat)</h2><ul>${chat || '<li class="m">No messages.</li>'}</ul>
<h2>Integrity</h2><p>${
    meta.auditHead
      ? `Audit chain head at export: entry #${esc(String(meta.auditSeq))} <code>${esc(meta.auditHead)}</code>. Keep this value somewhere separate; any later rewrite of the audit log changes it.`
      : 'Audit chain head unavailable.'
  }</p>
<p class="m">Regulatory timelines in the Control Tower are informational, not legal advice.</p>
</body></html>`;
}

export function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Plain-text shift handoff: who leads, where it stands, what is next. */
export function buildHandoff(d: IncidentData, nowMs: number, myRole: string): string {
  const inc = d.incident;
  const counts = scopeCounts(d.scope);
  const scopeLine = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${SCOPE_STATUS_META[s]?.label.toLowerCase() ?? s}`)
    .join(', ');
  const open = d.tasks.filter((t) => t.status === 'open');
  const recent = sortByTs(d.events).slice(-5);
  const next = nextStep(d, myRole);
  return [
    `SHIFT HANDOFF — ${inc.ref}: ${inc.title}`,
    `${SEVERITY_META[inc.severity]?.label ?? inc.severity} · ${PHASE_META[inc.phase]?.label ?? inc.phase} · ${INCIDENT_STATUS_META[inc.status]?.label ?? inc.status}`,
    `Commander: ${inc.commanderName || 'unassigned'} · ${formatDuration(nowMs - tsMs(inc.detectedAt))} since detection`,
    `Affected data: ${d.scope.length ? `${d.scope.length} assets (${scopeLine})` : 'none recorded'}`,
    `Open tasks (${open.length}): ${open.map((t) => `${t.title}${t.assigneeName ? ` [${t.assigneeName}]` : ''}`).join('; ') || 'none'}`,
    `Recent: ${recent.map((e) => e.text).join(' | ') || 'no events'}`,
    `Next step: ${next.title}`,
  ].join('\n');
}
