/**
 * The names of customers as the facility gave them in this run of the app.
 *
 * A report is opened by a route that carries a customer id, and a route can be
 * written by anybody: `warehousemanager://reports/<report>?customerId=...&customerName=...`.
 * The id is judged by the server on every request. A name in the route is judged
 * by nobody, so a report never shows it. What a report shows as the customer's
 * name is read from here, and only the facility's own answers are put in here:
 *
 *   - the row a person tapped in a report's customers list (useReportScope),
 *   - the customer activity answer (app/reports/customer-activity.tsx),
 *   - a read of `customers(id, name)` under the account's own access: the
 *     customer picker's list, and the one lookup for a customer that arrives
 *     with no name held here.
 *
 * Memory only, and emptied whenever the session changes: a name belongs to the
 * facility and the account that read it.
 */
import { getSessionGeneration, onSessionChange } from '@/config/sessionLifecycle';
import { getAuthenticatedClient } from '@/config/supabaseConfig';

const names = new Map<string, string>();
/** Customers being looked up, or looked up already, in this session: each is asked for once. */
const asked = new Set<string>();
const listeners = new Set<() => void>();

/** Keep a name the facility gave for a customer. A missing or empty name keeps nothing. */
export function trustCustomerName(id: string, name: string | null | undefined): void {
  if (!id || typeof name !== 'string' || !name || names.get(id) === name) return;
  names.set(id, name);
  listeners.forEach(listener => listener());
}

/** The facility's name for a customer, or '' when this run has none. */
export const trustedCustomerName = (id: string): string => names.get(id) ?? '';

export function subscribeCustomerNames(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Names of customers by id, read from `customers`. Row-level security gives a
 * customer account its own rows and no others, and a warehouse role every row.
 * The names read are kept, unless the session changed while the read was out.
 */
export async function readCustomerNames(ids: string[]): Promise<Record<string, string>> {
  const session = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const { data, error } = await client.from('customers').select('id, name').in('id', ids);
  if (error) throw error;
  const read: Record<string, string> = {};
  for (const row of (data ?? []) as { id: string; name: string | null }[]) read[row.id] = row.name ?? '';
  if (session === getSessionGeneration()) {
    for (const [id, name] of Object.entries(read)) trustCustomerName(id, name);
  }
  return read;
}

/**
 * Ask the facility for the name of a customer that has none here. Nothing is
 * returned: the name, when one comes, is kept and the subscribers are told. A
 * customer the facility returns no name for is not asked for again in this
 * session. A read that fails keeps nothing and is tried again by the next
 * screen that needs the name.
 */
export function lookUpCustomerName(id: string): void {
  if (!id || names.has(id) || asked.has(id)) return;
  const session = getSessionGeneration();
  asked.add(id);
  readCustomerNames([id]).catch(() => {
    if (session === getSessionGeneration()) asked.delete(id);
  });
}

/** Forget every name: the session they were read in is over. */
export function forgetCustomerNames(): void {
  asked.clear();
  if (names.size === 0) return;
  names.clear();
  listeners.forEach(listener => listener());
}

// Sign-in, sign-out, forced sign-out and a facility switch all change the session.
onSessionChange(forgetCustomerNames);
