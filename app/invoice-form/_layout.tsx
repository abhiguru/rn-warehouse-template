import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { usePermissions } from '@/hooks/usePermissions';

export default function InvoiceFormLayout() {
  const { canCreate } = usePermissions();

  // Protect form routes - redirect if user cannot create
  useEffect(() => {
    if (!canCreate) {
      router.replace('/(tabs)/invoices');
    }
  }, [canCreate]);

  if (!canCreate) {
    return null;
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
