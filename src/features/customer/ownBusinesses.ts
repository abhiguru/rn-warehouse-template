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
