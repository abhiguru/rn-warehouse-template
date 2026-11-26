/**
 * WH-299 slice 6, contract product/tech/app-offline-read-from-copy.md sections 6, 8 and 13 (P5 in part, P7, C2): the
 * stock summary and stock ageing from the copy, the "emptied in the last 360 days" section (PR3) and which day is
 * "today" (PR4).
 *
 * Real: the services, the sync engine, the copy. Faked at the edge: the server's answers, the phone's native modules and,
 * for the clock rule, the phone's date. Expected figures are derived by hand from `get_customer_stock_summary` and
 * `get_stock_aging_report` (backend cd9531e). Full report parity (item stock, the activity reports, every key) is the
 * golden export's and is not here.
 *
 * The copy was confirmed on 25 November 2026 (`as_of`).
 */
import { eraseEverything, env, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { grnNamed, grnFeedRow, lotNamed, seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { bootWarehouse, copySource, loadCopy, sourceOf } from '@/tests/phoneCopy/wh299Phone';

beforeEach(() => {
  resetEnv();
  seedWarehouse();
});
afterEach(async () => {
  jest.useRealTimers();
  await eraseEverything();
});

const stockSummary = () => require('@/services/reporting/stock-summary-service') as typeof import('@/services/reporting/stock-summary-service');
const ageing = () => require('@/services/reporting/stock-aging-service') as typeof import('@/services/reporting/stock-aging-service');

/** Only the date is faked; every timer runs as usual. */
function phoneClock(iso: string) {
  jest.useFakeTimers({
    now: new Date(iso),
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
}
async function ready() {
  const w = await bootWarehouse({ role: 'admin' });
  await loadCopy(w);
  return w;
}
const stocks = (rows: { item_id?: string; grns: { gr_no: string }[] }[]) => rows.map(row => [row.item_id, row.grns.map(g => g.gr_no)]);
/** A lot of GRN B1 with nothing left, emptied at `emptied_at`. */
const emptiedLot = (id: string, emptied_at: string | null) =>
  env.feed.rows.goodsreceived_trl.push({ id, row: { ...lotNamed('l06'), id, item_id: 'i3', item_name: 'Rice', stock: 0, emptied_at } });

describe('stock summary', () => {
  it('one customer: totals, then each item with its lots in stock, newest GRN first', async () => {
    const w = await ready();
    phoneClock('2026-11-25T06:00:00Z');
    const result = await stockSummary().getCustomerStockSummary('c1');
    expect(w.serverCalls).toEqual([]);
    expect(sourceOf(result)).toEqual(copySource());
    expect(result.data!.summary).toEqual({ total_items: 2, total_quantity: 30, oldest_stock_date: '2026-11-20', grn_count: 3, grn_count_empty: 0 });
    expect(result.data!.items.map(i => [i.item_name, i.total_stock, i.grn_count])).toEqual([['Beans', 19, 1], ['Peas', 11, 2]]);
    expect(stocks(result.data!.items)).toEqual([['i2', ['A2']], ['i1', ['GR-1', 'B1']]]);
    expect(result.data!.items[0].grns[0]).toMatchObject({ grn_id: 'g-A2', date: '2026-11-20', orig_qty: 100, stock: 19, item_weight: 30, rack: 'B-3', package_mark: '50%_OFF' });
  });

  it('PR3: lists the lots emptied, with the day in India they were emptied', async () => {
    const w = await ready();
    phoneClock('2026-11-25T06:00:00Z');
    const result = await stockSummary().getCustomerStockSummary('c1');
    expect(w.serverCalls).toEqual([]);
    expect(stocks(result.data!.out_of_stock_items!)).toEqual([['i1', ['A2']]]);
    expect(result.data!.out_of_stock_items![0].grns[0]).toMatchObject({ stock: 0, orig_qty: 100, emptied_date: '2026-11-23' });
  });

  it('PR3: goes back 360 days in India and no further; a lot with no emptied time is not listed', async () => {
    // 360 days before 25 November 2026 is 30 November 2025, which begins in India at 18:30 UTC the day before.
    emptiedLot('e-in', '2025-11-29T18:30:00+00:00');
    emptiedLot('e-out', '2025-11-29T18:29:59+00:00');
    emptiedLot('e-never', null);
    const w = await ready();
    phoneClock('2026-11-25T06:00:00Z');
    const result = await stockSummary().getCustomerStockSummary('c1');
    expect(w.serverCalls).toEqual([]);
    const rice = result.data!.out_of_stock_items!.find(row => row.item_id === 'i3');
    expect(rice?.grns.map(g => g.emptied_date)).toEqual(['2025-11-30']);
  });

  it('every customer: the stock of each', async () => {
    const w = await ready();
    const result = await stockSummary().getAllStockSummary();
    expect(w.serverCalls).toEqual([]);
    expect(sourceOf(result)).toEqual(copySource());
    expect(result.data!.summary).toMatchObject({ total_customers_with_stock: 3, total_quantity: 69 });
    expect(Object.fromEntries(result.data!.customers.map(c => [c.customer_id, c.total_stock]))).toEqual({ c1: 30, c2: 21, c3: 18 });
  });

  it('C2: a GRN moved to another customer moves its stock after the sync', async () => {
    const w = await ready();
    env.feed.changeAnswers.push({ position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [],
      changes: [{ e: 'goodsreceived', id: 'g-A2', op: 'upsert', v: 'b000000000000001',
        row: { ...grnFeedRow(grnNamed('A2')), customer_id: 'c2', customer_name: 'Bhavin Foods' } }] });
    expect(await w.phone.engine.syncNow('interval')).toBe('done');
    const result = await stockSummary().getAllStockSummary();
    expect(Object.fromEntries(result.data!.customers.map(c => [c.customer_id, c.total_stock]))).toEqual({ c1: 11, c2: 40, c3: 18 });
    expect(w.serverCalls).toEqual([]);
  });
});

describe('P7, PR4: the age of stock', () => {
  it.each<[string, string, number[]]>([
    ['the phone\'s date', '2026-11-27T06:00:00Z', [7, 6, 5]],
    ['the date in India: late evening UTC is already the next day', '2026-11-26T19:00:00Z', [7, 6, 5]],
    ['never a day before the copy was confirmed, when the phone clock was set back', '2026-11-01T06:00:00Z', [5, 4, 3]],
    ['the day before the confirmation counts as the confirmation\'s day', '2026-11-24T06:00:00Z', [5, 4, 3]],
  ])('is counted from %s', async (_name, now, ages) => {
    const w = await ready();
    phoneClock(now);
    const result = await ageing().getCustomerStockAging({ customerId: 'c1' });
    expect(w.serverCalls).toEqual([]);
    expect(sourceOf(result)).toEqual(copySource());
    expect(result.data!.items.map(i => [i.gr_no, i.current_stock, i.aging_days])).toEqual([['A2', 19, ages[0]], ['B1', 9, ages[1]], ['GR-1', 2, ages[2]]]);
  });

  it('summarises the stock in the age bands asked for', async () => {
    const w = await ready();
    phoneClock('2026-11-25T06:00:00Z');
    const result = await ageing().getCustomerStockAging({ customerId: 'c1', agingBuckets: [3, 4, 10] });
    expect(w.serverCalls).toEqual([]);
    expect(result.data!.summary).toMatchObject({ total_items: 3, total_quantity: 30, oldest_stock_days: 5, average_age_days: 4, items_over_365_days: 0, items_no_recent_dispatch: 3 });
    expect(result.data!.by_bucket['0-3']).toMatchObject({ item_count: 1, total_quantity: 2, percentage: 33.3 });
    expect(result.data!.by_bucket['4-4']).toMatchObject({ item_count: 1, total_quantity: 9 });
    expect(result.data!.by_bucket['5-10']).toMatchObject({ item_count: 1, total_quantity: 19 });
    expect(result.data!.by_bucket['10+']).toMatchObject({ item_count: 0, total_quantity: 0 });
  });
});
