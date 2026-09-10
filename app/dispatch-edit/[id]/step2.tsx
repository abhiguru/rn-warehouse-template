/**
 * Dispatch Edit - Step 2: Items Selection
 * Thin wrapper that renders the unified DispatchItemsStep component in edit mode
 */

import { DispatchItemsStep } from '@/features/dispatch/screens';

export default function DispatchEditStep2() {
  return <DispatchItemsStep mode="edit" />;
}
