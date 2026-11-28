/**
 * WH-381 (supersedes WH-328): orders, recent dispatched orders, and payments are server-only
 * and NEVER read from the phone copy (online or offline, for any role). No orders, order_items,
 * or payments tables exist in the schema-5 phone copy DB.
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { seedDocuments } from '@/tests/phoneCopy/documentsDataset';
import { seedOrders } from '@/tests/phoneCopy/ordersDataset';
import { bootWarehouse, goOffline, loadCopy, sourceOf, tryLoadCopy, type Role } from '@/tests/phoneCopy/wh299Phone';

const DROPPED = new Set(['dispatch', 'dispatch_trl', 'dispatch_images', 'invoice', 'invoice_trl', 'payments', 'orders', 'order_items']);

function stripDropped() {
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
}

beforeEach(() => {
  resetEnv();
  seedWarehouse();
  seedDocuments();
});
afterEach(async () => { await eraseEverything(); });

const orders = () => require('@/services/order-service') as typeof import('@/services/order-service');
const dispatches = () => require('@/services/dispatch-service') as typeof import('@/services/dispatch-service');
const payments = () => require('@/services/paymentsService') as typeof import('@/services/paymentsService');

async function ready(role: Role = 'admin') {
  seedOrders({ payments: role !== 'staff' });
  stripDropped();
  const w = await bootWarehouse({ role });
  await loadCopy(w);
  return w;
}

describe('WH-381: orders, recent dispatches and payments always ask the server (never read from phone copy)', () => {
  const TODAY = ['get_orders_list', 'get_order_with_items', 'get_customer_order', 'get_recent_dispatched_orders', 'get_invoice_detail'];

  async function allServices() {
    const r1 = await orders().getOrdersList({ has_items: true });
    const r2 = await orders().getOrderWithItems('o-1');
    const r3 = await orders().OrderService.getCustomerOrder('c1');
    const r4 = await dispatches().getRecentDispatchedOrders(10, 0);
    const r5 = await payments().getInvoicePayments('inv1').catch(() => undefined);
    return [r1, r2, r3, r4, r5];
  }

  it.each(['admin', 'supervisor', 'staff'] as const)('%s online over a ready copy: every order/dispatch/payment call goes to the server', async role => {
    const w = await ready(role);
    const results = await allServices();
    expect(w.serverCalls.map(c => c.name)).toEqual(TODAY);
    for (const r of results) expect(sourceOf(r)).toBeUndefined();
  });

  it.each(['admin', 'supervisor', 'staff'] as const)('%s offline over a ready copy: never serves orders, recent dispatches, or payments from the copy', async role => {
    const w = await ready(role);
    await goOffline(w);
    const results = await allServices();
    expect(w.serverCalls.map(c => c.name)).toEqual(TODAY);
    for (const r of results) expect(sourceOf(r)).toBeUndefined();
    await orders().getOrderScreenCustomer('c1').catch(() => undefined);
    expect(w.serverCalls.map(c => c.name)).toContain('from:customers');
  });

  it('orders, order_items, and payments tables are absent from the phone copy DB', async () => {
    const w = await ready('admin');
    const db = await w.phone.copyDb.openCopy((await w.phone.scope())!);
    const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map(r => r.name);
    for (const dropped of ['orders', 'order_items', 'payments']) expect(tables).not.toContain(dropped);
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

describe('R2: today stays today', () => {
  const asked = (w: { serverCalls: { name: string }[] }) => w.serverCalls.map(c => c.name);
  const TODAY = ['get_orders_list', 'get_order_with_items', 'get_customer_order', 'get_recent_dispatched_orders', 'get_invoice_detail'];

  async function allServices() {
    await orders().getOrdersList({ has_items: true });
    await orders().getOrderWithItems('o-1');
    await orders().OrderService.getCustomerOrder('c1');
    await dispatches().getRecentDispatchedOrders(10, 0);
    await payments().getInvoicePayments('inv1').catch(() => undefined);
  }

  it('feature off', async () => {
    seedOrders();
    stripDropped();
    const w = await bootWarehouse({ role: 'admin', capability: false });
    await tryLoadCopy(w);
    await allServices();
    expect(asked(w)).toEqual(TODAY);
  });

  it('a customer account', async () => {
    seedOrders();
    stripDropped();
    const w = await bootWarehouse({ role: 'customer' });
    await tryLoadCopy(w);
    await allServices();
    expect(asked(w)).toEqual(TODAY);
  });

  it('feature off: stock is not reduced by any overlay and no source is on the answer', async () => {
    seedOrders();
    stripDropped();
    const w = await bootWarehouse({ role: 'admin', capability: false });
    w.answers.get_order_with_items = () => ({ data: { success: true, data: { order_data: { id: 'o-1', customer_id: 'c1' },
      items: [{ id: 'ol-1', grn_items_id: 'l03', current_stock: 19 }] } }, error: null });
    const result = await orders().getOrderWithItems('o-1');
    expect(result.data?.items?.[0].grn_item?.current_stock).toBe(19);
    expect(sourceOf(result)).toBeUndefined();
  });
});
