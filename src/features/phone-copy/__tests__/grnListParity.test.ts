/**
 * WH-299, spec criterion 3 and contract product/tech/app-offline-read-from-copy.md sections 4, 7.1, 7.3 and 13 (P1, P2,
 * C1 to C4): the GRN list and its search answered from the phone copy give the rows, order, counts and totals that
 * `get_all_grn_items` (backend cd9531e) gives for the same request.
 *
 * The expected answers are worked out by hand from that function's SQL over the small warehouse of grnDataset.ts; they
 * are not the golden answers of section 8 (those need the export from a real server, which does not exist yet).
 *
 * Real: the sync engine, the copy, the services (so routing and shaping are covered). Faked at the edge: the server's
 * answers and the phone's native modules. No read may reach the server: every case checks it.
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - A copy answer is today's service result plus `source`; `data.aggregations` carries the server's `total_qty`,
 *    `total_stock` and `total_weight`.
 *  - `pgSearchTerms(query)` in `@/features/phone-copy/pgCompat` answers the words, lower-cased, as `search_terms` cuts them.
 * ==================================
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { ALL_LOTS, GRNS, LOTS, grnFeedRow, grnNamed, lockRow, lotNamed, seedWarehouse, serverRow } from '@/tests/phoneCopy/grnDataset';
import { bootWarehouse, copySource, goOffline, loadCopy, loadUpTo, sourceOf, type Role, type Warehouse } from '@/tests/phoneCopy/wh299Phone';
import { matchesSearch, searchTerms } from '@/features/filters/searchMatch';
import type { GRNListParams } from '@/services/grn-service';
import type { FilterContext } from '@/features/filters/types';

beforeEach(() => {
  resetEnv();
  seedWarehouse();
});
afterEach(async () => { await eraseEverything(); });

type Service = typeof import('@/services/grn-service');
const grnService = () => require('@/services/grn-service') as Service;

async function ready(role: Role = 'staff') {
  const w = await bootWarehouse({ role });
  await loadCopy(w);
  return w;
}
/** The list's read, which must have been answered by the copy alone. */
async function list(w: Warehouse, params: GRNListParams = {}) {
  const result = await grnService().getAllGRNItems({ p_limit: 50, p_offset: 0, ...params });
  expect(w.serverCalls).toEqual([]);
  expect(sourceOf(result)).toEqual(copySource());
  return result;
}
const lotIds = (result: Awaited<ReturnType<Service['getAllGRNItems']>>) => result.data.items.map(item => item.grn_item_id);
const sortedIds = (result: Awaited<ReturnType<Service['getAllGRNItems']>>) => lotIds(result).sort();
const sums = (ids: readonly string[]) => ({
  total_qty: ids.reduce((n, id) => n + lotNamed(id).qty, 0),
  total_stock: ids.reduce((n, id) => n + lotNamed(id).stock, 0),
  total_weight: ids.reduce((n, id) => n + (lotNamed(id).weight ?? 0), 0),
});
/** A sync that brings these changes. */
async function syncChanges(w: Warehouse, changes: unknown[]) {
  env.feed.changeAnswers.push({ position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [], changes: changes as never });
  expect(await w.phone.engine.syncNow('pull-to-refresh')).toBe('done');
}

describe('P1: rows and their shape', () => {
  it.each(['admin', 'supervisor', 'staff'] as const)('%s: every row has the server\'s keys and values, newest date first', async role => {
    const w = await ready(role);
    const result = await list(w);
    expect(result.success).toBe(true);
    // date desc; equal dates by GRN number in en_US order ascending; lines of one number by lot id.
    expect(result.data.items).toStrictEqual(['l08', 'l07', 'l05', 'l06', 'l04', 'l02', 'l03', 'l01'].map(serverRow));
    expect(result.data.pagination).toMatchObject({ total_count: 8, limit: 50, offset: 0, has_more: false, unit: 'line' });
    expect(result.data.aggregations).toEqual({ total_qty: 376, total_stock: 69, total_weight: 246 });
  });

  it('a GRN the server has soft-deleted is still listed, as get_all_grn_items has no deleted_at filter', async () => {
    const gone = { ...grnNamed('B1'), deleted_at: '2026-11-24T05:00:00+00:00' };
    env.feed.rows.goodsreceived = env.feed.rows.goodsreceived.map(r => (r.id === gone.id ? { id: r.id, row: grnFeedRow(gone) } : r));
    const w = await ready('admin');
    expect(sortedIds(await list(w))).toEqual(ALL_LOTS);
  });
});

describe('P1: order', () => {
  it.each([
    ['date ascending: ties by number, still ascending', 'date', 'asc', ['l01', 'l04', 'l02', 'l03', 'l05', 'l06', 'l07', 'l08']],
    // X, Y, Z before A; upper and lower case share a letter's rank; every other prefix after the letters.
    ['GRN number ascending (the document number key)', 'gr_no', 'asc', ['l01', 'l02', 'l03', 'l04', 'l05', 'l06', 'l07', 'l08']],
    ['GRN number descending', 'gr_no', 'desc', ['l08', 'l07', 'l06', 'l05', 'l04', 'l02', 'l03', 'l01']],
    // en_US, not byte order: "asha" comes before "Bhavin".
    ['customer name ascending', 'customer_name', 'asc', ['l02', 'l03', 'l06', 'l08', 'l04', 'l05', 'l07', 'l01']],
    ['customer name descending', 'customer_name', 'desc', ['l07', 'l01', 'l04', 'l05', 'l02', 'l03', 'l06', 'l08']],
    ['bags received descending', 'qty', 'desc', ['l04', 'l02', 'l03', 'l06', 'l01', 'l07', 'l05', 'l08']],
    ['stock ascending', 'stock', 'asc', ['l02', 'l05', 'l08', 'l07', 'l06', 'l01', 'l03', 'l04']],
  ] as const)('%s', async (_name, p_sort_by, p_sort_order, expected) => {
    const w = await ready();
    expect(lotIds(await list(w, { p_sort_by, p_sort_order }))).toEqual(expected);
  });
});

describe('P1: pages, counts and totals', () => {
  it('line pages: the offset counts lines, and a later page keeps the totals of the whole list', async () => {
    const w = await ready();
    const first = await list(w, { p_limit: 3 });
    const second = await list(w, { p_limit: 3, p_offset: 3 });
    const last = await list(w, { p_limit: 3, p_offset: 6 });
    expect(lotIds(first)).toEqual(['l08', 'l07', 'l05']);
    expect(lotIds(second)).toEqual(['l06', 'l04', 'l02']);
    expect(lotIds(last)).toEqual(['l03', 'l01']);
    for (const page of [first, second, last]) {
      expect(page.data.pagination.total_count).toBe(8);
      expect(page.data.aggregations).toEqual({ total_qty: 376, total_stock: 69, total_weight: 246 });
    }
    expect([first, second, last].map(p => p.data.pagination.has_more)).toEqual([true, true, false]);
  });

  it('receipt pages: limit, offset and count are GRNs, and a page holds every line of its GRNs', async () => {
    const w = await ready();
    const page = (p_offset: number) => list(w, { p_filters: { page_by: 'receipt' }, p_sort_by: 'gr_no', p_sort_order: 'desc', p_limit: 2, p_offset });
    const [first, second, third, last] = [await page(0), await page(2), await page(4), await page(6)];
    expect(lotIds(first)).toEqual(['l08', 'l07']);
    expect(lotIds(second)).toEqual(['l06', 'l05']);
    expect(lotIds(third)).toEqual(['l04', 'l02', 'l03']);
    expect(lotIds(last)).toEqual(['l01']);
    expect(third.data.pagination).toMatchObject({ total_count: 7, limit: 2, offset: 4, has_more: true, unit: 'receipt' });
    expect(third.data.aggregations).toEqual({ total_qty: 376, total_stock: 69, total_weight: 246 });
    expect(last.data.pagination.has_more).toBe(false);
  });

  it('receipt pages by date: GRNs of one date in number order, a microsecond apart in time order', async () => {
    const w = await ready();
    const result = await list(w, { p_filters: { page_by: 'receipt' }, p_sort_by: 'date', p_sort_order: 'desc', p_limit: 3 });
    expect(lotIds(result)).toEqual(['l08', 'l07', 'l05']);
  });

  it('refuses a line sort with receipt pages, as the server does', async () => {
    const w = await ready();
    const result = await grnService().getAllGRNItems({ p_filters: { page_by: 'receipt' }, p_sort_by: 'item_name' });
    expect(w.serverCalls).toEqual([]);
    expect(result.success).toBe(false);
    expect(result.data.items).toEqual([]);
  });

  it('nothing matches: no rows, a count of 0 and totals of 0', async () => {
    const w = await ready();
    const result = await list(w, { p_filters: { search: 'zzzz' } });
    expect(result.success).toBe(true);
    expect(result.data.items).toEqual([]);
    expect(result.data.pagination).toMatchObject({ total_count: 0, has_more: false });
    expect(result.data.aggregations).toEqual({ total_qty: 0, total_stock: 0, total_weight: 0 });
  });
});

describe('P1: every filter', () => {
  it.each<[string, GRNListParams, string[]]>([
    ['out of stock', { p_filters: { stock_status: 'out_of_stock' } }, ['l02']],
    ['in stock', { p_filters: { stock_status: 'in_stock' } }, ['l01', 'l03', 'l04', 'l05', 'l06', 'l07', 'l08']],
    // under a fifth of the bags received: 19 of 100 and 9 of 50; not 20 of 100, not 1 of 5.
    ['low stock', { p_filters: { stock_status: 'low_stock' } }, ['l03', 'l06']],
    ['customers', { p_filters: { customer_ids: ['c1'] } }, ['l02', 'l03', 'l06', 'l08']],
    ['two customers', { p_filters: { customer_ids: ['c2', 'c3'] } }, ['l01', 'l04', 'l05', 'l07']],
    ['items', { p_filters: { item_ids: ['i3'] } }, ['l05', 'l07']],
    ['GRN ids', { p_filters: { grn_ids: ['g-A2'] } }, ['l02', 'l03']],
    ['weight between, both ends included', { p_filters: { weight_min: 25, weight_max: 50 } }, ['l01', 'l02', 'l03', 'l04', 'l06']],
    ['weight from', { p_filters: { weight_min: 40 } }, ['l01', 'l04', 'l07']],
    ['weight to (a lot with no weight is left out)', { p_filters: { weight_max: 25 } }, ['l02', 'l08']],
    ['package mark, any case', { p_filters: { package_mark: 'pk' } }, ['l01', 'l02', 'l06']],
    ['package mark "%" is a plain character', { p_filters: { package_mark: '%' } }, ['l03']],
    ['package mark "_" is a plain character', { p_filters: { package_mark: '_' } }, ['l03']],
    ['package mark "\\" is a plain character', { p_filters: { package_mark: '\\' } }, ['l05']],
    ['GRN number between', { p_filters: { gr_no_from: 'A2', gr_no_to: 'B1' } }, ['l02', 'l03', 'l04', 'l05', 'l06']],
    ['GRN number from', { p_filters: { gr_no_from: 'B1' } }, ['l06', 'l07', 'l08']],
    ['GRN number to', { p_filters: { gr_no_to: 'A10' } }, ['l01', 'l02', 'l03', 'l04']],
    ['GRN number range the wrong way round', { p_filters: { gr_no_from: 'A10', gr_no_to: 'A2' } }, []],
    ['one Indian day', { p_date_from: '2026-11-21T00:00:00+05:30', p_date_to: '2026-11-21T23:59:59.999+05:30' }, ['l05', 'l06']],
    ['from a moment, to the microsecond', { p_date_from: '2026-11-22T10:30:00.000002+05:30' }, ['l08']],
    ['to a moment, to the microsecond', { p_date_from: '2026-11-22T00:00:00+05:30', p_date_to: '2026-11-22T10:30:00.000001+05:30' }, ['l07']],
    ['Invoiced', { p_filters: { invoiced: true } }, ['l01']],
    ['Not invoiced (a partly invoiced GRN is not one)', { p_filters: { invoiced: false } }, ['l04', 'l05', 'l06', 'l07', 'l08']],
    ['Partly invoiced', { p_filters: { invoiced: 'partly_invoiced' } }, ['l02', 'l03']],
    ['two filters together', { p_filters: { customer_ids: ['c1'], stock_status: 'low_stock' } }, ['l03', 'l06']],
    ['a filter and a search', { p_filters: { item_ids: ['i1'], search: 'asha' } }, ['l02', 'l06', 'l08']],
  ])('%s', async (_name, params, expected) => {
    const w = await ready();
    const result = await list(w, params);
    expect(sortedIds(result)).toEqual(expected);
    expect(result.data.pagination.total_count).toBe(expected.length);
    expect(result.data.aggregations).toEqual(sums(expected));
  });

  it('the result count of the filter sheet counts GRNs from the copy', async () => {
    const w = await ready();
    const { GRN_FILTERS } = require('@/features/filters/configs/grn') as typeof import('@/features/filters/configs/grn');
    const ctx = { isWarehouseRole: true, assignedCustomers: [] } as unknown as FilterContext;
    expect(await GRN_FILTERS.fetchCount!({ p_filters: { customer_ids: ['c1'] } }, ctx)).toBe(3);
    expect(await GRN_FILTERS.fetchCount!({ p_filters: { stock_status: 'in_stock' } }, ctx)).toBe(7);
    expect(w.serverCalls).toEqual([]);
  });

  it('the list screen\'s read is answered by the copy', async () => {
    const w = await ready();
    const result = await grnService().getGRNListPage({ p_limit: 2, p_offset: 0, p_filters: { page_by: 'receipt' }, p_sort_by: 'gr_no', p_sort_order: 'asc' }, null);
    expect(w.serverCalls).toEqual([]);
    expect(sourceOf(result)).toEqual(copySource());
    expect(lotIds(result)).toEqual(['l01', 'l02', 'l03']);
    expect(result.fromCache).toBeUndefined();
  });
});

describe('P2: search finds the rows the server finds', () => {
  it.each<[string, string, string[]]>([
    ['one character', '9', ['l01', 'l06']],
    ['two characters', 'pk', ['l01', 'l02', 'l06']],
    ['two characters inside a word', 'ea', ['l01', 'l02', 'l03', 'l04', 'l06', 'l08']],
    ['an item, upper case', 'PEAS', ['l01', 'l02', 'l06', 'l08']],
    ['two words in different columns', 'ASHA peas', ['l02', 'l06', 'l08']],
    ['part of a vehicle number', 'gj01', ['l02', 'l03']],
    ['a rack', 'c-1', ['l04']],
    ['a GRN number', 'gr-1', ['l08']],
    ['part of a longer GRN number', 'a10', ['l04']],
    ['"%" is a plain character', '%', ['l03']],
    ['"_" is a plain character', '_', ['l03']],
    ['"\\" is a plain character', '\\', ['l05']],
    ['"%" inside a word is not a wildcard', 'p%k', []],
    ['Gujarati', 'ગ-5', ['l07']],
    ['one word found and one not', 'peas zzzz', []],
    ['two columns are not run together', 'peaspk', []],
    ['spaces only', '   ', ['l01', 'l02', 'l03', 'l04', 'l05', 'l06', 'l07', 'l08']],
    ['the ninth word is not read', 'peas asha pk b-2 gj01 a2 s e zzzz', ['l02']],
    ['text after 120 characters is not read', `rice${' '.repeat(120)}zzzz`, ['l05', 'l07']],
  ])('%s: "%s"', async (_name, query, expected) => {
    const w = await ready();
    const result = await list(w, { p_filters: { search: query } });
    expect(sortedIds(result)).toEqual(expected);
    expect(result.data.aggregations).toEqual(sums(expected));
    // The app's own rule (searchMatch.ts) agrees on these queries.
    const byApp = LOTS.filter(l => {
      const g = GRNS.find(x => x.id === l.gr_id)!;
      return matchesSearch(searchTerms(query), [g.gr_no, g.customer_name, l.item_name, l.package_mark, l.rack, g.registration]);
    }).map(l => l.id);
    expect(byApp).toEqual(expected);
  });

  it('counts the 120 characters as the server does: characters, not UTF-16 units', async () => {
    // 55 two-unit characters and 10 spaces are 120 UTF-16 units but 65 characters: the server still reads "zzzz".
    const mark = '\u{1F95C}'.repeat(55);
    env.feed.rows.goodsreceived_trl.push({ id: 'l09', row: { ...lotNamed('l01'), id: 'l09', package_mark: mark } });
    const w = await ready();
    expect(lotIds(await list(w, { p_filters: { search: mark } }))).toEqual(['l09']);
    expect(lotIds(await list(w, { p_filters: { search: `${mark}${' '.repeat(10)}zzzz` } }))).toEqual([]);
  });

  describe('pgSearchTerms', () => {
    const pgSearchTerms = (query: string): string[] =>
      (require('@/features/phone-copy/pgCompat') as { pgSearchTerms: (q: string) => string[] }).pgSearchTerms(query);

    it('answers at most 8 lower-cased words, split at any white space', () => {
      expect(pgSearchTerms('  Peas\tASHA\n pk  ')).toEqual(['peas', 'asha', 'pk']);
      expect(pgSearchTerms('a b c d e f g h i j')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
      expect(pgSearchTerms('50%_ x\\y')).toEqual(['50%_', 'x\\y']);
      expect(pgSearchTerms('')).toEqual([]);
    });

    it('cuts at 120 characters, counting a two-unit character once', () => {
      const word = '\u{1F95C}'.repeat(61);
      expect(pgSearchTerms(`${word} abc`)).toEqual([word, 'abc']);
      expect(pgSearchTerms('\u{1F95C}'.repeat(130))).toEqual(['\u{1F95C}'.repeat(120)]);
    });
  });
});

describe('changes reach the list (C1 to C4)', () => {
  const upsert = (e: string, id: string, row: unknown) => ({ e, id, op: 'upsert', v: 'a3f09c2b11d4e5f6', row });

  it('C1: a changed rack is found by the new one and not by the old one', async () => {
    const w = await ready();
    expect(lotIds(await list(w, { p_filters: { search: 'c-1' } }))).toEqual(['l04']);
    await syncChanges(w, [upsert('goodsreceived_trl', 'l04', { ...lotNamed('l04'), rack: 'Z-9' })]);
    expect(lotIds(await list(w, { p_filters: { search: 'c-1' } }))).toEqual([]);
    const found = await list(w, { p_filters: { search: 'z-9' } });
    expect(found.data.items).toEqual([{ ...serverRow('l04'), rack: 'Z-9' }]);
  });

  it('C2: a GRN moved to another customer follows the customer filter and the name order', async () => {
    const w = await ready();
    await list(w, { p_sort_by: 'customer_name', p_sort_order: 'asc' });
    const moved = { ...grnNamed('B1'), customer_id: 'c4', customer_name: 'Aarav Depot' };
    await syncChanges(w, [upsert('goodsreceived', moved.id, grnFeedRow(moved))]);
    expect(lotIds(await list(w, { p_filters: { customer_ids: ['c4'] } }))).toEqual(['l06']);
    expect(sortedIds(await list(w, { p_filters: { customer_ids: ['c1'] } }))).toEqual(['l02', 'l03', 'l08']);
    // A name the copy had not seen takes its place in the en_US order: first.
    expect(lotIds(await list(w, { p_sort_by: 'customer_name', p_sort_order: 'asc' }))[0]).toBe('l06');
  });

  it('C3: a deleted GRN is gone from the list, the search and the count', async () => {
    const w = await ready();
    await syncChanges(w, [{ e: 'goodsreceived', id: 'g-A2', op: 'delete' }]);
    const all = await list(w);
    expect(sortedIds(all)).toEqual(['l01', 'l04', 'l05', 'l06', 'l07', 'l08']);
    expect(all.data.pagination.total_count).toBe(6);
    expect(lotIds(await list(w, { p_filters: { search: 'gj01' } }))).toEqual([]);
  });

  it('C4: an issued invoice changes invoice_state and the Invoicing filter', async () => {
    const w = await ready();
    await syncChanges(w, [upsert('grn_lock', 'g-B1', lockRow(grnNamed('B1'), 'invoiced'))]);
    const invoiced = await list(w, { p_filters: { invoiced: true } });
    expect(sortedIds(invoiced)).toEqual(['l01', 'l06']);
    expect(invoiced.data.items.map(i => (i as { invoice_state?: string }).invoice_state)).toEqual(['invoiced', 'invoiced']);
    expect(sortedIds(await list(w, { p_filters: { invoiced: false } }))).toEqual(['l04', 'l05', 'l07', 'l08']);
  });
});

describe('DS2: offline while older records load', () => {
  it('lists the GRNs with no invoice state, since the copy does not hold it yet', async () => {
    const w = await bootWarehouse();
    const load = await loadUpTo(w, 'dispatch');
    await goOffline(w);
    const result = await list(w);
    expect(sortedIds(result)).toEqual(ALL_LOTS);
    expect(result.data.items.map(i => (i as { invoice_state?: string | null }).invoice_state ?? null))
      .toEqual(ALL_LOTS.map(() => null));
    await load.finish();
  });
});
