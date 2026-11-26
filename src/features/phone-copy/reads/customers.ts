/**
 * The customer reads over the phone copy (WH-348, product/tech/app-offline-read-more.md section 0): the list, the two head
 * counts and one customer, as the `customers` table answers them through PostgREST for an administrator, a supervisor or
 * staff. Those roles read every row of the table (the starter_staff and starter_grn_staff_read policies), so none is left
 * out here. Rows come back as the server stores them.
 */
import { enCompare, parseTimestampUs } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { compareNullsLast, compareNumbers, parseRow, pick, textOf, type Row } from './rows';

export interface CustomerListRequest {
  search?: string;
  /** null or undefined: every customer; true: active only; false: deactivated only. */
  active?: boolean | null;
  city?: string;
  sortBy: 'name' | 'created_at' | 'city' | 'mobile';
  sortOrder: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export interface CustomerListData {
  rows: Row[];
  count: number;
}

const LIST_KEYS = ['id', 'name', 'mobile', 'city', 'email', 'address', 'active'] as const;

/** `column ILIKE '%text%'` with the text taken literally. */
const contains = (value: unknown, termLc: string): boolean => textOf(value)?.toLowerCase().includes(termLc) === true;

export async function readCustomerList(q: CopyReader, request: CustomerListRequest): Promise<CustomerListData> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (request.active !== null && request.active !== undefined) {
    where.push('active = ?');
    params.push(request.active ? 1 : 0);
  }
  const found = await q.all<{ row: string }>(`SELECT row FROM customers${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`, params);
  const search = request.search?.toLowerCase();
  const city = request.city?.toLowerCase();
  const rows = found
    .map(record => parseRow(record.row))
    .filter(row => (search ? contains(row.name, search) || contains(row.mobile, search) : true) && (city ? contains(row.city, city) : true));
  const sign = request.sortOrder === 'asc' ? 1 : -1;
  // Postgres puts a missing value last when ascending and first when descending.
  const nulls = (a: unknown, b: unknown): number | null =>
    a === null || a === undefined || b === null || b === undefined ? sign * ((a ?? null) === (b ?? null) ? 0 : a === null || a === undefined ? 1 : -1) : null;
  rows.sort((a, b) => {
    const x = a[request.sortBy];
    const y = b[request.sortBy];
    const missing = nulls(x, y);
    if (missing !== null) return missing;
    if (request.sortBy === 'created_at') {
      return sign * compareNullsLast(parseTimestampUs(textOf(x)), parseTimestampUs(textOf(y)), compareNumbers);
    }
    return sign * enCompare(textOf(x), textOf(y));
  });
  const page = rows.slice(request.offset, request.offset + request.limit);
  return { rows: page.map(row => Object.fromEntries(LIST_KEYS.map(key => [key, pick(row, key)]))), count: rows.length };
}

/** The two head counts of the customers table: active and deactivated. */
export async function readCustomerCounts(q: CopyReader): Promise<{ active: number; inactive: number }> {
  const count = async (active: number): Promise<number> => (await q.get<{ n: number }>('SELECT COUNT(*) AS n FROM customers WHERE active = ?', [active]))?.n ?? 0;
  return { active: await count(1), inactive: await count(0) };
}

/** `select('*')` of one customer; null when the table has no such row. */
export async function readCustomerById(q: CopyReader, customerId: string): Promise<Row | null> {
  const found = await q.get<{ row: string }>('SELECT row FROM customers WHERE id = ?', [customerId]);
  return found ? parseRow(found.row) : null;
}
