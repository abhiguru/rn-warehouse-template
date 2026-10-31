import type { CreateInvoicePayload, InvoiceItemData } from '@/types/invoice.types';

/**
 * The invoice form's header and lines as the payload of the save calls. The
 * financial year goes as the year it starts in ("2026-27" -> 2026) and the
 * date as a timestamp. The reason for a zero charge is sent only when a line has
 * a zero charge (the service decides).
 */
export const transformFormDataToPayload = (
  header: any,
  items: InvoiceItemData[]
): CreateInvoicePayload => {
  return {
    header: {
      customer_id: header.customer_id,
      customer_name: header.customer_name,
      gr_id: header.gr_id,
      gr_no: header.gr_no,
      inv_no: header.inv_no,
      inv_fin_year:
        typeof header.inv_fin_year === 'string'
          ? parseInt(header.inv_fin_year.split('-')[0])
          : header.inv_fin_year,
      inv_date: header.inv_date.includes('T')
        ? header.inv_date
        : header.inv_date + 'T00:00:00Z',
      discount: header.discount || 0,
      discount_reason: header.discount_reason?.trim() || null,
      // The save sends it only when a line has a zero charge.
      zero_charge_reason: header.zero_charge_reason?.trim() || null,
      labour: header.labour || 0,
      tax_amount: header.tax_amount || 0,
      total: header.total || 0,
      one_time_charge: header.one_time_charge || false,
    },
    items: items.map((item) => ({
      disp_trl_id: item.disp_trl_id,
      grn_item_id: item.grn_item_id, // GRN item record ID (goodsreceived_trl.id)
      qty: item.qty,
      charge: item.charge,
      labour_rate: item.labour_rate,
      tax: item.tax,
      duration: item.duration,
      no_of_days: item.no_of_days,
    })),
  };
};

type RateField = 'charge' | 'labour_rate' | 'tax';
const RATE_FIELDS: readonly RateField[] = ['charge', 'labour_rate', 'tax'];

/**
 * Tells the server which figures of each line were looked up and which the person typed (owner decision D12), so that it can
 * refuse the save when a looked-up rate changed since the form opened (RATES_CHANGED). `looked_up` is what the lookup gave
 * when the lines were read; `typed` lists the fields whose figure the person set by hand (a figure typed equal to the looked-up
 * one is not told apart). A line with no looked-up figures (an invoice read from the server for editing) carries neither, and
 * an invoice with no such line sends none: the server then makes no check.
 */
export const withLookedUpFigures = (
  payload: CreateInvoicePayload,
  formItems: readonly InvoiceItemData[],
  lookedUp: Record<string, { charge: number; labour_rate: number; tax: number }>,
  editedItems: Record<string, Partial<Record<RateField, number>>>
): CreateInvoicePayload => {
  const byDispatch = new Map(formItems.map((item) => [item.disp_trl_id, item] as const));
  return {
    ...payload,
    items: payload.items.map((line) => {
      const looked = lookedUp[line.disp_trl_id];
      const form = byDispatch.get(line.disp_trl_id);
      if (!looked || !form) return line;
      const edits = editedItems[form.temp_id] ?? {};
      const typed = RATE_FIELDS.filter((field) => edits[field] !== undefined && edits[field] !== looked[field]);
      return { ...line, looked_up: { charge: looked.charge, labour_rate: looked.labour_rate, tax: looked.tax }, ...(typed.length > 0 ? { typed } : {}) };
    }),
  };
};
