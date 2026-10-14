/**
 * Dispatch Form - Step 2: Items Selection
 * Thin wrapper that renders the unified DispatchItemsStep component in create mode
 */

import { useRef } from 'react';
import { useRouter } from 'expo-router';
import { DispatchItemsStep } from '@/features/dispatch/screens';
import { useBackHandler } from '@/hooks/useBackHandler';

export default function DispatchFormStep2() {
  const router = useRouter();
  // The step puts its own way back here while it is mounted: the one its footer's
  // Back button takes, which asks "Go back to details?" when items would be left.
  const backGuard = useRef<(() => void) | null>(null);

  // I11: the Android Back key takes the step's way back. With none registered it
  // goes to the step 1 already in the stack, without a question, as it always did.
  useBackHandler({
    onBackPress: () => {
      if (backGuard.current) {
        backGuard.current();
      } else {
        router.dismissTo('/dispatch-form/step1');
      }
      return true;
    },
  });

  return <DispatchItemsStep mode="create" backGuard={backGuard} />;
}
