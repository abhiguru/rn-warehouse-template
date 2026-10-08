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
import { View, StyleSheet } from 'react-native';
import { DispatchFlashList } from '@/components/lists';
import { ListErrorBoundary } from '@/components/list/ListErrorBoundary';
import { useTheme } from '@/hooks/useTheme';

export default function DispatchTab() {
  const { colors: themeColors, isDarkMode } = useTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDarkMode ? themeColors.gray[900] : themeColors.gray[50] },
      ]}
    >
      <ListErrorBoundary listName="dispatches">
        <DispatchFlashList />
      </ListErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
