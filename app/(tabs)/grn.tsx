/**
 * GRN Tab
 *
 * Displays the list of Goods Receipt Notes using GRNListFiori, or Find goods over the phone copy (WH-300).
 * Auth is handled by the parent (tabs)/_layout.tsx.
 */

import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import GRNListFiori from '@/components/GRNListFiori';
import { FindGoodsScreen } from '@/features/find-goods/FindGoodsScreen';
import { GrnViewSwitch } from '@/features/find-goods/GrnViewSwitch';
import { useFindGoodsState } from '@/features/find-goods/findGoodsGate';
import { useFindGoodsSession } from '@/features/find-goods/findGoodsSession';
import { ListErrorBoundary } from '@/components/list/ListErrorBoundary';
import { HeldStrip } from '@/features/holding/HeldStrip';
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

  // The "GRN | Find goods" switch is there only while the phone copy can answer Find goods (WH-300); without it the
  // tab is the GRN list as ever.
  const gate = useFindGoodsState();
  const { view } = useFindGoodsSession();
  const offered = gate !== 'hidden';
  const switcher = offered ? <GrnViewSwitch view={view} /> : null;

  // A print-range link opens the list on that range of GRN numbers.
  const initialNumberRange = React.useMemo(
    () => (rangeStart || rangeEnd ? { from: rangeStart, to: rangeEnd } : undefined),
    [rangeStart, rangeEnd]
  );

  return (
    <View style={styles.container}>
      <HeldStrip />
      <ListErrorBoundary listName="GRN items">
        {offered && view === 'find-goods' ? (
          <FindGoodsScreen switcher={switcher} />
        ) : (
          <GRNListFiori initialNumberRange={initialNumberRange} subHeader={switcher} />
        )}
      </ListErrorBoundary>
    </View>
  );
}
