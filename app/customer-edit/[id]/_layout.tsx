/**
 * Customer Edit Layout
 *
 * Layout wrapper for the customer edit flow.
 * Loads existing customer data by ID.
 */

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useAppDispatch } from '@/store/hooks';
import { setMode, setCustomerId, setIsLoading } from '@/store/slices/customerFormSlice';
import theme from '@/theme';

export default function CustomerEditLayout() {
  const dispatch = useAppDispatch();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [isReady, setIsReady] = useState(false);

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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary[500]} />
        <Text style={styles.loadingText}>Loading customer...</Text>
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

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.gray[50],
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: theme.colors.gray[600],
  },
});
