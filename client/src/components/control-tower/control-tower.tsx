'use client';

/**
 * Cyber Control Tower entry point. Opens its own connection to the isolated
 * arrow-ir database and gates everything on the server-reported access state:
 * connecting → unreachable → access screen → member workspace.
 */
import { IrProvider, useIr, useMe, useMyAccess } from '@/lib/ir/client';
import { AccessScreen, ConnectingScreen, UnreachableScreen } from './access-screen';
import { Workspace } from './workspace';

function Gate() {
  const { ready, status, error, retry } = useIr();
  const access = useMyAccess();
  const me = useMe();

  if (!ready) {
    return status === 'error' ? <UnreachableScreen error={error} onRetry={retry} /> : <ConnectingScreen />;
  }
  if (!access) return <ConnectingScreen />;
  if (access.status !== 'active') return <AccessScreen />;
  // The member row arrives with the same transaction; keep a loading state just in case.
  if (!me) return <ConnectingScreen />;
  return <Workspace me={me} />;
}

export function ControlTower() {
  return (
    <IrProvider>
      <Gate />
    </IrProvider>
  );
}
