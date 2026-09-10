/**
 * Dispatch Form - Step 3: Review & Submit
 * Thin wrapper that renders the unified DispatchReviewStep component in create mode
 */

import { DispatchReviewStep } from '@/features/dispatch/screens';
import { useBackHandler } from '@/hooks/useBackHandler';

export default function DispatchFormStep3() {
  // I11: Handle Android back button - go to previous step
  useBackHandler({
    currentStep: 3,
    totalSteps: 3,
    stepBasePath: '/dispatch-form/step',
    exitRoute: '/(tabs)/dispatch',
  });

  return <DispatchReviewStep mode="create" />;
}
