/**
 * `get_users_list` and `get_user_details` over the phone copy (WH-348, product/tech/app-offline-read-more.md section 0):
 * the server's answer, key for key, for an administrator or a supervisor. Their text is migration 113 with migration 171's
 * service-account rule, as installed on temp1. Staff are refused online (the Users screen is closed to them), so for them
 * these reads do not answer and the server's refusal is shown as today (contract section 2, roles).
 */
import { enCompare, likeUnescaped } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { compareText, parseRow, parseRows, pick, textOf, type Row } from './rows';

export interface UserListRequest {
  search: string;
  roles: readonly string[] | null;
  active: boolean | null;
  limit: number;
  offset: number;
}

export interface UserListData {
  users: Row[];
  pagination: { total_count: number; total_with_deleted: number; limit: number; offset: number; has_more: boolean };
}

const refusedToStaff = (q: CopyReader): void => {
  if (q.role === 'staff') throw new Error('users are refused to staff');
};

const isDeleted = (row: Row): boolean => row.deleted_at !== null && row.deleted_at !== undefined;
const enrollment = (row: Row): unknown => (row.enrollment_status === 'pending' || row.enrollment_status === 'rejected' ? row.enrollment_status : null);

async function assignedCount(q: CopyReader, userId: string): Promise<number> {
  return (await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM users_customers_new WHERE json_extract(row, '$.user_profile_id') = ? AND json_extract(row, '$.active') IN (1, 'true')", [userId]))?.n ?? 0;
}

/** The fields the list and the details share. */
const userOf = (row: Row): Row => ({
  id: pick(row, 'id'), auth_user_id: pick(row, 'auth_user_id'), name: pick(row, 'name'), display_name: pick(row, 'display_name'),
  mobile: isDeleted(row) ? null : pick(row, 'mobile'), role: pick(row, 'role'), active: pick(row, 'active'),
  is_service_account: pick(row, 'is_service_account'), enrollment_status: enrollment(row), is_deleted: isDeleted(row),
  deleted_at: pick(row, 'deleted_at'), created_at: pick(row, 'created_at'), updated_at: pick(row, 'updated_at'),
});

export async function readUsersList(q: CopyReader, request: UserListRequest): Promise<UserListData> {
  refusedToStaff(q);
  // The page is 1 to 100 rows (0 or none: 20), from a start of 0 or more.
  const limit = request.limit < 1 ? 20 : Math.min(request.limit, 100);
  const offset = Math.max(request.offset, 0);
  const search = request.search.trim();
  const like = search ? likeUnescaped(`%${search}%`).param : null;
  const matches = (row: Row): boolean => {
    if (like !== null) {
      const text = like.slice(1, -1);
      const byName = textOf(row.name)?.toLowerCase().includes(text) === true;
      const byMobile = !isDeleted(row) && textOf(row.mobile)?.toLowerCase().includes(text) === true;
      if (!byName && !byMobile) return false;
    }
    if (request.roles !== null && !request.roles.includes(String(row.role))) return false;
    if (request.active !== null && Boolean(row.active) !== request.active) return false;
    // A supervisor does not see administrators; nobody sees the service accounts (the "Import" actor).
    return !(q.role === 'supervisor' && row.role === 'admin') && row.is_service_account !== true;
  };
  const rows = parseRows(await q.all<{ row: string }>('SELECT row FROM user_profiles')).filter(matches);
  // Live accounts first (by name), deleted accounts after them.
  rows.sort((a, b) => Number(isDeleted(a)) - Number(isDeleted(b)) || enCompare(textOf(a.name), textOf(b.name)) || compareText(String(a.id), String(b.id)));
  const total = rows.length;
  const live = rows.filter(row => !isDeleted(row)).length;
  // One statement at a time: the copy's connection runs a single statement at once (copyDriver.ts).
  const users: Row[] = [];
  for (const row of rows.slice(offset, offset + limit)) {
    users.push({ ...userOf(row), assigned_customers_count: await assignedCount(q, String(row.id)) });
  }
  return { users, pagination: { total_count: live, total_with_deleted: total, limit, offset, has_more: offset + limit < total } };
}

export type UserDetailsData = { kind: 'found'; user: Row; assigned_customers: Row[] } | { kind: 'not-found' };

export async function readUserDetails(q: CopyReader, userId: string): Promise<UserDetailsData> {
  refusedToStaff(q);
  const found = await q.get<{ row: string }>('SELECT row FROM user_profiles WHERE id = ?', [userId]);
  // A supervisor asking after an administrator is refused by the server: the server answers that.
  if (!found || (q.role === 'supervisor' && parseRow(found.row).role === 'admin')) {
    if (found) throw new Error('administrators are refused to supervisors');
    return { kind: 'not-found' };
  }
  const row = parseRow(found.row);
  const assignments = parseRows(await q.all<{ row: string }>("SELECT row FROM users_customers_new WHERE json_extract(row, '$.user_profile_id') = ?", [userId]))
    .filter(a => a.active === true || a.active === 1);
  const names = new Map((await q.all<{ id: string; name: string | null }>("SELECT id, json_extract(row, '$.name') AS name FROM user_profiles")).map(p => [p.id, p.name]));
  const customers: Row[] = [];
  for (const assignment of assignments) {
    const customer = await q.get<{ row: string }>('SELECT row FROM customers WHERE id = ?', [String(assignment.customer_id)]);
    if (customer) customers.push({ assignment, customer: parseRow(customer.row) });
  }
  customers.sort((a, b) => enCompare(textOf((a.customer as Row).name), textOf((b.customer as Row).name)) || compareText(String((a.customer as Row).id), String((b.customer as Row).id)));
  return {
    kind: 'found',
    user: {
      ...userOf(row), mobile_verified: pick(row, 'mobile_verified'), mobile_verified_at: pick(row, 'mobile_verified_at'),
      assigned_customers_count: await assignedCount(q, userId),
    },
    assigned_customers: customers.map(entry => {
      const assignment = entry.assignment as Row;
      const customer = entry.customer as Row;
      return {
        customer_id: customer.id, customer_name: pick(customer, 'name'), customer_mobile: pick(customer, 'mobile'), customer_city: pick(customer, 'city'),
        customer_active: pick(customer, 'active'), assigned_at: pick(assignment, 'assigned_at'),
        assigned_by_name: names.get(String(assignment.assigned_by)) ?? null,
      };
    }),
  };
}
