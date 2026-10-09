/**
 * Invoices Tab
 *
 * Displays the list of invoices using InvoiceFlashList, with a floating
 * create button for roles that can create (guide 14.1).
 * Auth is handled by the parent (tabs)/_layout.tsx.
 */

import React, { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { InvoiceFlashList } from '@/components/lists';
import { ListErrorBoundary } from '@/components/list/ListErrorBoundary';
import { usePermissions } from '@/hooks/usePermissions';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { useAppDispatch } from '@/store/hooks';
import { resetForm as resetInvoiceForm } from '@/store/slices/invoiceFormSlice';
import { iconSize, layout, radius, type ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  // Floating create button (guide 14.1): brand.fill, shadow[3], 56 px,
  // bottom right above the tab bar.
  fab: {
    position: 'absolute' as const,
    right: layout.marginCompact,
    bottom: layout.marginCompact,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: t.brand.fill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    ...t.shadow[3],
  },
  fabPressed: {
    backgroundColor: t.brand.fillPressed,
  },
});

export default function InvoicesTab() {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
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
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          onPress={handleCreateInvoice}
          accessibilityRole="button"
          accessibilityLabel="Create invoice"
          testID="create-invoice-fab"
        >
          <Icon name="plus" size={iconSize.lg} color={t.brand.onFill} />
        </Pressable>
      )}
    </View>
  );
}
