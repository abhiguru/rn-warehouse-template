/**
 * WH-348, contract product/tech/app-offline-read-more.md sections 15 to 17: what the new readers answer from the phone copy
 * and when they leave it to the server.
 *  - Invoices list: a restart when the source changes between pages, and staff's payment-status filter going to the server.
 *  - Rates: the rates list for an administrator, and staff refused (server).
 *  - Invoice details: the server's line totals copied as they are; no totals in the feed means the server answers.
 *  - A GRN's rates: each lot's `item_rate` copied as sent, one source for every role.
 *  - Items without a rate: the item's `rate_cover` ("none", up_to, null, edit).
 *
 * Real: the services, the sync engine, the copy. Faked at the edge: the server's answers and the phone's native modules.
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { seedDocuments } from '@/tests/phoneCopy/documentsDataset';
import { bootWarehouse, copySource, loadCopy, sourceOf, type Role, type Warehouse } from '@/tests/phoneCopy/wh299Phone';

const invoices = () => require('@/services/invoice-service') as typeof import('@/services/invoice-service');
const pricing = () => require('@/services/item-pricing-service') as typeof import('@/services/item-pricing-service');

const feedRow = (entity: string, id: string) => {
  const found = env.feed.rows[entity].find(r => r.id === id);
  if (!found) throw new Error(`no ${entity} ${id} in the fake feed`);
  return found.row;
};

beforeEach(() => {
  resetEnv();
  seedWarehouse();
  seedDocuments();
  env.feed.format = 3;
  Object.assign(feedRow('invoice', 'inv1'), {
    customer_name: 'Bhavin Foods', inv_prefix: 'INV-', inv_fin_year: 2026, cancelled_at: null, doc_type: 'invoice',
    payment_state: { paid_amount: 1000, due_amount: 8999, payment_status: 'part_paid' },
  });
});
afterEach(async () => { await eraseEverything(); });

async function ready(role: Role): Promise<Warehouse> {
  const w = await bootWarehouse({ role });
  await loadCopy(w);
  return w;
}
const names = (w: Warehouse) => w.serverCalls.map(call => call.name);

describe('Invoices list: restart and the staff payment-status filter', () => {
  const page = (offset: number) => invoices().getInvoicesList({ p_limit: 1, p_offset: offset });

  it('first page from the copy, copy erased: page 2 asks for a restart and asks the server nothing, then page 1 asks the server', async () => {
    const w = await ready('admin');
    expect(sourceOf(await page(0))).toEqual(copySource());
    await w.phone.copyDb.eraseCopy();
    const later = await page(1);
    expect(later).toMatchObject({ success: false, copyRestart: true, data: { invoices: [] } });
    expect(sourceOf(later)).toBeUndefined();
    expect(w.serverCalls).toEqual([]);
    const again = await page(0);
    expect(names(w)).toEqual(['get_invoices_list']);
    expect((again as { copyRestart?: boolean }).copyRestart).toBeUndefined();
  });

  it('admin: the payment-status filter is answered from the copy', async () => {
    const w = await ready('admin');
    const result = await invoices().getInvoicesList({ p_limit: 20, p_payment_status: 'part_paid' });
    expect(w.serverCalls).toEqual([]);
    expect(sourceOf(result)).toEqual(copySource());
    expect(result.data.invoices.map(i => String(i.invoice_number))).toEqual(['7001']);
    const none = await invoices().getInvoicesList({ p_limit: 20, p_payment_status: 'paid' });
    expect(none.data.invoices).toEqual([]);
  });

  it('staff: the payment-status filter goes to the server, which answers (the copy is not read)', async () => {
    const w = await ready('staff');
    w.answers.get_invoices_list = () => ({ data: { success: true, data: { invoices: [], pagination: { total_count: 0, limit: 20, offset: 0, has_more: false } } }, error: null });
    const result = await invoices().getInvoicesList({ p_limit: 20, p_payment_status: 'part_paid' });
    expect(names(w)).toEqual(['get_invoices_list']);
    expect(w.serverCalls[0].args).toMatchObject({ p_payment_status: 'part_paid' });
    expect(sourceOf(result)).toBeUndefined();
  });

  it('staff without the filter still reads the copy', async () => {
    const w = await ready('staff');
    const result = await invoices().getInvoicesList({ p_limit: 20 });
    expect(w.serverCalls).toEqual([]);
    expect(sourceOf(result)).toEqual(copySource());
  });
});

describe('readItemStoragePrices: the rates list from the copy', () => {
  const rate = (id: string, item: string, extra: Record<string, unknown>) => env.feed.rows.item_storage_prices.push({
    id, row: { id, item_id: item, customer_id: null, price_type: 'monthly', unit_price: 10, weight_min: 0, weight_max: 50, labour_rate: 1, tax_percent: 5,
      effective_from: '2026-01-01', effective_to: null, created_at: '2026-01-01T05:00:00+00:00', created_by: 'p1', ...extra },
  });
  beforeEach(() => {
    rate('r1', 'i1', { unit_price: 12.5 });
    rate('r2', 'i2', { unit_price: 14 });
    rate('r3', 'i2', { unit_price: 99, effective_to: '2026-02-01' });
    rate('r4', 'i1', { unit_price: 20, customer_id: 'c2', price_type: 'one_time' });
  });
  const ids = (result: { data: Array<{ id: string }> }) => result.data.map(r => r.id);

  it('admin: the live rates by item name, an ended one only when asked for, no server call', async () => {
    const w = await ready('admin');
    const live = await pricing().getItemStoragePrices({ p_limit: 20 });
    expect(w.serverCalls).toEqual([]);
    expect(ids(live)).toEqual(['r2', 'r1', 'r4']);
    expect(live.data[0]).toMatchObject({ item_name: 'Beans', unit_price: 14, customer_name: null });
    expect(live.pagination).toMatchObject({ total_count: 3, has_more: false });
    const all = await pricing().getItemStoragePrices({ p_limit: 20, p_filters: { include_expired: true } });
    expect(ids(all)).toContain('r3');
  });

  it('admin: the filters and the page', async () => {
    await ready('admin');
    const oneTime = await pricing().getItemStoragePrices({ p_filters: { price_type: 'one_time' } });
    expect(ids(oneTime)).toEqual(['r4']);
    expect(oneTime.data[0]).toMatchObject({ customer_name: 'Bhavin Foods' });
    const item = await pricing().getItemStoragePrices({ p_filters: { item_ids: ['i2'] } });
    expect(ids(item)).toEqual(['r2']);
    const second = await pricing().getItemStoragePrices({ p_limit: 1, p_offset: 1 });
    expect(ids(second)).toEqual(['r1']);
    expect(second.pagination).toMatchObject({ total_count: 3, has_more: true, offset: 1 });
  });

  it('staff are refused online, so the server is asked and the copy is not read', async () => {
    const w = await ready('staff');
    const result = await pricing().getItemStoragePrices({ p_limit: 20 });
    expect(names(w)).toEqual(['get_item_storage_prices']);
    expect(result.success).toBe(false);
  });
});

describe('Invoice details: the server\'s line totals are copied, never worked out', () => {
  const TOTALS = { items_total_amount: 9999.99, discount_set_by_name: 'Meera Fictional', discount_reason: 'Fictional goodwill', zero_charge_set_by_name: null };
  const LINE = { storage_amount: 777.5, line_amounts: { tax_amount: 123.45, total_amount: 9999.99 } };
  const withTotals = () => { Object.assign(feedRow('invoice', 'inv1'), TOTALS); };
  const withLine = () => { Object.assign(feedRow('invoice_trl', 'invl1'), LINE); };
  const SERVER_DATA = { header: { invoice_id: 'inv1', from: 'server' }, items: [] };

  it('with both, the lines and the total are the feed\'s figures (not charge x quantity), and the server is not asked', async () => {
    withTotals();
    withLine();
    const w = await ready('admin');
    const detailed = await invoices().getInvoiceItemsDetailed('inv1');
    expect(w.serverCalls).toEqual([]);
    expect(detailed.success).toBe(true);
    expect(detailed.data?.summary.total_amount).toBe(9999.99);
    expect(detailed.data?.items[0]).toMatchObject({ taxAmount: 123.45, totalAmount: 9999.99 });
    const data = await invoices().getInvoiceDetails('inv1');
    expect(w.serverCalls).toEqual([]);
    expect(data.data?.header).toMatchObject({ invoice_id: 'inv1', paid_amount: 1000, due_amount: 8999, payment_status: 'part_paid' });
    expect(data.data?.items[0]).toMatchObject({ item_id: 'invl1', storage_amount: 777.5 });
  });

  it('the reasons are keys of the invoice row', async () => {
    withTotals();
    withLine();
    const w = await ready('admin');
    expect(await invoices().getInvoiceReasons('inv1')).toMatchObject({ discountReason: 'Fictional goodwill', discountSetByName: 'Meera Fictional' });
    expect(w.serverCalls).toEqual([]);
  });

  it.each([
    ['the invoice has no total', () => withLine()],
    ['a line has no amounts', () => withTotals()],
    ['neither has them', () => undefined],
  ])('%s: the server answers, with what the server sends', async (_why, arrange) => {
    arrange();
    const w = await ready('admin');
    w.answers.get_invoice_items_detailed = () => ({ data: { success: true, data: { items: [], summary: { total_items: 0, total_quantity: 0, total_amount: 42 } } }, error: null });
    w.answers.get_invoice_data = () => ({ data: { success: true, data: SERVER_DATA }, error: null });
    const detailed = await invoices().getInvoiceItemsDetailed('inv1');
    expect(detailed.data?.summary.total_amount).toBe(42);
    const data = await invoices().getInvoiceDetails('inv1');
    expect(data.data).toEqual(SERVER_DATA);
    expect(names(w)).toEqual(['get_invoice_items_detailed', 'get_invoice_data']);
  });

  it('no totals and no connection: a failure the screen can show, not a total made up on the phone', async () => {
    const w = await ready('admin');
    const detailed = await invoices().getInvoiceItemsDetailed('inv1');
    expect(detailed.success).toBe(false);
    expect(names(w)).toEqual(['get_invoice_items_detailed']);
  });
});

describe('A GRN\'s rates: each lot\'s item_rate is copied as sent', () => {
  const RATE = { source: 'customer', unit_price: 33.25, labour_rate: 2.5, tax_percent: 12, weight_min: 0, weight_max: 40, varies: true };
  const lot = (id: string, extra: Record<string, unknown>) => Object.assign(feedRow('goodsreceived_trl', id), extra);

  it.each(['admin', 'supervisor', 'staff'] as const)('%s: the rates come from the lots, not from grn_rates, and the server is not asked', async role => {
    lot('l02', { item_rate: RATE });
    lot('l03', { item_rate: { ...RATE, source: 'grn', unit_price: 8, varies: false } });
    // A grn_rates row that disagrees: it must not be read (staff never get these rows).
    env.feed.rows.grn_rates.push({ id: 'gr-x', row: { id: 'gr-x', gr_id: 'g-A2', item_id: 'i1', price_type: 'monthly', weight_min: 0, weight_max: 50, unit_price: 1, labour_rate: 0, tax_percent: 0 } });
    const w = await ready(role);
    const rates = await pricing().getGrnItemRates('g-A2');
    expect(w.serverCalls).toEqual([]);
    expect(rates).toMatchObject({ gr_id: 'g-A2', price_type: 'monthly', invoiced: false });
    expect(rates?.rates.map(r => [r.grn_item_id, r.source, r.unit_price, r.labour_rate, r.tax_percent, r.weight_max, r.varies])).toEqual([
      ['l02', 'customer', 33.25, 2.5, 12, 40, true],
      ['l03', 'grn', 8, 2.5, 12, 40, false],
    ]);
  });

  it('a lot with no item_rate reads as no rate', async () => {
    lot('l02', { item_rate: RATE });
    await ready('admin');
    const rates = await pricing().getGrnItemRates('g-A2');
    expect(rates?.rates.find(r => r.grn_item_id === 'l03')).toMatchObject({ source: null, unit_price: null, varies: false });
  });

  it('a GRN the copy does not have: the server is asked', async () => {
    const w = await ready('admin');
    w.answers.get_grn_item_rates = () => ({ data: { success: true, data: { gr_id: 'g-none', grn_date: '2026-11-01', price_type: 'monthly', invoiced: false, rates: [] } }, error: null });
    await pricing().getGrnItemRates('g-none');
    expect(names(w)).toEqual(['get_grn_item_rates']);
  });
});

describe('Items without a rate: the item\'s rate_cover, never a rate looked up on the phone', () => {
  const cover = (id: string, rateCover: unknown) => { feedRow('items', id).rate_cover = rateCover; };
  const ask = (lines: Array<{ itemId: string; weight: number }>, mode: 'monthly' | 'one_time' = 'monthly', grnId?: string) =>
    pricing().getItemsWithoutRate('c2', lines, '2026-11-25', mode, grnId);

  it('"none" for the GRN\'s pricing mode: the item is listed, by item name, and the server is not asked (staff)', async () => {
    cover('i1', { monthly: 'none', one_time: null });
    cover('i2', { monthly: 'none', one_time: { up_to: 100 } });
    const w = await ready('staff');
    expect(await ask([{ itemId: 'i1', weight: 20 }, { itemId: 'i2', weight: 30 }])).toEqual(['i2', 'i1']);
    expect(w.serverCalls).toEqual([]);
  });

  it('the cover of the other pricing mode is the one that counts', async () => {
    cover('i1', { monthly: 'none', one_time: { up_to: 100 } });
    const w = await ready('staff');
    expect(await ask([{ itemId: 'i1', weight: 20 }], 'one_time')).toEqual([]);
    expect(await ask([{ itemId: 'i1', weight: 20 }], 'monthly')).toEqual(['i1']);
    expect(w.serverCalls).toEqual([]);
  });

  it('up_to: a weight within it has a rate (not listed), a weight above it cannot be told (no answer, nothing asked)', async () => {
    cover('i1', { monthly: { up_to: 50 }, one_time: null });
    const w = await ready('staff');
    expect(await ask([{ itemId: 'i1', weight: 50 }])).toEqual([]);
    expect(await ask([{ itemId: 'i1', weight: 51 }])).toBeNull();
    expect(w.serverCalls).toEqual([]);
  });

  it('null, or no rate_cover at all: no answer, so no warning, and the server is not asked', async () => {
    cover('i1', { monthly: null, one_time: null });
    const w = await ready('staff');
    expect(await ask([{ itemId: 'i1', weight: 5 }])).toBeNull();
    expect(await ask([{ itemId: 'i2', weight: 5 }])).toBeNull();
    expect(w.serverCalls).toEqual([]);
  });

  it('one line that cannot be told makes the whole answer none, even beside a "none" line', async () => {
    cover('i1', { monthly: 'none', one_time: null });
    cover('i2', { monthly: null, one_time: null });
    await ready('staff');
    expect(await ask([{ itemId: 'i1', weight: 5 }, { itemId: 'i2', weight: 5 }])).toBeNull();
  });

  it('an edit (a GRN id) gives no answer, so no warning: the GRN\'s own rates count and staff\'s copy lacks them (PQ-R1), and nothing is asked', async () => {
    cover('i1', { monthly: 'none', one_time: null });
    const w = await ready('staff');
    expect(await ask([{ itemId: 'i1', weight: 5 }], 'monthly', 'g-A2')).toBeNull();
    expect(w.serverCalls).toEqual([]);
  });
});
