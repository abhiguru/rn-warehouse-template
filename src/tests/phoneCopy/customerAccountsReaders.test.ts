/**
 * WH-306 (commits 67f79a73 & 7d43015a):
 *  - Unknown-role copy load refusal (`SyncFailedError`, never written as `warehouse`).
 *  - Customer-copy parity & staff-key stripping (`answerFor`) on GRN/dispatch/invoice/order details,
 *    `getGrnItemRates`, item stock, GRN/dispatch activity, and customer/item pickers.
 *  - Unassigned-customer refusal & single-transaction ownership (`ownsInCopy` / `readForCustomer`)
 *    on orders, item stock, and GRN/dispatch activity.
 *
 * Real: syncEngine, copyDb, readRoute, customerScope, rows (`answerFor`), every reader and service.
 * Faked at the edge: server feed answers and native modules (phoneEnv / wh299Phone).
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { seedCustomerAccount } from '@/tests/phoneCopy/customerAccountFeed';
import { LINE_ROWS, ORDER_ROWS, PAYMENT_ROWS } from '@/tests/phoneCopy/ordersDataset';
import { bootWarehouse, copySource, goOffline, loadCopy, sourceOf, type Role, type Warehouse } from '@/tests/phoneCopy/wh299Phone';

const grnDetail = () => require('@/services/grn-detail-service') as typeof import('@/services/grn-detail-service');
const dispatchDetail = () => require('@/services/dispatch-detail-service') as typeof import('@/services/dispatch-detail-service');
const invoices = () => require('@/services/invoice-service') as typeof import('@/services/invoice-service');
const payments = () => require('@/services/paymentsService') as typeof import('@/services/paymentsService');
const orders = () => require('@/services/order-service') as typeof import('@/services/order-service');
const pricing = () => require('@/services/item-pricing-service') as typeof import('@/services/item-pricing-service');
const stockService = () => require('@/services/stock-service') as typeof import('@/services/stock-service');
const grnActivity = () => require('@/services/reporting/grn-activity-service') as typeof import('@/services/reporting/grn-activity-service');
const dispatchActivity = () => require('@/services/reporting/dispatch-activity-service') as typeof import('@/services/reporting/dispatch-activity-service');
const searchService = () => require('@/services/search-service') as typeof import('@/services/search-service');
const itemSearchService = () => require('@/services/item-search-service') as typeof import('@/services/item-search-service');
const customerService = () => require('@/services/customer-service') as typeof import('@/services/customer-service');
const rowsMod = () => require('@/features/phone-copy/reads/rows') as typeof import('@/features/phone-copy/reads/rows');

const FORBIDDEN_STAFF_KEYS = [
  'created_by', 'updated_by', 'deleted_by', 'supervisor_id', 'sender_id', 'import_batch_id', 'uploaded_by',
  'created_by_name', 'updated_by_name', 'updated_by_display_name', 'user_access',
  'created_by_info', 'created_by_display_name', 'created_by_role',
] as const;

function collectKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      out.add(key);
      collectKeys(inner, out);
    }
  }
  return out;
}

/** Keys the server's `strip_staff_keys` gained with WH-306 373df336; the copy of a customer account answers none of them. */
const NEWLY_FORBIDDEN_KEYS = [
  'cancelled_by', 'cancelled_by_name', 'ignored_by', 'discount_set_by', 'zero_charge_set_by', 'discount_reason', 'zero_charge_reason',
] as const;

function expectNoStaffKeys(value: unknown) {
  const keys = collectKeys(value);
  for (const forbidden of FORBIDDEN_STAFF_KEYS) {
    expect(keys.has(forbidden)).toBe(false);
  }
}

const feedRow = (entity: string, id: string) => {
  const found = env.feed.rows[entity]?.find(r => r.id === id);
  if (!found) throw new Error(`no ${entity} ${id} in fake feed`);
  return found.row;
};

/** Seeds a customer-scoped feed including orders, payments, invoice figures, and lot rates for `own`. */
function seedFullCustomerFeed(own: string[]) {
  seedCustomerAccount(own);
  const feed = env.feed;
  const ownOrders = ORDER_ROWS.filter(o => own.includes(String(o.customer_id)));
  const ownOrderIds = new Set(ownOrders.map(o => o.id));
  for (const row of ownOrders) {
    // Deliberately include staff-only keys on the feed row to verify `answerFor` strips them for customer accounts.
    feed.rows.orders.push({
      id: row.id,
      row: {
        ...row,
        created_by: 'p1',
        updated_by: 'p1',
        updated_by_name: 'Meera Fictional',
        updated_by_display_name: 'Meera',
        cancelled_by: 'p1',
        cancelled_by_name: 'Meera Fictional',
        ignored_by: 'p1',
      },
    });
  }
  for (const row of LINE_ROWS.filter(l => ownOrderIds.has(String(l.order_id)))) {
    feed.rows.order_items.push({ id: row.id, row: { ...row } });
  }
  if (own.includes('c2')) {
    Object.assign(feedRow('invoice', 'inv1'), {
      customer_name: 'Bhavin Foods',
      inv_prefix: 'INV-',
      inv_fin_year: 2026,
      cancelled_at: null,
      doc_type: 'invoice',
      items_total_amount: 4321,
      discount_reason: 'Fictional goodwill',
      discount_set_by_name: 'Meera Fictional',
      zero_charge_set_by_name: null,
      payment_state: { paid_amount: 1500, due_amount: 2821, payment_status: 'part_paid' },
      created_by: 'p1',
      created_by_display_name: 'Meera',
      created_by_role: 'admin',
      cancelled_by: 'p1',
      cancelled_by_name: 'Meera Fictional',
      ignored_by: 'p1',
      discount_set_by: 'p1',
      zero_charge_set_by: 'p1',
      zero_charge_reason: 'Fictional waiver',
    });
    Object.assign(feedRow('invoice_trl', 'invl1'), {
      storage_amount: 777.5,
      line_amounts: { tax_amount: 123.45, total_amount: 4321 },
    });
    Object.assign(feedRow('dispatch', 'd-D2'), {
      source_order_id: 'o-2',
      created_by_name: 'Meera Fictional',
      user_access: 'full',
    });
    for (const pay of PAYMENT_ROWS) {
      feed.rows.payments.push({ id: pay.id, row: { ...pay, created_by: 'p1' } });
    }
  }
  if (own.includes('c1')) {
    Object.assign(feedRow('goodsreceived', 'g-A2'), {
      sender_name: 'Kiran Sender',
      supervisor_name: 'Meera Fictional',
      created_by_name: 'Meera Fictional',
    });
    Object.assign(feedRow('goodsreceived_trl', 'l02'), {
      item_rate: { source: 'customer', unit_price: 33.25, labour_rate: 2.5, tax_percent: 12, weight_min: 0, weight_max: 40, varies: true },
    });
    Object.assign(feedRow('goodsreceived_trl', 'l03'), {
      item_rate: { source: 'grn', unit_price: 8, labour_rate: 2.5, tax_percent: 12, weight_min: 0, weight_max: 40, varies: false },
    });
    Object.assign(feedRow('dispatch', 'd-D1'), {
      created_by_name: 'Meera Fictional',
      updated_by_name: 'Meera Fictional',
    });
  }
}

async function readyCustomer(own: string[]): Promise<Warehouse> {
  seedFullCustomerFeed(own);
  const w = await bootWarehouse({ role: 'customer' });
  await loadCopy(w);
  await goOffline(w);
  return w;
}

beforeEach(() => resetEnv());
afterEach(async () => { await eraseEverything(); });

describe('unknown-role copy load refusal (67f79a73)', () => {
  it('refuses to start a copy load when the signed-in role is unknown, calls no sync RPC, and never writes kind=warehouse', async () => {
    seedCustomerAccount(['c1']);
    const w = await bootWarehouse({ role: 'customer' });
    const { store } = require('@/store') as typeof import('@/store');
    const auth = require('@/store/slices/authSlice') as typeof import('@/store/slices/authSlice');
    // Clear profile so signedInRole() is undefined.
    store.dispatch(auth.setUserProfile(null as never));

    await w.phone.engine.startPhoneCopy();
    const outcome = await w.phone.engine.syncNow('open');
    expect(outcome).toBe('failed');
    expect(env.feed.named('get_sync_start')).toEqual([]);
    const snap = w.phone.syncStore.getSyncSnapshot();
    expect(snap.phase).toBe('empty');
    expect(snap.kind).toBeUndefined();

    // Verify the database never recorded `kind = warehouse`.
    const db = await w.phone.copyDb.openCopy((await w.phone.scope())!);
    const metaKind = await db.all<{ v: string }>('SELECT v FROM meta WHERE k = ?', ['kind']);
    expect(metaKind).toEqual([]);

    // Once the profile is known as customer, the load succeeds with kind='customer'.
    w.setRole('customer');
    expect(await w.phone.engine.syncNow('open')).toBe('done');
    expect(w.phone.syncStore.getSyncSnapshot()).toMatchObject({ feature: 'on', phase: 'ready', kind: 'customer' });
    expect(await db.all<{ v: string }>('SELECT v FROM meta WHERE k = ?', ['kind'])).toEqual([{ v: 'customer' }]);
  });

  it('refuses a non-copy role without writing kind=warehouse', async () => {
    seedCustomerAccount(['c1']);
    const w = await bootWarehouse({ role: 'customer' });
    const { store } = require('@/store') as typeof import('@/store');
    const auth = require('@/store/slices/authSlice') as typeof import('@/store/slices/authSlice');
    store.dispatch(auth.setUserProfile({ id: 'profile-1', role: 'unknown_role', name: 'Fictional' } as never));

    await w.phone.engine.startPhoneCopy();
    expect(await w.phone.engine.syncNow('open')).toBe('failed');
    expect(env.feed.named('get_sync_start')).toEqual([]);
    expect(w.phone.syncStore.getSyncSnapshot().kind).toBeUndefined();
  });
});

describe('answerFor staff-key stripping (7d43015a)', () => {
  it('strips all 14 staff-only keys recursively for customer while keeping supervisor_name and sender_name', () => {
    const sample = {
      id: 'doc-1',
      supervisor_name: 'Meera Fictional',
      sender_name: 'Kiran Sender',
      created_by: 'p1',
      updated_by: 'p2',
      deleted_by: 'p3',
      supervisor_id: 'p1',
      sender_id: 'p4',
      import_batch_id: 'b1',
      uploaded_by: 'p5',
      created_by_name: 'Meera Fictional',
      updated_by_name: 'Meera Fictional',
      updated_by_display_name: 'Meera',
      user_access: 'admin',
      created_by_info: { id: 'p1', name: 'Meera', display_name: 'Meera', role: 'admin' },
      created_by_display_name: 'Meera',
      created_by_role: 'admin',
      cancelled_by: 'p1',
      cancelled_by_name: 'Meera Fictional',
      ignored_by: 'p1',
      discount_set_by: 'p1',
      zero_charge_set_by: 'p1',
      nested: {
        ok: true,
        updated_by: 'p2',
        created_by_info: { id: 'p1' },
        items: [{ id: 'i1', uploaded_by: 'p5', cancelled_by: 'p1', ignored_by: 'p1', supervisor_name: 'Meera Fictional' }],
      },
    };
    const stripped = rowsMod().answerFor('customer', sample) as Record<string, unknown>;
    expectNoStaffKeys(stripped);
    const strippedKeys = collectKeys(stripped);
    for (const key of NEWLY_FORBIDDEN_KEYS.filter(k => k !== 'discount_reason' && k !== 'zero_charge_reason')) expect(strippedKeys.has(key)).toBe(false);
    expect(stripped.id).toBe('doc-1');
    expect(stripped.supervisor_name).toBe('Meera Fictional');
    expect(stripped.sender_name).toBe('Kiran Sender');
    expect((stripped.nested as Record<string, unknown>).ok).toBe(true);
    expect(((stripped.nested as { items: Array<Record<string, unknown>> }).items)[0]).toEqual({
      id: 'i1',
      supervisor_name: 'Meera Fictional',
    });

    for (const role of ['admin', 'supervisor', 'staff'] as Role[]) {
      const kept = rowsMod().answerFor(role, sample);
      expect(kept).toBe(sample);
      expect(kept.created_by_info).toEqual({ id: 'p1', name: 'Meera', display_name: 'Meera', role: 'admin' });
      expect(kept).toMatchObject({ cancelled_by: 'p1', cancelled_by_name: 'Meera Fictional', ignored_by: 'p1', discount_set_by: 'p1', zero_charge_set_by: 'p1' });
    }
  });
});

describe('customer-copy parity & staff-key stripping on details, rates, stock, activity and pickers', () => {
  it('GRN details & lot dispatches: reads own GRN offline, strips staff keys, keeps supervisor_name only, disables invoicing/rates', async () => {
    const w = await readyCustomer(['c1']);
    const result = await grnDetail().getGRNDetails('g-A2');
    expect(result.success).toBe(true);
    expect(sourceOf(result)).toEqual(copySource());
    expect(w.serverCalls).toEqual([]);
    const grn = result.data!.grn;
    expect(grn).toMatchObject({
      id: 'g-A2',
      gr_no: 'A2',
      supervisor_details: { name: 'Meera Fictional' },
      sender_details: { name: 'Kiran Sender' },
      rates: [],
    });
    expect(Object.keys(grn.supervisor_details ?? {})).toEqual(['name']);
    expect(grn.invoices_summary?.can_create_invoice).toBe(false);
    expect(grn.invoices_summary?.invoice_state).toBeNull();
    expectNoStaffKeys(grn);

    // Another customer's GRN is not in the copy and asks the server nothing.
    const other = await grnDetail().getGRNDetails('g-A10');
    expect(other.success).toBe(false);
    expect(other.notFound).toBe(true);
    expect(w.serverCalls).toEqual([]);

    const lotDispatches = await grnDetail().getGRNItemDispatches('l02');
    expect(lotDispatches.success).toBe(true);
    expect(sourceOf(lotDispatches)).toEqual(copySource());
    expect(lotDispatches.data?.dispatches.map(d => d.disp_no)).toEqual(['D1']);
    expect(w.serverCalls).toEqual([]);
  });

  it('getGrnItemRates: reads each lot item_rate from the customer copy offline with 0 server calls', async () => {
    const w = await readyCustomer(['c1']);
    const rates = await pricing().getGrnItemRates('g-A2');
    expect(w.serverCalls).toEqual([]);
    expect(rates).toMatchObject({ gr_id: 'g-A2', price_type: 'monthly', invoiced: false });
    expect(rates?.rates.map(r => [r.grn_item_id, r.source, r.unit_price, r.varies])).toEqual([
      ['l02', 'customer', 33.25, true],
      ['l03', 'grn', 8, false],
    ]);
  });

  it('dispatch details: reads own dispatch with invoice amounts offline, keeps supervisor name only, strips staff keys', async () => {
    const w = await readyCustomer(['c2']);
    const result = await dispatchDetail().getDispatchDetails('d-D2');
    expect(result.success).toBe(true);
    expect(sourceOf(result)).toEqual(copySource());
    expect(w.serverCalls).toEqual([]);
    const dispatch = result.data!.dispatch;
    expect(dispatch).toMatchObject({
      id: 'd-D2',
      disp_no: 'D2',
      supervisor_details: { name: 'Meera Fictional' },
    });
    expect(Object.keys(dispatch.supervisor_details ?? {})).toEqual(['name']);
    expect(dispatch.items[0].invoice_details).toMatchObject({
      invoice_no: 7001,
      charge: 12.5,
      tax: 18,
      labour_rate: 2,
      total: 4321,
    });
    expectNoStaffKeys(dispatch);
  });

  it('invoice details, items, payments & reasons: reads own invoice offline with payment figures and zero staff keys', async () => {
    const w = await readyCustomer(['c2']);

    const details = await invoices().getInvoiceDetails('inv1');
    expect(details.success).toBe(true);
    expect(w.serverCalls).toEqual([]);
    expect(details.data?.header).toMatchObject({
      invoice_id: 'inv1',
      invoice_number: 7001,
      paid_amount: 1500,
      due_amount: 2821,
      payment_status: 'part_paid',
    });
    expectNoStaffKeys(details.data);

    const detailed = await invoices().getInvoiceItemsDetailed('inv1');
    expect(detailed.success).toBe(true);
    expect(detailed.data?.summary.total_amount).toBe(4321);
    expect(detailed.data?.items[0]).toMatchObject({ taxAmount: 123.45, totalAmount: 4321 });

    const pay = await payments().getInvoicePayments('inv1');
    expect(pay).toMatchObject({ paidAmount: 1500, dueAmount: 2821, status: 'part_paid' });
    expect(pay.payments.map(p => [p.id, p.amount])).toEqual([['pay-1', 500], ['pay-2', 1000]]);
    expectNoStaffKeys(pay);

    const reasons = await invoices().getInvoiceReasons('inv1');
    // The server answers a customer account none of the reasons (WH-306 373df336), though the copy holds them.
    // The reader answers {}, so the service maps every reason field to null: no goodwill text, no setter name.
    expect(reasons).toEqual({
      discountReason: null, discountSetAt: null, discountSetByName: null,
      zeroChargeReason: null, zeroChargeSetAt: null, zeroChargeSetByName: null,
    });
    expectNoStaffKeys(reasons);
    expect(w.serverCalls).toEqual([]);
  });

  it('invoice and order reads: carry none of the cancelled/ignored/discount/zero-charge staff keys at any depth, though the copy holds them', async () => {
    const w = await readyCustomer(['c1', 'c2']);
    expect(Object.keys(feedRow('invoice', 'inv1'))).toEqual(expect.arrayContaining([...NEWLY_FORBIDDEN_KEYS]));
    const reads = [
      await invoices().getInvoiceDetails('inv1'),
      await invoices().getInvoiceItemsDetailed('inv1'),
      await invoices().getInvoiceReasons('inv1'),
      await payments().getInvoicePayments('inv1'),
      await orders().getOrdersList({ has_items: true }),
      await orders().getOrderWithItems('o-1'),
      await dispatchDetail().getDispatchDetails('d-D2'),
    ];
    for (const read of reads) {
      const keys = collectKeys(read);
      for (const key of NEWLY_FORBIDDEN_KEYS) expect(keys.has(key)).toBe(false);
    }
    expect(reads[0]).toMatchObject({ success: true });
    expect(w.serverCalls).toEqual([]);
  });

  it('customer dispatch list: carries total_items (line count), supervisor_name and total_weight rounded half away from zero, and no staff keys', async () => {
    // D2 has two lines (l04 x30, l05 x4); 30 x 40.55 = 1216.5 must be answered as 1217, never 1216.5.
    seedFullCustomerFeed(['c2']);
    Object.assign(feedRow('goodsreceived_trl', 'l04'), { weight: 40.55 });
    const w = await bootWarehouse({ role: 'customer' });
    await loadCopy(w);
    await goOffline(w);
    const { readVia, forCustomerAccounts } = require('@/features/phone-copy/readRoute') as typeof import('@/features/phone-copy/readRoute');
    const { readCustomerDispatchList } = require('@/features/phone-copy/reads/customer/customerDispatchList') as typeof import('@/features/phone-copy/reads/customer/customerDispatchList');
    const answer = await readVia('all', forCustomerAccounts(q => readCustomerDispatchList(q, 'c2', 50, 0, true)));
    const d2 = answer?.value.dispatches.find(d => d.disp_no === 'D2');
    expect(d2).toMatchObject({ total_items: 2, supervisor_name: 'Meera Fictional', total_weight: 1217 });
    expectNoStaffKeys(answer?.value);
    expect(w.serverCalls).toEqual([]);
  });

  it('orders list, order with items, customer open order & order screen customer: reads own orders offline and strips staff keys', async () => {
    const w = await readyCustomer(['c1']);

    const list = await orders().getOrdersList({ has_items: true });
    expect(list.success).toBe(true);
    expect(sourceOf(list)).toEqual(copySource());
    expect(list.data?.map(o => o.id)).toEqual(['o-1']);
    expectNoStaffKeys(list.data);

    const listScoped = await orders().getOrdersList({ customer_id: 'c1', has_items: true });
    expect(listScoped.success).toBe(true);
    expect(listScoped.data?.map(o => o.id)).toEqual(['o-1']);

    const one = await orders().getOrderWithItems('o-1');
    expect(one.success).toBe(true);
    expect(sourceOf(one)).toEqual(copySource());
    expect(one.data?.items?.map(i => i.id)).toEqual(['ol-1', 'ol-2']);
    // Service maps optional fields from stripped reader data as undefined (never carrying staff values).
    expect(one.data?.updated_by).toBeUndefined();
    expect(one.data?.updated_by_name).toBeUndefined();
    expect(one.data?.updated_by_display_name).toBeUndefined();
    // Reader itself strips the staff-only keys completely from `order_data`.
    const { readVia, forCustomerAccounts } = require('@/features/phone-copy/readRoute') as typeof import('@/features/phone-copy/readRoute');
    const { readOrderWithItems } = require('@/features/phone-copy/reads/orders') as typeof import('@/features/phone-copy/reads/orders');
    const rawOrder = await readVia('all', forCustomerAccounts(q => readOrderWithItems(q, 'o-1')));
    expect(rawOrder?.value.kind).toBe('found');
    if (rawOrder?.value.kind === 'found') expectNoStaffKeys(rawOrder.value.order_data);

    const open = await orders().OrderService.getCustomerOrder('c1');
    expect(open.success).toBe(true);
    expect(sourceOf(open)).toEqual(copySource());
    expect(open.data).toEqual({ order_id: 'o-1', order_no: 101, item_count: 2 });

    const customer = await orders().getOrderScreenCustomer('c1');
    // Same shape as the server branch (`select('name, active, deleted_at')`): no id on this answer.
    expect(customer).toEqual({ name: 'asha Traders', active: true, deleted_at: null });
    expect(w.serverCalls).toEqual([]);
  });

  it('item stock, GRN activity & dispatch activity: reads own customer offline with supervisor_name from GRN row', async () => {
    const w = await readyCustomer(['c1']);

    const items = await stockService().StockService.getItemWiseStockList({ customerId: 'c1' });
    expect(items.success).toBe(true);
    expect(sourceOf(items)).toEqual(copySource());
    const itemNames = (items.data?.items ?? []).map(i => i.item_name).sort();
    expect(itemNames).toEqual(['Beans', 'Peas']);
    expect(itemNames).not.toContain('Rice');

    const grnAct = await grnActivity().getCustomerGRNActivity({ customerId: 'c1', fromDate: '2026-01-01', toDate: '2026-12-31' });
    expect(grnAct.success).toBe(true);
    expect(sourceOf(grnAct)).toEqual(copySource());
    expect(grnAct.data?.grns.map(g => g.gr_no).sort()).toEqual(['A2', 'B1', 'GR-1']);
    // Customer copy holds no people/user_profiles: supervisor_name comes from the GRN row itself.
    expect(grnAct.data?.grns.find(g => g.gr_no === 'A2')?.supervisor_name).toBe('Meera Fictional');

    const dispAct = await dispatchActivity().getCustomerDispatchActivity({ customerId: 'c1', fromDate: '2026-01-01', toDate: '2026-12-31' });
    expect(dispAct.success).toBe(true);
    expect(sourceOf(dispAct)).toEqual(copySource());
    expect(dispAct.data?.dispatches.map(d => d.disp_no).sort()).toEqual(['D1', 'D3']);
    expect(w.serverCalls).toEqual([]);
  });

  it('customer & item pickers: read own customers and catalog items from the copy offline with 0 server calls', async () => {
    const w = await readyCustomer(['c1']);

    const customers = await searchService().searchService.searchCustomers('a');
    expect(customers.map(c => c.value)).toEqual(['c1']);
    expect(customers[0].label).toBe('asha Traders');

    const itemsFromSearch = await searchService().searchService.searchGRNItems('Beans');
    expect(itemsFromSearch.map(i => i.label)).toContain('Beans');

    const itemsFromPicker = await itemSearchService().searchItems('Beans');
    expect(itemsFromPicker.map(i => i.name)).toContain('Beans');

    const states = await customerService().customerService.getCustomerStates(['c1', 'c3']);
    expect(states?.get('c1')).toEqual({ active: true, deleted: false });
    expect(states?.has('c3')).toBe(false);
    expect(w.serverCalls).toEqual([]);
  });
});

describe('unmarked reads stay on the server for a customer account (ee238b62)', () => {
  it('readVia over a ready customer copy: an unmarked reader is never run (server path); the same reader marked for customers is', async () => {
    await readyCustomer(['c1']);
    const { readVia, forCustomerAccounts } = require('@/features/phone-copy/readRoute') as typeof import('@/features/phone-copy/readRoute');
    const unmarked = jest.fn(async () => 'from the copy');
    expect(await readVia('all', unmarked)).toBeNull();
    expect(unmarked).not.toHaveBeenCalled();

    const marked = jest.fn(async () => 'from the copy');
    const answer = await readVia('all', forCustomerAccounts(marked));
    expect(answer?.value).toBe('from the copy');
    expect(answer?.source).toEqual(copySource());
  });

  it('a staff-only service (supervisors picker) asks the server for a customer account, offline over its copy', async () => {
    const w = await readyCustomer(['c1']);
    await (require('@/services/supervisor-service') as typeof import('@/services/supervisor-service')).getSupervisors('');
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_supervisors']);
  });
});

describe('unassigned-customer refusal & single-transaction ownership (7d43015a)', () => {
  it('refuses unassigned customers on orders, item stock, GRN activity and dispatch activity with 0 server calls', async () => {
    const w = await readyCustomer(['c1']);

    const openOrder = await orders().OrderService.getCustomerOrder('c3');
    expect(openOrder).toMatchObject({ success: false, message: 'Customer access denied', error: 'CUSTOMER_ACCESS_DENIED' });

    const ordersList = await orders().getOrdersList({ customer_id: 'c3' });
    expect(ordersList).toMatchObject({ success: false, message: 'Customer access denied', error: 'CUSTOMER_ACCESS_DENIED', data: [] });

    const itemStock = await stockService().StockService.getItemWiseStockList({ customerId: 'c3' });
    expect(itemStock).toMatchObject({ success: false, message: 'Customer access denied', error: 'CUSTOMER_ACCESS_DENIED' });

    const grnAct = await grnActivity().getCustomerGRNActivity({ customerId: 'c3', fromDate: '2026-01-01', toDate: '2026-12-31' });
    expect(grnAct).toMatchObject({ success: false, message: 'Customer access denied', error: 'CUSTOMER_ACCESS_DENIED' });
    expect(grnAct.data?.grns).toEqual([]);

    const dispAct = await dispatchActivity().getCustomerDispatchActivity({ customerId: 'c3', fromDate: '2026-01-01', toDate: '2026-12-31' });
    expect(dispAct).toMatchObject({ success: false, message: 'Customer access denied', error: 'CUSTOMER_ACCESS_DENIED' });
    expect(dispAct.data?.dispatches).toEqual([]);

    expect(w.serverCalls).toEqual([]);
  });

  it('runs customer ownership check and read in a single copy transaction (readForCustomer)', async () => {
    const w = await readyCustomer(['c1']);
    const spy = jest.spyOn(w.phone.copyDb, 'currentCopy');

    const own = await grnActivity().getCustomerGRNActivity({ customerId: 'c1', fromDate: '2026-01-01', toDate: '2026-12-31' });
    expect(own.success).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockClear();
    const refused = await grnActivity().getCustomerGRNActivity({ customerId: 'c3', fromDate: '2026-01-01', toDate: '2026-12-31' });
    expect(refused).toMatchObject({ success: false, error: 'CUSTOMER_ACCESS_DENIED' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
