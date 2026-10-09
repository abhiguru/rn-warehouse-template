/**
 * Invoices Tab
 *
 * Displays the list of invoices using InvoiceFlashList, with a floating
 * create button for roles that can create (guide 14.1).
 * Auth is handled by the parent (tabs)/_layout.tsx.
 */

import React, { useCallback } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { InvoiceFlashList } from '@/components/lists';
import { ListErrorBoundary } from '@/components/list/ListErrorBoundary';
import { usePermissions } from '@/hooks/usePermissions';
import { useThemedStyles } from '@/hooks/useTheme';
import { Fab } from '@/components/ui/Fab';
import { useAppDispatch } from '@/store/hooks';
import { resetForm as resetInvoiceForm } from '@/store/slices/invoiceFormSlice';
import type { ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
});

export default function InvoicesTab() {
  const styles = useThemedStyles(makeStyles);
  const dispatch = useAppDispatch();
  const { canCreate } = usePermissions();

  const handleCreateInvoice = useCallback(() => {
    // Reset form state before creating a new invoice
    dispatch(resetInvoiceForm());
    router.push('/invoice-form/step1');
  }, [dispatch]);

  return (
    <View style={styles.container}>
      <ListErrorBoundary listName="invoices">
        <InvoiceFlashList />
      </ListErrorBoundary>
      {canCreate && (
        <Fab label="Create invoice" onPress={handleCreateInvoice} testID="create-invoice-fab" />
      )}
    </View>
  );
}
