/**
 * Dispatch Form - Step 1: Header Information
 * Thin wrapper that renders the unified DispatchHeaderStep component in create mode
 */

import { DispatchHeaderStep } from '@/features/dispatch/screens';

export default function DispatchFormStep1() {
  // The Android Back key is handled by the step's header: with something entered
  // it asks before discarding, as the X in the header does (useFirstStepBack).
  return <DispatchHeaderStep mode="create" />;
}
