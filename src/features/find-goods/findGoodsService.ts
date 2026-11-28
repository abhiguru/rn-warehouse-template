/**
 * Find goods (WH-300, product/tech/app-offline-find-goods.md section 2): one search over every lot, answered from the
 * phone copy and never from the server.
 */
import { pgSearchTerms } from '@/features/phone-copy/pgCompat';
import { getSyncSnapshot } from '@/features/phone-copy/syncStore';
import { copyEligible, readCopyOnly } from '@/features/phone-copy/readRoute';
import { readFindGoods, type FindGoodsPage } from '@/features/phone-copy/reads/findGoods';
import type { DataSource } from '@/features/phone-copy/sourced';

export const FIND_GOODS_PAGE = 50;

export type FindGoodsAnswer =
  | { kind: 'page'; page: FindGoodsPage; source: DataSource; copyId: string }
  | { kind: 'not-ready' }
  | { kind: 'failed' };

export async function findGoods(query: string, offset: number): Promise<FindGoodsAnswer> {
  if (!copyEligible()) return { kind: 'not-ready' };
  if (pgSearchTerms(query).length === 0) {
    // Nothing typed: the screen shows its intro, never every lot, and the copy is not opened.
    const { asOf } = getSyncSnapshot();
    return {
      kind: 'page',
      page: { data: [], total_count: 0, limit: FIND_GOODS_PAGE, offset },
      source: { kind: 'copy', asOf: asOf ?? '' },
      copyId: '',
    };
  }
  const result = await readCopyOnly(async q => ({
    page: await readFindGoods(q, { query, limit: FIND_GOODS_PAGE, offset }),
    copyId: q.copyId,
  }));
  if (result.kind !== 'answer') return result;
  const { page, copyId } = result.answer.value;
  return { kind: 'page', page, source: result.answer.source, copyId };
}
