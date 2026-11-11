/**
 * Whether payments show at all: the facility's Record payments setting is on (`capabilities.payments`) AND its backend has
 * the payment functions (migration 172). With either missing nothing about payments renders (WH-143, spec step 1).
 */
import { useCapability } from '@/hooks/useCapability';
import { backendHasFeature } from '@/config/backendFeatures';

export function usePaymentsVisible(): boolean {
  const on = useCapability('payments');
  return on && backendHasFeature('recordPayments');
}
