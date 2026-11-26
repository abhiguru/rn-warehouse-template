/**
 * `get_items` and `get_item` over the phone copy (WH-348, product/tech/app-offline-read-more.md section 0): the server's
 * `data`, key for key, for an administrator, a supervisor or staff (the pickers read items for every role). Their text is
 * the baseline function with migration 114, as installed on temp1.
 */
import { enCompare, likeUnescaped } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { parseRow, pick, textOf, type Row } from './rows';

export interface ItemListRequest {
  search: string | null;
  /** `p_active_only`: true lists only active items. */
  activeOnly: boolean;
  limit: number;
  offset: number;
}

export interface ItemListData {
  items: Row[];
  total_count: number;
  limit: number;
  offset: number;
}

const itemOf = (row: Row): Row => ({
  id: pick(row, 'id'), name: pick(row, 'name'), packaging: pick(row, 'packaging'), description: pick(row, 'description'),
  active: pick(row, 'active'),
});

export async function readItemList(q: CopyReader, request: ItemListRequest): Promise<ItemListData> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (request.activeOnly) where.push('active = 1');
  // The service sends an empty search as no search (`|| null`), so the empty text filters nothing.
  if (request.search) {
    // The server's ILIKE leaves `%` and `_` in the search as wildcards.
    const like = likeUnescaped(`%${request.search}%`);
    where.push(`(name_lc ${like.sql} OR description_lc ${like.sql} OR packaging_lc ${like.sql})`);
    params.push(like.param, like.param, like.param);
  }
  const found = await q.all<{ row: string }>(`SELECT row FROM items${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`, params);
  const rows = found.map(record => parseRow(record.row));
  // ORDER BY name: the database's en_US order, with the id as a fixed end.
  rows.sort((a, b) => enCompare(textOf(a.name), textOf(b.name)) || enCompare(textOf(a.id), textOf(b.id)));
  const offset = Math.max(request.offset, 0);
  return { items: rows.slice(offset, offset + request.limit).map(itemOf), total_count: rows.length, limit: request.limit, offset: request.offset };
}

/** One item as `get_item` answers it; null when there is none (the server answers `success: false`). */
export async function readItem(q: CopyReader, itemId: string): Promise<Row | null> {
  const found = await q.get<{ row: string }>('SELECT row FROM items WHERE id = ?', [itemId]);
  return found ? itemOf(parseRow(found.row)) : null;
}
