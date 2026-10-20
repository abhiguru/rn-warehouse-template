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
  /** The customer's state when known (true = deactivated, null = not known yet): a deactivated customer gets no new rate. */
  customerDeactivated?: boolean | null;
  /** The read of the customer's state failed: the form says so and offers to try again. */
  customerCheckFailed?: boolean;
  onRetryCustomerCheck?: () => void;
}

export function CustomerRateForm({ itemId, customerId, customerName, customerDeactivated, customerCheckFailed, onRetryCustomerCheck }: Props) {
  return <RateForm itemId={itemId} mode="addCustomer" customerId={customerId} customerName={customerName} customerDeactivated={customerDeactivated} customerCheckFailed={customerCheckFailed} onRetryCustomerCheck={onRetryCustomerCheck} />;
}

export default CustomerRateForm;
