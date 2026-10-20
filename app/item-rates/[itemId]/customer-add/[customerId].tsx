/**
 * Customers → a customer → Pricing → "+ Add item" → an item: the full-screen "Add customer rate" form (owner,
 * 2026-10-17). The customer rate page's "Add customer rate" opens it too.
 */
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useCustomerDeactivatedState } from '@/features/item-pricing/useCustomerDeactivated';
import { knownDeactivated } from '@/features/item-pricing/contract';
import { CustomerRateForm } from '@/features/item-pricing/components/CustomerRateForm';

export default function AddCustomerRateScreen() {
  const params = useLocalSearchParams<{ itemId: string; customerId: string; customer_name?: string; deactivated?: string }>();
  const customerId = String(params.customerId ?? '');
  const { deactivated, failed, retry } = useCustomerDeactivatedState(customerId, knownDeactivated(params.deactivated));
  return (
    <CustomerRateForm
      itemId={String(params.itemId ?? '')}
      customerId={customerId}
      customerName={typeof params.customer_name === 'string' ? params.customer_name : undefined}
      customerDeactivated={deactivated}
      customerCheckFailed={failed}
      onRetryCustomerCheck={retry}
    />
  );
}
