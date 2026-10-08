/**
 * Dispatch Edit Form Layout
 * Stack layout for dispatch edit form steps with proper animation handling
 * - Forward navigation (next step): slide in from right
 * - Backward navigation (previous step via router.back()): slide in from left
 */

import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { Platform } from 'react-native';
import { usePermissions } from '@/hooks/usePermissions';

export default function DispatchEditLayout() {
  const { canUpdate } = usePermissions();

  // Protect edit routes - redirect if user cannot update
  useEffect(() => {
    if (!canUpdate) {
      if (__DEV__) console.log('[DispatchEditLayout] User lacks update permission, redirecting');
      router.replace('/(tabs)/dispatch');
    }
  }, [canUpdate]);

  if (!canUpdate) {
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
