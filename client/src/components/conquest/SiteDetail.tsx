'use client';

/** Right-hand panel for the selected site: photo, deal score, Nemotron memo, costs, contract, competitors, traffic, landlord. */
import clsx from 'clsx';
import { Footprints, MapPin, ScrollText, Store, Timer } from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatInt, formatUsd } from '@/lib/format';
import { COMPETITION_RADIUS_MI, competitorsNear, hourlyTraffic, landlordFor, peakHour, weekdayTraffic } from '@/lib/conquest/model';
import type { Market, Plan, Site } from '@/lib/conquest/types';
import { Badge, SectionLabel } from '@/components/ui/primitives';
import { CostProjection } from './CostProjection';
import { DealMemo } from './DealMemo';
import { DealScoreCard } from './DealScore';
import { LandlordCard, Stars } from './LandlordCard';
import type { SiteRow } from './SiteList';

export function SiteDetail({ market, row, orgId, orgName }: { market: Market; row: SiteRow; orgId: number | undefined; orgName: string }) {
  const { site, deal, projection } = row;
  return (
    <div>
      <div className="relative h-44 w-full overflow-hidden rounded-t-xl bg-panel-2">
        <Image src={site.photo} alt={`${site.name} listing photo`} fill sizes="440px" className="object-cover" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3 text-white">
          <p className="text-[15px] leading-tight font-bold">{site.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-white/80">
            <MapPin className="size-3" aria-hidden /> {site.address}
          </p>
        </div>
        <span className="absolute top-2.5 left-2.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white/90">
          Listed {site.listedDaysAgo} days ago
        </span>
      </div>

      <div className="space-y-5 p-4">
        <div>
          <div className="flex flex-wrap gap-1.5">
            <Badge>{site.neighborhood}</Badge>
            <Badge>{formatInt(site.sqft)} sf</Badge>
            <Badge>{site.zoning}</Badge>
          </div>
          <ul className="mt-2 space-y-0.5 text-[11.5px] text-muted">
            {site.highlights.map((h) => (
              <li key={h} className="flex gap-1.5">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-accent" />
                {h}
              </li>
            ))}
          </ul>
        </div>

        <section aria-label="AI evaluation" className="space-y-3">
          <DealScoreCard deal={deal} />
          <DealMemo market={market} site={site} orgId={orgId} orgName={orgName} />
        </section>

        <CostProjection market={market} site={site} projection={projection} />
        <ContractRates site={site} />
        <Competitors market={market} site={site} />
        <FootTraffic market={market} site={site} />
        <LandlordCard landlord={landlordFor(market, site)} site={site} plan={market.plan as Plan} />
      </div>
    </div>
  );
}

function ContractRates({ site }: { site: Site }) {
  const { lease, sqft, rentPsf } = site;
  const rows: [string, string, string?][] = [
    ['Lease term', `${lease.termYears} years`],
    ['Base rent', `$${rentPsf.toFixed(2)}/sf/yr`, `${formatUsd(rentPsf * sqft)}/yr`],
    ['Escalation', `${lease.escalationPct}% / yr`, 'Fixed annual bumps'],
    ['CAM / NNN', `$${lease.camPsf.toFixed(2)}/sf/yr`, `${formatUsd(lease.camPsf * sqft)}/yr`],
    ['TI allowance', `$${lease.tiPsf}/sf`, formatUsd(lease.tiPsf * sqft)],
    ['Deposit', `${lease.depositMonths} months`, formatUsd(((rentPsf * sqft) / 12) * lease.depositMonths)],
    ['Free rent', `${lease.freeRentMonths} months`, lease.freeRentMonths ? 'Base rent abated' : 'None offered'],
    ['Build-out est.', `$${lease.buildOutPsf}/sf`, formatUsd(lease.buildOutPsf * sqft)],
  ];
  return (
    <section aria-label="Contract rates">
      <SectionLabel icon={ScrollText}>Contract rates</SectionLabel>
      <dl className="mt-2 grid grid-cols-2 gap-1.5">
        {rows.map(([label, value, sub]) => (
          <div key={label} className="rounded-lg border border-line bg-panel px-2.5 py-1.5">
            <dt className="text-[10px] font-semibold text-muted">{label}</dt>
            <dd className="text-[12.5px] font-bold text-fg tabular-nums">{value}</dd>
            {sub && <dd className="text-[10px] text-faint">{sub}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

function Competitors({ market, site }: { market: Market; site: Site }) {
  const nearby = useMemo(() => competitorsNear(market, site), [market, site]);
  const within = nearby.filter((c) => c.distanceMi <= COMPETITION_RADIUS_MI).length;
  const shown = nearby.slice(0, 6);
  return (
    <section aria-label="Competitors nearby">
      <SectionLabel
        icon={Store}
        right={
          <span className={clsx('text-[10.5px] font-semibold', within >= 3 ? 'text-danger' : within >= 1 ? 'text-warning' : 'text-success')}>
            {within} within {COMPETITION_RADIUS_MI} mi
          </span>
        }
      >
        Competitors nearby
      </SectionLabel>
      <ul className="mt-2 divide-y divide-line/60 rounded-lg border border-line bg-panel">
        {shown.map((c) => {
          const close = c.distanceMi <= COMPETITION_RADIUS_MI;
          return (
            <li key={c.id} className="flex items-center gap-2 px-2.5 py-1.5">
              <span className={clsx('size-2 shrink-0 rotate-45 rounded-[1px]', close ? 'bg-violet' : 'bg-violet/40')} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-fg">{c.name}</span>
                <span className="block text-[10.5px] text-faint">{c.category}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className={clsx('block text-[11.5px] font-bold tabular-nums', close ? 'text-fg' : 'text-muted')}>
                  {c.distanceMi.toFixed(2)} mi
                </span>
                <span className="flex items-center justify-end gap-1 text-[10.5px] text-muted">
                  <Stars value={c.rating} size="size-2.5" />
                  {c.rating.toFixed(1)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-[10px] text-faint">Distances from coordinates (haversine). Simulated businesses.</p>
    </section>
  );
}

function FootTraffic({ market, site }: { market: Market; site: Site }) {
  const [mode, setMode] = useState<'hour' | 'weekday'>('hour');
  const data = useMemo(() => (mode === 'hour' ? hourlyTraffic(market, site) : weekdayTraffic(market, site)), [mode, market, site]);
  const peak = peakHour(market, site);
  const weekly = weekdayTraffic(market, site).reduce((s, d) => s + d.visitors, 0);

  return (
    <section aria-label="Foot traffic">
      <SectionLabel
        icon={Footprints}
        right={
          <div className="flex rounded-lg border border-line bg-panel p-0.5" role="group" aria-label="Traffic view">
            {(['hour', 'weekday'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={clsx('rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold', mode === m ? 'bg-accent-soft text-accent' : 'text-muted hover:text-fg')}
              >
                {m === 'hour' ? 'By hour' : 'By weekday'}
              </button>
            ))}
          </div>
        }
      >
        Foot traffic
      </SectionLabel>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <div className="rounded-lg border border-line bg-panel px-2 py-1.5">
          <p className="text-[10px] font-semibold text-muted">{market.trafficLabel}</p>
          <p className="text-[13px] font-extrabold text-fg tabular-nums">{formatInt(site.dailyTraffic)}</p>
        </div>
        <div className="rounded-lg border border-line bg-panel px-2 py-1.5">
          <p className="flex items-center gap-1 text-[10px] font-semibold text-muted">
            <Timer className="size-3" aria-hidden /> Peak hour
          </p>
          <p className="text-[13px] font-extrabold text-fg">{peak}</p>
        </div>
        <div className="rounded-lg border border-line bg-panel px-2 py-1.5">
          <p className="text-[10px] font-semibold text-muted">Per week</p>
          <p className="text-[13px] font-extrabold text-fg tabular-nums">{formatInt(weekly)}</p>
        </div>
      </div>
      <div className="mt-2 h-[120px] rounded-lg border border-line bg-panel p-1.5">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barCategoryGap={mode === 'hour' ? 1.5 : 6}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9.5, fill: 'var(--faint)' }}
              stroke="var(--line)"
              interval={mode === 'hour' ? 3 : 0}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 9.5, fill: 'var(--faint)' }} stroke="var(--line)" width={40} tickFormatter={(v: number) => formatInt(v)} />
            <Tooltip
              cursor={{ fill: 'var(--panel-hover)' }}
              contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--muted)' }}
              formatter={(v) => [formatInt(Number(v)), mode === 'hour' ? 'Visitors this hour' : 'Visitors that day']}
            />
            <Bar dataKey="visitors" fill="var(--accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[10px] text-faint">Simulated counts for a typical week.</p>
    </section>
  );
}
