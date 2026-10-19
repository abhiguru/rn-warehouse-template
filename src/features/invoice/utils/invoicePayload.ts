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
