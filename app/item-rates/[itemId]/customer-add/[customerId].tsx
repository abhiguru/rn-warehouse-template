/**
 * Customers → a customer → Pricing → "+ Add item" → an item: the full-screen "Add customer rate" form (owner,
 * 2026-10-17). The customer rate page's "Add customer rate" opens it too.
 */
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CustomerRateForm } from '@/features/item-pricing/components/CustomerRateForm';

export default function AddCustomerRateScreen() {
  const params = useLocalSearchParams<{ itemId: string; customerId: string; customer_name?: string }>();
  return (
    <CustomerRateForm
      itemId={String(params.itemId ?? '')}
      customerId={String(params.customerId ?? '')}
      customerName={typeof params.customer_name === 'string' ? params.customer_name : undefined}
    />
  );
}
