/**
 * Dispatch Form Layout
 * Stack layout for dispatch form steps with proper animation handling
 * - Forward navigation (next step): slide in from right
 * - Backward navigation (previous step via router.back()): slide in from left
 */

import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { Platform } from 'react-native';
import { usePermissions } from '@/hooks/usePermissions';

export default function DispatchFormLayout() {
  const { canCreate } = usePermissions();

  // Protect form routes - redirect if user cannot create
  useEffect(() => {
    if (!canCreate) {
      if (__DEV__) console.log('[DispatchFormLayout] User lacks create permission, redirecting');
      router.replace('/(tabs)/dispatch');
    }
  }, [canCreate]);

  if (!canCreate) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
        gestureEnabled: false,
      }}
    />
  );
}
