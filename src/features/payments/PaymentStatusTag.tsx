/** The Due / Part paid / Paid tag of an invoice (WH-143). The status is the server's; this only words and colours it. */
import React from 'react';
import { StatusTag, type StatusKind } from '@/components/ui/StatusTag';
import { t } from '@/i18n';
import type { PaymentStatus } from '@/services/paymentsService';

const KIND: Record<PaymentStatus, StatusKind> = { due: 'critical', part_paid: 'informative', paid: 'positive' };
const LABEL = { due: 'payments.status.due', part_paid: 'payments.status.partPaid', paid: 'payments.status.paid' } as const;

export function PaymentStatusTag({ status, testID }: { status: PaymentStatus | null | undefined; testID?: string }) {
  if (!status) return null;
  return <StatusTag status={KIND[status]} label={t(LABEL[status])} testID={testID} />;
}
