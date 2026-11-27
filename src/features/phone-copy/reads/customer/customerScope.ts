/**
 * Which customers a customer account's copy holds (WH-306, contract product/tech/app-offline-customer-accounts.md 15 item 2).
 * The copy's `customers` rows are the account's customers while the copy is read: the profile's `assignedCustomerIds` may be
 * older (a customer deleted since). A read for a customer that is not a row of the copy is refused as the server refuses it.
 */
import { readVia, type CopyNeed } from '@/features/phone-copy/readRoute';
import type { DataSource } from '@/features/phone-copy/sourced';

export interface CustomerScope {
  /** The copy's customers: id to name. */
  names: ReadonlyMap<string, string>;
  source: DataSource;
}

/**
 * The customers of the copy, or null when this read is not answered from a customer account's copy (the server path
 * stays as it is, and so does every read of a warehouse role).
 */
export async function customerScope(need: CopyNeed): Promise<CustomerScope | null> {
  const copy = await readVia(need, async q => {
    if (q.role !== 'customer') return null;
    const rows = await q.all<{ id: string; name: string | null }>('SELECT id, name FROM customers WHERE deleted_at IS NULL');
    return rows.map(row => [row.id, row.name ?? ''] as const);
  });
  if (copy?.value == null) return null;
  return { names: new Map(copy.value), source: copy.source };
}

/** The ids that are rows of the copy, in the order given. */
export const ownIds = (scope: CustomerScope, ids: readonly string[]): string[] => ids.filter(id => scope.names.has(id));
