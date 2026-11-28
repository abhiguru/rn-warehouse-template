/**
 * `get_grn_item_rates` over the phone copy (WH-348, contract section 16.2): the rate each lot of a GRN is invoiced at, for
 * every copy role. The server works each lot's rate out (the invoice line, the GRN's own rate, or the customer's or the
 * item's rate) and sends it as the `item_rate` key of the lot's row; this read copies that key as it is, adds nothing up and
 * works out no rate (decision 4). A lot whose row has no `item_rate` (an older feed) reads as "no rate".
 */
import { businessDate } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { parseRow, parseRows, pick, textOf, type Row } from './rows';

export interface GrnItemRatesData {
  gr_id: string;
  grn_date: string;
  price_type: 'monthly' | 'one_time';
  invoiced: boolean;
  rates: Row[];
}

/** The server's `data`, or null when the copy has no such GRN (the server answers "GRN not found"). */
export async function readGrnItemRates(q: CopyReader, grnId: string): Promise<GrnItemRatesData | null> {
  const found = await q.get<{ row: string }>('SELECT row FROM goodsreceived WHERE id = ? AND deleted_at IS NULL', [grnId]);
  if (!found) return null;
  const grn = parseRow(found.row);
  const lots = parseRows(await q.all<{ row: string }>('SELECT row FROM goodsreceived_trl WHERE gr_id = ? ORDER BY id', [grnId]));
  const date = textOf(grn.date);
  return {
    gr_id: grnId,
    grn_date: date === null ? '' : businessDate(date),
    price_type: (textOf(grn.pricing_mode) ?? '').toUpperCase() === 'ONE_TIME' ? 'one_time' : 'monthly',
    invoiced: grn.invoiced === true,
    rates: lots.map(lot => {
      const rate = (typeof lot.item_rate === 'object' && lot.item_rate !== null ? lot.item_rate : {}) as Row;
      return {
        grn_item_id: lot.id, item_id: pick(lot, 'item_id'), item_name: pick(lot, 'item_name'), weight: pick(lot, 'weight'),
        source: pick(rate, 'source'), unit_price: pick(rate, 'unit_price'), labour_rate: pick(rate, 'labour_rate'),
        tax_percent: pick(rate, 'tax_percent'), weight_min: pick(rate, 'weight_min'), weight_max: pick(rate, 'weight_max'),
        varies: rate.varies === true,
      };
    }),
  };
}
