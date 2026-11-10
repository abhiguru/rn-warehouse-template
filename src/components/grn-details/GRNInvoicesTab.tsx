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
import { View } from 'react-native';
import { StatusTag } from '@/components/ui/StatusTag';
import { invoiceStateKind, invoiceStateLabel, type InvoiceState } from '@/features/charging/invoiceState';
import { space } from '@/theme/tokens';
import { Button } from '@/components/ui/Button';

interface GRNInvoicesTabProps {
  invoices: InvoiceTable;
  loading?: boolean;
  onViewInvoice?: (invoice_id: string) => void;
  /** Migration 165: the GRN's invoice state, shown above the invoices (a GRN may have several). Absent on an older server. */
  state?: InvoiceState;
  /** WH-162: "Create invoice", given only when the person may create invoices and the server would accept one for this GRN now. */
  onCreateInvoice?: () => void;
}

export const GRNInvoicesTab: React.FC<GRNInvoicesTabProps> = ({ invoices, loading = false, onViewInvoice, state, onCreateInvoice }) => (
  <>
    {state || onCreateInvoice ? (
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.sm,
          paddingHorizontal: space.lg,
          paddingTop: space.md,
        }}
      >
        {state ? <StatusTag status={invoiceStateKind(state)} label={invoiceStateLabel(state)} testID="grn-invoice-state" /> : <View />}
        {onCreateInvoice ? (
          <Button type="primary" size="auto" leftIcon="plus" onPress={onCreateInvoice} testID="grn-create-invoice">
            {tr('lists.invoice.create')}
          </Button>
        ) : null}
      </View>
    ) : null}
    <InvoicesTable
      invoices={invoices}
      loading={loading}
      loadingText={tr('grn.detailsTable.loadingInvoices')}
      onViewInvoice={onViewInvoice}
      note={tr('grn.detailsTable.invoicesNote')}
      emptyText={tr('grn.detailsTable.invoicesEmpty')}
      testIDPrefix="grn"
    />
  </>
);
