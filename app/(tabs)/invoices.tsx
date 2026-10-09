/**
 * Invoices Tab
 *
 * Displays the list of invoices using InvoiceFlashList.
 * Auth is handled by the parent (tabs)/_layout.tsx.
 */

import React from 'react';
import { View } from 'react-native';
import { InvoiceFlashList } from '@/components/lists';
import { ListErrorBoundary } from '@/components/list/ListErrorBoundary';
import { useThemedStyles } from '@/hooks/useTheme';
import type { ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
});

export default function InvoicesTab() {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <ListErrorBoundary listName="invoices">
        <InvoiceFlashList />
      </ListErrorBoundary>
    </View>
  );
}
