/**
 * Orders Tab (Home Screen)
 *
 * Displays the list of customer orders using OrderFlashList.
 * Auth is handled by the parent (tabs)/_layout.tsx.
 */

import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React from 'react';
import { View } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import type { ThemeTokens } from '@/theme/tokens';
import { OrderFlashList } from '@/components/lists';

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
});

export default function OrdersTab() {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <OrderFlashList />
    </View>
  );
}
