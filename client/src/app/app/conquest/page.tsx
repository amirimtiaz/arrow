import { Suspense } from 'react';
import { ConquestView } from '@/components/conquest/ConquestView';

export default function ConquestPage() {
  return (
    <Suspense>
      <ConquestView />
    </Suspense>
  );
}
