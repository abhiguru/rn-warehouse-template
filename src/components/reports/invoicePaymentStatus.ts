/**
 * The status tag of an invoice's payment (docs/STYLE_GUIDE.md §3.5): paid is
 * positive, pending is critical. The backend sends only these two; anything
 * else is shown as "Unknown" in neutral, not as a label made from the stored
 * value (docs/I18N.md rule 9) and not as "Pending", which would claim money is
 * owed. It maps statuses as `invoiceStatus` in app/reports/customer-activity.tsx
 * does; that screen can take this function when it moves to the report layer.
 */
import type { StatusKind } from '@/components/ui';
import { t as tr } from '@/i18n';

export interface InvoicePaymentStatusInfo {
  kind: StatusKind;
  label: string;
}

export function invoicePaymentStatus(status: string | null | undefined): InvoicePaymentStatusInfo {
  if (status === 'paid') return { kind: 'positive', label: tr('reports.customerActivity.paid') };
  if (status === 'pending') return { kind: 'critical', label: tr('common.pending') };
  return { kind: 'neutral', label: tr('common.unknown') };
}

export default invoicePaymentStatus;
