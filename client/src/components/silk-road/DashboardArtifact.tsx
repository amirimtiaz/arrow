'use client';

/**
 * A dashboard Ask Arrow built: Nemotron chose the charts (build_dashboard tool), the worker computed every number from
 * live SpacetimeDB rows, and this renders them as real charts. Each chart downloads as a PNG image; the whole dataset
 * downloads as CSV, which opens directly in Excel, Google Sheets, Tableau and Power BI.
 */
import clsx from 'clsx';
import { Download, FileSpreadsheet, ImageDown, LayoutDashboard, Maximize2 } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Dialog } from '@/components/ui/primitives';

export interface DashboardChart {
  title: string;
  type: 'bar' | 'pie' | 'table';
  metric: string;
  group_by: string;
  rows: { label: string; value: number }[];
}
export interface DashboardData {
  title: string;
  generated_at: string;
  filter?: { route_status?: string[]; mode?: string[]; shipment_status?: string[] } | null;
  kpis: { label: string; value: number; format: 'number' | 'usd' | 'pct' }[];
  charts: DashboardChart[];
}

const PALETTE = ['#3b8bff', '#22c55e', '#f5a524', '#a78bfa', '#22d3ee', '#f472b6', '#f2555a', '#94a3b8', '#84cc16', '#fb923c', '#60a5fa', '#e879f9', '#cbd5e1'];
const STATUS_COLOR: Record<string, string> = {
  healthy: '#22c55e',
  'at risk': '#f5a524',
  disrupted: '#f2555a',
  rerouted: '#22d3ee',
  'in transit': '#3b8bff',
  delayed: '#f2555a',
  held: '#f5a524',
  critical: '#f2555a',
  high: '#f5a524',
  standard: '#3b8bff',
  low: '#94a3b8',
};
const TICK = { fill: '#94a3b8', fontSize: 11 };
const METRIC_LABEL: Record<string, string> = {
  shipments: 'Shipments',
  value_usd: 'Value (USD)',
  value_at_risk_usd: 'Value at risk (USD)',
  lanes: 'Lanes',
  units: 'Units',
};

const colorFor = (label: string, i: number) => STATUS_COLOR[label.toLowerCase()] ?? PALETTE[i % PALETTE.length];
const isUsd = (metric: string) => metric.includes('usd');

function short(value: number, metric: string): string {
  const abs = Math.abs(value);
  const s = abs >= 1e9 ? `${(value / 1e9).toFixed(1)}B` : abs >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : abs >= 1e4 ? `${(value / 1e3).toFixed(0)}K` : value.toLocaleString('en-US');
  return isUsd(metric) ? `$${s}` : s;
}
function full(value: number, format: string): string {
  if (format === 'usd') return `$${Math.round(value).toLocaleString('en-US')}`;
  if (format === 'pct') return `${value.toFixed(1)}%`;
  return value.toLocaleString('en-US');
}

export function parseDashboard(json: string): DashboardData | null {
  try {
    const d = JSON.parse(json) as DashboardData;
    return d && Array.isArray(d.charts) && Array.isArray(d.kpis) ? d : null;
  } catch {
    return null;
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'dashboard';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv(data: DashboardData) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [['section', 'chart', 'group_by', 'metric', 'label', 'value'].join(',')];
  for (const k of data.kpis) lines.push(['kpi', '', '', k.format, esc(k.label), k.value].join(','));
  for (const c of data.charts) for (const r of c.rows) lines.push(['chart', esc(c.title), c.group_by, c.metric, esc(r.label), r.value].join(','));
  download(new Blob([lines.join('\n')], { type: 'text/csv' }), `arrow-${slug(data.title)}.csv`);
}

/** Renders a chart's SVG (or a table) onto a canvas with its title and saves it as a PNG. */
async function exportPng(container: HTMLElement | null, chart: DashboardChart) {
  const root = getComputedStyle(document.documentElement);
  const bg = root.getPropertyValue('--panel').trim() || '#111827';
  const fg = root.getPropertyValue('--text').trim() || '#e7edf6';
  const svg = container?.querySelector('svg.recharts-surface') as SVGSVGElement | null;
  const scale = 2;
  const width = svg ? svg.clientWidth : 520;
  const bodyHeight = svg ? svg.clientHeight : 26 * (chart.rows.length + 1);
  const height = bodyHeight + 44;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = fg;
  ctx.font = '600 14px Inter, Arial, sans-serif';
  ctx.fillText(chart.title, 12, 24);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px Inter, Arial, sans-serif';
  ctx.fillText(`${METRIC_LABEL[chart.metric] ?? chart.metric} · Arrow (simulated data)`, 12, 38);

  if (svg) {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(bodyHeight));
    clone.setAttribute('style', 'font-family: Inter, Arial, sans-serif');
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render the chart image'));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
    });
    ctx.drawImage(img, 0, 44, width, bodyHeight);
  } else {
    ctx.font = '12px Inter, Arial, sans-serif';
    chart.rows.forEach((r, i) => {
      const y = 44 + 22 * (i + 1);
      ctx.fillStyle = fg;
      ctx.fillText(r.label, 12, y);
      ctx.textAlign = 'right';
      ctx.fillText(short(r.value, chart.metric), width - 12, y);
      ctx.textAlign = 'left';
    });
  }
  canvas.toBlob((blob) => blob && download(blob, `arrow-${slug(chart.title)}.png`), 'image/png');
}

function ChartBody({ chart, height }: { chart: DashboardChart; height: number }) {
  if (chart.type === 'table') {
    return (
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[10.5px] text-faint uppercase">
            <th className="py-1 font-semibold">{chart.group_by.replace(/_/g, ' ')}</th>
            <th className="py-1 text-right font-semibold">{METRIC_LABEL[chart.metric] ?? chart.metric}</th>
          </tr>
        </thead>
        <tbody>
          {chart.rows.map((r, i) => (
            <tr key={r.label} className="border-t border-line">
              <td className="flex items-center gap-1.5 py-1 text-fg">
                <span className="size-2 shrink-0 rounded-sm" style={{ background: colorFor(r.label, i) }} aria-hidden />
                <span className="truncate">{r.label}</span>
              </td>
              <td className="py-1 text-right font-semibold text-fg tabular-nums">{short(r.value, chart.metric)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (chart.type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={height} debounce={120}>
        <PieChart>
          <Pie
            data={chart.rows}
            dataKey="value"
            nameKey="label"
            innerRadius="48%"
            outerRadius="78%"
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {chart.rows.map((r, i) => (
              <Cell key={r.label} fill={colorFor(r.label, i)} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => short(Number(v), chart.metric)} />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }
  const labelWidth = Math.min(180, Math.max(60, ...chart.rows.map((r) => r.label.length * 6.4 + 8)));
  return (
    <ResponsiveContainer width="100%" height={Math.max(height, chart.rows.length * 24 + 30)} debounce={120}>
      <BarChart data={chart.rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke="#94a3b833" />
        <XAxis type="number" tick={TICK} tickFormatter={(v) => short(Number(v), chart.metric)} stroke="#94a3b855" />
        <YAxis type="category" dataKey="label" tick={TICK} width={labelWidth} stroke="#94a3b855" interval={0} />
        <Tooltip formatter={(v) => short(Number(v), chart.metric)} cursor={{ fill: '#94a3b822' }} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {chart.rows.map((r, i) => (
            <Cell key={r.label} fill={colorFor(r.label, i)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartCard({ chart, height }: { chart: DashboardChart; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <figure className="rounded-lg border border-line bg-panel-2 p-2.5">
      <figcaption className="mb-1.5 flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-bold text-fg">{chart.title}</span>
          <span className="block text-[10.5px] text-muted">{METRIC_LABEL[chart.metric] ?? chart.metric} by {chart.group_by.replace(/_/g, ' ')}</span>
        </span>
        <button
          type="button"
          onClick={() => void exportPng(ref.current, chart)}
          className="flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] font-semibold text-muted hover:bg-panel-hover hover:text-fg"
          title="Download this chart as a PNG image"
        >
          <ImageDown className="size-3" aria-hidden />
          PNG
        </button>
      </figcaption>
      <div ref={ref}>
        <ChartBody chart={chart} height={height} />
      </div>
    </figure>
  );
}

function DashboardBody({ data, wide }: { data: DashboardData; wide: boolean }) {
  return (
    <div className="space-y-2.5">
      <div className={clsx('grid gap-1.5', wide ? 'grid-cols-5' : 'grid-cols-2')}>
        {data.kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-line bg-panel-2 px-2 py-1.5">
            <p className="truncate text-[10px] text-muted">{k.label}</p>
            <p className="text-[14px] font-extrabold text-fg tabular-nums">{full(k.value, k.format)}</p>
          </div>
        ))}
      </div>
      <div className={clsx('grid gap-2.5', wide && 'grid-cols-2')}>
        {data.charts.map((c) => (
          <ChartCard key={c.title} chart={c} height={wide ? 260 : 190} />
        ))}
      </div>
    </div>
  );
}

/** Memoised: Ask Arrow re-renders whenever any agent step arrives, and a re-render must not redraw the charts. */
export const DashboardArtifact = memo(function DashboardArtifact({ data }: { data: DashboardData }) {
  const [expanded, setExpanded] = useState(false);
  const actions = (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => exportCsv(data)}
        className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-white hover:bg-accent-strong"
        title="CSV opens directly in Excel, Google Sheets, Tableau and Power BI"
      >
        <FileSpreadsheet className="size-3.5" aria-hidden />
        Download CSV (Excel · Sheets · Tableau · Power BI)
      </button>
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-muted hover:bg-panel-hover hover:text-fg"
        >
          <Maximize2 className="size-3.5" aria-hidden />
          Full view
        </button>
      )}
    </div>
  );

  return (
    <div className="mt-2 rounded-xl border border-accent/40 bg-panel p-2.5">
      <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-fg">
        <LayoutDashboard className="size-4 text-accent" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{data.title}</span>
      </p>
      <p className="mb-2 text-[10.5px] text-faint">
        Charts chosen by Nemotron · numbers computed by Arrow from live data · {new Date(data.generated_at).toLocaleTimeString()}
      </p>
      {data.filter && Object.values(data.filter).some((v) => v && v.length > 0) && (
        <p className="mb-2 flex flex-wrap gap-1 text-[10.5px]">
          <span className="text-muted">Filtered to</span>
          {Object.values(data.filter)
            .flatMap((v) => v ?? [])
            .map((v) => (
              <span key={v} className="rounded-md border border-accent/40 bg-accent-soft px-1.5 font-semibold text-accent">
                {v.replace(/_/g, ' ')}
              </span>
            ))}
        </p>
      )}
      <DashboardBody data={data} wide={false} />
      <div className="mt-2.5">{actions}</div>

      <Dialog open={expanded} onClose={() => setExpanded(false)} title={data.title} width="max-w-6xl">
        <div className="scroll-thin max-h-[78vh] overflow-y-auto pr-1">
          <DashboardBody data={data} wide />
          <div className="mt-3 flex items-center gap-2">
            {actions}
            <span className="flex items-center gap-1 text-[11px] text-faint">
              <Download className="size-3" aria-hidden />
              Each chart also downloads as a PNG.
            </span>
          </div>
        </div>
      </Dialog>
    </div>
  );
});
