/**
 * DispatchInvoicesTab - the invoices that bill this dispatch (common/InvoicesTable).
 *
 * Rows come from dispatchDetailsModel.buildInvoiceTable: the invoice each line carries. The
 * amounts are whole invoice totals: an invoice bills one GRN and may hold other dispatches'
 * lines, so the note under the table says so.
 */

import React from 'react';
import { t as tr } from '@/i18n';
import { InvoicesTable } from '@/components/common/InvoicesTable';
import type { InvoiceTable } from './dispatchDetailsModel';

export type { InvoiceTable } from './dispatchDetailsModel';

interface DispatchInvoicesTabProps {
  invoices: InvoiceTable;
  onViewInvoice?: (invoice_id: string) => void;
}

export const DispatchInvoicesTab: React.FC<DispatchInvoicesTabProps> = ({ invoices, onViewInvoice }) => (
  <InvoicesTable
    invoices={invoices}
    onViewInvoice={onViewInvoice}
    note={tr('dispatch.details.table.invoiceTotalsNote')}
    emptyText={tr('dispatch.details.table.invoicesEmpty')}
    testIDPrefix="dispatch"
  />
);
