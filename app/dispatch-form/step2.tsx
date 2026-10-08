/**
 * Dispatch Form - Step 2: Items Selection
 * Thin wrapper that renders the unified DispatchItemsStep component in create mode
 */

import { DispatchItemsStep } from '@/features/dispatch/screens';
import { useBackHandler } from '@/hooks/useBackHandler';

export default function DispatchFormStep2() {
  // I11: Handle Android back button - go to previous step
  useBackHandler({
    currentStep: 2,
    totalSteps: 3,
    stepBasePath: '/dispatch-form/step',
    exitRoute: '/(tabs)/dispatch',
  });

  return <DispatchItemsStep mode="create" />;
}
