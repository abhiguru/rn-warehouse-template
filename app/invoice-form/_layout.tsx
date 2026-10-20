import React, { useEffect, useRef, useState } from 'react';
import { Stack, router } from 'expo-router';
import { usePermissions } from '@/hooks/usePermissions';
import { useAppStore } from '@/store/hooks';
import {
  openFormBlocking,
  registerInvoiceForm,
  type OpenInvoiceForm,
} from '@/features/invoice/utils/openInvoiceForms';
import { showOpenFormRefusal } from '@/features/invoice/utils/refuseOpenForm';

export default function InvoiceFormLayout() {
  const { canCreate } = usePermissions();
  const store = useAppStore();

  // J1: the invoice form lives in one slice. A new invoice is not opened over another invoice's open form: it
  // would share (and empty) that form. Asked once, before anything else touches the slice.
  const [blocker] = useState<OpenInvoiceForm | null>(() => openFormBlocking({ kind: 'create' }));

  // Protect form routes - redirect if user cannot create
  useEffect(() => {
    if (!canCreate) {
      router.replace('/(tabs)/invoices');
    }
  }, [canCreate]);

  // Blocked: say why and go back, leaving the form that is open as it is. Once, whatever mounts again.
  const turnedAway = useRef(false);
  useEffect(() => {
    if (!blocker || turnedAway.current) return;
    turnedAway.current = true;
    // The number of the invoice that is open, from its own loaded form (the slice was not touched by this visit).
    const open = store.getState().invoiceForm;
    showOpenFormRefusal(blocker, open.baseline?.inv_no || open.header.inv_no || undefined);
    router.back();
  }, []);

  // Open for as long as this layout is: an edit of an invoice is not opened over it.
  useEffect(() => {
    if (blocker) return;
    return registerInvoiceForm({ kind: 'create' });
  }, []);

  if (!canCreate || blocker) {
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
