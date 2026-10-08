/**
 * Customer Form Layout
 *
 * Layout wrapper for the customer creation flow.
 * Resets form state when entering the create flow.
 */

import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { useAppDispatch } from '@/store/hooks';
import { resetForm } from '@/store/slices/customerFormSlice';

export default function CustomerFormLayout() {
  const dispatch = useAppDispatch();
  const [isReady, setIsReady] = useState(false);

  // Reset form when entering create flow
  useEffect(() => {
    dispatch(resetForm());

    // Wait for next frame to ensure state is reset
    requestAnimationFrame(() => {
      setIsReady(true);
    });
  }, [dispatch]);

  // Don't render until form is reset
  if (!isReady) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="step1" />
      <Stack.Screen name="step2" />
      <Stack.Screen name="step3" />
    </Stack>
  );
}
