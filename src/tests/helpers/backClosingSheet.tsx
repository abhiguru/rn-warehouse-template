/**
 * Stand-ins for the bottom sheets in screen tests. They draw nothing, but
 * while "open" they listen for the Android Back key exactly as the real
 * sheets do: the listener is added when the sheet opens and removed when it
 * closes (SearchableBottomSheet on `isVisible`, CustomerSearchBottomSheet on
 * its open state). A screen test can so tell whether Back reaches the open
 * sheet or the screen under it.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { BackHandler } from 'react-native';

/** Names of the sheets that took a Back press, in order. Emptied by `resetSheetBack`. */
export const sheetBackPresses: string[] = [];

export function resetSheetBack(): void {
  sheetBackPresses.length = 0;
}

function useBackWhileOpen(name: string, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      sheetBackPresses.push(name);
      close();
      return true;
    });
    return () => subscription.remove();
    // Like the real sheets, this depends on the open flag alone.
  }, [open]);
}

/** A sheet shown by a flag (`isVisible` / `onClose`), like SupervisorBottomSheet. */
export function flagSheet(name: string) {
  return function FlagSheet({ isVisible, onClose }: { isVisible: boolean; onClose: () => void }) {
    useBackWhileOpen(name, isVisible, onClose);
    return null;
  };
}

/** A sheet opened through its ref (`open()` / `close()`), like CustomerSearchBottomSheet. */
export function refSheet(name: string) {
  return forwardRef<{ open: () => void; close: () => void }, object>(function RefSheet(_props, ref) {
    const [open, setOpen] = useState(false);
    useImperativeHandle(ref, () => ({ open: () => setOpen(true), close: () => setOpen(false) }), []);
    useBackWhileOpen(name, open, () => setOpen(false));
    return null;
  });
}
