'use client';

/**
 * 5-year total cost of occupancy and a simulated break-even. All figures come from projectCosts(): base rent × sqft
 * compounded by the escalation, minus free rent, plus CAM/NNN, plus build-out, minus the TI allowance.
 */
import clsx from 'clsx';
import { CalendarCheck, CalendarX, Calculator } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatInt, formatUsd } from '@/lib/format';
import { PROJECTION_YEARS, type Projection } from '@/lib/conquest/model';
import type { Market, Site } from '@/lib/conquest/types';
import { SectionLabel } from '@/components/ui/primitives';

const COST_COLOR = 'var(--violet)';
const CONTRIBUTION_COLOR = 'var(--accent)';

export function CostProjection({ market, site, projection: p }: { market: Market; site: Site; projection: Projection }) {
  const breakEven = p.breakEvenMonth;
  const lines: { label: string; value: number; sign: 1 | -1; note?: string }[] = [
    {
      label: 'Base rent',
      value: p.baseRentTotal,
      sign: 1,
      note: `$${site.rentPsf.toFixed(2)}/sf, +${site.lease.escalationPct}%/yr`,
    },
    { label: 'Free rent', value: p.freeRentTotal, sign: -1, note: `${site.lease.freeRentMonths} mo` },
    { label: 'CAM / NNN', value: p.camTotal, sign: 1, note: `$${site.lease.camPsf.toFixed(2)}/sf/yr` },
    { label: 'Build-out', value: p.buildOut, sign: 1, note: `$${site.lease.buildOutPsf}/sf est.` },
    { label: 'TI allowance', value: p.tiAllowance, sign: -1, note: `$${site.lease.tiPsf}/sf` },
  ];

  return (
    <section aria-label="Cost projections">
      <SectionLabel icon={Calculator} right={<span className="text-[10.5px] text-faint">{PROJECTION_YEARS}-year horizon</span>}>
        Cost projections
      </SectionLabel>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Tile label="5-yr occupancy" value={formatUsd(p.total5y)} />
        <Tile label="Effective rent" value={`$${p.effectivePsf.toFixed(2)}`} sub="/sf/yr all-in" />
        <div
          className={clsx(
            'rounded-lg border border-line px-2 py-1.5',
            breakEven ? 'bg-success-soft' : 'bg-danger-soft'
          )}
        >
          <p className="text-[10px] font-semibold text-muted">Break-even</p>
          <p className={clsx('flex items-center gap-1 text-[13px] font-extrabold', breakEven ? 'text-success' : 'text-danger')}>
            {breakEven ? <CalendarCheck className="size-3.5" aria-hidden /> : <CalendarX className="size-3.5" aria-hidden />}
            {breakEven ? `Month ${breakEven}` : 'Beyond 5 yrs'}
          </p>
          <p className="text-[10px] text-faint">{breakEven ? `Year ${Math.ceil(breakEven / 12)} (simulated)` : 'Simulated revenue'}</p>
        </div>
      </div>

      <div className="mt-2.5 rounded-lg border border-line bg-panel p-2">
        <div className="flex items-center gap-3 px-1 text-[10.5px] text-muted">
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3 rounded-full" style={{ background: COST_COLOR }} /> Cumulative cost
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3 rounded-full" style={{ background: CONTRIBUTION_COLOR }} /> Cumulative contribution
          </span>
        </div>
        <div className="h-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={p.months} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="month"
                type="number"
                domain={[0, PROJECTION_YEARS * 12]}
                ticks={[0, 12, 24, 36, 48, 60]}
                tickFormatter={(m: number) => (m === 0 ? 'Sign' : `Y${m / 12}`)}
                tick={{ fontSize: 10, fill: 'var(--faint)' }}
                stroke="var(--line)"
              />
              <YAxis
                tickFormatter={(v: number) => formatUsd(v)}
                tick={{ fontSize: 10, fill: 'var(--faint)' }}
                stroke="var(--line)"
                width={48}
              />
              <Tooltip
                contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--muted)' }}
                labelFormatter={(m) => (Number(m) === 0 ? 'At signing' : `Month ${m}`)}
                formatter={(v, name) => [formatUsd(Number(v), false), name === 'cost' ? 'Cumulative cost' : 'Cumulative contribution']}
              />
              {breakEven && (
                <ReferenceLine
                  x={breakEven}
                  stroke="var(--success)"
                  strokeDasharray="4 4"
                  label={{ value: 'Break-even', position: 'insideTopLeft', fontSize: 10, fill: 'var(--success)' }}
                />
              )}
              <Line type="monotone" dataKey="cost" stroke={COST_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="contribution" stroke={CONTRIBUTION_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <table className="mt-2.5 w-full text-[11.5px]">
        <tbody>
          {lines.map((l) => (
            <tr key={l.label} className="border-b border-line/60">
              <td className="py-1 text-muted">
                {l.label} <span className="text-[10.5px] text-faint">· {l.note}</span>
              </td>
              <td className={clsx('py-1 text-right font-semibold tabular-nums', l.sign < 0 ? 'text-success' : 'text-fg')}>
                {l.sign < 0 ? '−' : '+'}
                {formatUsd(l.value, false)}
              </td>
            </tr>
          ))}
          <tr>
            <td className="pt-1.5 font-bold text-fg">Total cost of occupancy</td>
            <td className="pt-1.5 text-right font-extrabold text-fg tabular-nums">{formatUsd(p.total5y, false)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[10.5px] text-faint">
        Refundable deposit due at signing: {formatUsd(p.deposit, false)} ({site.lease.depositMonths} mo). CAM held flat.
      </p>
      <p className="mt-2 rounded-lg border border-dashed border-line px-2.5 py-2 text-[10.5px] leading-relaxed text-muted">
        <b className="text-fg">Simulated revenue assumption:</b> {formatInt(p.unitsPerDay)} {market.revenue.unit}/day →{' '}
        {formatUsd(p.annualRevenue)}/yr, {formatUsd(p.monthlyContribution)}/mo contribution at full ramp (6-month ramp from 55%). Needs{' '}
        {formatUsd(p.breakEvenRevenue)}/yr in sales to cover year-1 occupancy. {market.revenue.note}
      </p>
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-2 py-1.5">
      <p className="text-[10px] font-semibold text-muted">{label}</p>
      <p className="text-[13px] font-extrabold text-fg tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-faint">{sub}</p>}
    </div>
  );
}
