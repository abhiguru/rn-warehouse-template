/**
 * GRNInvoicesTab - the invoices of this GRN (common/InvoicesTable).
 *
 * An invoice bills one GRN, so each amount is that invoice's whole total (with tax, less any
 * discount). The rows come from the invoice list the account may read (getGrnInvoiceRows),
 * matched to this GRN by its id; until they arrive a spinner shows, and when they cannot be
 * matched to every invoice in the summary the table falls back to the summary's numbers.
 */

import React from 'react';
import { t as tr } from '@/i18n';
import { InvoicesTable } from '@/components/common/InvoicesTable';
import type { InvoiceTable } from '@/components/common/invoiceTable';

interface GRNInvoicesTabProps {
  invoices: InvoiceTable;
  loading?: boolean;
  onViewInvoice?: (invoice_id: string) => void;
}

export const GRNInvoicesTab: React.FC<GRNInvoicesTabProps> = ({ invoices, loading = false, onViewInvoice }) => (
  <InvoicesTable
    invoices={invoices}
    loading={loading}
    loadingText={tr('grn.detailsTable.loadingInvoices')}
    onViewInvoice={onViewInvoice}
    note={tr('grn.detailsTable.invoicesNote')}
    emptyText={tr('grn.detailsTable.invoicesEmpty')}
    testIDPrefix="grn"
  />
);
