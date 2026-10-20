/**
 * Customers → a customer → Pricing → "+ Add item" → an item: the full-screen "Add customer rate" form (owner,
 * 2026-10-17). The body is RateForm, which also serves the item's default rate.
 */
import React from 'react';
import { RateForm } from './RateForm';

interface Props {
  itemId: string;
  customerId: string;
  /** From the link; the rows give it too once a customer has any rate. */
  customerName?: string;
}

export function CustomerRateForm({ itemId, customerId, customerName }: Props) {
  return <RateForm itemId={itemId} mode="addCustomer" customerId={customerId} customerName={customerName} />;
}

export default CustomerRateForm;
