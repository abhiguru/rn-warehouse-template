/**
 * WH-404: a GRN saved offline and then sent is listed once. Until a sync run ends after the send, the overlay still holds the sent
 * document, so the GRN list, the receipts, the totals, `includes_unsent` and both stock summaries must drop it once the copy's
 * goodsreceived holds its server id. The number never matches: it can repeat across financial years.
 *
 * Real: the unsent store and queue, the `newGrn` kind with its overlay, the sync engine, the copy and the services the screens call.
 * Faked at the edge: the server's answers, expo-sqlite, files, NetInfo. Fictional warehouse (grnDataset.ts): stock 69 in all, 30 for c1.
 * The copy's sync run is made while the overlay is NOT subscribed, so the sent document stays in the overlay as it does on the phone
 * between the sync that brings the record and the run that ends after the send.
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { grnFeedRow, GRNS } from '@/tests/phoneCopy/grnDataset';
import { rawRows, server } from '@/tests/unsent/unsentPhone';
import { bootNewRecords, grnSaved, type NewRecordPhone } from '@/tests/unsent/newRecordPhone';

const LOCAL = '5f1c0000-0000-4000-8000-0000000000a1';
const LOT_LOCAL = '5f1c0000-0000-4000-8000-0000000000b0';
const body = () => ({
  v: 1,
  localId: LOCAL,
  lotLocalIds: [LOT_LOCAL],
  args: {
    p_gr_no: '', p_issue_number: true, p_date: '2026-11-27', p_customer_id: 'c1', p_customer_name: 'asha Traders',
    p_items: [{ item_id: 'i1', item_name: 'Peas', packaging: 'Bag', qty: 40, weight: 25, rack: 'A-1', package_mark: 'M1' }],
    p_warn_duplicate: true,
  },
  show: { customerName: 'asha Traders', lines: [{ itemName: 'Peas', packaging: 'Bag' }] },
});
const unsentGrn = (phone: NewRecordPhone) =>
  phone.queue.enqueue({ kind: 'newGrn', body: body(), what: 'New GRN', customer: 'asha Traders', targetRef: { grnId: LOCAL, lotIds: [LOT_LOCAL] } });

const overlay = () => (require('@/features/phone-copy/unsentOverlay') as typeof import('@/features/phone-copy/unsentOverlay')).getUnsentOverlay();
const grnService = () => require('@/services/grn-service') as typeof import('@/services/grn-service');
const detailService = () => require('@/services/grn-detail-service') as typeof import('@/services/grn-detail-service');
const stockSummary = () => require('@/services/reporting/stock-summary-service') as typeof import('@/services/reporting/stock-summary-service');
const list = (extra: Record<string, unknown> = {}) => grnService().getAllGRNItems({ p_limit: 50, p_offset: 0, p_sort_by: 'gr_no', p_sort_order: 'asc', ...extra } as never);

/** The copy's own record of the sent GRN, brought by a sync run. */
async function copyBrings(phone: NewRecordPhone, record: { id: string; gr_no: string }) {
  const row = { ...grnFeedRow(GRNS[0]), id: record.id, gr_no: record.gr_no, customer_id: 'c1', customer_name: 'asha Traders' };
  const lot = { id: 'item-server-0', gr_id: record.id, item_id: 'i1', item_name: 'Peas', packaging: 'Bag', qty: 40, stock: 40, weight: 25, rack: 'A-1', package_mark: 'M1', trl_img_url: null, emptied_at: null };
  env.feed.changeAnswers.push({
    position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [],
    changes: [
      { e: 'goodsreceived', id: record.id, op: 'upsert', v: 'a3f09c2b11d4e5f6', row },
      { e: 'goodsreceived_trl', id: 'item-server-0', op: 'upsert', v: 'a3f09c2b11d4e5f7', row: lot },
    ],
  });
  expect(await phone.phone.engine.syncNow('pull-to-refresh')).toBe('done');
}

/** A GRN saved offline, then sent (the server answered), the phone offline again. */
async function sent(answer = grnSaved('312')) {
  const phone = await bootNewRecords();
  await phone.offline();
  await unsentGrn(phone);
  server.answers.save_grn = () => answer;
  await phone.online();
  await phone.pass();
  return phone;
}
const sentDoc = () => (overlay().newDocuments('grn') as unknown as Record<string, any>[])[0];
const mine = (result: Awaited<ReturnType<typeof list>>) => result.data.items.filter(item => item.grn_id === LOCAL || item.gr_no === '312');

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

describe('WH-404: a sent GRN the copy already holds', () => {
  it('(1) by the server id: one row, one receipt, totals not doubled, no includes_unsent', async () => {
    const phone = await sent();
    await copyBrings(phone, { id: 'grn-server-1', gr_no: '312' });
    expect(sentDoc()).toMatchObject({ state: 'sent', serverId: 'grn-server-1' }); // the overlay still lists it: that is the situation
    const lines = await list();
    expect(mine(lines)).toHaveLength(1);
    expect(mine(lines)[0]).toMatchObject({ gr_no: '312' });
    expect(lines.data.items.some(item => item.grn_id === LOCAL)).toBe(false); // the copy's row, not the overlay's
    expect(lines.data.pagination.total_count).toBe(9);
    expect(lines.data.aggregations).toMatchObject({ total_stock: 109 });
    expect(lines.data.aggregations).not.toHaveProperty('includes_unsent');
    const receipts = await list({ p_filters: { page_by: 'receipt' } });
    expect(mine(receipts)).toHaveLength(1);
    expect(receipts.data.pagination.total_count).toBe(8); // the copy's 7 receipts and this one
  });

  it('(2) matched by the number only (another id in the copy) is NOT held: the sent GRN shows once, from the overlay', async () => {
    const phone = await sent();
    await copyBrings(phone, { id: 'grn-other-id', gr_no: '312' });
    expect(sentDoc()).toMatchObject({ state: 'sent', serverId: 'grn-server-1', number: '312' });
    const lines = await list();
    // The overlay row (local id) and the copy's other receipt numbered 312 are both there: the number is not a key.
    expect(lines.data.items.filter(item => item.grn_id === LOCAL)).toHaveLength(1);
    expect(lines.data.items.filter(item => item.gr_no === '312' && item.grn_id !== LOCAL)).toHaveLength(1);
    expect(lines.data.aggregations).toMatchObject({ includes_unsent: 40 });
  });

  it('(5) neither stock summary counts its lots twice', async () => {
    const phone = await sent();
    await copyBrings(phone, { id: 'grn-server-1', gr_no: '312' });
    const all: any = await stockSummary().getAllStockSummary();
    expect(all.data.summary).toMatchObject({ total_quantity: 109 });
    expect(all.data.summary).not.toHaveProperty('includes_unsent');
    expect(all.data.customers.find((c: any) => c.customer_id === 'c1')).toMatchObject({ total_stock: 70 });
    const one: any = await stockSummary().getCustomerStockSummary('c1');
    expect(one.data.summary).toMatchObject({ total_quantity: 70 });
    expect(one.data.summary).not.toHaveProperty('includes_unsent');
  });

  it('(6) its details still answer by the local id and by the server id', async () => {
    const phone = await sent();
    await copyBrings(phone, { id: 'grn-server-1', gr_no: '312' });
    const byLocal: any = await detailService().getGRNDetails(LOCAL);
    expect(byLocal.success).toBe(true);
    expect(byLocal.data.grn).toMatchObject({ gr_no: '312' });
    const byServer: any = await detailService().getGRNDetails('grn-server-1');
    expect(byServer.success).toBe(true);
    expect(byServer.data.grn).toMatchObject({ gr_no: '312' });
  });
});

describe('WH-404: a sent GRN the copy does not hold yet, unsent ones, refused ones', () => {
  it('(3) shown once, with its number, counted once in the totals and the stock summaries', async () => {
    await sent();
    expect(sentDoc()).toMatchObject({ state: 'sent', number: '312' });
    const lines = await list();
    expect(mine(lines)).toHaveLength(1);
    expect(mine(lines)[0]).toMatchObject({ grn_id: LOCAL, gr_no: '312' });
    expect(lines.data.aggregations).toMatchObject({ total_stock: 109, includes_unsent: 40 });
    const all: any = await stockSummary().getAllStockSummary();
    expect(all.data.summary).toMatchObject({ total_quantity: 109, includes_unsent: 40 });
    const detail: any = await detailService().getGRNDetails(LOCAL);
    expect(detail.success).toBe(true);
    expect(detail.data.grn).toMatchObject({ gr_no: '312' });
  });

  it('(4) an unsent GRN is as before: one row first, 40 bags in the totals and both summaries', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    await unsentGrn(phone);
    const lines = await list();
    expect(lines.data.items[0]).toMatchObject({ grn_id: LOCAL, grn_item_id: LOT_LOCAL });
    expect(lines.data.items.filter(item => item.grn_id === LOCAL)).toHaveLength(1);
    expect(lines.data.aggregations).toMatchObject({ total_stock: 109, includes_unsent: 40 });
    const all: any = await stockSummary().getAllStockSummary();
    expect(all.data.summary).toMatchObject({ total_quantity: 109, includes_unsent: 40 });
    const one: any = await stockSummary().getCustomerStockSummary('c1');
    expect(one.data.summary).toMatchObject({ total_quantity: 70, includes_unsent: 40 });
  });

  it('(7) a refused GRN is not shown and adds nothing, as before', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    await unsentGrn(phone);
    server.answers.save_grn = () => ({ data: { success: false, reason: 'NUMBER_TAKEN', number: 'G-501' }, error: null });
    await phone.online();
    await phone.pass();
    expect((await rawRows<{ state: string }>('items', 'ORDER BY seq'))[0].state).toBe('refused');
    const lines = await list();
    expect(lines.data.items.some(item => item.grn_id === LOCAL)).toBe(false);
    expect(lines.data.aggregations).toMatchObject({ total_stock: 69 });
    expect(lines.data.aggregations).not.toHaveProperty('includes_unsent');
    const all: any = await stockSummary().getAllStockSummary();
    expect(all.data.summary.total_quantity).toBe(69);
  });
});

describe('WH-404: edges (what the code does)', () => {
  it('a save answered without grn_id is not "sent": it does not throw and the GRN is listed once', async () => {
    await sent({ data: { success: true, data: { item_mapping: [{ index: 0, item_id: 'item-server-0', item_name: 'Peas' }] } }, error: null });
    expect(sentDoc()?.state).not.toBe('sent');
    const lines = await list();
    expect(lines.data.items.filter(item => item.grn_id === LOCAL)).toHaveLength(1);
  });

  it('a different GRN in the copy with the same number (another year) does not hide the sent one', async () => {
    const phone = await sent();
    // The copy holds a different receipt numbered 312, another customer, another year; the sent one is not in it.
    const row = { ...grnFeedRow(GRNS[0]), id: 'grn-2025-312', gr_no: '312', customer_id: 'c2', customer_name: 'beta Traders', date: '2025-11-20T05:00:00+00:00' };
    env.feed.changeAnswers.push({
      position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [],
      changes: [{ e: 'goodsreceived', id: 'grn-2025-312', op: 'upsert', v: 'a3f09c2b11d4e5f6', row }],
    });
    expect(await phone.phone.engine.syncNow('pull-to-refresh')).toBe('done');
    const lines = await list();
    expect(lines.data.items.filter(item => item.grn_id === LOCAL)).toHaveLength(1);
    expect(lines.data.aggregations).toMatchObject({ includes_unsent: 40 });
    const all: any = await stockSummary().getAllStockSummary();
    expect(all.data.summary).toMatchObject({ includes_unsent: 40 });
  });
});
