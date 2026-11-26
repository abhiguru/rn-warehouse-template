/**
 * DispatchInvoicesTab - the invoices that bill this dispatch (common/InvoicesTable).
 *
 * Rows come from dispatchDetailsModel.buildInvoiceTable: the invoice each line carries. The
 * amounts are whole invoice totals: an invoice bills one GRN and may hold other dispatches'
 * lines, so the note under the table says so.
 */

import React from 'react';
import { View } from 'react-native';
import { space } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import { InvoicesTable } from '@/components/common/InvoicesTable';
import { NeedsConnectionLine } from '@/features/phone-copy/components/NeedsConnectionLine';
import type { InvoiceTable } from './dispatchDetailsModel';

export type { InvoiceTable } from './dispatchDetailsModel';

interface DispatchInvoicesTabProps {
  invoices: InvoiceTable;
  onViewInvoice?: (invoice_id: string) => void;
  /** The invoice amounts are not on the phone (WH-299): the tab says they need a connection. */
  amountsNeedConnection?: boolean;
}

export const DispatchInvoicesTab: React.FC<DispatchInvoicesTabProps> = ({ invoices, onViewInvoice, amountsNeedConnection = false }) =>
  amountsNeedConnection ? (
    <View style={{ padding: space.lg }}>
      <NeedsConnectionLine
        testID="dispatch-details-section-needs-connection-invoice-amounts"
        text={tr('components.offlineRead.screenNeedsConnection')}
        icon
      />
    </View>
  ) : (
  <InvoicesTable
    invoices={invoices}
    onViewInvoice={onViewInvoice}
    note={tr('dispatch.details.table.invoiceTotalsNote')}
    emptyText={tr('dispatch.details.table.invoicesEmpty')}
    testIDPrefix="dispatch"
  />
  );
