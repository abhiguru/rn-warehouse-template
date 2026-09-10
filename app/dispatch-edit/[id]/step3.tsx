/**
 * Dispatch Edit - Step 3: Review & Submit
 * Thin wrapper that renders the unified DispatchReviewStep component in edit mode
 */

import { DispatchReviewStep } from '@/features/dispatch/screens';

export default function DispatchEditStep3() {
  return <DispatchReviewStep mode="edit" />;
}
