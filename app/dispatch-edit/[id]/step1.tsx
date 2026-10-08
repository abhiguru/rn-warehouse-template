/**
 * Dispatch Edit - Step 1: Header Information
 * Thin wrapper that renders the unified DispatchHeaderStep component in edit mode
 */

import { DispatchHeaderStep } from '@/features/dispatch/screens';

export default function DispatchEditStep1() {
  return <DispatchHeaderStep mode="edit" />;
}
