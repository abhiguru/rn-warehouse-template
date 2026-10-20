/**
 * Invoices Tab
 *
 * Displays the list of invoices using InvoiceFlashList, with a floating
 * create button for roles that can create (guide 14.1).
 * Auth is handled by the parent (tabs)/_layout.tsx.
 */

import React, { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { InvoiceFlashList } from '@/components/lists';
import { ListErrorBoundary } from '@/components/list/ListErrorBoundary';
import { usePermissions } from '@/hooks/usePermissions';
import { useThemedStyles } from '@/hooks/useTheme';
import { Fab } from '@/components/ui/Fab';
import { t } from '@/i18n';
import { useAppDispatch } from '@/store/hooks';
import { resetForm as resetInvoiceForm } from '@/store/slices/invoiceFormSlice';
import { openFormBlocking } from '@/features/invoice/utils/openInvoiceForms';
import { showOpenFormRefusal } from '@/features/invoice/utils/refuseOpenForm';
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

  // Set by the first tap on "Create invoice" until this tab is in front again:
  // a second tap opened a second step 1 and reset the form the first one had
  // started (its suggested number was lost).
  const isOpening = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isOpening.current = false;
    }, [])
  );

  const handleCreateInvoice = useCallback(() => {
    if (isOpening.current) return;
    // Another invoice form is open (maybe hidden under other screens): say so before anything is reset. Emptying the
    // form first would leave the open one without its data, and the refusal could never be got past (J1).
    const blocker = openFormBlocking({ kind: 'create' });
    if (blocker) {
      showOpenFormRefusal(blocker);
      return;
    }
    isOpening.current = true;
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
        <Fab label={t('lists.invoice.create')} onPress={handleCreateInvoice} testID="create-invoice-fab" />
      )}
    </View>
  );
}
