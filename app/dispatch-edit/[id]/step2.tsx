/**
 * Dispatch Edit - Step 2: Items Selection
 * Thin wrapper that renders the unified DispatchItemsStep component in edit mode
 */

import { useRef } from 'react';
import { DispatchItemsStep } from '@/features/dispatch/screens';
import { useBackHandler } from '@/hooks/useBackHandler';

export default function DispatchEditStep2() {
  // The step puts its own way back here while it is mounted: the one its footer's
  // Back button takes, which asks "Go back to details?" when items would be left.
  const backGuard = useRef<(() => void) | null>(null);

  // The Android Back key takes the step's way back. With none registered the key
  // is left to the system, as it was while this route had no handler of its own.
  useBackHandler({
    onBackPress: () => {
      if (!backGuard.current) return false;
      backGuard.current();
      return true;
    },
  });

  return <DispatchItemsStep mode="edit" backGuard={backGuard} />;
}
