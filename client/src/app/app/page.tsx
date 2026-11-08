import { Suspense } from 'react';
import { SilkRoadView } from '@/components/silk-road/SilkRoadView';

export default function SilkRoadPage() {
  return (
    <Suspense>
      <SilkRoadView />
    </Suspense>
  );
}
