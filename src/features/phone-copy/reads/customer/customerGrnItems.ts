/**
 * `get_customer_grn_items` over a customer account's phone copy (WH-306, contract product/tech/app-offline-customer-accounts.md
 * 3 R1 and 15 item 5): one customer's lots with the search, filters, order, paging and totals of the all-GRN read
 * (`grnItems.ts`), which the copy holds only for the account's own customers. The invoice state is `invoiced` from the
 * receipt's row and no `invoice_state`, as the server's customer read answers today; the Invoicing filter is not in that read.
 */
import type { GRNListParams } from '@/services/grn-service';
import type { CopyReader } from '@/features/phone-copy/readRoute';
import { readGrnItems, type GrnItemsAnswer } from '../grnItems';

export async function readCustomerGrnItems(q: CopyReader, customerId: string, params: GRNListParams): Promise<GrnItemsAnswer> {
  const filters: NonNullable<GRNListParams['p_filters']> = { ...params.p_filters, customer_ids: [customerId] };
  delete filters.invoiced;
  const answer = await readGrnItems(q, { ...params, p_filters: filters });
  if (answer.kind !== 'page') return answer;
  const data = answer.page.data.map(row => {
    const copyRow: Record<string, unknown> = { ...row, grn_id: row.id };
    delete copyRow.invoice_state;
    return copyRow as unknown as (typeof answer.page.data)[number];
  });
  return { kind: 'page', page: { ...answer.page, data } };
}
