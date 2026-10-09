/**
 * Dispatch Tab
 *
 * Displays the list of dispatches using DispatchFlashList.
 * Auth is handled by the parent (tabs)/_layout.tsx.
 *
 * Features:
 * - FlashList for optimal scroll performance
 * - Memoized list items prevent unnecessary re-renders
 * - Stable callbacks for better performance
 */

import React from 'react';
import { View } from 'react-native';
import { DispatchFlashList } from '@/components/lists';
import { ListErrorBoundary } from '@/components/list/ListErrorBoundary';
import { useThemedStyles } from '@/hooks/useTheme';
import type { ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
});

export default function DispatchTab() {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <ListErrorBoundary listName="dispatches">
        <DispatchFlashList />
      </ListErrorBoundary>
    </View>
  );
}
