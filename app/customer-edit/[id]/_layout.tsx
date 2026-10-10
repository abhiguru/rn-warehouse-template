/**
 * Customer Edit Layout
 *
 * Layout wrapper for the customer edit flow.
 * Loads existing customer data by ID.
 */

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useAppDispatch } from '@/store/hooks';
import { setMode, setCustomerId, setIsLoading } from '@/store/slices/customerFormSlice';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

const makeStyles = (t: ThemeTokens) => ({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.background.base,
  },
  loadingText: {
    ...typography.subhead,
    marginTop: space.md,
    color: t.text.secondary,
  },
});

export default function CustomerEditLayout() {
  const dispatch = useAppDispatch();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [isReady, setIsReady] = useState(false);
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  useEffect(() => {
    if (!id) {
      console.error('[CustomerEditLayout] No customer ID provided');
      router.replace('/customers');
      return;
    }

    // Set edit mode and customer ID
    dispatch(setMode('edit'));
    dispatch(setCustomerId(id));

    // Wait for next frame
    requestAnimationFrame(() => {
      setIsReady(true);
    });
  }, [id, dispatch]);

  // Show loading while initializing
  if (!isReady) {
    return (
      <View style={styles.loadingContainer} accessibilityRole="progressbar" accessibilityLabel={tr('customers.form.loadingLabel')}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>{tr('customers.form.loading')}</Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="step1" />
      <Stack.Screen name="step2" />
      <Stack.Screen name="step3" />
    </Stack>
  );
}
