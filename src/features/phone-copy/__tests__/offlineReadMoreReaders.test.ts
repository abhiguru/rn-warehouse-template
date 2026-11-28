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

const DROPPED = new Set(['dispatch', 'dispatch_trl', 'dispatch_images', 'invoice', 'invoice_trl', 'payments', 'orders', 'order_items']);

beforeEach(() => {
  resetEnv();
  seedWarehouse();
  seedDocuments();
  env.feed.format = 3;
  const rpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    const answer = await rpc(name, args);
    const data = answer.data as { entities?: unknown[] } | null;
    if (!data?.entities) return answer;
    if (name === 'get_sync_start') {
      return { ...answer, data: { ...data, entities: (data.entities as string[]).filter(e => !DROPPED.has(e)) } };
    }
    if (name === 'get_sync_checksums') {
      return { ...answer, data: { ...data, entities: (data.entities as Array<{ e: string }>).filter(e => !DROPPED.has(e.e)) } };
    }
    return answer;
  };
});
afterEach(async () => { await eraseEverything(); });

async function ready(role: Role): Promise<Warehouse> {
  const w = await bootWarehouse({ role });
  await loadCopy(w);
  return w;
}
const names = (w: Warehouse) => w.serverCalls.map(call => call.name);

describe('WH-381: Invoices list always calls the server (never the phone copy)', () => {
  it.each(['admin', 'staff'] as const)('%s: getInvoicesList calls get_invoices_list on server, never reads copy', async role => {
    const w = await ready(role);
    const result = await invoices().getInvoicesList({ p_limit: 20, p_offset: 0 });
    expect(names(w)).toEqual(['get_invoices_list']);
    expect(sourceOf(result)).toBeUndefined();
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

describe('WH-381: Invoice details, items detailed, and reasons always ask the server (never the phone copy)', () => {
  it('calls get_invoice_items_detailed, get_invoice_data, and get_invoice_detail on the server over a ready copy', async () => {
    const w = await ready('admin');
    const detailed = await invoices().getInvoiceItemsDetailed('inv1');
    const data = await invoices().getInvoiceDetails('inv1');
    const reasons = await invoices().getInvoiceReasons('inv1');
    expect(names(w)).toEqual(['get_invoice_items_detailed', 'get_invoice_data', 'get_invoice_detail']);
    expect(sourceOf(detailed)).toBeUndefined();
    expect(sourceOf(data)).toBeUndefined();
    expect(reasons).toBeNull();
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
