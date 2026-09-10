import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { usePermissions } from '@/hooks/usePermissions';

export default function InvoiceFormLayout() {
  const { canCreate } = usePermissions();

  // Protect form routes - redirect if user cannot create
  useEffect(() => {
    if (!canCreate) {
      if (__DEV__) console.log('[InvoiceFormLayout] User lacks create permission, redirecting');
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
      }}
    >
      <Stack.Screen name="step1" />
      <Stack.Screen name="step2" />
      <Stack.Screen name="step3" />
    </Stack>
  );
}
