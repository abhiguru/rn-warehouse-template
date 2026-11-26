/**
 * The pickers over the phone copy (WH-299, product/tech/app-offline-read-from-copy.md sections 7.2 and 10.3): customers
 * (`search_customers`, migration 147), their states, items (`search_items_autocomplete`), supervisors
 * (`get_supervisors`) and the rack presets. The expected behaviour is each server function's (backend cd9531e); where a
 * function does not escape `%` and `_` in the typed text, neither does the copy.
 */
import { CopyReadError } from '../sourced';
import { enCompare, likeUnescaped, mobileDigits, mobileKey } from '../pgCompat';
import type { CopyReader } from '../readRoute';

type Row = Record<string, unknown>;
const parseRow = (text: string): Row => JSON.parse(text) as Row;
const SPACE_ONLY = /^ +| +$/g;


// ---------------------------------------------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------------------------------------------

export interface CustomerPickerRow {
  id: unknown;
  name: unknown;
  mobile: unknown;
  city: unknown;
  email: unknown;
  address: unknown;
  active: unknown;
  deleted: boolean;
}

/** What the server accepts as "a query made only of digits and number punctuation". */
const NUMBER_QUERY = /^[0-9+()\-. ]+$/;

/** `search_customers(p_search_query, p_limit, p_include_inactive)`: the rows as the function answers them. */
export async function readCustomerSearch(q: CopyReader, search: string, limit: number, includeInactive: boolean): Promise<CustomerPickerRow[]> {
  const query = search.replace(SPACE_ONLY, '');
  const lower = query.toLowerCase();
  const digits = NUMBER_QUERY.test(query) ? mobileDigits(search) : '';
  const key = mobileKey(digits);
  const afterNinetyOne = digits.startsWith('91') && digits.length > 2 ? `${digits.slice(2)}%` : null;

  // Deactivated customers are listed on request (every copy role may ask); deleted ones never.
  const visible = includeInactive ? 'deleted_at IS NULL' : 'active = 1 AND deleted_at IS NULL';
  const words = query.split(/\s+/);
  const hit = `(? <> '' AND (mobile_digits LIKE ? OR mobile_key LIKE ? OR (? IS NOT NULL AND mobile_key LIKE ?)))`;
  const mobilePrefix = `instr(lower(json_extract(row, '$.mobile')), ?) = 1`;
  const namePrefix = `instr(name_lc, ?) = 1`;
  const found = await q.all<{ row: string; rank: number }>(
    `SELECT row, CASE WHEN ? = '' OR ${namePrefix} OR ${mobilePrefix} OR ${hit} THEN 0 ELSE 1 END AS rank
       FROM customers
      WHERE ${visible}
        AND (? = '' OR ${mobilePrefix} OR ${hit} OR NOT EXISTS (SELECT 1 FROM json_each(?) w WHERE instr(name_lc, w.value) = 0))`,
    [
      lower, lower, lower, digits, `${digits}%`, `${key}%`, afterNinetyOne, afterNinetyOne,
      lower, lower, digits, `${digits}%`, `${key}%`, afterNinetyOne, afterNinetyOne, JSON.stringify(words.map(word => word.toLowerCase())),
    ]
  );
  const rows = found.map(record => ({ rank: record.rank, row: parseRow(record.row) }));
  rows.sort((a, b) => a.rank - b.rank || enCompare(textOf(a.row.name), textOf(b.row.name)) || compareIds(a.row.id, b.row.id));
  return rows.slice(0, limit).map(({ row }) => ({
    id: row.id ?? null,
    name: row.name ?? null,
    mobile: row.mobile ?? null,
    city: row.city ?? null,
    email: row.email ?? null,
    address: row.address ?? null,
    active: row.active ?? null,
    deleted: row.deleted_at !== null && row.deleted_at !== undefined,
  }));
}

const textOf = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const compareIds = (a: unknown, b: unknown): number => {
  const left = String(a);
  const right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
};

/** The recent customers' states (`customers` read directly): a customer the copy does not hold is left out. */
export async function readCustomerStates(q: CopyReader, ids: readonly string[]): Promise<Map<string, { active: boolean; deleted: boolean }>> {
  const found = await q.all<{ row: string }>('SELECT row FROM customers WHERE id IN (SELECT value FROM json_each(?))', [JSON.stringify(ids)]);
  return new Map(
    found.map(record => {
      const row = parseRow(record.row);
      return [String(row.id), { active: row.active !== false, deleted: row.deleted_at !== null && row.deleted_at !== undefined }];
    })
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------------------------------------------

export interface ItemPickerRow {
  id: unknown;
  name: unknown;
  packaging: unknown;
  description: unknown;
  active: unknown;
}

/**
 * `search_items_autocomplete(p_search_query, p_active_only, p_limit)`: the server's `LIMIT` sits on the one row that
 * holds the whole list, so it cuts nothing; neither does this. The typed `%` and `_` are wildcards, as there.
 */
export async function readItemSearch(q: CopyReader, search: string, activeOnly: boolean): Promise<{ items: ItemPickerRow[]; total_count: number }> {
  const contains = likeUnescaped(`%${search}%`);
  const prefix = likeUnescaped(`${search}%`);
  const found = await q.all<{ row: string; rank: number }>(
    `SELECT row, CASE WHEN name_lc ${prefix.sql} THEN 1 WHEN name_lc ${contains.sql} THEN 2 ELSE 3 END AS rank
       FROM items
      WHERE (? = 0 OR active = 1)
        AND (? = '' OR name_lc ${contains.sql} OR packaging_lc ${contains.sql} OR description_lc ${contains.sql})`,
    [prefix.param, contains.param, activeOnly ? 1 : 0, search, contains.param, contains.param, contains.param]
  );
  const rows = found.map(record => ({ rank: record.rank, row: parseRow(record.row) }));
  rows.sort((a, b) => a.rank - b.rank || enCompare(textOf(a.row.name), textOf(b.row.name)) || compareIds(a.row.id, b.row.id));
  return {
    items: rows.map(({ row }) => ({
      id: row.id ?? null,
      name: row.name ?? null,
      packaging: row.packaging ?? null,
      description: row.description ?? null,
      active: row.active ?? null,
    })),
    total_count: rows.length,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Supervisors
// ---------------------------------------------------------------------------------------------------------------

/** The pattern of a LIKE whose typed text is not escaped, as a regular expression over the whole text. */
function likeRegExp(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '\\' && i + 1 < pattern.length) {
      i += 1;
      source += pattern[i].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    } else if (char === '%') {
      source += '[\\s\\S]*';
    } else if (char === '_') {
      source += '[\\s\\S]';
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`, 'iu');
}

export interface SupervisorRow {
  id: unknown;
  name: unknown;
  display_name: unknown;
  role: unknown;
  phone?: unknown;
}

/**
 * `get_supervisors(search_query)`: active staff, supervisors and administrators in name order; an administrator or
 * supervisor also gets each person's mobile as `phone`. An administrator's or supervisor's copy holds `user_profiles`
 * (from the second stage), a staff member's holds `people`.
 */
export async function readSupervisors(q: CopyReader, search: string): Promise<{ success: true; data: SupervisorRow[]; message: null }> {
  const withPhone = q.role !== 'staff';
  const table = withPhone ? 'user_profiles' : 'people';
  const found = await q.all<{ row: string }>(`SELECT row FROM ${table}`);
  // The second stage has not brought the profiles yet: the answer would be a wrong "nobody".
  if (withPhone && q.phase !== 'ready' && found.length === 0) throw new CopyReadError();
  const matcher = search === '' ? null : likeRegExp(`%${search}%`);
  const people = found
    .map(record => parseRow(record.row))
    .filter(row => row.role === 'admin' || row.role === 'supervisor' || row.role === 'staff')
    .filter(row => row.is_service_account !== true && row.active !== false)
    .filter(row => matcher === null || matcher.test(textOf(row.name) ?? ''));
  people.sort((a, b) => enCompare(textOf(a.name), textOf(b.name)) || compareIds(a.id, b.id));
  return {
    success: true,
    data: people.map(row => ({
      id: row.id ?? null,
      name: row.name ?? null,
      display_name: row.display_name ?? null,
      role: row.role ?? null,
      ...(withPhone ? { phone: row.mobile ?? null } : {}),
    })),
    message: null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Rack presets
// ---------------------------------------------------------------------------------------------------------------

/** The `rack_presets` setting as `get_rack_presets` answers it; null when the copy has none (the server is asked). */
export async function readRackPresets(q: CopyReader): Promise<Row> {
  const setting = await q.get<{ row: string }>("SELECT row FROM settings WHERE id = 'rack_presets'");
  if (!setting) throw new CopyReadError();
  return { success: true, ...parseRow(setting.row) };
}
