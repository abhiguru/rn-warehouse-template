import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, useLocalSearchParams, router, useNavigation, type Href } from 'expo-router';
import { View, Text, ActivityIndicator } from 'react-native';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { usePermissions } from '@/hooks/usePermissions';
import {
  setInvoiceId,
  loadInvoiceEditData,
  selectInvoiceFormId,
  selectInvoiceFormBaseline,
  resetForm,
} from '@/store/slices/invoiceFormSlice';
import { loadInvoiceData } from '@/features/invoice/services/invoiceFormService';
import { InvoiceHeaderData } from '@/types/invoice.types';
import { ErrorStateView } from '@/components/ErrorBoundary';

import { t as tr } from '@/i18n';
import { serverText } from '@/utils/serverText';
import { createLogger } from '@/utils/logger';

const log = createLogger('InvoiceEditLayout');

type Phase = 'loading' | 'ready' | 'error';

// How many edit layouts are open. The form lives in one slice, so a second edit of the same invoice (opened
// from the GRN's invoice list on top of the first) shares the first one's form. The one that closes first must
// not empty it: the form is reset only when the last layout closes.
let openLayouts = 0;

export default function InvoiceEditLayout() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invoiceId = useAppSelector(selectInvoiceFormId);
  const baseline = useAppSelector(selectInvoiceFormBaseline);
  const { canUpdate } = usePermissions();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Starts in loading, so the form is never drawn empty before the invoice is there. An invoice
  // that is already loaded in the store (the layout opened again on it) is ready at once.
  const [phase, setPhase] = useState<Phase>(() => (id && invoiceId === id && baseline ? 'ready' : 'loading'));
  const [errorMessage, setErrorMessage] = useState('');

  // Protect edit routes - redirect if user cannot update
  useEffect(() => {
    if (!canUpdate) {
      router.replace('/(tabs)/invoices');
    }
  }, [canUpdate]);

  // The latest load; an answer is used only while its load is the latest and the layout is open.
  const loadRequest = useRef(0);

  // Ensure parent navigation has no header
  useEffect(() => {
    navigation.getParent()?.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const load = useCallback(async () => {
    if (!id) {
      setErrorMessage(tr('invoice.edit.openFailedMessage'));
      setPhase('error');
      return;
    }
    const request = ++loadRequest.current;
    setPhase('loading');

    // Reset form state synchronously before async operation
    dispatch(resetForm());
    dispatch(setInvoiceId(id));

    try {
      const result = await loadInvoiceData(id);
      if (request !== loadRequest.current) return;

      if (result.success && result.data) {
        dispatch(loadInvoiceEditData({
          invoiceId: id,
          header: result.data.header as InvoiceHeaderData,
          items: result.data.items,
          grId: result.data.header.gr_id || '',
        }));
        setPhase('ready');
      } else {
        setErrorMessage(serverText(result.message, tr('common.checkConnection')));
        setPhase('error');
      }
    } catch (error) {
      if (request !== loadRequest.current) return;
      log.error('Failed to load invoice data:', error);
      setErrorMessage(tr('common.checkConnection'));
      setPhase('error');
    }
  }, [id, dispatch]);

  // Main loading effect - only depends on `id`
  useEffect(() => {
    if (id && invoiceId === id && baseline) return; // already loaded
    void load();
  }, [id]);

  // Clean up on unmount: the last layout to close empties the form
  useEffect(() => {
    openLayouts += 1;
    return () => {
      openLayouts -= 1;
      loadRequest.current += 1;
      if (openLayouts === 0) dispatch(resetForm());
    };
  }, [dispatch]);

  // Don't render if no permission
  if (!canUpdate) {
    return null;
  }

  if (phase === 'loading') {
    return (
      <View style={styles.loadingContainer} accessibilityRole="progressbar" accessibilityLabel={tr('invoice.label.loadingInvoiceA11y')}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>{tr('invoice.label.loadingInvoice')}</Text>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <ErrorStateView
        title={tr('invoice.edit.openFailedTitle')}
        message={errorMessage}
        onRetry={id ? () => { void load(); } : undefined}
        secondaryActionLabel={tr('common.close')}
        onSecondaryAction={() => router.dismissTo((id ? `/invoice-details/${id}` : '/(tabs)/invoices') as Href)}
      />
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // The steps are left by their own Back and Cancel, which ask first and keep the form in step.
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="step1" />
      <Stack.Screen name="step2" />
      <Stack.Screen name="step3" />
    </Stack>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.background.base,
  },
  loadingText: {
    ...typography.body,
    marginTop: space.lg,
    color: t.text.secondary,
  },
});
