/**
 * WH-306 (written before the build): a customer account reads its own goods from the phone copy. Contract
 * product/tech/app-offline-customer-accounts.md sections 2, 3, 7.1, 8, 11 and 14; Product PQ1-PQ7 and Design 9.7 on the card.
 *
 * Real: the sync engine, the copy, the store (role), the capabilities, the GRN, dispatch, invoice and stock services.
 * Faked at the edge: the server's answers (customerAccountFeed.ts) and the phone's native modules.
 *
 * ===== AGREE WITH DEVELOPMENT (guesses) =====
 *  - `isWarehouseCopyRole` is exported by `@/config/offlineStart` next to `isCopyRole` (contract 2).
 *  - `CUSTOMER_COPY_FORMAT` is exported by `@/features/phone-copy/copySchema` (contract 12 "constant only").
 *  - `customerAge({ asOf, current, phoneDay })` lives in `@/features/phone-copy/customerAge` (contract 7.1); `phoneDay` is a
 *    `YYYY-MM-DD` business date string (contract: `businessDate(Date.now())`; the type is not named).
 *  - A customer account at feed format below 7: `feature` 'off', no copy file, `copyRoute` 'server' (contract 2, 8).
 *  - A copy reader refuses a customer id that is not in the copy with the service's own `success: false` and
 *    `errors.customer.accessDenied` text, and asks the server nothing (contract 3).
 *  - A service result from the copy carries `source` { kind: 'copy', asOf } as for staff (WH-299 contract 2).
 * SILENT in the contract: the answer shape of the customer dispatch list and invoice summary from the copy (tested by
 *    the numbers they hold, not by key); the invoice state on a GRN row (topic 1 of section 9 is open).
 * NOT COVERED here (need modules that are not in this tree): Statement and Customer activity fetches (C305: S1-S4), orders
 *    readers (C328), invoice details (C348), parity against the server's golden answers (B7).
 * ==============================================
 */
import { env, eraseEverything, idsOf, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { fakeDatabaseNames } from '@/tests/phoneCopy/fakeExpoSqlite';
import { CUSTOMER_ENTITIES, NEVER_FOR_CUSTOMER, seedCustomerAccount } from '@/tests/phoneCopy/customerAccountFeed';
import { bootWarehouse, copySource, goOffline, loadCopy, sourceOf, tryLoadCopy } from '@/tests/phoneCopy/wh299Phone';

const grn = () => require('@/services/grn-service') as typeof import('@/services/grn-service');
const dispatch = () => require('@/services/dispatch-service') as typeof import('@/services/dispatch-service');
const invoices = () => require('@/services/invoice-service') as typeof import('@/services/invoice-service');
const stock = () => require('@/services/reporting/stock-summary-service') as typeof import('@/services/reporting/stock-summary-service');
const route = () => require('@/features/phone-copy/readRoute') as { copyRoute(need: 'stage1' | 'all'): 'copy' | 'server' };
const grnNumbers = (result: { data: { items: Array<{ gr_no: string }> } }) => [...new Set(result.data.items.map(i => i.gr_no))].sort();

beforeEach(() => resetEnv());
afterEach(async () => { await eraseEverything(); });

describe('O1: roles', () => {
  it('a customer account is a copy role; it is not a warehouse copy role', () => {
    const config = require('@/config/offlineStart') as { isCopyRole(r: unknown): boolean; isWarehouseCopyRole(r: unknown): boolean };
    expect(config.isCopyRole('customer')).toBe(true);
    expect(config.isWarehouseCopyRole('customer')).toBe(false);
    for (const role of ['admin', 'supervisor', 'staff']) {
      expect(config.isCopyRole(role)).toBe(true);
      expect(config.isWarehouseCopyRole(role)).toBe(true);
    }
    expect(config.isCopyRole(undefined)).toBe(false);
    expect(config.isWarehouseCopyRole('customer ')).toBe(false);
  });

  it('the customer copy starts at feed format 7 or later', () => {
    const schema = require('@/features/phone-copy/copySchema') as { CUSTOMER_COPY_FORMAT: number };
    expect(schema.CUSTOMER_COPY_FORMAT).toBeGreaterThanOrEqual(7);
  });
});

describe('O2 to O4: turning the copy on', () => {
  it('first load over the account\'s 14 entities only; staff-only entities are never asked', async () => {
    seedCustomerAccount(['c1']);
    const w = await bootWarehouse({ role: 'customer' });
    await loadCopy(w);
    expect(w.phone.syncStore.getSyncSnapshot()).toMatchObject({ feature: 'on', phase: 'ready' });
    expect(w.phone.syncStore.getSyncSnapshot().format).toBeGreaterThanOrEqual(7);
    const asked = new Set(env.feed.named('get_sync_page').map(c => String(c.args.p_entity)));
    expect([...asked].sort()).toEqual(expect.arrayContaining(['customers', 'goodsreceived', 'dispatch', 'invoice']));
    for (const entity of NEVER_FOR_CUSTOMER) expect(asked.has(entity)).toBe(false);
    for (const entity of asked) expect(CUSTOMER_ENTITIES as readonly string[]).toContain(entity);
    expect(await idsOf(w.phone, 'customers')).toEqual(['c1']);
  });

  it('copyRoute is the copy for a customer account, online and offline', async () => {
    seedCustomerAccount(['c1']);
    const w = await bootWarehouse({ role: 'customer' });
    await loadCopy(w);
    expect([route().copyRoute('stage1'), route().copyRoute('all')]).toEqual(['copy', 'copy']);
    await goOffline(w);
    expect([route().copyRoute('stage1'), route().copyRoute('all')]).toEqual(['copy', 'copy']);
  });

  it('a feed below format 7: the feature is off, no copy file, every read stays on the server', async () => {
    seedCustomerAccount(['c1'], 6);
    const w = await bootWarehouse({ role: 'customer' });
    await tryLoadCopy(w);
    expect(w.phone.syncStore.getSyncSnapshot().feature).toBe('off');
    expect(fakeDatabaseNames()).toEqual([]);
    expect(route().copyRoute('all')).toBe('server');
    w.answers.get_customer_grn_items = () => ({ data: { success: true, data: { items: [], pagination: { total_count: 0 } } }, error: null });
    await grn().getGRNListPage({ p_limit: 20, p_offset: 0 }, ['c1']);
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_customer_grn_items']);
  });

  it('the capability off: today\'s server read, no copy', async () => {
    seedCustomerAccount(['c1']);
    const w = await bootWarehouse({ role: 'customer', capability: false });
    await tryLoadCopy(w);
    expect(route().copyRoute('all')).toBe('server');
    expect(fakeDatabaseNames()).toEqual([]);
  });
});

describe('R1, R4, R7, R9: the services read the account\'s own rows from the copy, offline, asking the server nothing', () => {
  it('one customer: the GRN list holds only its GRNs', async () => {
    seedCustomerAccount(['c1']);
    const w = await bootWarehouse({ role: 'customer' });
    await loadCopy(w);
    await goOffline(w);
    const result = await grn().getGRNListPage({ p_limit: 50, p_offset: 0 }, ['c1']);
    expect(result.success).toBe(true);
    expect(grnNumbers(result as never)).toEqual(['A2', 'B1', 'GR-1']);
    expect(sourceOf(result)).toEqual(copySource());
    expect(w.serverCalls).toEqual([]);
  });

  it('three customers (one soft-deleted, so out of scope): the merged list holds the other two, no more', async () => {
    seedCustomerAccount(['c1', 'c2']); // c3 left the feed with its deletion
    const w = await bootWarehouse({ role: 'customer' });
    await loadCopy(w);
    await goOffline(w);
    const result = await grn().getGRNListPage({ p_limit: 50, p_offset: 0 }, ['c1', 'c2', 'c3']);
    expect(grnNumbers(result as never)).toEqual(['A10', 'A2', 'B1', 'GR-1', 'a3']);
    expect(w.serverCalls).toEqual([]);
  });

  it('a customer not in the copy is refused with today\'s text and no row, and the server is not asked', async () => {
    seedCustomerAccount(['c1']);
    const w = await bootWarehouse({ role: 'customer' });
    await loadCopy(w);
    await goOffline(w);
    const result = await grn().getCustomerGRNItems('c3', { p_limit: 20, p_offset: 0 });
    expect(result.success).toBe(false);
    expect(result.message).toBe('Customer access denied');
    expect(result.data.items).toEqual([]);
    expect(w.serverCalls).toEqual([]);
  });

  it('the list rows carry none of the hidden or staff-only keys', async () => {
    seedCustomerAccount(['c1']);
    const w = await bootWarehouse({ role: 'customer' });
    await loadCopy(w);
    const result = await grn().getGRNListPage({ p_limit: 50, p_offset: 0 }, ['c1']);
    const keys = new Set(result.data.items.flatMap(i => Object.keys(i)));
    for (const key of ['created_by', 'updated_by', 'supervisor_id', 'sender_id', 'import_batch_id', 'created_by_name', 'updated_by_name', 'updated_by_display_name', 'user_access']) {
      expect(keys.has(key)).toBe(false);
    }
    expect(result.data.items.find(i => i.gr_no === 'A2')?.supervisor_name).toBe('Meera Fictional');
  });

  it('stock is the row\'s figure, with no unsent deduction', async () => {
    seedCustomerAccount(['c1']);
    const w = await bootWarehouse({ role: 'customer' });
    await loadCopy(w);
    const result = await grn().getGRNListPage({ p_limit: 50, p_offset: 0 }, ['c1']);
    const stockOf = (lot: string) => result.data.items.find(i => String(i.grn_item_id) === lot)?.stock;
    expect([stockOf('l02'), stockOf('l03'), stockOf('l06'), stockOf('l08')]).toEqual([0, 19, 9, 2]);
  });

  it('the dispatch list: only its customers\' dispatches', async () => {
    seedCustomerAccount(['c1']);
    const w = await bootWarehouse({ role: 'customer' });
    await loadCopy(w);
    await goOffline(w);
    const result = await dispatch().getAssignedCustomerDispatchList(['c1'], { p_limit: 50 });
    expect(result.success).toBe(true);
    const text = JSON.stringify(result.data);
    expect(text).toContain('D1');
    expect(text).toContain('D3');
    expect(text).not.toContain('D2');
    expect(text).not.toContain('D10');
    expect(text).not.toContain('created_by');
    expect(w.serverCalls).toEqual([]);
  });

  it('the invoices list: its customer\'s invoice only, from the copy', async () => {
    seedCustomerAccount(['c2']);
    const w = await bootWarehouse({ role: 'customer' });
    await loadCopy(w);
    await goOffline(w);
    const result = await invoices().getAssignedCustomerInvoices(['c2'], { p_limit: 50 });
    expect(result.success).toBe(true);
    expect(JSON.stringify(result.data)).toContain('7001');
    expect(w.serverCalls).toEqual([]);
    const other = await invoices().getAssignedCustomerInvoices(['c1'], { p_limit: 50 });
    expect(JSON.stringify(other.data)).not.toContain('7001');
  });

  it('the stock summary of its customer: its items only, from the copy', async () => {
    seedCustomerAccount(['c1']);
    const w = await bootWarehouse({ role: 'customer' });
    await loadCopy(w);
    await goOffline(w);
    const result = await stock().getCustomerStockSummary('c1');
    expect(result.success).toBe(true);
    expect(sourceOf(result)).toEqual(copySource());
    const text = JSON.stringify(result);
    expect(text).toContain('Beans');
    expect(text).not.toContain('Rice');
    expect(w.serverCalls).toEqual([]);
  });
});

describe('access change and a deleted customer (PQ4, L5)', () => {
  it('a deleted customer: the reload answers ACCESS_CHANGED, its rows leave the copy and its reads refuse', async () => {
    seedCustomerAccount(['c1', 'c2']);
    const w = await bootWarehouse({ role: 'customer' });
    await loadCopy(w);
    expect(await idsOf(w.phone, 'customers')).toEqual(['c1', 'c2']);
    await goOffline(w);
    // Offline the old copy stays readable until the next sync run.
    expect(grnNumbers(await grn().getGRNListPage({ p_limit: 50, p_offset: 0 }, ['c1', 'c2']) as never)).toContain('A10');

    // The server deletes c2: the account's scope changes, its copy key changes, the feed answers reload_all.
    await w.phone.engine.stopPhoneCopy();
    resetFeedTo(['c1']);
    env.feed.copy = '1.6f1c0000-0000-4000-8000-000000000002.9e107d9d372bb6826bd81d3542a4aaaa';
    env.reachable = true;
    const { setReachable } = require('@/tests/phoneCopy/phoneEnv') as typeof import('@/tests/phoneCopy/phoneEnv');
    await setReachable(true);
    w.phone.engine.setCopyOffline(false);
    env.feed.changeAnswers.push({ position: '1048600', as_of: env.feed.asOf, more: false, reload_all: { reason: 'ACCESS_CHANGED' }, reload: [], changes: [] });
    await w.phone.engine.startPhoneCopy();
    expect(await w.phone.engine.syncNow('interval')).toBe('done');

    expect(await idsOf(w.phone, 'customers')).toEqual(['c1']);
    const result = await grn().getGRNListPage({ p_limit: 50, p_offset: 0 }, ['c1', 'c2']);
    expect(grnNumbers(result as never)).toEqual(['A2', 'B1', 'GR-1']);
    const refused = await grn().getCustomerGRNItems('c2', { p_limit: 20, p_offset: 0 });
    expect(refused).toMatchObject({ success: false, message: 'Customer access denied' });
  });
});

/** The server's feed again, for the account's customers `own` (what a changed assignment gives). */
function resetFeedTo(own: string[]) {
  const { copy, startPosition, asOf } = env.feed;
  resetEnv();
  seedCustomerAccount(own);
  Object.assign(env.feed, { copy, startPosition, asOf });
}

describe('A1: customerAge (Design 9.2 and 9.7, contract 7.1)', () => {
  const age = (a: { asOf: string; current: boolean; phoneDay: string }) =>
    (require('@/features/phone-copy/customerAge') as { customerAge(a: unknown): string }).customerAge(a);

  it('current wins whatever the day', () => {
    expect(age({ asOf: '2026-11-25T05:12:00.000+00:00', current: true, phoneDay: '2026-11-25' })).toBe('current');
  });
  it('not current, the copy\'s own day: today', () => {
    expect(age({ asOf: '2026-11-25T05:12:00.000+00:00', current: false, phoneDay: '2026-11-25' })).toBe('today');
  });
  it('not current, an earlier day: earlier', () => {
    expect(age({ asOf: '2026-11-25T05:12:00.000+00:00', current: false, phoneDay: '2026-11-26' })).toBe('earlier');
  });
  it('the phone clock set back (its day before the copy\'s): earlier, never today', () => {
    expect(age({ asOf: '2026-11-25T05:12:00.000+00:00', current: false, phoneDay: '2026-11-24' })).toBe('earlier');
  });
  it('the business day is the facility\'s (Asia/Kolkata): 20:00 UTC on the 25th is the 26th', () => {
    expect(age({ asOf: '2026-11-25T20:00:00.000+00:00', current: false, phoneDay: '2026-11-26' })).toBe('today');
  });
});
