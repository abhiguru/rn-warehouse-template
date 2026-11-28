/**
 * Parts of a GRN's or a dispatch's details that both read the same way from the copy (WH-299,
 * product/tech/app-offline-read-from-copy.md section 4): the customer, the supervisor and the item.
 */
import type { CopyReader } from '../readRoute';
import { parseRow, pick, type Row } from './rows';

/** `customer_details`: the customer's fields under the names the server gives them. */
export async function customerDetails(q: CopyReader, customerId: unknown): Promise<Row | null> {
  if (typeof customerId !== 'string') return null;
  const found = await q.get<{ row: string }>('SELECT row FROM customers WHERE id = ?', [customerId]);
  if (!found) return null;
  const c = parseRow(found.row);
  return {
    id: c.id,
    name: pick(c, 'name'),
    first_name: pick(c, 'firstName'),
    last_name: pick(c, 'lastName'),
    gst: pick(c, 'gst'),
    mobile: pick(c, 'mobile'),
    address: pick(c, 'address'),
    city: pick(c, 'city'),
    state: pick(c, 'state'),
    pincode: pick(c, 'pincode'),
    email: pick(c, 'email'),
    active: pick(c, 'active'),
    auto_invoice_generation: pick(c, 'auto_invoice_generation'),
  };
}

/**
 * `supervisor_details`. An administrator's copy holds the profiles; the others hold the people list, which has no
 * mobile number: the key is left out then, not made up.
 */
export async function supervisorDetails(q: CopyReader, supervisorId: unknown, supervisorName?: unknown): Promise<Row | null> {
  // A customer account's copy holds no people: the supervisor is the name the document carries, and nothing else of them.
  if (q.role === 'customer') return typeof supervisorName === 'string' ? { name: supervisorName } : null;
  // A row with no supervisor id (older records) is matched by the name it carries.
  const byName = supervisorId === undefined && typeof supervisorName === 'string';
  if (typeof supervisorId !== 'string' && !byName) return null;
  const where = byName ? 'json_extract(row, \'$.name\') = ?' : 'id = ?';
  const key = byName ? supervisorName : supervisorId;
  const profile = await q.get<{ row: string }>(`SELECT row FROM user_profiles WHERE ${where}`, [String(key)]);
  const found = profile ?? (await q.get<{ row: string }>(`SELECT row FROM people WHERE ${where}`, [String(key)]));
  if (!found) return null;
  const u = parseRow(found.row);
  return {
    id: u.id,
    name: pick(u, 'name'),
    ...(profile || 'mobile' in u ? { mobile: pick(u, 'mobile') } : {}),
    role: pick(u, 'role'),
    display_name: pick(u, 'display_name'),
  };
}

/** `item_details` for the lots' items, by item id. */
export async function itemDetailsById(q: CopyReader, itemIds: readonly string[]): Promise<Map<string, Row>> {
  const found = new Map<string, Row>();
  if (!itemIds.length) return found;
  const rows = await q.all<{ row: string }>('SELECT row FROM items WHERE id IN (SELECT value FROM json_each(?))', [JSON.stringify(itemIds)]);
  for (const record of rows) {
    const i = parseRow(record.row);
    found.set(String(i.id), { id: i.id, name: pick(i, 'name'), packaging: pick(i, 'packaging'), description: pick(i, 'description'), active: pick(i, 'active') });
  }
  return found;
}
