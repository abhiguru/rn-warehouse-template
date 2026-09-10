/**
 * Dispatch Form - Step 1: Header Information
 * Thin wrapper that renders the unified DispatchHeaderStep component in create mode
 */

import { DispatchHeaderStep } from '@/features/dispatch/screens';
import { useBackHandler } from '@/hooks/useBackHandler';

export default function DispatchFormStep1() {
  // I11: Handle Android back button - on step 1, go back to dispatch list
  useBackHandler({
    currentStep: 1,
    totalSteps: 3,
    stepBasePath: '/dispatch-form/step',
    exitRoute: '/(tabs)/dispatch',
  });

  return <DispatchHeaderStep mode="create" />;
}
