/**
 * Reading the phone copy (WH-298, contract section 10; screens use it from WH-299). Search follows the server's rule
 * and the app's `matchesSearch` (src/features/filters/searchMatch.ts): every word, cut and counted as `searchTerms`
 * does, must be inside at least one of the lot's six columns; `%` and `_` are plain characters.
 */
import { searchTerms } from '@/features/filters/searchMatch';
import { currentCopy } from './copyDb';
import type { CopyDriver, SqlValue } from './copyDriver';
import { isCopyReadable } from './syncEngine';

/** The copy is not readable yet (nothing loaded, or the first load still running): read the server as before. */
export class CopyNotReadableError extends Error {
  constructor() {
    super('the phone copy is not readable');
    this.name = 'CopyNotReadableError';
  }
}

export interface CopyLot {
  lotId: string;
  grId: string;
  grn: Record<string, unknown>;
  lot: Record<string, unknown>;
}
export interface LotCursor {
  date: string;
  grId: string;
  lotId: string;
}

const MAX_ROWS = 50;
const UNIT_SEPARATOR = String.fromCharCode(31);

function readable(): CopyDriver {
  const db = currentCopy();
  if (!db || !isCopyReadable()) throw new CopyNotReadableError();
  return db;
}

const parseRow = (text: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(text);
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
};

/** One FTS5 phrase for a word: on the trigram index a phrase is a substring match. */
const phrase = (word: string): string => `"${word.replace(/"/g, '""')}"`;

export async function searchLots(
  query: string,
  options: { limit?: number; after?: LotCursor | null } = {}
): Promise<{ rows: CopyLot[]; next: LotCursor | null }> {
  const db = readable();
  const limit = Math.max(1, Math.min(options.limit ?? MAX_ROWS, MAX_ROWS));
  const where: string[] = [];
  const params: SqlValue[] = [];
  for (const term of searchTerms(query)) {
    if (term.includes(UNIT_SEPARATOR)) {
      // No column holds it, so nothing matches.
      where.push('0');
    } else if (Array.from(term).length >= 3) {
      where.push('ls.rowid IN (SELECT rowid FROM lot_fts WHERE lot_fts MATCH ?)');
      params.push(phrase(term));
    } else {
      where.push('instr(ls.haystack, ?) > 0');
      params.push(term);
    }
  }
  const after = options.after;
  if (after) {
    where.push("(coalesce(g.date, '') < ? OR (coalesce(g.date, '') = ? AND (g.id > ? OR (g.id = ? AND t.id > ?))))");
    params.push(after.date, after.date, after.grId, after.grId, after.lotId);
  }
  params.push(limit + 1);
  const found = await db.all<{ lot_id: string; gr_id: string; d: string; grn_row: string; lot_row: string }>(
    `SELECT ls.lot_id, ls.gr_id, coalesce(g.date, '') AS d, g.row AS grn_row, t.row AS lot_row
       FROM lot_search ls JOIN goodsreceived g ON g.id = ls.gr_id JOIN goodsreceived_trl t ON t.id = ls.lot_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY d DESC, g.id, t.id LIMIT ?`,
    params
  );
  const page = found.slice(0, limit);
  const last = page[page.length - 1];
  return {
    rows: page.map(r => ({ lotId: r.lot_id, grId: r.gr_id, grn: parseRow(r.grn_row), lot: parseRow(r.lot_row) })),
    next: found.length > limit && last ? { date: last.d, grId: last.gr_id, lotId: last.lot_id } : null,
  };
}

/** One GRN with its lots, photos and lock state, as the server sent them; null when the copy has no such GRN. */
export async function readGrn(id: string): Promise<{
  grn: Record<string, unknown>;
  lots: Record<string, unknown>[];
  images: Record<string, unknown>[];
  lock: Record<string, unknown> | null;
} | null> {
  const db = readable();
  const [grn] = await db.all<{ row: string }>('SELECT row FROM goodsreceived WHERE id = ?', [id]);
  if (!grn) return null;
  const lots = await db.all<{ row: string }>('SELECT row FROM goodsreceived_trl WHERE gr_id = ? ORDER BY id', [id]);
  const images = await db.all<{ row: string }>('SELECT row FROM grn_images WHERE grn_id = ? ORDER BY id', [id]);
  const [lock] = await db.all<{ row: string }>('SELECT row FROM grn_lock WHERE id = ?', [id]);
  return {
    grn: parseRow(grn.row),
    lots: lots.map(r => parseRow(r.row)),
    images: images.map(r => parseRow(r.row)),
    lock: lock ? parseRow(lock.row) : null,
  };
}

/** One of the facility's settings, as the server sent it; null when the copy has none. */
export async function readSetting(key: 'rack_presets' | 'numbering' | 'charging_rule'): Promise<unknown> {
  const db = readable();
  const [setting] = await db.all<{ row: string }>('SELECT row FROM settings WHERE id = ?', [key]);
  return setting ? parseRow(setting.row) : null;
}
