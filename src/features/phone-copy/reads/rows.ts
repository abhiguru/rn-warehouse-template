/**
 * Small helpers the copy's readers share (WH-299): rows are the server's JSON, kept as text.
 */
import { enCompare, parseTimestampUs } from '../pgCompat';

export type Row = Record<string, unknown>;

export const parseRow = (text: string): Row => JSON.parse(text) as Row;
export const parseRows = (records: readonly { row: string }[]): Row[] => records.map(r => parseRow(r.row));

/** The row's value, or null when it has none (the server's JSON writes SQL nulls). */
export const pick = (from: Row | null | undefined, key: string): unknown => from?.[key] ?? null;

export const textOf = (value: unknown): string | null => (typeof value === 'string' ? value : null);
export const numberOf = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** A list of ids as one parameter. */
export const IN_LIST = 'IN (SELECT value FROM json_each(?))';

/** ORDER BY a, b with a missing value last, as Postgres sorts ascending. */
export function compareNullsLast<T>(a: T | null, b: T | null, compare: (x: T, y: T) => number): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return compare(a, b);
}
export const compareNumbers = (a: number, b: number): number => a - b;
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A photo row's order: `display_order`, then `created_at`, then the id (a stable end). */
export function comparePhotos(a: Row, b: Row): number {
  return (
    compareNullsLast(numberOf(a.display_order), numberOf(b.display_order), compareNumbers) ||
    compareNullsLast(parseTimestampUs(textOf(a.created_at)), parseTimestampUs(textOf(b.created_at)), compareNumbers) ||
    compareText(String(a.id), String(b.id))
  );
}

/** The distinct texts, in the server's en_US order. */
export const distinctSorted = (values: readonly (string | null)[]): string[] =>
  [...new Set(values.filter((value): value is string => value !== null))].sort(enCompare);

/** A sum of figures the server holds with two decimals: no float dust. */
export const sumMoney = (values: readonly number[]): number => Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;

/** The keys no read may answer to a customer account (WH-306 contract 14 item 3): the server's `strip_staff_keys` list. */
const STAFF_ONLY_KEYS: ReadonlySet<string> = new Set([
  'created_by', 'updated_by', 'deleted_by', 'supervisor_id', 'sender_id', 'import_batch_id', 'uploaded_by',
  'created_by_name', 'updated_by_name', 'updated_by_display_name', 'user_access',
  'created_by_info', 'created_by_display_name', 'created_by_role',
  'cancelled_by', 'cancelled_by_name', 'ignored_by', 'discount_set_by', 'zero_charge_set_by',
]);

function withoutStaffKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutStaffKeys);
  if (value === null || typeof value !== 'object') return value;
  const own: Row = {};
  for (const [key, inner] of Object.entries(value)) {
    if (!STAFF_ONLY_KEYS.has(key)) own[key] = withoutStaffKeys(inner);
  }
  return own;
}

/** What a read answers to this role: for a customer account, the answer with the staff-only keys left out at any depth, as the server does. */
export const answerFor = <T>(role: string, value: T): T => (role === 'customer' ? (withoutStaffKeys(value) as T) : value);
