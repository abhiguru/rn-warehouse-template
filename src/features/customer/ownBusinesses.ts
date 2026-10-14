/**
 * The businesses the signed-in customer account may place an order for, asked of
 * the facility each time.
 *
 * No list of ids is sent. The facility's row-level policy on `customers` gives a
 * customer account its own businesses and no others (backend `starter_customer`,
 * `warehouse_security.owns_customer`: an active assignment of an active profile),
 * and the ids the phone holds can be out of date or missing: a sign-in whose
 * lookup failed stores none.
 *
 * That policy looks at the assignment only, so a business the facility has
 * deactivated or deleted (`active = false`, `deleted_at` set) would still come
 * back while its assignment stands. Those are left out here, as the staff search
 * (`search_customers`) leaves them out.
 */
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { getAuthenticatedClient } from '@/config/supabaseConfig';

export interface OwnBusiness {
  id: string;
  /** Empty when the facility holds none. */
  name: string;
  /** Empty when the facility holds none. */
  city: string;
}

/**
 * The account's own businesses that are in use, ordered by name. Throws when the
 * read fails, and when the session changed while it was out: rows read for one
 * account or facility are never handed to the next.
 */
export async function readOwnBusinesses(): Promise<OwnBusiness[]> {
  const session = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const { data, error } = await client
    .from('customers')
    .select('id, name, city')
    .eq('active', true)
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  if (session !== getSessionGeneration()) throw new Error('Session changed');
  return ((data ?? []) as { id: string; name: string | null; city: string | null }[]).map((row) => ({
    id: row.id,
    name: row.name ?? '',
    city: row.city ?? '',
  }));
}

export type AccessStatus = 'active' | 'revoked' | 'none';

/**
 * What the facility says about the signed-in account's access (`get_my_access_status`,
 * backend migration 80). An empty list of businesses reads the same for an account
 * the facility revoked as for one with no business linked; this tells them apart.
 *
 * Null for anything but a clear answer: a failed call, a facility without the function
 * (an older backend answers PGRST202 / 404) or a text that is not one of the three. The
 * caller then treats the account as it did before this call existed. Never throws,
 * except when the session changed while it was out (rows for one account are never
 * handed to the next).
 */
export async function readAccessStatus(): Promise<AccessStatus | null> {
  const session = getSessionGeneration();
  let status: unknown;
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await client.rpc('get_my_access_status');
    status = error ? null : data;
  } catch {
    status = null;
  }
  if (session !== getSessionGeneration()) throw new Error('Session changed');
  return status === 'active' || status === 'revoked' || status === 'none' ? status : null;
}
