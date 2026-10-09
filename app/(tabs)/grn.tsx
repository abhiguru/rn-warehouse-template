/**
 * GRN Tab
 *
 * Displays the list of Goods Receipt Notes using GRNListFiori.
 * Auth is handled by the parent (tabs)/_layout.tsx.
 */

import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import GRNListFiori from '@/components/GRNListFiori';
import { GRNItem } from '@/services/grn-service';
import { ListErrorBoundary } from '@/components/list/ListErrorBoundary';
import { useThemedStyles } from '@/hooks/useTheme';
import type { ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
});

export default function GRNTab() {
  const styles = useThemedStyles(makeStyles);
  const { rangeStart, rangeEnd } = useLocalSearchParams<{
    rangeStart?: string;
    rangeEnd?: string;
  }>();

  // Build initial filters from URL params
  const initialFilters = React.useMemo(() => {
    if (rangeStart || rangeEnd) {
      return {
        grNoFrom: rangeStart
          ? [
              {
                id: rangeStart,
                label: rangeStart,
                type: 'grn' as const,
              },
            ]
          : undefined,
        grNoTo: rangeEnd
          ? [
              {
                id: rangeEnd,
                label: rangeEnd,
                type: 'grn' as const,
              },
            ]
          : undefined,
      };
    }
    return undefined;
  }, [rangeStart, rangeEnd]);

  const handleItemPress = (item: GRNItem) => {
    if (__DEV__) console.log('[GRNTab] Item pressed:', item);
    // Use grn_id if available, fallback to id
    router.push(`/grn-details/${item.grn_id || item.id}`);
  };

  return (
    <View style={styles.container}>
      <ListErrorBoundary listName="GRN items">
        <GRNListFiori
          onItemPress={handleItemPress}
          initialFilters={initialFilters}
          clearFiltersOnMount={!!initialFilters}
        />
      </ListErrorBoundary>
    </View>
  );
}
