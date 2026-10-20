/**
 * Dispatch Form - Step 3: Review & Submit
 * Thin wrapper that renders the unified DispatchReviewStep component in create mode
 */

import { DispatchReviewStep } from '@/features/dispatch/screens';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useAppSelector } from '@/store/hooks';
import { selectDispatchCheckingAnswer } from '@/store/slices/dispatchFormSlice';

export default function DispatchFormStep3() {
  // The server is being asked what became of a create that got no answer: the Back key does nothing (the X, with its
  // warning, is the only way out).
  const checkingAnswer = useAppSelector(selectDispatchCheckingAnswer);

  // I11: Handle Android back button - go to previous step
  useBackHandler({
    currentStep: 3,
    totalSteps: 3,
    stepBasePath: '/dispatch-form/step',
    exitRoute: '/(tabs)/dispatch',
    onBackPress: checkingAnswer ? () => true : undefined,
  });

  return <DispatchReviewStep mode="create" />;
}
