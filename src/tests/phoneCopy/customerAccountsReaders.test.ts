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
const stockSummary = () => require('@/services/reporting/stock-summary-service') as typeof import('@/services/reporting/stock-summary-service');
const stockAging = () => require('@/services/reporting/stock-aging-service') as typeof import('@/services/reporting/stock-aging-service');
const searchService = () => require('@/services/search-service') as typeof import('@/services/search-service');
const itemSearchService = () => require('@/services/item-search-service') as typeof import('@/services/item-search-service');
const customerService = () => require('@/services/customer-service') as typeof import('@/services/customer-service');
const rowsMod = () => require('@/features/phone-copy/reads/rows') as typeof import('@/features/phone-copy/reads/rows');

const DROPPED_ENTITIES = new Set(['dispatch', 'dispatch_trl', 'dispatch_images', 'invoice', 'invoice_trl', 'payments', 'orders', 'order_items']);

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

/** Seeds a WH-381 kept customer-scoped feed (6 kept entities, no dispatch/order/invoice/payment entities). */
function seedFullCustomerFeed(own: string[]) {
  seedCustomerAccount(own);
  const feed = env.feed;
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
  }
  const rpc = feed.rpc;
  feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    const answer = await rpc(name, args);
    const data = answer.data as { entities?: unknown[] } | null;
    if (!data?.entities) return answer;
    if (name === 'get_sync_start') {
      return { ...answer, data: { ...data, entities: (data.entities as string[]).filter(e => !DROPPED_ENTITIES.has(e)) } };
    }
    if (name === 'get_sync_checksums') {
      return { ...answer, data: { ...data, entities: (data.entities as Array<{ e: string }>).filter(e => !DROPPED_ENTITIES.has(e.e)) } };
    }
    return answer;
  };
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
    seedFullCustomerFeed(['c1']);
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
    seedFullCustomerFeed(['c1']);
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

    // WH-381: lot dispatches always ask the server (never read from the phone copy).
    const lotDispatches = await grnDetail().getGRNItemDispatches('l02');
    expect(sourceOf(lotDispatches)).toBeUndefined();
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_grn_item_dispatches']);
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

  it('WH-381: dispatch details, invoice details/items/payments/reasons, orders, and activity reports never read from the customer copy offline', async () => {
    const w = await readyCustomer(['c1', 'c2']);
    const results = [
      await dispatchDetail().getDispatchDetails('d-D2'),
      await invoices().getInvoiceDetails('inv1'),
      await invoices().getInvoiceItemsDetailed('inv1'),
      await invoices().getInvoiceReasons('inv1'),
      await payments().getInvoicePayments('inv1').catch(() => null),
      await orders().getOrdersList({ has_items: true }),
      await orders().getOrderWithItems('o-1'),
      await orders().OrderService.getCustomerOrder('c1'),
      await orders().getOrderScreenCustomer('c1').catch(() => null),
      await grnActivity().getCustomerGRNActivity({ customerId: 'c1', fromDate: '2026-01-01', toDate: '2026-12-31' }),
      await dispatchActivity().getCustomerDispatchActivity({ customerId: 'c1', fromDate: '2026-01-01', toDate: '2026-12-31' }),
    ];
    for (const r of results) expect(sourceOf(r)).toBeUndefined();
    expect(w.serverCalls.map(c => c.name)).toEqual(expect.arrayContaining([
      'get_dispatch_details',
      'get_invoice_data',
      'get_invoice_items_detailed',
      'get_invoice_detail',
      'get_orders_list',
      'get_order_with_items',
      'get_customer_order',
      'from:customers',
      'get_grn_activity_report',
      'get_dispatch_activity_report',
    ]));
  });

  it('item stock & stock aging: reads own customer offline from the copy with 0 server calls', async () => {
    const w = await readyCustomer(['c1']);

    const items = await stockService().StockService.getItemWiseStockList({ customerId: 'c1' });
    expect(items.success).toBe(true);
    expect(sourceOf(items)).toEqual(copySource());
    const itemNames = (items.data?.items ?? []).map(i => i.item_name).sort();
    expect(itemNames).toEqual(['Beans', 'Peas']);
    expect(itemNames).not.toContain('Rice');

    const aging = await stockAging().getCustomerStockAging({ customerId: 'c1' });
    expect(aging.success).toBe(true);
    expect(sourceOf(aging)).toEqual(copySource());
    expect(aging.data?.summary.avg_dispatch_velocity_days).toBeNull();
    expect(aging.data?.summary.items_no_recent_dispatch).toBe(0);
    for (const item of aging.data?.items ?? []) expect(item.dispatch_info).toBeUndefined();
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
  it('refuses unassigned customers on kept stock services (item stock, stock summary, stock aging) with 0 server calls', async () => {
    const w = await readyCustomer(['c1']);

    const itemStock = await stockService().StockService.getItemWiseStockList({ customerId: 'c3' });
    expect(itemStock).toMatchObject({ success: false, message: 'Customer access denied', error: 'CUSTOMER_ACCESS_DENIED' });

    const summary = await stockSummary().getCustomerStockSummary('c3');
    expect(summary).toMatchObject({ success: false, message: 'Customer access denied', error: 'CUSTOMER_ACCESS_DENIED' });

    const aging = await stockAging().getCustomerStockAging({ customerId: 'c3' });
    expect(aging).toMatchObject({ success: false, message: 'Customer access denied', error: 'CUSTOMER_ACCESS_DENIED' });

    expect(w.serverCalls).toEqual([]);
  });

  it('runs customer ownership check and read in a single copy transaction (readForCustomer)', async () => {
    const w = await readyCustomer(['c1']);
    const spy = jest.spyOn(w.phone.copyDb, 'currentCopy');

    const own = await stockAging().getCustomerStockAging({ customerId: 'c1' });
    expect(own.success).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockClear();
    const refused = await stockAging().getCustomerStockAging({ customerId: 'c3' });
    expect(refused).toMatchObject({ success: false, error: 'CUSTOMER_ACCESS_DENIED' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
