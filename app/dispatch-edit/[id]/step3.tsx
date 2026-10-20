/**
 * Dispatch Edit - Step 3: Review & Submit
 * Thin wrapper that renders the unified DispatchReviewStep component in edit mode
 */

import { DispatchReviewStep } from '@/features/dispatch/screens';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useAppSelector } from '@/store/hooks';
import { selectDispatchCheckingAnswer } from '@/store/slices/dispatchFormSlice';

export default function DispatchEditStep3() {
  // The server is being asked what became of a save that got no answer: the Back key does nothing (the X, with its
  // warning, is the only way out). Otherwise the key keeps its usual way.
  const checkingAnswer = useAppSelector(selectDispatchCheckingAnswer);
  useBackHandler({ enabled: checkingAnswer, onBackPress: () => true });

  return <DispatchReviewStep mode="edit" />;
}
