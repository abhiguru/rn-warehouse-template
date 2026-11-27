/**
 * `get_customer_dispatch_list` over a customer account's phone copy (WH-306, contract
 * product/tech/app-offline-customer-accounts.md 3 R4): one customer's dispatches, newest first, in the server's `data`
 * shape, with none of the staff-only keys (`created_by`, `updated_by`). The page is whole pages of `limit` rows.
 */
import type { CopyReader } from '@/features/phone-copy/readRoute';
import { readDispatchList } from '../dispatchList';
import type { Row } from '../rows';

export interface CustomerDispatchListData {
  dispatches: Row[];
  pagination: { total_count: number; limit: number; offset: number; has_more: boolean };
}

export async function readCustomerDispatchList(
  q: CopyReader,
  customerId: string,
  limit: number,
  offset: number,
  includeItems: boolean
): Promise<CustomerDispatchListData> {
  // The list asks for pages from a multiple of its page size; any other start is the server's to answer.
  if (offset % limit !== 0) throw new Error('page start is not a page');
  const data = await readDispatchList(q, {
    customerId, filters: {}, sortBy: 'dispatch_date', sortOrder: 'desc', page: offset / limit + 1, limit, includeItems,
  });
  const dispatches = data.dispatches.map(row => {
    const own: Row = { ...row };
    delete own.created_by;
    delete own.updated_by;
    return own;
  });
  return {
    dispatches,
    pagination: { total_count: data.total_count, limit, offset, has_more: offset + dispatches.length < data.total_count },
  };
}
