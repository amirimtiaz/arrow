'use client';

import type { ReactNode } from 'react';
import { OpsProvider } from '@/lib/ops/client';
import { CommsProvider } from '@/lib/ops/comms';
import { SettingsProvider } from '@/lib/settings';
import { ToastProvider } from '@/components/ui/toast';
import { JoinWorkspaceDialog } from './JoinWorkspaceDialog';
import { TopBar } from './TopBar';
import { TopBarSlotsProvider } from './TopBarSlots';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <OpsProvider>
        <SettingsProvider>
          <CommsProvider>
            <TopBarSlotsProvider>
              <div data-arrow-stage className="flex h-screen flex-col overflow-hidden bg-bg">
                <TopBar />
                <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
              </div>
              <JoinWorkspaceDialog />
            </TopBarSlotsProvider>
          </CommsProvider>
        </SettingsProvider>
      </OpsProvider>
    </ToastProvider>
  );
}
