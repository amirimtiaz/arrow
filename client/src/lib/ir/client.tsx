'use client';

/**
 * Live connection to the ISOLATED arrow-ir database (Control Tower).
 *
 * Separate connection, separate identity token (`arrow-ir-token`) and no
 * shared credentials with arrow-ops. The client subscribes only to the
 * member-gated views; the server returns rows only to active members, so a
 * non-member (or a revoked member) receives no incident data at all.
 */
import { useMemo, type ReactNode } from 'react';
import { DbConnection, tables } from '@/module_bindings/ir';
import { IR_DB, IR_URI } from '@/lib/spacetime/config';
import { createLiveClient } from '@/lib/spacetime/live-client';

const irClient = createLiveClient<DbConnection>({
  dbName: IR_DB,
  uri: IR_URI,
  // Keyed by server + database: an identity is only valid on the server that issued it.
  tokenKey: `arrow-ir-token@${IR_URI}/${IR_DB}`,
  builder: () => DbConnection.builder(),
  tables: ['myAccess', 'irStatus', 'irMembers', 'irInvites', 'irIncidents', 'irTimeline', 'irScope', 'irTasks', 'irMessages', 'irAudit'],
});

export const useIr = irClient.useClient;
export const useIrRows = irClient.useRows;

const queries = () => [
  tables.myAccess,
  tables.irStatus,
  tables.irMembers,
  tables.irInvites,
  tables.irIncidents,
  tables.irTimeline,
  tables.irScope,
  tables.irTasks,
  tables.irMessages,
  tables.irAudit,
];

export function IrProvider({ children }: { children: ReactNode }) {
  return <irClient.Provider queries={queries}>{children}</irClient.Provider>;
}

/** The caller's own access state (the only IR view a non-member can read). */
export function useMyAccess() {
  const rows = useIrRows('myAccess');
  return rows[0];
}

/** Server-side settings visible to members (lockdown, audit head). */
export function useIrStatus() {
  const rows = useIrRows('irStatus');
  return rows[0];
}

export function useMe() {
  const access = useMyAccess();
  const members = useIrRows('irMembers');
  return useMemo(() => (access ? members.find((m) => m.identity.toHexString() === access.identityHex) : undefined), [access, members]);
}
