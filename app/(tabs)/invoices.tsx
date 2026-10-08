/**
 * Invoices Tab
 *
 * Displays the list of invoices using InvoiceFlashList.
 * Auth is handled by the parent (tabs)/_layout.tsx.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { InvoiceFlashList } from '@/components/lists';
import { ListErrorBoundary } from '@/components/list/ListErrorBoundary';
import { useTheme } from '@/hooks/useTheme';

export default function InvoicesTab() {
  const { colors: themeColors, isDarkMode } = useTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDarkMode ? themeColors.gray[900] : themeColors.gray[50] },
      ]}
    >
      <ListErrorBoundary listName="invoices">
        <InvoiceFlashList />
      </ListErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
