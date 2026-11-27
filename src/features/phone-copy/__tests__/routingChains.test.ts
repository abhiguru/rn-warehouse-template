/**
 * WH-299, contract product/tech/app-offline-read-from-copy.md section 2.2 (R4) and Product's PR12 on the WH-299 card:
 * one source for all the pages of a list, a first page the copy cannot read, and the Invoicing filter while the copy
 * has no invoice state.
 *
 * Real: the services, the sync engine, the copy. Faked at the edge: the server's answers and the phone's native modules
 * (one database statement is made to fail where a case needs a read error).
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - A later page whose source would change answers `success: false` with `copyRestart: true` and asks the server nothing.
 *  - Product's PR12 names no flag for "the copy cannot answer this filter yet": only what must not happen is checked
 *    here, and what the person sees in grnListCopyScreen.test.tsx.
 * ==================================
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { failStatement } from '@/tests/phoneCopy/fakeExpoSqlite';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import {
  bootWarehouse, copySource, goOffline, loadCopy, loadUpTo, settleWrites, sourceOf, type Warehouse,
} from '@/tests/phoneCopy/wh299Phone';

const DROPPED = new Set(['dispatch', 'dispatch_trl', 'dispatch_images', 'invoice', 'invoice_trl', 'payments', 'orders', 'order_items']);

beforeEach(() => {
  resetEnv();
  seedWarehouse();
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

const grn = () => require('@/services/grn-service') as typeof import('@/services/grn-service');
const dispatch = () => require('@/services/dispatch-service') as typeof import('@/services/dispatch-service');
const stock = () => (require('@/services/stock-service') as typeof import('@/services/stock-service')).StockService;

const restartOf = (result: unknown) => (result as { copyRestart?: boolean }).copyRestart;
const names = (w: Warehouse) => w.serverCalls.map(call => call.name);
const lotIds = (result: { data: { items: { grn_item_id?: string }[] } }) => result.data.items.map(item => item.grn_item_id);

/** The paged services: one page of `size` rows, from `offset`. */
const PAGED: [string, (offset: number) => Promise<unknown>][] = [
  ['getAllGRNItems', offset => grn().getAllGRNItems({ p_limit: 1, p_offset: offset })],
  ['getGRNListPage', offset => grn().getGRNListPage({ p_limit: 1, p_offset: offset }, null)],
  ['getItemWiseStockList', offset => stock().getItemWiseStockList({ limit: 1, offset })],
];

describe('R4: a later page never comes from another source than the first', () => {
  it.each(PAGED)('%s: first page from the copy, copy erased: page 2 asks for a restart, then page 1 asks the server', async (_name, page) => {
    const w = await bootWarehouse({ role: 'admin' });
    await loadCopy(w);
    expect(sourceOf(await page(0))).toEqual(copySource());
    await w.phone.copyDb.eraseCopy();
    const later = await page(1);
    expect(later).toMatchObject({ success: false });
    expect(restartOf(later)).toBe(true);
    expect(sourceOf(later)).toBeUndefined();
    expect(w.serverCalls).toEqual([]);
    const again = await page(0);
    expect(w.serverCalls).toHaveLength(1);
    expect(sourceOf(again)).toBeUndefined();
    expect(restartOf(again)).toBeUndefined();
  });

  it.each(PAGED)('%s: first page from the server, copy becomes ready: page 2 asks for a restart, then page 1 reads the copy', async (_name, page) => {
    const w = await bootWarehouse({ role: 'admin' });
    const load = await loadUpTo(w, 'goodsreceived');
    await page(0);
    expect(w.serverCalls).toHaveLength(1);
    await load.finish();
    const later = await page(1);
    expect(later).toMatchObject({ success: false });
    expect(restartOf(later)).toBe(true);
    expect(w.serverCalls).toHaveLength(1);
    expect(sourceOf(await page(0))).toEqual(copySource());
    expect(w.serverCalls).toHaveLength(1);
  });

  it('the restart is the list\'s normal failure: no rows and the load failure message', async () => {
    const w = await bootWarehouse();
    await loadCopy(w);
    await grn().getAllGRNItems({ p_limit: 3, p_offset: 0 });
    await w.phone.copyDb.eraseCopy();
    const later = await grn().getAllGRNItems({ p_limit: 3, p_offset: 3 });
    const { t } = require('@/i18n') as typeof import('@/i18n');
    expect(later).toMatchObject({ success: false, message: t('errors.grn.fetchItemsFailed'), data: { items: [] } });
    expect(restartOf(later)).toBe(true);
    expect(w.serverCalls).toEqual([]);
  });

  it('a page after a restart is not answered from the saved server page', async () => {
    const w = await bootWarehouse();
    await loadCopy(w);
    await grn().getGRNListPage({ p_limit: 3, p_offset: 0 }, null);
    await w.phone.copyDb.eraseCopy();
    const later = await grn().getGRNListPage({ p_limit: 3, p_offset: 3 }, null);
    expect(later.fromCache).toBeUndefined();
    expect(restartOf(later)).toBe(true);
  });

  it.each<[string, (w: Warehouse) => void | Promise<void>]>([
    ['the facility loses the capability', w => w.setCapability(false)],
    ['the copy on the phone is another one', async w => {
      const db = await w.phone.copyDb.openCopy((await w.phone.scope())!);
      await db.run("UPDATE meta SET v = 'another-copy' WHERE k = 'copy'");
    }],
  ])('restarts when %s', async (_name, change) => {
    const w = await bootWarehouse();
    await loadCopy(w);
    await grn().getAllGRNItems({ p_limit: 3, p_offset: 0 });
    await change(w);
    const later = await grn().getAllGRNItems({ p_limit: 3, p_offset: 3 });
    expect(restartOf(later)).toBe(true);
    expect(w.serverCalls).toEqual([]);
  });

  it('restarts when a later page cannot be read from the copy', async () => {
    const w = await bootWarehouse();
    await loadCopy(w);
    await grn().getAllGRNItems({ p_limit: 3, p_offset: 0 });
    failStatement(/(FROM|JOIN)\s+(goodsreceived|lot_search)/i, new Error('disk I/O error'));
    const later = await grn().getAllGRNItems({ p_limit: 3, p_offset: 3 });
    expect(later.success).toBe(false);
    expect(restartOf(later)).toBe(true);
    expect(w.serverCalls).toEqual([]);
  });

  it('with the same source, page 2 simply follows page 1', async () => {
    const w = await bootWarehouse();
    await loadCopy(w);
    await grn().getAllGRNItems({ p_limit: 3, p_offset: 0 });
    const later = await grn().getAllGRNItems({ p_limit: 3, p_offset: 3 });
    expect(restartOf(later)).toBeUndefined();
    expect(lotIds(later)).toEqual(['l06', 'l04', 'l02']);
    expect(sourceOf(later)).toEqual(copySource());
  });

  it('each request keeps its own source: another search\'s first page does not restart this one', async () => {
    const w = await bootWarehouse();
    await loadCopy(w);
    await grn().getAllGRNItems({ p_limit: 1, p_offset: 0, p_filters: { search: 'peas' } });
    w.setCapability(false);
    await grn().getAllGRNItems({ p_limit: 1, p_offset: 0, p_filters: { search: 'rice' } }); // from the server
    w.setCapability(true);
    const peas = await grn().getAllGRNItems({ p_limit: 1, p_offset: 1, p_filters: { search: 'peas' } });
    expect(restartOf(peas)).toBeUndefined();
    expect(sourceOf(peas)).toEqual(copySource());
    const rice = await grn().getAllGRNItems({ p_limit: 1, p_offset: 1, p_filters: { search: 'rice' } });
    expect(restartOf(rice)).toBe(true);
  });

  it('with no record of the first page (the app was restarted), a later page takes the current route', async () => {
    const w = await bootWarehouse();
    await loadCopy(w);
    const later = await grn().getAllGRNItems({ p_limit: 3, p_offset: 3 });
    expect(restartOf(later)).toBeUndefined();
    expect(lotIds(later)).toEqual(['l06', 'l04', 'l02']);
    expect(w.serverCalls).toEqual([]);
  });
});

describe('a first page the copy cannot read', () => {
  it('is answered by today\'s server path, with nothing from the copy', async () => {
    const w = await bootWarehouse();
    await loadCopy(w);
    w.answers.get_all_grn_items = () => ({
      data: { success: true, data: [{ id: 'server-grn', grn_item_id: 'server-lot' }], pagination: { total_count: 1, limit: 20, offset: 0 } }, error: null,
    });
    failStatement(/(FROM|JOIN)\s+(goodsreceived|lot_search)/i, new Error('disk I/O error'));
    const result = await grn().getAllGRNItems({ p_limit: 20, p_offset: 0 });
    expect(names(w)).toEqual(['get_all_grn_items']);
    expect(result.success).toBe(true);
    expect(lotIds(result)).toEqual(['server-lot']);
    expect(sourceOf(result)).toBeUndefined();
    expect(restartOf(result)).toBeUndefined();
  });
});

describe('PR12 (WH-381): the Invoicing filter offline over a ready copy', () => {
  const REQUEST = { p_limit: 20, p_offset: 0, p_filters: { invoiced: false } };

  it.each([[true], [false], ['partly_invoiced']] as const)(
    'invoiced = %s offline answers no rows and invoiceFilterWaiting, from neither the server nor a saved page', async invoiced => {
      const w = await bootWarehouse();
      const request = { ...REQUEST, p_filters: { invoiced } };
      // A server page of this very request, saved while copy was not ready yet.
      w.answers.get_all_grn_items = () => ({
        data: { success: true, data: [{ id: 'server-grn', grn_item_id: 'server-lot' }], pagination: { total_count: 1, limit: 20, offset: 0 } }, error: null,
      });
      await grn().getGRNListPage(request, null);
      await settleWrites();
      delete w.answers.get_all_grn_items;
      await loadCopy(w);
      await goOffline(w);
      w.serverCalls.length = 0;
      const result: any = await grn().getGRNListPage(request, null);
      expect(w.serverCalls).toEqual([]);
      expect(result.fromCache).toBeUndefined();
      expect(result.data.items).toEqual([]);
      expect(result.invoiceFilterWaiting).toBe(true);
    });

  it('works from the copy when online', async () => {
    const w = await bootWarehouse();
    await loadCopy(w);
    const result = await grn().getGRNListPage(REQUEST, null);
    expect(lotIds(result).sort()).toEqual(['l04', 'l05', 'l06', 'l07', 'l08']);
    expect(sourceOf(result)).toEqual(copySource());
    expect(w.serverCalls).toEqual([]);
  });
});
