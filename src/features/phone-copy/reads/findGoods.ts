/**
 * Find goods over the phone copy (WH-300, product/tech/app-offline-find-goods.md section 3): the lots `get_all_grn_items`
 * answers for one search, with the lots that still have stock first, then the empty ones; each group newest GRN first.
 * Rows are in the server's shape, with the stock net of this phone's unsent work.
 */
import type { GRNItem } from '@/services/grn-service';
import { pgSearchTerms } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { getUnsentOverlay } from '../unsentOverlay';
import { conditionsOf, LINE_COLUMNS, LOCK_JOIN, linesFrom, listRow, totalsOf, where, type LineRecord } from './grnItems';

export interface FindGoodsPage {
  /** Exactly `get_all_grn_items`' row shape, stock net of the overlay. */
  data: GRNItem[];
  /** Lots matching, empty ones included; counted on the first page and kept for the later ones. */
  total_count: number;
  limit: number;
  offset: number;
}

export async function readFindGoods(q: CopyReader, req: { query: string; limit: number; offset: number }): Promise<FindGoodsPage> {
  const { query, limit, offset } = req;
  if (pgSearchTerms(query).length === 0) return { data: [], total_count: 0, limit, offset };
  const params = { p_filters: { search: query } };
  const c = conditionsOf(params);
  await q.rank(['gr_no']);
  // Lot id to the bags taken off it: the group a lot falls in follows the number shown.
  const deductions = JSON.stringify(Object.fromEntries(getUnsentOverlay().deductions()));
  const records = await q.all<LineRecord>(
    `SELECT ${LINE_COLUMNS} ${linesFrom(c)}
       LEFT JOIN text_rank rn ON rn.kind = 'gr_no' AND rn.value = g.gr_no
       ${LOCK_JOIN}
       LEFT JOIN json_each(?) dd ON dd.key = t.id
       ${where([...c.grn.sql, ...c.lot.sql])}
      ORDER BY CASE WHEN t.stock - COALESCE(dd.value, 0) > 0 THEN 0 ELSE 1 END, g.date_us DESC NULLS FIRST, rn.rank, t.id
      LIMIT ? OFFSET ?`,
    [deductions, ...c.grn.params, ...c.lot.params, limit, offset]
  );
  // After the ranks are up to date, so writing them does not make a first page's count look old.
  const totals = await totalsOf(q, params, c, offset);
  return { data: records.map(listRow), total_count: totals.lines, limit, offset };
}
