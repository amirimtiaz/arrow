'use client';

/** Derived, memoised views over the live ops tables. */
import { useMemo } from 'react';
import type { ActionProposal, AgentRun, AgentStep, Disruption, Node, Route, RouteOption, Shipment } from '@/module_bindings/ops/types';
import { tsToMs } from '@/lib/format';
import { useOpsRows, useOrgSelection } from './client';

export interface Network {
  nodes: Node[];
  routes: Route[];
  shipments: Shipment[];
  nodesById: Map<number, Node>;
  routesById: Map<number, Route>;
  shipmentsByRoute: Map<number, Shipment[]>;
}

export function useNetwork(): Network {
  const { orgId } = useOrgSelection();
  const allNodes = useOpsRows('node');
  const allRoutes = useOpsRows('route');
  const allShipments = useOpsRows('shipment');

  return useMemo(() => {
    const nodes = allNodes.filter((n) => n.orgId === orgId);
    const routes = allRoutes.filter((r) => r.orgId === orgId);
    const shipments = allShipments.filter((s) => s.orgId === orgId);
    const shipmentsByRoute = new Map<number, Shipment[]>();
    for (const s of shipments) {
      const list = shipmentsByRoute.get(s.routeId) ?? [];
      list.push(s);
      shipmentsByRoute.set(s.routeId, list);
    }
    return {
      nodes,
      routes,
      shipments,
      nodesById: new Map(nodes.map((n) => [n.id, n])),
      routesById: new Map(routes.map((r) => [r.id, r])),
      shipmentsByRoute,
    };
  }, [allNodes, allRoutes, allShipments, orgId]);
}

export function useDisruptions(): { active: Disruption[]; all: Disruption[] } {
  const { orgId } = useOrgSelection();
  const rows = useOpsRows('disruption');
  return useMemo(() => {
    const all = rows.filter((d) => d.orgId === orgId).sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));
    return { all, active: all.filter((d) => d.status !== 'resolved') };
  }, [rows, orgId]);
}

export function useRiskSeries() {
  const { orgId } = useOrgSelection();
  const rows = useOpsRows('riskSample');
  return useMemo(() => rows.filter((r) => r.orgId === orgId).sort((a, b) => tsToMs(a.ts) - tsToMs(b.ts)), [rows, orgId]);
}

export interface Kpis {
  onTimePct: number;
  inTransit: number;
  valueInTransitUsd: number;
  valueAtRiskUsd: number;
  openDisruptions: number;
  cyberAlerts: number;
  riskIndex: number;
}

export function useKpis(): Kpis {
  const network = useNetwork();
  const { active } = useDisruptions();
  const series = useRiskSeries();
  return useMemo(() => {
    let total = 0;
    let late = 0;
    let atRisk = 0;
    for (const s of network.shipments) {
      const route = network.routesById.get(s.routeId);
      total += s.valueUsd;
      const isLate = s.status === 'delayed' || s.status === 'held';
      if (isLate) late += s.valueUsd;
      if (isLate || route?.status === 'at_risk') atRisk += s.valueUsd;
    }
    return {
      onTimePct: total > 0 ? 100 * (1 - late / total) : 100,
      inTransit: network.shipments.length,
      valueInTransitUsd: total,
      valueAtRiskUsd: atRisk,
      openDisruptions: active.length,
      cyberAlerts: active.filter((d) => d.kind === 'cyber').length,
      riskIndex: series.at(-1)?.riskIndex ?? 0,
    };
  }, [network, active, series]);
}

/** The event-triggered agent run handling a disruption, if any. */
export function useRunForDisruption(disruptionId: bigint | undefined): AgentRun | undefined {
  const runs = useOpsRows('agentRun');
  return useMemo(
    () => (disruptionId === undefined ? undefined : runs.find((r) => r.disruptionId === disruptionId && r.trigger === 'event')),
    [runs, disruptionId]
  );
}

export function useRunSteps(runId: bigint | undefined): AgentStep[] {
  const steps = useOpsRows('agentStep');
  return useMemo(() => (runId === undefined ? [] : steps.filter((s) => s.runId === runId).sort((a, b) => a.seq - b.seq)), [steps, runId]);
}

export function useOptions(disruptionId: bigint | undefined): RouteOption[] {
  const options = useOpsRows('routeOption');
  return useMemo(
    () => (disruptionId === undefined ? [] : options.filter((o) => o.disruptionId === disruptionId).sort((a, b) => a.rank - b.rank)),
    [options, disruptionId]
  );
}

export function useProposals(runId: bigint | undefined): ActionProposal[] {
  const proposals = useOpsRows('actionProposal');
  return useMemo(
    () => (runId === undefined ? [] : proposals.filter((p) => p.runId === runId).sort((a, b) => tsToMs(a.createdAt) - tsToMs(b.createdAt))),
    [proposals, runId]
  );
}

export function useAskRuns(): AgentRun[] {
  const { orgId } = useOrgSelection();
  const runs = useOpsRows('agentRun');
  return useMemo(
    () => runs.filter((r) => r.orgId === orgId && r.trigger === 'ask').sort((a, b) => tsToMs(a.startedAt) - tsToMs(b.startedAt)),
    [runs, orgId]
  );
}

export function useScenarioPresets() {
  const { orgId } = useOrgSelection();
  const presets = useOpsRows('scenarioPreset');
  return useMemo(() => presets.filter((p) => p.orgId === orgId).sort((a, b) => a.sortOrder - b.sortOrder), [presets, orgId]);
}

export function useFeed() {
  const { orgId } = useOrgSelection();
  const rows = useOpsRows('feedItem');
  return useMemo(() => rows.filter((f) => f.orgId === orgId).sort((a, b) => tsToMs(b.ts) - tsToMs(a.ts)), [rows, orgId]);
}

/** Grok News Scout signals for the workspace, newest first. */
export function useNewsSignals() {
  const { orgId } = useOrgSelection();
  const rows = useOpsRows('newsSignal');
  return useMemo(() => rows.filter((s) => s.orgId === orgId).sort((a, b) => tsToMs(b.ts) - tsToMs(a.ts)), [rows, orgId]);
}

/** The most recent Grok News Scout scan for the workspace. */
export function useLatestNewsScan() {
  const { orgId } = useOrgSelection();
  const rows = useOpsRows('newsScan');
  return useMemo(() => rows.filter((s) => s.orgId === orgId).sort((a, b) => tsToMs(b.startedAt) - tsToMs(a.startedAt))[0], [rows, orgId]);
}

/** Points for a route as {lat,lng}; air routes are drawn as arcs elsewhere. */
export function routePoints(route: Route) {
  return route.waypoints.map((p) => ({ lat: p.lat, lng: p.lng }));
}
