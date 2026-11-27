/**
 * The kind of person a phone copy is loaded for (WH-306, contract product/tech/app-offline-customer-accounts.md 15 item 3).
 * A warehouse copy holds every customer's rows and a customer account's copy holds only its own, so a copy is read only
 * by the kind it was loaded for, and is erased when the signed-in role changes kind.
 */
import { isWarehouseCopyRole } from '@/config/copyRoles';

export type CopyKind = 'warehouse' | 'customer';

/** The kind of copy a role has: null for a role with no copy. */
export function copyKindOf(role: unknown): CopyKind | null {
  if (isWarehouseCopyRole(role)) return 'warehouse';
  return role === 'customer' ? 'customer' : null;
}

/**
 * The signed-in person's role. The store is loaded when first asked: the services that read through the copy would
 * otherwise bring the whole store, and its screens' hooks, into everything that imports them.
 */
export function signedInRole(): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- loaded when first asked, see above
    const { store } = require('@/store') as typeof import('@/store');
    return store.getState().auth.userProfile?.role;
  } catch {
    // No store to read (a bare engine, as in a unit test): no role, so no kind.
    return undefined;
  }
}

/** Reads the kind written in the copy's meta; a copy from before WH-306 has none and was loaded for a warehouse role. */
export function storedCopyKind(value: string | null | undefined, hasFormat: boolean): CopyKind | undefined {
  if (value === 'warehouse' || value === 'customer') return value;
  return hasFormat ? 'warehouse' : undefined;
}
