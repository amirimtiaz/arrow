'use client';

/**
 * Live connection to the arrow-ops database. Any employee can read it; the
 * selected workspace (org) scopes the heavy subscriptions so a browser only
 * streams the network it is looking at.
 */
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { DbConnection, tables } from '@/module_bindings/ops';
import { OPS_DB, SPACETIME_URI } from '@/lib/spacetime/config';
import { createLiveClient } from '@/lib/spacetime/live-client';

const opsClient = createLiveClient<DbConnection>({
  dbName: OPS_DB,
  uri: SPACETIME_URI,
  tokenKey: 'arrow-ops-token',
  builder: () => DbConnection.builder(),
  tables: [
    'org',
    'scenarioPreset',
    'userProfile',
    'opsState',
    'agentService',
    'node',
    'route',
    'shipment',
    'vendor',
    'disruption',
    'routeOption',
    'agentRun',
    'agentStep',
    'actionProposal',
    'feedItem',
    'riskSample',
    'telemetry',
    'securityEvent',
  ],
});

export const useOps = opsClient.useClient;
export const useOpsRows = opsClient.useRows;

const ORG_STORAGE_KEY = 'arrow-org';
export const DEFAULT_ORG_ID = 1;

interface OrgSelection {
  orgId: number;
  setOrgId(id: number): void;
}

const OrgContext = createContext<OrgSelection | null>(null);

/** The selected workspace lives in localStorage (per browser), read as an external store. */
const orgListeners = new Set<() => void>();
let memoryOrgId = DEFAULT_ORG_ID;

function readOrgId(): number {
  try {
    const saved = Number(localStorage.getItem(ORG_STORAGE_KEY));
    return saved >= 1 && saved <= 3 ? saved : memoryOrgId;
  } catch {
    return memoryOrgId;
  }
}

function subscribeOrg(listener: () => void) {
  orgListeners.add(listener);
  return () => orgListeners.delete(listener);
}

export function OpsProvider({ children }: { children: ReactNode }) {
  const orgId = useSyncExternalStore(subscribeOrg, readOrgId, () => DEFAULT_ORG_ID);

  const setOrgId = useCallback((id: number) => {
    memoryOrgId = id;
    try {
      localStorage.setItem(ORG_STORAGE_KEY, String(id));
    } catch {
      /* kept in memory only */
    }
    orgListeners.forEach((l) => l());
  }, []);

  const queries = useCallback(
    () => [
      tables.org,
      tables.scenarioPreset,
      tables.userProfile,
      tables.opsState,
      tables.agentService,
      tables.node.where((r) => r.orgId.eq(orgId)),
      tables.route.where((r) => r.orgId.eq(orgId)),
      tables.shipment.where((r) => r.orgId.eq(orgId)),
      tables.vendor.where((r) => r.orgId.eq(orgId)),
      tables.disruption.where((r) => r.orgId.eq(orgId)),
      tables.routeOption.where((r) => r.orgId.eq(orgId)),
      tables.agentRun.where((r) => r.orgId.eq(orgId)),
      tables.agentStep,
      tables.actionProposal.where((r) => r.orgId.eq(orgId)),
      tables.feedItem.where((r) => r.orgId.eq(orgId)),
      tables.riskSample.where((r) => r.orgId.eq(orgId)),
      tables.telemetry.where((r) => r.orgId.eq(orgId)),
      tables.securityEvent.where((r) => r.orgId.eq(orgId)),
    ],
    [orgId]
  );

  const selection = useMemo(() => ({ orgId, setOrgId }), [orgId, setOrgId]);
  return (
    <OrgContext.Provider value={selection}>
      <opsClient.Provider queries={queries}>{children}</opsClient.Provider>
    </OrgContext.Provider>
  );
}

export function useOrgSelection(): OrgSelection {
  const value = useContext(OrgContext);
  if (!value) throw new Error('useOrgSelection must be used inside OpsProvider');
  return value;
}

/** The selected org row (undefined until the subscription lands). */
export function useCurrentOrg() {
  const { orgId } = useOrgSelection();
  const orgs = useOpsRows('org');
  return useMemo(() => orgs.find((o) => o.id === orgId), [orgs, orgId]);
}

/** This browser's ops profile, if the user has joined a workspace. */
export function useMyProfile() {
  const { identityHex } = useOps();
  const profiles = useOpsRows('userProfile');
  return useMemo(() => (identityHex ? profiles.find((p) => p.identity.toHexString() === identityHex) : undefined), [profiles, identityHex]);
}
