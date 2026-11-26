/**
 * WH-299, Development's "For Test" asks on the Ready-for-test note (slices 3 and 4) and one gap the mutation check found:
 *  - kept dispatch photos offline (contract section 9; the dispatch's photos are kept under `dispatch-images/<path>`),
 *  - a copy-sourced Dispatch list never reads, writes or replaces the saved dispatch pages,
 *  - a GRN with no supervisor id finds its supervisor by name, and a dispatch with one uses the id,
 *  - `can_create_invoice` is never true for an imported GRN,
 *  - the Invoicing filter while older records load answers no rows and says the filter is waiting (PR12).
 *
 * Real: the services, the sync engine, the copy. Faked at the edge: the server's answers and the phone's native modules
 * (the phone's files, tests/phoneCopy/fakeFiles.ts).
 */
type Storage = typeof import('@react-native-async-storage/async-storage').default;
/** The app was booted afresh (modules loaded again): the storage is the one the services hold now. */
const storage = (): Storage => {
  const loaded = require('@react-native-async-storage/async-storage') as { default?: Storage } & Storage;
  return loaded.default ?? loaded;
};
import { env, eraseEverything, mockFactories, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { fileSystemModule, files } from '@/tests/phoneCopy/fakeFiles';
import { GRNS, grnFeedRow, lockRow, seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { photoRow, seedDocuments } from '@/tests/phoneCopy/documentsDataset';
import { bootWarehouse, copySource, goOffline, loadCopy, loadUpTo, settleWrites, sourceOf } from '@/tests/phoneCopy/wh299Phone';

const plainFiles = mockFactories.fileSystem;
beforeAll(() => { mockFactories.fileSystem = fileSystemModule as never; });
afterAll(() => { mockFactories.fileSystem = plainFiles; });
jest.mock('expo-file-system/legacy', () => require('@/tests/phoneCopy/fakeFiles').fileSystemModule(), { virtual: true });

beforeEach(() => {
  resetEnv();
  files.reset();
  seedWarehouse();
  seedDocuments();
});
afterEach(async () => { await eraseEverything(); });

const grnDetails = (id: string) =>
  (require('@/services/grn-detail-service') as typeof import('@/services/grn-detail-service')).getGRNDetails(id);
const dispatchDetails = (id: string) =>
  (require('@/services/dispatch-detail-service') as typeof import('@/services/dispatch-detail-service')).getDispatchDetails(id);
const dispatchList = (params: Record<string, unknown> = {}) =>
  (require('@/services/dispatch-service') as typeof import('@/services/dispatch-service')).getDispatchListWithItems(params as never);
const grnService = () => require('@/services/grn-service') as typeof import('@/services/grn-service');
const photoStore = () => require(`@/features/phone-copy/${'photoStore'}`) as {
  keepPhoto(path: string, url: string): Promise<unknown>; photoFile(path: string): Promise<string | null>;
};

async function ready() {
  const w = await bootWarehouse({ role: 'admin' });
  await loadCopy(w);
  return w;
}
async function sync(w: Awaited<ReturnType<typeof ready>>, changes: unknown[]) {
  env.feed.changeAnswers.push({ position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [], changes: changes as never });
  expect(await w.phone.engine.syncNow('interval')).toBe('done');
}
const imageOf = (result: any, id: string) => result.data.dispatch.processed_images.find((image: any) => image.id === id);

describe('kept dispatch photos, offline', () => {
  beforeEach(() => {
    env.feed.rows.dispatch_images.push({ id: 'ph-disp-2', row: photoRow('ph-disp-2', { dispatch_id: 'd-D2', display_order: 2 }) });
  });

  it('a dispatch photo viewed before is shown from the phone; one never viewed says it needs a connection', async () => {
    const w = await ready();
    await photoStore().keepPhoto('dispatch-images/fictional/ph-disp.jpg', 'https://warehouse.example.test/signed/ph-disp.jpg');
    const file = await photoStore().photoFile('dispatch-images/fictional/ph-disp.jpg');
    expect(file).toMatch(/phone-copy-photos\//);
    await goOffline(w);
    w.serverCalls.length = 0;
    const result: any = await dispatchDetails('d-D2');
    expect(sourceOf(result)).toEqual(copySource());
    expect(imageOf(result, 'ph-disp')).toMatchObject({ image_url: file });
    expect(imageOf(result, 'ph-disp')).not.toHaveProperty('needs_connection');
    expect(imageOf(result, 'ph-disp-2')).toMatchObject({ image_url: '', needs_connection: true });
    expect(w.serverCalls).toEqual([]);
  });

  it('a GRN photo kept under the same file name does not stand in for the dispatch photo', async () => {
    const w = await ready();
    // The GRN's photo has this very path; only the dispatch's own key (dispatch-images/...) keeps its photo.
    await photoStore().keepPhoto('fictional/ph-disp.jpg', 'https://warehouse.example.test/signed/grn-photo.jpg');
    await goOffline(w);
    const result: any = await dispatchDetails('d-D2');
    expect(imageOf(result, 'ph-disp')).toMatchObject({ image_url: '', needs_connection: true });
  });
});

describe('a copy-sourced Dispatch list leaves the saved dispatch pages alone', () => {
  const savedKeys = async () => (await storage().getAllKeys()).filter(key => key.startsWith('dispatch_list_cache')).sort();
  const saved = async () => Object.fromEntries(await Promise.all((await savedKeys()).map(async key => [key, await storage().getItem(key)])));

  it('reads none, writes none, and does not answer from a page saved earlier', async () => {
    const w = await bootWarehouse({ role: 'admin' });
    // A page of the same request, saved while the server answered (the copy is not loaded yet).
    w.answers.get_dispatch_list_with_items = () => ({
      data: {
        success: true,
        data: { dispatches: [{ id: 'server-d', disp_no: 'S1', dispatch_date: '2026-11-25', customer_name: 'Server Fictional Traders', items: [] }], total_count: 1, current_page: 1, total_pages: 1, limit: 20 },
      },
      error: null,
    });
    const first = await dispatchList({});
    expect(sourceOf(first)).toBeUndefined();
    for (let i = 0; i < 6; i += 1) await settleWrites(); // the page's write is not waited for by the service
    const before = await saved();
    // The saved page and the cache's index.
    expect(Object.keys(before)).toHaveLength(2);

    await loadCopy(w);
    await goOffline(w);
    delete w.answers.get_dispatch_list_with_items;
    w.serverCalls.length = 0;
    const read = jest.spyOn(storage(), 'getItem');
    const readMany = jest.spyOn(storage(), 'multiGet');
    const written = jest.spyOn(storage(), 'setItem');
    const writtenMany = jest.spyOn(storage(), 'multiSet');
    const removed = jest.spyOn(storage(), 'multiRemove');
    // The storage mock's functions already hold the calls made before this point.
    for (const spy of [read, readMany, written, writtenMany, removed]) spy.mockClear();

    const result: any = await dispatchList({});
    await settleWrites();
    expect(sourceOf(result)).toEqual(copySource());
    expect(result.fromCache).toBeUndefined();
    expect(result.data.dispatches.map((d: any) => d.disp_no)).toEqual(['D3', 'D2', 'D1', 'D10', 'D4']);
    expect(w.serverCalls).toEqual([]);
    const touched = [...read.mock.calls, ...readMany.mock.calls, ...written.mock.calls, ...writtenMany.mock.calls, ...removed.mock.calls]
      .map(call => JSON.stringify(call)).filter(call => call.includes('dispatch_list_cache'));
    expect(touched).toEqual([]);
    expect(await saved()).toEqual(before);
  });
});

describe('fallbacks in GRN and dispatch details', () => {
  it('a GRN with no supervisor id finds its supervisor by the name it carries', async () => {
    await ready();
    const { grn } = ((await grnDetails('g-A2')) as any).data;
    expect(GRNS.find(g => g.id === 'g-A2')).not.toHaveProperty('supervisor_id');
    expect(grn.supervisor_details).toMatchObject({ id: 'p1', name: 'Meera Fictional', role: 'staff' });
  });

  it('a GRN whose name matches nobody has no supervisor details, and one with no name has none either', async () => {
    const w = await ready();
    await sync(w, [{ e: 'goodsreceived', id: 'g-A2', op: 'upsert', v: 'b000000000000001', row: { ...grnFeedRow(GRNS.find(g => g.id === 'g-A2')!), supervisor_name: 'Nobody Fictional' } }]);
    expect(((await grnDetails('g-A2')) as any).data.grn.supervisor_details).toBeNull();
    expect(((await grnDetails('g-a3')) as any).data.grn.supervisor_details).toBeNull();
  });

  it('a record with a supervisor id uses the id, whatever name it carries', async () => {
    const w = await ready();
    await sync(w, [{ e: 'dispatch', id: 'd-D2', op: 'upsert', v: 'b000000000000001', row: { ...require('@/tests/phoneCopy/documentsDataset').dispatchRow('D2'), supervisor_name: 'Another Name' } }]);
    const { dispatch } = ((await dispatchDetails('d-D2')) as any).data;
    expect(dispatch.supervisor_details).toMatchObject({ id: 'p1', name: 'Meera Fictional' });
  });
});

describe('can_create_invoice is never true for an imported GRN', () => {
  /** A2 with every other condition met: stock out, not invoiced, a dispatched line with no invoice. */
  const readyToInvoice = (imported: boolean) => {
    const a2 = GRNS.find(g => g.id === 'g-A2')!;
    const row = { ...grnFeedRow(a2), out_of_stock: true, invoiced: false, import_batch_id: imported ? 'batch-1' : null };
    return [
      { e: 'goodsreceived', id: 'g-A2', op: 'upsert', v: 'b000000000000001', row },
      { e: 'grn_lock', id: 'g-A2', op: 'upsert', v: 'b000000000000002', row: lockRow({ ...a2, ...row } as never) },
    ];
  };
  const canCreate = async () => ((await grnDetails('g-A2')) as any).data.grn.invoices_summary.can_create_invoice;

  it('control: the same GRN, not imported, may be invoiced', async () => {
    const w = await ready();
    await sync(w, readyToInvoice(false));
    expect(await canCreate()).toBe(true);
  });

  it('imported: not offered', async () => {
    const w = await ready();
    await sync(w, readyToInvoice(true));
    const { grn } = ((await grnDetails('g-A2')) as any).data;
    expect(grn.imported).toBe(true);
    expect(grn.invoices_summary.can_create_invoice).toBe(false);
  });
});

describe('PR12: the Invoicing filter while older records load', () => {
  it.each([[true], [false]])('invoiced = %s: no rows, and the answer says the filter is waiting, not "no match"', async invoiced => {
    const w = await bootWarehouse({ role: 'admin' });
    const load = await loadUpTo(w, 'dispatch');
    await goOffline(w);
    const result: any = await grnService().getGRNListPage({ p_limit: 20, p_offset: 0, p_filters: { invoiced } }, null);
    expect(result.data.items).toEqual([]);
    expect(result.invoiceFilterWaiting).toBe(true);
    expect(w.serverCalls).toEqual([]);
    // Without the filter the same list answers.
    const plain: any = await grnService().getGRNListPage({ p_limit: 20, p_offset: 0 }, null);
    expect(plain.data.items.length).toBeGreaterThan(0);
    expect(plain.invoiceFilterWaiting).toBeUndefined();
    await load.finish();
  });
});
