import { Suspense } from 'react';
import { AgentsView } from '@/components/agents/AgentsView';

export default function AgentsPage() {
  return (
    <Suspense>
      <AgentsView />
    </Suspense>
  );
}
