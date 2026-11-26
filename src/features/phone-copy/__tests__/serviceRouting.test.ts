/**
 * WH-299, contract product/tech/app-offline-read-from-copy.md sections 2, 3 and 13 (R1, R2, R3, R5): each service reads
 * the copy or the server, never both, and with the feature off or an older server today's calls and caches are
 * unchanged (spec criterion 14).
 *
 * Real: every service named, the sync engine, the copy, the store, the caches (AsyncStorage's own mock). Faked at the
 * edge: the server's answers and the phone's native modules.
 *
 * The R1 table proves only where each read comes from. What each reader returns is the parity tests' to prove (the GRN
 * list: grnListParity.test.ts; the others come with their slices).
 *
 * Not routed (contract section 1): customer activity (WH-305) and `loadGRNData` (WH-303).
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import {
  bootWarehouse, copySource, goOffline, loadCopy, loadUpTo, settleWrites, sourceOf, tryLoadCopy, type Warehouse,
} from '@/tests/phoneCopy/wh299Phone';

beforeEach(() => {
  resetEnv();
  seedWarehouse();
  env.feed.rows.dispatch.push({ id: 'd1', row: { id: 'd1', disp_no: 'D1', customer_id: 'c1', customer_name: 'asha Traders',
    disp_date: '2026-11-23T05:00:00+00:00', created_at: '2026-11-23T05:00:00+00:00', registration: 'GJ01AB1234', deleted_at: null } });
  env.feed.rows.dispatch_trl.push({ id: 'dt1', row: { id: 'dt1', disp_id: 'd1', gr_id: 'g-A2', gr_trl_id: 'l02', disp_qty: 100 } });
  env.feed.rows.people.push({ id: 'p1', row: { id: 'p1', name: 'Meera Fictional', display_name: 'Meera', role: 'staff' } });
  env.feed.rows.user_profiles.push({ id: 'p1', row: { id: 'p1', name: 'Meera Fictional', display_name: 'Meera', role: 'staff', mobile: '9000000009', active: true, is_service_account: false } });
  env.feed.rows.settings.push({ id: 'rack_presets', row: { floor: ['F-1'], chamber: ['C-1', 'C-2'], version: 3, max_label_length: 12, max_per_list: 20 } });
});
afterEach(async () => { await eraseEverything(); });

const grn = () => require('@/services/grn-service') as typeof import('@/services/grn-service');
const grnDetail = () => require('@/services/grn-detail-service') as typeof import('@/services/grn-detail-service');
const dispatch = () => require('@/services/dispatch-service') as typeof import('@/services/dispatch-service');
const dispatchDetail = () => require('@/services/dispatch-detail-service') as typeof import('@/services/dispatch-detail-service');
const search = () => require('@/services/search-service') as typeof import('@/services/search-service');
const racks = () => require('@/services/rackPresetsService') as typeof import('@/services/rackPresetsService');
const stockSummary = () => require('@/services/reporting/stock-summary-service') as typeof import('@/services/reporting/stock-summary-service');
const aging = () => require('@/services/reporting/stock-aging-service') as typeof import('@/services/reporting/stock-aging-service');
const grnActivity = () => require('@/services/reporting/grn-activity-service') as typeof import('@/services/reporting/grn-activity-service');
const dispatchActivity = () => require('@/services/reporting/dispatch-activity-service') as typeof import('@/services/reporting/dispatch-activity-service');

const period = { fromDate: '2026-11-01', toDate: '2026-11-25' };

/** Services whose result is an object: it carries `source` (contract section 2). */
const SOURCED: [string, () => Promise<unknown>][] = [
  ['getAllGRNItems', () => grn().getAllGRNItems({})],
  ['getGRNListPage', () => grn().getGRNListPage({ p_limit: 20, p_offset: 0 }, null)],
  ['getGRNDetails', () => grnDetail().getGRNDetails('g-A2')],
  ['getDispatchListWithItems', () => dispatch().getDispatchListWithItems({})],
  ['getDispatchDetails', () => dispatchDetail().getDispatchDetails('d1')],
  ['getAllStockSummary', () => stockSummary().getAllStockSummary()],
  ['getCustomerStockSummary', () => stockSummary().getCustomerStockSummary('c1')],
  ['StockService.getItemWiseStockList', () => (require('@/services/stock-service') as typeof import('@/services/stock-service')).StockService.getItemWiseStockList({})],
  ['getAllStockAging', () => aging().getAllStockAging()],
  ['getCustomerStockAging', () => aging().getCustomerStockAging({ customerId: 'c1' })],
  ['getAllGRNActivity', () => grnActivity().getAllGRNActivity(period)],
  ['getCustomerGRNActivity', () => grnActivity().getCustomerGRNActivity({ customerId: 'c1', ...period })],
  ['getAllDispatchActivity', () => dispatchActivity().getAllDispatchActivity(period)],
  ['getCustomerDispatchActivity', () => dispatchActivity().getCustomerDispatchActivity({ customerId: 'c1', ...period })],
];

/** Services whose result has no place for `source`: proved by what they answer and by the silence on the network. */
const PLAIN: [string, () => Promise<unknown>, unknown][] = [
  ['searchCustomersOrThrow', async () => (await search().searchService.searchCustomersOrThrow('bhavin')).length, 1],
  ['getCustomerStates', async () => (require('@/services/customer-service') as typeof import('@/services/customer-service')).customerService.getCustomerStates(['c1']),
    new Map([['c1', { active: true, deleted: false }]])],
  ['searchItems', () => (require('@/services/item-search-service') as typeof import('@/services/item-search-service')).searchItems('pea'),
    [{ id: 'i1', name: 'Peas', packaging: 'Bag' }]],
  ['searchGRNItems', async () => (await search().searchService.searchGRNItems('pea')).map(r => r.value), ['i1']],
  ['rackPresetsForForm', () => racks().rackPresetsForForm(), { floor: ['F-1'], chamber: ['C-1', 'C-2'] }],
  ['getRackPresets', async () => { const a = await racks().getRackPresets(); return a && { floor: a.floor, chamber: a.chamber, version: a.version, maxLabelLength: a.maxLabelLength, maxPerList: a.maxPerList }; },
    { floor: ['F-1'], chamber: ['C-1', 'C-2'], version: 3, maxLabelLength: 12, maxPerList: 20 }],
  ['getSupervisors', async () => {
    // New file (contract section 2): the supervisor picker's read moves out of the component.
    const service = require(`@/services/${'supervisor-service'}`) as { getSupervisors: (q: string) => Promise<unknown> };
    return JSON.stringify(await service.getSupervisors('meera')).includes('Meera Fictional');
  }, true],
];

async function ready() {
  const w = await bootWarehouse({ role: 'admin' });
  await loadCopy(w);
  return w;
}

describe('R1: with a ready copy every routed service reads the copy and asks the server nothing', () => {
  it.each(SOURCED)('%s', async (_name, read) => {
    const w = await ready();
    const result = await read();
    expect(w.serverCalls).toEqual([]);
    expect(result).toMatchObject({ success: true });
    expect(sourceOf(result)).toEqual(copySource());
  });

  it.each(PLAIN)('%s', async (_name, read, expected) => {
    const w = await ready();
    expect(await read()).toEqual(expected);
    expect(w.serverCalls).toEqual([]);
  });

  it.each(['supervisor', 'staff'] as const)('%s: the GRN list comes from the copy', async role => {
    const w = await bootWarehouse({ role });
    await loadCopy(w);
    const result = await grn().getAllGRNItems({});
    expect(w.serverCalls).toEqual([]);
    expect(sourceOf(result)).toEqual(copySource());
  });

  it('customer activity is not moved: it still asks the server', async () => {
    const w = await ready();
    const service = require('@/services/reporting/customer-activity-service') as typeof import('@/services/reporting/customer-activity-service');
    const result = await service.getAllCustomerActivity(period);
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_all_customer_activity_summary']);
    expect(sourceOf(result)).toBeUndefined();
  });
});

describe('R2: while the second stage loads', () => {
  it('reachable: the GRN list asks the server', async () => {
    const w = await bootWarehouse();
    const load = await loadUpTo(w, 'dispatch');
    const result = await grn().getAllGRNItems({});
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_all_grn_items']);
    expect(sourceOf(result)).toBeUndefined();
    await load.finish();
  });

  it('offline: the GRN list comes from the copy', async () => {
    const w = await bootWarehouse();
    const load = await loadUpTo(w, 'dispatch');
    await goOffline(w);
    const result = await grn().getAllGRNItems({});
    expect(result.success).toBe(true);
    expect(result.data.items).toHaveLength(8);
    expect(sourceOf(result)).toEqual(copySource());
    expect(w.serverCalls).toEqual([]);
    await load.finish();
  });

  it('offline: the Dispatch list, which the copy does not hold yet, answers as today', async () => {
    const w = await bootWarehouse();
    const load = await loadUpTo(w, 'dispatch');
    await goOffline(w);
    const result = await dispatch().getDispatchListWithItems({});
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_dispatch_list_with_items']);
    expect(result.success).toBe(false);
    expect(sourceOf(result)).toBeUndefined();
    await load.finish();
  });
});

const SERVER_ROW = { id: 'server-grn', grn_item_id: 'server-lot', gr_no: 'S1' };
const serverList = () => ({
  data: { success: true, data: [SERVER_ROW], pagination: { total_count: 1, limit: 20, offset: 0 }, aggregates: { total_qty: 1, total_stock: 1 } },
  error: null,
});
const REQUEST = { p_limit: 20, p_offset: 0, p_sort_by: 'gr_no' as const, p_sort_order: 'asc' as const, p_filters: { search: 'pk' } };

type OffCase = [string, () => Promise<{ w: Warehouse; finish?: () => Promise<void> }>];
const OFF: OffCase[] = [
  ['the facility lacks the capability', async () => {
    const w = await bootWarehouse({ capability: false });
    await tryLoadCopy(w);
    return { w };
  }],
  ['the server sends format 1', async () => {
    env.feed.format = 1;
    const w = await bootWarehouse();
    await loadCopy(w);
    return { w };
  }],
  ['the server has no sync functions (PGRST202)', async () => {
    const w = await bootWarehouse();
    const rpc = env.feed.rpc;
    env.feed.rpc = async (name, args) =>
      name.startsWith('get_sync_') ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } } : rpc(name, args);
    await w.phone.engine.startPhoneCopy();
    expect(await w.phone.engine.syncNow('open')).toBe('off');
    return { w };
  }],
  ['nothing is loaded yet', async () => {
    const w = await bootWarehouse();
    await w.phone.engine.startPhoneCopy();
    return { w };
  }],
  ['the first stage is still loading', async () => {
    const w = await bootWarehouse();
    const load = await loadUpTo(w, 'goodsreceived');
    return { w, finish: load.finish };
  }],
];

describe('R3: otherwise today\'s calls, results and caches are unchanged', () => {
  it.each(OFF)('%s: the same RPC with the same parameters, and the saved page when offline', async (_name, arrange) => {
    const { w, finish } = await arrange();
    w.answers.get_all_grn_items = serverList;
    const online = await grn().getGRNListPage(REQUEST, null);
    expect(w.serverCalls).toEqual([{ name: 'get_all_grn_items', args: REQUEST }]);
    expect(online.data.items).toEqual([SERVER_ROW]);
    expect(sourceOf(online)).toBeUndefined();
    await settleWrites();
    delete w.answers.get_all_grn_items;
    const offline = await grn().getGRNListPage(REQUEST, null);
    expect(offline).toMatchObject({ success: true, fromCache: true, data: { items: [SERVER_ROW] } });
    expect(sourceOf(offline)).toBeUndefined();
    await finish?.();
  });

  it('a customer account asks for its own customers\' goods, even with a staff copy still on the phone', async () => {
    const w = await bootWarehouse();
    await tryLoadCopy(w);
    w.setRole('customer');
    w.answers.get_customer_grn_items = () => ({ data: { success: true, data: { items: [SERVER_ROW], pagination: { total_count: 1 } } }, error: null });
    const result = await grn().getGRNListPage({ p_limit: 20, p_offset: 0 }, ['c1']);
    expect(w.serverCalls).toEqual([{ name: 'get_customer_grn_items', args: expect.objectContaining({ p_customer_id: 'c1' }) }]);
    expect(result.data.items.map(i => i.id)).toEqual(['server-grn']);
    expect(sourceOf(result)).toBeUndefined();
  });
});

describe('R5: copy answers and the saved server pages never mix', () => {
  it('a saved server page is not read while the copy answers, offline included', async () => {
    const w = await bootWarehouse({ capability: false });
    await loadCopy(w);
    w.answers.get_all_grn_items = serverList;
    await grn().getGRNListPage(REQUEST, null);
    await settleWrites();
    w.setCapability(true);
    await goOffline(w);
    const result = await grn().getGRNListPage(REQUEST, null);
    expect(sourceOf(result)).toEqual(copySource());
    expect(result.fromCache).toBeUndefined();
    expect(result.data.items.map(i => i.grn_item_id)).toEqual(['l01', 'l02', 'l06']);
  });

  it('a copy answer is not saved as the last server page', async () => {
    const w = await bootWarehouse();
    await loadCopy(w);
    const fromCopy = await grn().getGRNListPage(REQUEST, null);
    expect(sourceOf(fromCopy)).toEqual(copySource());
    await settleWrites();
    w.setCapability(false);
    const offline = await grn().getGRNListPage(REQUEST, null);
    expect(offline.success).toBe(false);
    expect(offline.fromCache).toBeUndefined();
    expect(offline.data.items).toEqual([]);
  });
});
