
import { router } from 'expo-router';

import { EmptyState } from '../src/components/ui/EmptyState';

export default function NotFoundScreen() {
  return (
    <EmptyState
      title="That page wandered off"
      message="Let's get you back to your money."
      actionLabel="Go home"
      onAction={() => router.replace('/')}
    />
  );
}