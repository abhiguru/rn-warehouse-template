/**
 * Which customers a customer account's copy holds (WH-306, contract product/tech/app-offline-customer-accounts.md 15 item 2).
 * The copy's `customers` rows are the account's customers while the copy is read: the profile's `assignedCustomerIds` may be
 * older (a customer deleted since). A read for a customer that is not a row of the copy is refused as the server refuses it.
 */
import { signedInRole } from '@/features/phone-copy/copyKind';
import { forCustomerAccounts, readVia, type CopyAnswer, type CopyNeed, type CopyReader } from '@/features/phone-copy/readRoute';
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
  if (signedInRole() !== 'customer') return null;
  const copy = await readVia(need, forCustomerAccounts(async q => {
    if (q.role !== 'customer') return null;
    const rows = await q.all<{ id: string; name: string | null }>('SELECT id, name FROM customers WHERE deleted_at IS NULL');
    return rows.map(row => [row.id, row.name ?? ''] as const);
  }));
  if (copy?.value == null) return null;
  return { names: new Map(copy.value), source: copy.source };
}

/** The ids that are rows of the copy, in the order given. */
export const ownIds = (scope: CustomerScope, ids: readonly string[]): string[] => ids.filter(id => scope.names.has(id));

/** Whether a customer account owns this customer in the open copy (always true for a warehouse role). */
export async function ownsInCopy(q: CopyReader, customerId: string): Promise<boolean> {
  if (q.role !== 'customer') return true;
  const own = await q.get<{ id: string }>('SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL', [customerId]);
  return own !== null;
}

/**
 * A per-customer read over the copy (WH-306): refused when a customer account asks for a customer that is not a row of its
 * copy (the server is not asked), the copy's answer when it can give one, and null for today's server path. A warehouse role
 * is answered as before. Both the scope check and the read run in one transaction.
 */
export async function readForCustomer<T>(
  customerId: string,
  need: CopyNeed,
  reader: (q: CopyReader) => Promise<T>
): Promise<{ refused: DataSource } | CopyAnswer<T> | null> {
  const copy = await readVia(need, forCustomerAccounts(async q => {
    if (!(await ownsInCopy(q, customerId))) return { kind: 'refused' as const };
    return { kind: 'ok' as const, value: await reader(q) };
  }));
  if (!copy) return null;
  return copy.value.kind === 'refused' ? { refused: copy.source } : { value: copy.value.value, source: copy.source };
}
