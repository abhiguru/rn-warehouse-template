import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { usePermissions } from '@/hooks/usePermissions';

export default function GRNEditLayout() {
  const { canUpdate } = usePermissions();

  // Protect edit routes - redirect if user cannot update
  useEffect(() => {
    if (!canUpdate) {
      if (__DEV__) console.log('[GRNEditLayout] User lacks update permission, redirecting');
      router.replace('/(tabs)/grn');
    }
  }, [canUpdate]);

  if (!canUpdate) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="[id]"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}