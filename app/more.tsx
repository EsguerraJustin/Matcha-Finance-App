/**
 * Modal route for settings, budgets, allowance, recurring, goals, category
 * management, backup and recently-deleted. Phase 2 onwards fills these in.
 */

import { Stack } from 'expo-router';

import { ScreenScaffold } from '../src/components/ui/ScreenScaffold';
import { EmptyState } from '../src/components/ui/EmptyState';
import { colors } from '../theme/colors';

export default function MoreScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'More', headerTintColor: colors.matcha900 }} />
      <ScreenScaffold title="More">
        <EmptyState
          title="Everything lives here"
          message="Allowance, budgets, categories, savings goals, backup and app lock."
        />
      </ScreenScaffold>
    </>
  );
}