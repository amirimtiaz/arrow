import type { Metadata } from 'next';
import { ControlTower } from '@/components/control-tower/control-tower';

export const metadata: Metadata = {
  title: 'Control Tower · Arrow',
  description: 'Isolated cyber incident response command center.',
};

export default function ControlTowerPage() {
  return (
    <div className="h-full min-h-0">
      <ControlTower />
    </div>
  );
}
