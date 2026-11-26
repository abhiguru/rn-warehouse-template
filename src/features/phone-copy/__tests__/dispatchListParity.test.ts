/**
 * WH-299 slice 4, contract product/tech/app-offline-read-from-copy.md sections 7.2 and 13 (P3, C1): the Dispatch list from
 * the copy finds, filters, orders and pages as `get_dispatch_list_with_items` does.
 *
 * Real: the service, the sync engine, the copy. Faked at the edge: the server's answers and the phone's native modules.
 * Expected rows are derived by hand from the function's text (backend cd9531e: migration 125 with the patches of 131,
 * 133, 138 and 191). They are not a comparison with a server; the golden export is still unwritten.
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { lotNamed, seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { seedDocuments } from '@/tests/phoneCopy/documentsDataset';
import { bootWarehouse, copySource, loadCopy, sourceOf, type Warehouse } from '@/tests/phoneCopy/wh299Phone';

beforeEach(() => {
  resetEnv();
  seedWarehouse();
  seedDocuments();
});
afterEach(async () => { await eraseEverything(); });

type Params = Record<string, unknown>;
const list = (params: Params = {}) =>
  (require('@/services/dispatch-service') as typeof import('@/services/dispatch-service')).getDispatchListWithItems(params as never);

async function ready() {
  const w = await bootWarehouse({ role: 'admin' });
  await loadCopy(w);
  return w;
}
/** The numbers of the answer's dispatches, from the copy and with nothing asked of the server. */
async function numbers(w: Warehouse, params: Params = {}) {
  const result = await list(params);
  expect(w.serverCalls).toEqual([]);
  expect(sourceOf(result)).toEqual(copySource());
  return result.data.dispatches.map(d => d.disp_no);
}

describe('P3: order', () => {
  it.each<[string, Params, string[]]>([
    ['by default, newest date first, then number downwards, no date last', {}, ['D3', 'D2', 'D1', 'D10', 'D4']],
    ['date upwards, no date still last', { p_sort_by: 'dispatch_date', p_sort_order: 'asc' }, ['D10', 'D1', 'D2', 'D3', 'D4']],
    ['number upwards, as numbers', { p_sort_by: 'disp_no', p_sort_order: 'asc' }, ['D1', 'D2', 'D3', 'D4', 'D10']],
    ['number downwards', { p_sort_by: 'disp_no', p_sort_order: 'desc' }, ['D10', 'D4', 'D3', 'D2', 'D1']],
    ['customer upwards, en_US, then newest first', { p_sort_by: 'customer_name', p_sort_order: 'asc' }, ['D3', 'D1', 'D2', 'D4', 'D10']],
    ['customer downwards, still newest first within one', { p_sort_by: 'customer_name', p_sort_order: 'desc' }, ['D10', 'D2', 'D4', 'D3', 'D1']],
  ])('%s', async (_name, params, expected) => {
    const w = await ready();
    expect(await numbers(w, params)).toEqual(expected);
  });
});

describe('P3: search, every word on the dispatch or one of its lines', () => {
  it.each<[string, string, string[]]>([
    ['the customer', 'ASHA', ['D3', 'D1']],
    ['the dispatch number, anywhere in it', 'd1', ['D1', 'D10']],
    ['the vehicle, two characters', 'gj', ['D1']],
    ['an item of a line', 'peas', ['D3', 'D1', 'D10']],
    ['a package mark', 'pk-9', ['D3']],
    ['a rack', 'e-5', ['D4']],
    ['a GRN number of a line', 'a10', ['D2']],
    ['Gujarati', 'ગ-5', ['D4']],
    ['two words on two different lines', 'rice beans', ['D2']],
    ['two words no one dispatch has', 'rice peas', []],
    ['a percent sign, taken literally', '%', []],
    ['an underscore, taken literally', '_', []],
    ['a backslash', 'back\\slash', ['D2']],
  ])('%s', async (_name, search, expected) => {
    const w = await ready();
    const found = await numbers(w, { p_filters: { search } });
    expect([...found].sort()).toEqual([...expected].sort());
  });
});

describe('P3: filters', () => {
  it.each<[string, Params, string[]]>([
    ['one customer', { p_customer_id: 'c1' }, ['D3', 'D1']],
    ['several customers', { p_filters: { customer_ids: ['c2', 'c3'] } }, ['D2', 'D10', 'D4']],
    ['an item', { p_filters: { item_ids: ['i3'] } }, ['D2', 'D4']],
    ['a package mark, every word on one line', { p_filters: { package_mark: 'pk 99' } }, ['D3']],
    ['package mark words on different lines', { p_filters: { package_mark: 'pk back' } }, []],
    ['a number range', { p_filters: { dispNoFrom: 'D2', dispNoTo: 'D4' } }, ['D3', 'D2', 'D4']],
    ['a number typed with #', { p_filters: { dispNoFrom: '#D10' } }, ['D10']],
    ['a number that starts so, highest first whatever the sort', { p_filters: { disp_no: 'd1' }, p_sort_by: 'disp_no', p_sort_order: 'asc' }, ['D10', 'D1']],
    ['dispatch dates, both ends included', { p_filters: { date_from: '2026-11-23T05:00:00+00:00', date_to: '2026-11-23T05:00:00+00:00' } }, ['D2', 'D1']],
    ['entry dates', { p_filters: { created_date_from: '2026-11-22T06:00:00+00:00', created_date_to: '2026-11-23T06:00:00+00:00' } }, ['D1', 'D10']],
    ['GRN quantity of a line', { p_filters: { qtyMin: 100, qtyMax: 100 } }, ['D2', 'D1']],
    ['dispatched quantity of a line', { p_filters: { dispQtyMin: 41 } }, ['D3', 'D1']],
  ])('%s', async (_name, params, expected) => {
    const w = await ready();
    expect(await numbers(w, params)).toEqual(expected);
  });
});

describe('P3: pages and rows', () => {
  it('pages through the list, counting all that match', async () => {
    const w = await ready();
    const pages = [];
    for (const offset of [0, 2, 4]) {
      const result = await list({ p_limit: 2, offset });
      pages.push({
        numbers: result.data.dispatches.map(d => d.disp_no),
        total: result.data.pagination.total_count, more: result.data.pagination.has_more,
      });
    }
    expect(w.serverCalls).toEqual([]);
    expect(pages).toEqual([
      { numbers: ['D3', 'D2'], total: 5, more: true },
      { numbers: ['D1', 'D10'], total: 5, more: true },
      { numbers: ['D4'], total: 5, more: false },
    ]);
  });

  it('gives each dispatch its totals and its lines by item name', async () => {
    await ready();
    const result = await list({ p_filters: { disp_no: 'D2' } });
    const [d2] = result.data.dispatches;
    expect(d2).toMatchObject({
      id: 'd-D2', disp_no: 'D2', disp_date: '2026-11-23T05:00:00+00:00', customer_id: 'c2', customer_name: 'Bhavin Foods',
      note: 'Fictional dispatch note', total_qty: 34, total_items: 2, created_at: '2026-11-23T07:00:00+00:00',
    });
    expect(d2.items).toEqual([
      expect.objectContaining({ item_name: 'Beans', disp_qty: 30, weight: 40, gr_no: 'A10', grn_qty: 100, grn_item_id: 'l04', rack: 'C-1', package_mark: null, grn_id: 'g-A10', packaging: 'Bag' }),
      expect.objectContaining({ item_name: 'Rice', disp_qty: 4, weight: null, gr_no: 'a3', grn_qty: 5, grn_item_id: 'l05', rack: null, package_mark: 'back\\slash', grn_id: 'g-a3' }),
    ]);
  });

  it('C1: finds a dispatch by a lot\'s new rack after the sync, and no longer by the old one', async () => {
    const w = await ready();
    env.feed.changeAnswers.push({ position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [],
      changes: [{ e: 'goodsreceived_trl', id: 'l02', op: 'upsert', v: 'b000000000000001', row: { ...lotNamed('l02'), rack: 'Q-7' } }] });
    expect(await w.phone.engine.syncNow('interval')).toBe('done');
    expect(await numbers(w, { p_filters: { search: 'q-7' } })).toEqual(['D1']);
    expect(await numbers(w, { p_filters: { search: 'b-2' } })).toEqual([]);
  });
});
