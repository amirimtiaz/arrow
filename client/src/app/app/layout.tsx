import type { Metadata } from 'next';
import { AppShell } from '@/components/shell/AppShell';

export const metadata: Metadata = {
  title: 'Arrow · Command Center',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
