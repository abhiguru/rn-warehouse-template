/**
 * WH-161, test first (product/tech/app-offline-new-records.md sections 6 and 7a; cases S2, S3, S9 at the reader level). The screens
 * and their testIDs are not here (see the hand-back).
 *
 * Real: the unsent store and queue, the `newGrn` kind with its overlay, the sync engine, the copy, and the services the screens call
 * (`getAllGRNItems`, `getGRNDetails`, the stock summaries). Faked at the edge: the server's answers, expo-sqlite, files, NetInfo.
 * Figures come from the fictional warehouse (grnDataset.ts): stock 69 in all, 30 for customer c1, 376 ordered in all.
 *
 * ===== AGREE WITH DEVELOPMENT (the contract is silent; ASSUMED) =====
 *  - An unsent GRN's body is NewGrnBody (section 5): the overlay reads the lines from `args.p_items` (`item_id`, `item_name`, `packaging`,
 *    `qty`, `weight`) and the customer from `args.p_customer_id` / `p_customer_name`, the date from `args.p_date`.
 *  - The new document's row in a list has `grn_id` = the GRN's local id and `grn_item_id` = `lotLocalIds[i]` (section 6: "id = lotLocalIds[i]").
 *  - A copy total tells how many unsent bags it counts in `includes_unsent` (bags, a number) of the same object as the total: `data.summary`
 *    of the stock summaries, `data.aggregations` of the GRN list. Absent or 0 when nothing unsent is counted. Section 7a names the label
 *    (`includesUnsent`) and the testID suffix, not the field.
 *  - Details of a local id: `getGRNDetails(localId)` answers `data.grn` with `gr_no` null (a number not given yet), the lots as `items`
 *    (stock = qty) and `source: copy`.
 * ====================================================================
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { grnFeedRow, GRNS } from '@/tests/phoneCopy/grnDataset';
import { rawRows, server } from '@/tests/unsent/unsentPhone';
import { bootNewRecords, grnSaved, type NewRecordPhone } from '@/tests/unsent/newRecordPhone';

const LOCAL = '5f1c0000-0000-4000-8000-0000000000a1';
const LOT_LOCAL = '5f1c0000-0000-4000-8000-0000000000b0';
const body = (qty = 40) => ({
  v: 1,
  localId: LOCAL,
  lotLocalIds: [LOT_LOCAL],
  args: {
    p_gr_no: '', p_issue_number: true, p_date: '2026-11-27', p_customer_id: 'c1', p_customer_name: 'asha Traders',
    p_items: [{ item_id: 'i1', item_name: 'Peas', packaging: 'Bag', qty, weight: 25, rack: 'A-1', package_mark: 'M1' }],
    p_warn_duplicate: true,
  },
  show: { customerName: 'asha Traders', lines: [{ itemName: 'Peas', packaging: 'Bag' }] },
});
const unsentGrn = (phone: NewRecordPhone, qty = 40) =>
  phone.queue.enqueue({ kind: 'newGrn', body: body(qty), what: 'New GRN', customer: 'asha Traders', targetRef: { grnId: LOCAL, lotIds: [LOT_LOCAL] } });

const overlay = () => (require('@/features/phone-copy/unsentOverlay') as typeof import('@/features/phone-copy/unsentOverlay')).getUnsentOverlay();
const grnService = () => require('@/services/grn-service') as typeof import('@/services/grn-service');
const detailService = () => require('@/services/grn-detail-service') as typeof import('@/services/grn-detail-service');
const stockSummary = () => require('@/services/reporting/stock-summary-service') as typeof import('@/services/reporting/stock-summary-service');
const list = (extra: Record<string, unknown> = {}) => grnService().getAllGRNItems({ p_limit: 50, p_offset: 0, p_sort_by: 'gr_no', p_sort_order: 'asc', ...extra } as never);
const items = () => rawRows<{ id: string; state: string }>('items', 'ORDER BY seq');

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-27T09:00:00+05:30'), doNotFake: ['setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask'] });
  resetEnv();
  files.reset();
  server.reset();
});
afterEach(async () => {
  jest.useRealTimers();
  await eraseEverything();
});

describe('S2: an unsent new GRN on screen', () => {
  it('the overlay holds one new document with no number, state saved, and its lot at stock = qty', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    await unsentGrn(phone);
    const [doc] = overlay().newDocuments('grn') as unknown as Record<string, any>[];
    expect(doc).toMatchObject({ kind: 'grn', localId: LOCAL, state: 'saved', serverId: null, number: null });
    expect(doc.header).toMatchObject({ customer_name: 'asha Traders' });
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]).toMatchObject({ id: LOT_LOCAL, qty: 40, stock: 40, item_name: 'Peas' });
    expect(overlay().marker('grn', LOCAL)).toBe('notSent');
  });

  it('the list shows it first on page 0 whatever the sort, counted in the list, above the copy\'s rows', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    await unsentGrn(phone);
    for (const order of ['asc', 'desc'] as const) {
      const result = await list({ p_sort_order: order });
      expect(result.data.items[0]).toMatchObject({ grn_id: LOCAL, grn_item_id: LOT_LOCAL });
    }
    const result = await list();
    expect(result.data.items.filter(item => item.grn_id === LOCAL)).toHaveLength(1);
    expect(result.data.pagination.total_count).toBe(9); // the copy's 8 lines and the new one
  });

  it('a filter it cannot match hides it (a date range that excludes the document date)', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    await unsentGrn(phone);
    const result = await list({ p_date_from: '2026-12-01', p_date_to: '2026-12-31' });
    expect(result.data.items.some(item => item.grn_id === LOCAL)).toBe(false);
  });

  it('its details open by the local id from the copy, with the lot at stock = qty, and no server call', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    await unsentGrn(phone);
    const result: any = await detailService().getGRNDetails(LOCAL);
    expect(result.success).toBe(true);
    expect(result.source).toMatchObject({ kind: 'copy' });
    expect(result.data.grn.gr_no ?? null).toBeNull();
    expect(result.data.grn.customer_details).toMatchObject({ name: 'asha Traders' });
    expect(result.data.grn.items[0]).toMatchObject({ id: LOT_LOCAL, qty: 40, stock: 40 });
    expect(server.calls).toEqual([]);
  });

});

describe('S3: after the send', () => {
  async function sentWithNumber() {
    const phone = await bootNewRecords();
    await phone.offline();
    await unsentGrn(phone);
    server.answers.save_grn = () => grnSaved('312');
    await phone.online();
    await phone.pass();
    expect((await items())[0].state).toBe('sent');
    return phone;
  }

  it('the row has its number and no marker until the first sync that ends after the send', async () => {
    await sentWithNumber();
    const [doc] = overlay().newDocuments('grn') as unknown as Record<string, any>[];
    expect(doc).toMatchObject({ state: 'sent', serverId: 'grn-server-1', number: '312' });
    expect(overlay().marker('grn', LOCAL)).toBeNull();
  });

  it('once the copy holds the server id, the new row is dropped and the GRN is listed once', async () => {
    const phone = await sentWithNumber();
    const row = { ...grnFeedRow(GRNS[0]), id: 'grn-server-1', gr_no: '312', customer_id: 'c1', customer_name: 'asha Traders' };
    const lot = { id: 'item-server-0', gr_id: 'grn-server-1', item_id: 'i1', item_name: 'Peas', packaging: 'Bag', qty: 40, stock: 40, weight: 25, rack: 'A-1', package_mark: 'M1', trl_img_url: null, emptied_at: null };
    env.feed.changeAnswers.push({
      position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [],
      changes: [
        { e: 'goodsreceived', id: 'grn-server-1', op: 'upsert', v: 'a3f09c2b11d4e5f6', row },
        { e: 'goodsreceived_trl', id: 'item-server-0', op: 'upsert', v: 'a3f09c2b11d4e5f7', row: lot },
      ],
    });
    overlay(); // the screens subscribe to the sync runs when they mount: the run below must end after that, as on the phone
    expect(await phone.phone.engine.syncNow('pull-to-refresh')).toBe('done');
    expect(overlay().newDocuments('grn')).toHaveLength(0);
    const result = await list();
    expect(result.data.items.filter(item => item.gr_no === '312')).toHaveLength(1);
    expect(result.data.items.some(item => item.grn_id === LOCAL)).toBe(false);
  });
});

describe('S9: an unsent GRN\'s bags in the totals the copy computes (PQ3)', () => {
  const includes = (answer: any) => answer?.includes_unsent ?? 0;

  it('with nothing unsent every figure is the server\'s (parity) and nothing is labelled', async () => {
    await bootNewRecords();
    const all: any = await stockSummary().getAllStockSummary();
    expect(all.data.summary).toMatchObject({ total_quantity: 69 });
    expect(includes(all.data.summary)).toBe(0);
    const aggregations = (await list()).data.aggregations as any;
    expect(aggregations).toMatchObject({ total_qty: 376, total_stock: 69 });
    expect(includes(aggregations)).toBe(0);
  });

  it('40 unsent bags: the stock summary, the customer\'s summary and the GRN list total are 40 higher, each says 40', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    await unsentGrn(phone, 40);
    const all: any = await stockSummary().getAllStockSummary();
    expect(all.data.summary).toMatchObject({ total_quantity: 109, includes_unsent: 40 });
    const one: any = await stockSummary().getCustomerStockSummary('c1');
    expect(one.data.summary).toMatchObject({ total_quantity: 70, includes_unsent: 40 });
    const aggregations = (await list()).data.aggregations as any;
    expect(aggregations).toMatchObject({ total_stock: 109, includes_unsent: 40 });
    expect(server.calls).toEqual([]);
  });

  it('another customer\'s summary does not count it', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    await unsentGrn(phone, 40);
    const other: any = await stockSummary().getCustomerStockSummary('c2');
    expect(includes(other.data.summary)).toBe(0);
  });

  it('after the send and a sync the GRN is counted once and the footnote is gone', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    await unsentGrn(phone, 40);
    server.answers.save_grn = () => grnSaved('312');
    await phone.online();
    await phone.pass();
    const row = { ...grnFeedRow(GRNS[0]), id: 'grn-server-1', gr_no: '312', customer_id: 'c1', customer_name: 'asha Traders' };
    const lot = { id: 'item-server-0', gr_id: 'grn-server-1', item_id: 'i1', item_name: 'Peas', packaging: 'Bag', qty: 40, stock: 40, weight: 25, rack: 'A-1', package_mark: 'M1', trl_img_url: null, emptied_at: null };
    env.feed.changeAnswers.push({
      position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [],
      changes: [
        { e: 'goodsreceived', id: 'grn-server-1', op: 'upsert', v: 'a3f09c2b11d4e5f6', row },
        { e: 'goodsreceived_trl', id: 'item-server-0', op: 'upsert', v: 'a3f09c2b11d4e5f7', row: lot },
      ],
    });
    overlay(); // the screens subscribe to the sync runs when they mount: the run below must end after that, as on the phone
    expect(await phone.phone.engine.syncNow('pull-to-refresh')).toBe('done');
    const all: any = await stockSummary().getAllStockSummary();
    expect(all.data.summary.total_quantity).toBe(109);
    expect(includes(all.data.summary)).toBe(0);
  });

  it('a refused GRN adds nothing', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    await unsentGrn(phone, 40);
    server.answers.save_grn = () => ({ data: { success: false, reason: 'NUMBER_TAKEN', number: 'G-501' }, error: null });
    await phone.online();
    await phone.pass();
    expect((await items())[0].state).toBe('refused');
    const all: any = await stockSummary().getAllStockSummary();
    expect(all.data.summary.total_quantity).toBe(69);
    expect(includes(all.data.summary)).toBe(0);
  });

  it('a total read from the server (the copy not usable) adds no unsent bags and no line (PQ7)', async () => {
    const phone = await bootNewRecords({ withCopy: false });
    await unsentGrn(phone, 40);
    server.answers.get_all_stock_summary = () => ({ data: { success: true, summary: { total_quantity: 69 }, customers: [] }, error: null });
    await phone.online();
    const all: any = await stockSummary().getAllStockSummary();
    expect(all.data.summary.total_quantity).toBe(69);
    expect(includes(all.data.summary)).toBe(0);
  });
});
