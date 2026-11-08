'use client';

/**
 * Conquest GIS: market-expansion workspace. Left: candidate sites. Centre: a hand-drawn SVG city map with a foot-
 * traffic heatmap, competitors and the selected site's trade area. Right: the selected site's deal score, Nemotron
 * deal memo, cost projections, contract rates, competitors, foot traffic and landlord (with a message thread).
 * Listings are simulated; every number is computed in code (lib/conquest/model.ts).
 */
import { FlaskConical, Loader2, MapPinned } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCurrentOrg, useOps } from '@/lib/ops/client';
import { marketForPlan } from '@/lib/conquest/markets';
import { dealScore, projectCosts } from '@/lib/conquest/model';
import { TopBarActions, TopBarTitle } from '@/components/shell/TopBarSlots';
import { EmptyState } from '@/components/ui/primitives';
import { CityMap } from './CityMap';
import { SiteDetail } from './SiteDetail';
import { SiteList, type SiteRow } from './SiteList';

export function ConquestView() {
  const { ready, status } = useOps();
  const org = useCurrentOrg();
  const loading = !org && !ready && status !== 'error';

  if (loading) {
    return (
      <>
        <ConquestTitle subtitle="Loading your workspace…" />
        <div className="grid h-full place-items-center">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin text-accent" aria-hidden />
            Loading candidate markets…
          </p>
        </div>
      </>
    );
  }

  // Re-mount per tier so the selection and map view reset when the workspace changes.
  const plan = org?.plan ?? 'bronze';
  return <ConquestWorkspace key={plan} plan={plan} orgId={org?.id} orgName={org?.name ?? 'Maple & Main Kitchen'} />;
}

function ConquestTitle({ subtitle }: { subtitle: string }) {
  return (
    <>
      <TopBarTitle>
        <div className="min-w-0">
          <p className="text-[15px] leading-tight font-extrabold text-accent">Conquest GIS</p>
          <p className="truncate text-[11.5px] text-muted">{subtitle}</p>
        </div>
      </TopBarTitle>
      <TopBarActions>
        <span
          className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[11.5px] font-semibold whitespace-nowrap text-muted"
          title="Listings, landlords, reviews and competitors are simulated demo data"
        >
          <FlaskConical className="size-3.5 text-violet" aria-hidden />
          Simulated listings
        </span>
      </TopBarActions>
    </>
  );
}

function ConquestWorkspace({ plan, orgId, orgName }: { plan: string; orgId: number | undefined; orgName: string }) {
  const market = marketForPlan(plan);
  const rows: SiteRow[] = useMemo(
    () => market.sites.map((site) => ({ site, deal: dealScore(market, site), projection: projectCosts(market, site) })),
    [market]
  );
  const best = useMemo(() => [...rows].sort((a, b) => b.deal.score - a.deal.score)[0], [rows]);
  const [selectedId, setSelectedId] = useState<string>(best?.site.id ?? '');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const selected = rows.find((r) => r.site.id === selectedId) ?? null;

  return (
    <div className="flex h-full min-h-0 gap-3 p-3">
      <ConquestTitle subtitle={`${orgName} · ${market.useLabel} sites in ${market.city} · ${market.sites.length} candidates`} />
      <aside
        className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-elevated 2xl:w-[340px]"
        aria-label="Candidate sites"
      >
        <SiteList market={market} rows={rows} selectedId={selectedId} onSelect={setSelectedId} onHover={setHoverId} />
      </aside>
      <section className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-elevated" aria-label="Market map">
        <CityMap
          market={market}
          rows={rows}
          selectedId={selectedId}
          hoverId={hoverId}
          onSelect={setSelectedId}
          onHover={setHoverId}
        />
      </section>
      <aside
        className="scroll-thin w-[400px] shrink-0 overflow-y-auto rounded-xl border border-line bg-elevated 2xl:w-[440px]"
        aria-label="Selected site"
      >
        {selected ? (
          <SiteDetail key={selected.site.id} market={market} row={selected} orgId={orgId} orgName={orgName} />
        ) : (
          <EmptyState icon={MapPinned} title="Pick a site">
            Select a candidate on the map or in the list to see its costs, contract, competitors and landlord.
          </EmptyState>
        )}
      </aside>
    </div>
  );
}
