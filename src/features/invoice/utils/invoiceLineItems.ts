/**
 * The lines of a saved invoice as the details screen shows them.
 *
 * `get_invoice_data` has every line with its rates, dispatch and GRN item;
 * `get_invoice_items_detailed` has the amounts the server computed for each
 * line (backend migration 41: the same way the invoice total is computed).
 * The two are joined by invoice line id so the screen shows the server's
 * amounts and does not work them out a second time.
 */
import type { InvoiceDetailsResponse, InvoiceItem, InvoiceItemDetailed } from '@/services/invoice-service';
import type { InvoiceLineItem } from '@/components/invoice-details/InvoiceLineItemsTab';
import { t as tr } from '@/i18n';

type InvoiceHeader = NonNullable<InvoiceDetailsResponse['data']>['header'];

const isOneTime = (pricingMode: unknown): boolean => String(pricingMode ?? '').toUpperCase() === 'ONE_TIME';

export function buildInvoiceLineItems(
  invoice: InvoiceHeader,
  invoiceItems: InvoiceItem[] | null | undefined,
  detailedItems: InvoiceItemDetailed[]
): InvoiceLineItem[] {
  if (invoiceItems && invoiceItems.length > 0) {
    const serverLines = new Map(detailedItems.map((line) => [line.id, line]));

    return invoiceItems.map((item: InvoiceItem) => {
      const catalog = item.catalog || {};
      const grnItem = item.grn_item || {};
      const dispatch = item.dispatch || {};
      const serverLine = serverLines.get(item.item_id);

      return {
        id: item.item_id,
        item_name: catalog.name || grnItem.name || tr('invoice.details.unknownItem'),
        duration: (item.duration || 1).toString(),
        no_of_days: item.no_of_days || 0,
        charge: item.charge || 0,
        tax: item.tax || 0,
        // The server's amounts for the line, when they loaded
        server_tax_amount: serverLine?.taxAmount,
        server_total_amount: serverLine?.totalAmount,
        // How the GRN is priced decides how a line is charged
        one_time: isOneTime(grnItem.pricing_mode),
        // Some deployed get_invoice_data variants omit grn.id, but every
        // invoice line carries the authoritative GRN UUID on its dispatch.
        grn_id: invoice.grn?.id || dispatch.gr_id || grnItem.gr_id || '',
        gr_no: invoice.gr_no || invoice.grn?.number || '',
        // GRN Item ID for grouping
        grn_item_id: grnItem.id || '',
        // Dispatch details - now directly on dispatch object from updated RPC
        dispatch_id: dispatch.disp_id || '',
        dispatch_no: dispatch.disp_no || undefined, // e.g., "I2660"
        dispatch_date: dispatch.disp_date,
        dispatch_qty: dispatch.quantity || 0,
        // Storage details
        package_mark: grnItem.package_mark || '',
        rack: grnItem.rack || '',
        grn_quantity: grnItem.original_quantity || 0,
        grn_date: invoice.grn?.date || '',
        weight: grnItem.weight || 0,
        packaging: catalog.packaging || grnItem.packaging || '',
        // Rates for grouping calculations
        labour_rate: item.labour_rate || 0,
        charge_per_unit: item.charge || 0,
      };
    });
  }

  return detailedItems.map((item) => ({
    id: item.id,
    item_name: item.itemName || tr('invoice.details.unknownItem'),
    duration: item.duration,
    no_of_days: item.noOfDays,
    charge: item.charge || 0,
    tax: item.tax || 0,
    server_tax_amount: item.taxAmount,
    server_total_amount: item.totalAmount,
    one_time: isOneTime(invoice.grn?.pricing_mode),
    grn_id: invoice.grn?.id || '',
    gr_no: item.grNo,
    // GRN Item ID for grouping (the dispatch keeps lines apart when it is not known)
    grn_item_id: item.grnItemId || item.dispatchId || item.id,
    // Dispatch details
    dispatch_id: item.dispatchId,
    dispatch_no: item.dispatchNo,
    dispatch_date: item.dispatchDate,
    dispatch_qty: item.dispatchQty,
    // Storage details
    package_mark: item.packageMark,
    rack: item.rack,
    grn_quantity: item.grnQuantity,
    grn_date: undefined,
    weight: item.weight,
    packaging: item.packaging,
    // Rates
    labour_rate: item.labourRate || 0,
    charge_per_unit: item.charge || 0,
  }));
}

/**
 * The dispatches an invoice bills, for the "related documents" list: opened
 * by dispatch id, labelled with the dispatch number, each once. A dispatch
 * whose id is not known is left out, because the number cannot open it.
 */
export function relatedDispatchDocuments(
  lines: Pick<InvoiceLineItem, 'dispatch_id' | 'dispatch_no'>[]
): { id: string; number: string; type: 'dispatch' }[] {
  const byId = new Map<string, string>();
  lines.forEach((line) => {
    if (line.dispatch_id && line.dispatch_no && !byId.has(line.dispatch_id)) {
      byId.set(line.dispatch_id, String(line.dispatch_no));
    }
  });
  return Array.from(byId, ([id, number]) => ({ id, number, type: 'dispatch' as const }));
}
