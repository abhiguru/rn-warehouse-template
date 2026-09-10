import React, { useEffect, useRef } from 'react';
import { Stack, useLocalSearchParams, router, useNavigation } from 'expo-router';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import theme from '@/theme';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { usePermissions } from '@/hooks/usePermissions';
import {
  setInvoiceId,
  setIsLoading,
  loadInvoiceEditData,
  selectInvoiceFormId,
  resetForm,
} from '@/store/slices/invoiceFormSlice';
import { loadInvoiceData } from '@/features/invoice/services/invoiceFormService';
import { InvoiceHeaderData } from '@/types/invoice.types';
import { Alert } from 'react-native';

export default function InvoiceEditLayout() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invoiceId = useAppSelector(selectInvoiceFormId);
  const { is_loading: isLoading } = useAppSelector((state) => state.invoiceForm);
  const { canUpdate } = usePermissions();

  // Protect edit routes - redirect if user cannot update
  useEffect(() => {
    if (!canUpdate) {
      if (__DEV__) console.log('[InvoiceEditLayout] User lacks update permission, redirecting');
      router.replace('/(tabs)/invoices');
    }
  }, [canUpdate]);

  // Use refs to prevent race conditions
  const loadingIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  // Ensure parent navigation has no header
  useEffect(() => {
    navigation.getParent()?.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // Main loading effect - only depends on `id`
  useEffect(() => {
    const initializeEdit = async () => {
      if (!id) {
        Alert.alert('Error', 'No Invoice ID provided');
        router.back();
        return;
      }

      // Skip if we're already loading this exact invoice
      if (loadingIdRef.current === id) {
        if (__DEV__) console.log('[InvoiceEditLayout] Already loading this invoice, skipping:', id);
        return;
      }

      // Skip if this invoice is already loaded in Redux
      if (invoiceId === id && !isLoading) {
        if (__DEV__) console.log('[InvoiceEditLayout] Invoice already loaded:', id);
        return;
      }

      if (__DEV__) console.log('[InvoiceEditLayout] Initializing invoice edit for:', id);
      loadingIdRef.current = id;

      // Reset form state synchronously before async operation
      dispatch(resetForm());
      dispatch(setInvoiceId(id));
      dispatch(setIsLoading(true));

      try {
        const result = await loadInvoiceData(id);

        // Check if component unmounted or id changed during load
        if (!mountedRef.current || loadingIdRef.current !== id) {
          if (__DEV__) console.log('[InvoiceEditLayout] Load cancelled - id changed or unmounted');
          return;
        }

        if (__DEV__) console.log('[InvoiceEditLayout] Load result:', result.success ? 'SUCCESS' : 'FAILED');

        if (result.success && result.data) {
          dispatch(loadInvoiceEditData({
            invoiceId: id,
            header: result.data.header as InvoiceHeaderData,
            items: result.data.items,
            grId: result.data.header.gr_id || '',
          }));
        } else {
          Alert.alert('Error', result.message || 'Failed to load invoice data');
          router.back();
        }
      } catch (error) {
        if (mountedRef.current && loadingIdRef.current === id) {
          console.error('[InvoiceEditLayout] Failed to load invoice data:', error);
          Alert.alert('Error', 'Failed to load invoice data');
          router.back();
        }
      } finally {
        if (mountedRef.current && loadingIdRef.current === id) {
          dispatch(setIsLoading(false));
        }
      }
    };

    initializeEdit();
  }, [id]); // Only depend on id - refs handle the rest

  // Clean up on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadingIdRef.current = null;
      dispatch(resetForm());
    };
  }, []);

  // Don't render if no permission
  if (!canUpdate) {
    return null;
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading invoice data...</Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="step1" options={{ headerShown: false }} />
      <Stack.Screen name="step2" options={{ headerShown: false }} />
      <Stack.Screen name="step3" options={{ headerShown: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.gray[50],
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.gray[600],
  },
});
