/**
 * GRN Tab
 *
 * Displays the list of Goods Receipt Notes using GRNListFiori.
 * Auth is handled by the parent (tabs)/_layout.tsx.
 */

import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import GRNListFiori from '@/components/GRNListFiori';
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

  // A print-range link opens the list on that range of GRN numbers.
  const initialNumberRange = React.useMemo(
    () => (rangeStart || rangeEnd ? { from: rangeStart, to: rangeEnd } : undefined),
    [rangeStart, rangeEnd]
  );

  return (
    <View style={styles.container}>
      <ListErrorBoundary listName="GRN items">
        <GRNListFiori initialNumberRange={initialNumberRange} />
      </ListErrorBoundary>
    </View>
  );
}
