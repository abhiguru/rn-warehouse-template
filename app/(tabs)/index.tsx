/**
 * Orders Tab (Home Screen)
 *
 * Displays the list of customer orders using OrderFlashList.
 * Auth is handled by the parent (tabs)/_layout.tsx.
 */

import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React from 'react';
import { View, StyleSheet } from 'react-native';
import theme from '@/theme';
import { useTheme } from '@/hooks/useTheme';
import { OrderFlashList } from '@/components/lists';

export default function OrdersTab() {
  const { colors: themeColors, isDarkMode } = useTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDarkMode ? themeColors.gray[900] : themeColors.gray[50] },
      ]}
    >
      <OrderFlashList />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.base,
  },
});
