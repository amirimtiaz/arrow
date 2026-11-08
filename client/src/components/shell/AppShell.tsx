'use client';

import type { ReactNode } from 'react';
import { OpsProvider } from '@/lib/ops/client';
import { ToastProvider } from '@/components/ui/toast';
import { JoinWorkspaceDialog } from './JoinWorkspaceDialog';
import { TopBar } from './TopBar';
import { TopBarSlotsProvider } from './TopBarSlots';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <OpsProvider>
        <TopBarSlotsProvider>
          <div className="flex h-screen flex-col overflow-hidden bg-bg">
            <TopBar />
            <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
          </div>
          <JoinWorkspaceDialog />
        </TopBarSlotsProvider>
      </OpsProvider>
    </ToastProvider>
  );
}
