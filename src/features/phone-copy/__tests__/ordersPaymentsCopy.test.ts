/**
 * WH-328, contract product/tech/app-offline-orders-payments.md sections 2, 5, 9, 11 (R1, R2, R5, O1-O3, History): the order
 * services and the payments service read the phone copy per role, with the net stock of an order line, and with the
 * feature off, an older server (format 2) or a customer account they run today's calls.
 *
 * Real: the services, the sync engine, the copy, the store. Faked at the edge: the server's answers, the phone's native
 * modules, and the seam of this phone's unsent work (`getUnsentOverlay`, WH-301's store is not in this base).
 *
 * ===== AGREE WITH DEVELOPMENT (the contract is silent) =====
 *  - The invoice row's `payment_state` is `{ paid_amount, due_amount, payment_status }` (C348 topic 3 defines it).
 *  - The overlay is read through `getUnsentOverlay().deductions()` / `lessUnsent` / `lessHeld` (contract 5, "Stock on an order line").
 *  - `getOrdersList` answers `data` as an array of the list items (as today); `getOrderScreenCustomer` returns `{ id, name, ... }`.
 * ============================================================
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { seedDocuments } from '@/tests/phoneCopy/documentsDataset';
import { seedDeactivatedCustomerOrder, seedOrders } from '@/tests/phoneCopy/ordersDataset';
import { bootWarehouse, copySource, goOffline, loadCopy, sourceOf, tryLoadCopy, type Role } from '@/tests/phoneCopy/wh299Phone';

let overlay: { lessUnsent: Record<string, number>; lessHeld: Record<string, number> };

beforeEach(() => {
  resetEnv();
  seedWarehouse();
  seedDocuments();
  overlay = { lessUnsent: {}, lessHeld: {} };
});
afterEach(async () => { await eraseEverything(); });

const orders = () => require('@/services/order-service') as typeof import('@/services/order-service');
const dispatches = () => require('@/services/dispatch-service') as typeof import('@/services/dispatch-service');
const payments = () => require('@/services/paymentsService') as typeof import('@/services/paymentsService');

/** A phone for `role` with a finished first load; the overlay answers what the test puts in `overlay`. */
async function ready(role: Role = 'admin', opts: { payments?: boolean } = {}) {
  seedOrders({ payments: opts.payments ?? role !== 'staff' });
  const w = await bootWarehouse({ role });
  jest.doMock('@/features/phone-copy/unsentOverlay', () => {
    const actual = jest.requireActual('@/features/phone-copy/unsentOverlay');
    const sum = () => new Map(Object.keys({ ...overlay.lessUnsent, ...overlay.lessHeld })
      .map(id => [id, (overlay.lessUnsent[id] ?? 0) + (overlay.lessHeld[id] ?? 0)] as const)
      .filter(([, n]) => n > 0));
    return { ...actual, getUnsentOverlay: () => ({ grn: () => null, lot: () => null, dispatch: () => null,
      lessUnsent: (id: string) => overlay.lessUnsent[id] ?? 0, lessHeld: (id: string) => overlay.lessHeld[id] ?? 0, deductions: sum }) };
  });
  await loadCopy(w);
  return w;
}

describe('R1: format 3, admin, supervisor and staff read orders from the copy and ask the server nothing', () => {
  it.each(['admin', 'supervisor', 'staff'] as const)('%s: the orders list, an order, the open order and recent dispatches', async role => {
    const w = await ready(role);
    const list = await orders().getOrdersList({ has_items: true });
    const one = await orders().getOrderWithItems('o-1');
    const open = await orders().OrderService.getCustomerOrder('c1');
    const recent = await dispatches().getRecentDispatchedOrders(10, 0);
    expect(w.serverCalls).toEqual([]);
    for (const result of [list, one, open, recent]) expect(sourceOf(result)).toEqual(copySource());
    expect(list.data?.map(o => o.id)).toEqual(['o-1']);
    expect(one.data?.items?.map(i => i.id)).toEqual(['ol-1', 'ol-2']);
    expect(open.data).toEqual({ order_id: 'o-1', order_no: 101, item_count: 2 });
  });

  it('the Orders tab and the queue read the list while offline', async () => {
    const w = await ready('supervisor');
    await goOffline(w);
    const list = await orders().getOrdersList({ has_items: true });
    expect(list.success).toBe(true);
    expect(list.data?.map(o => o.id)).toEqual(['o-1']);
    expect(w.serverCalls).toEqual([]);
  });

  it('an order names the dispatch made from it, and a recent dispatch the person who made it', async () => {
    await ready('admin');
    const two = await orders().getOrderWithItems('o-2');
    expect((two.data as unknown as { dispatch_no?: string }).dispatch_no).toBe('D2');
    const recent = await dispatches().getRecentDispatchedOrders(10, 0);
    expect(JSON.stringify(recent.data)).toContain('Meera Fictional');
  });

  it('a customer name for the order screen comes from the copy', async () => {
    const w = await ready('staff');
    const service = require(`@/services/${'order-service'}`) as { getOrderScreenCustomer: (id: string) => Promise<{ name?: string } | null> };
    expect((await service.getOrderScreenCustomer('c1'))?.name).toBe('asha Traders');
    expect(w.serverCalls).toEqual([]);
  });
});

describe('R3 (contract 13.3): a deactivated customer\'s order opens from the copy for staff, as for admin and supervisor', () => {
  it.each(['admin', 'supervisor', 'staff'] as const)('%s', async role => {
    seedOrders({ payments: false });
    seedDeactivatedCustomerOrder();
    const w = await bootWarehouse({ role });
    await loadCopy(w);
    const result = await orders().getOrderWithItems('o-3');
    expect(result.success).toBe(true);
    expect(result.data?.items?.map(i => i.id)).toEqual(['ol-4']);
    expect(sourceOf(result)).toEqual(copySource());
    expect(w.serverCalls).toEqual([]);
  });
});

describe('Payments (admin and supervisor): the invoice payments come from the copy, in the server order, with its figures', () => {
  it('lists the payments by date then number and copies the three figures', async () => {
    const w = await ready('admin');
    await goOffline(w);
    const result = await payments().getInvoicePayments('inv1');
    expect(result.payments.map(p => [p.id, p.amount])).toEqual([['pay-1', 500], ['pay-2', 1000]]);
    expect(result).toMatchObject({ paidAmount: 1500, dueAmount: 2821, status: 'part_paid' });
    expect(w.serverCalls).toEqual([]);
  });

  it('R5: a staff phone receives no payment rows', async () => {
    const w = await ready('staff');
    const db = await w.phone.copyDb.openCopy((await w.phone.scope())!);
    expect(await db.all('SELECT id FROM payments')).toEqual([]);
  });
});

describe('History needs a connection (Product PQ1)', () => {
  it('the order change log is not read from the copy: it asks the server', async () => {
    const w = await ready('admin');
    const log = require('@/services/change-log-service') as { ChangeLogService: { getCustomerChangeLog: (id: string) => Promise<unknown> } };
    const result = await log.ChangeLogService.getCustomerChangeLog('c1');
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_order_change_log']);
    expect(sourceOf(result)).toBeUndefined();
  });
});

describe('O1-O3: the stock of an order line is the one every screen shows (net of unsent and held dispatches)', () => {
  const stocks = async () => Object.fromEntries(((await orders().getOrderWithItems('o-1')).data?.items ?? [])
    .map(i => [i.id, i.grn_item?.current_stock]));

  it('O1: an unsent dispatch of 20 bags comes off the lot', async () => {
    await ready();
    overlay.lessUnsent.l04 = 20;
    expect(await stocks()).toEqual({ 'ol-1': 19, 'ol-2': 0 });
  });

  it('O2: held bags and unsent bags both come off', async () => {
    await ready();
    overlay.lessUnsent.l03 = 4;
    overlay.lessHeld.l03 = 6;
    expect(await stocks()).toEqual({ 'ol-1': 9, 'ol-2': 20 });
  });

  it('O3: no unsent work, the server figure', async () => {
    await ready();
    expect(await stocks()).toEqual({ 'ol-1': 19, 'ol-2': 20 });
  });

  it('the queue card read (the same service) shows the same net figure for the same lot', async () => {
    await ready('supervisor');
    overlay.lessUnsent.l03 = 4;
    const again = await orders().getOrderWithItems('o-1');
    expect(again.data?.items?.[0].grn_item?.current_stock).toBe(15);
  });
});

describe('R2: today stays today', () => {
  const asked = (w: { serverCalls: { name: string }[] }) => w.serverCalls.map(c => c.name);

  async function allServices() {
    await orders().getOrdersList({ has_items: true });
    await orders().getOrderWithItems('o-1');
    await orders().OrderService.getCustomerOrder('c1');
    await dispatches().getRecentDispatchedOrders(10, 0);
    await payments().getInvoicePayments('inv1').catch(() => undefined);
  }
  const TODAY = ['get_orders_list', 'get_order_with_items', 'get_customer_order', 'get_recent_dispatched_orders', 'get_invoice_detail'];

  it('feature off', async () => {
    seedOrders();
    const w = await bootWarehouse({ role: 'admin', capability: false });
    await tryLoadCopy(w);
    await allServices();
    expect(asked(w)).toEqual(TODAY);
  });

  it('a format-2 server', async () => {
    seedOrders();
    env.feed.format = 2;
    const w = await bootWarehouse({ role: 'admin' });
    await tryLoadCopy(w);
    await allServices();
    expect(asked(w)).toEqual(TODAY);
  });

  it('a customer account', async () => {
    seedOrders();
    const w = await bootWarehouse({ role: 'customer' });
    await tryLoadCopy(w);
    await allServices();
    expect(asked(w)).toEqual(TODAY);
  });

  it('feature off: stock is not reduced by the overlay and no source is on the answer', async () => {
    seedOrders();
    const w = await bootWarehouse({ role: 'admin', capability: false });
    w.answers.get_order_with_items = () => ({ data: { success: true, data: { order_data: { id: 'o-1', customer_id: 'c1' },
      items: [{ id: 'ol-1', grn_items_id: 'l03', current_stock: 19 }] } }, error: null });
    overlay.lessUnsent.l03 = 4;
    const result = await orders().getOrderWithItems('o-1');
    expect(result.data?.items?.[0].grn_item?.current_stock).toBe(19);
    expect(sourceOf(result)).toBeUndefined();
  });
});
