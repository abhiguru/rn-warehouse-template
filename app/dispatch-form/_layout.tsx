/**
 * Dispatch Form Layout
 * Stack layout for dispatch form steps with proper animation handling
 * - Forward navigation (next step): slide in from right
 * - Backward navigation (previous step via router.back()): slide in from left
 *
 * It is registered as an open dispatch form while it is open. A new dispatch is not opened over another dispatch's
 * open form (an edit, or an earlier new dispatch): the visit is turned away and that form is left as it is.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Stack, router } from 'expo-router';
import { usePermissions } from '@/hooks/usePermissions';
import { useAppStore } from '@/store/hooks';
import {
  openDispatchFormBlocking,
  registerDispatchForm,
  type OpenDispatchForm,
} from '@/features/dispatch/utils/openDispatchForms';
import { showOpenDispatchFormRefusal } from '@/features/dispatch/utils/refuseOpenForm';

export default function DispatchFormLayout() {
  const { canCreate } = usePermissions();
  const store = useAppStore();

  // Asked once, before anything else touches the slice.
  const [blocker] = useState<OpenDispatchForm | null>(() => openDispatchFormBlocking());

  // Protect form routes - redirect if user cannot create
  useEffect(() => {
    if (!canCreate) {
      if (__DEV__) console.log('[DispatchFormLayout] User lacks create permission, redirecting');
      router.replace('/(tabs)/dispatch');
    }
  }, [canCreate]);

  // Blocked: say why and go back, leaving the form that is open as it is. Once, whatever mounts again.
  const turnedAway = useRef(false);
  useEffect(() => {
    if (!blocker || turnedAway.current) return;
    turnedAway.current = true;
    // The number of the dispatch that is open, from its own loaded form (the slice was not touched by this visit).
    showOpenDispatchFormRefusal(blocker, store.getState().dispatchForm.header.disp_no || undefined);
    router.back();
  }, []);

  // Open for as long as this layout is: no other dispatch form is opened over it.
  useEffect(() => {
    if (blocker) return;
    return registerDispatchForm({ kind: 'create' });
  }, []);

  if (!canCreate || blocker) {
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
