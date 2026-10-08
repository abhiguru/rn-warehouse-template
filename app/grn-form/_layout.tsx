import React, { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { useAppDispatch } from '@/store/hooks';
import { resetForm } from '@/store/slices/grnFormSlice';
import { usePermissions } from '@/hooks/usePermissions';

export default function GRNFormLayout() {
  const dispatch = useAppDispatch();
  const [isReady, setIsReady] = useState(false);
  const { canCreate } = usePermissions();

  // Protect form routes - redirect if user cannot create
  useEffect(() => {
    if (!canCreate) {
      if (__DEV__) console.log('[GRNFormLayout] User lacks create permission, redirecting');
      router.replace('/(tabs)/grn');
    }
  }, [canCreate]);

  // Reset form when entering create flow to clear any stale data from previous edit sessions
  // We set isReady after reset to ensure child components mount AFTER the reset completes
  useEffect(() => {
    if (!canCreate) return; // Don't reset if redirecting
    if (__DEV__) console.log('[GRNFormLayout] Resetting form state');
    dispatch(resetForm());
    // Small delay to ensure Redux state is updated before children mount
    requestAnimationFrame(() => {
      setIsReady(true);
      if (__DEV__) console.log('[GRNFormLayout] Form reset complete, ready for child components');
    });
  }, [dispatch, canCreate]);

  // Don't render children until reset is complete or if no permission
  if (!isReady || !canCreate) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="step1" />
      <Stack.Screen name="step2" />
      <Stack.Screen name="step3" />
    </Stack>
  );
}