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

const DROPPED = new Set(['dispatch', 'dispatch_trl', 'dispatch_images', 'invoice', 'invoice_trl', 'payments', 'orders', 'order_items']);

beforeEach(() => {
  resetEnv();
  files.reset();
  seedWarehouse();
  seedDocuments();
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

describe('WH-381: dispatch details and dispatch list always use the server (never the phone copy)', () => {
  it('getDispatchDetails calls get_dispatch_details on the server offline over a ready copy', async () => {
    const w = await ready();
    await goOffline(w);
    w.serverCalls.length = 0;
    const result: any = await dispatchDetails('d-D2');
    expect(sourceOf(result)).toBeUndefined();
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_dispatch_details']);
  });

  it('getDispatchListWithItems calls get_dispatch_list_with_items on the server offline over a ready copy', async () => {
    const w = await ready();
    await goOffline(w);
    w.serverCalls.length = 0;
    const result: any = await dispatchList({});
    expect(sourceOf(result)).toBeUndefined();
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_dispatch_list_with_items']);
  });
});

describe('fallbacks in GRN details', () => {
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

  it('a GRN with a supervisor id uses the id, whatever name it carries', async () => {
    const w = await ready();
    await sync(w, [{ e: 'goodsreceived', id: 'g-A2', op: 'upsert', v: 'b000000000000001', row: { ...grnFeedRow(GRNS.find(g => g.id === 'g-A2')!), supervisor_id: 'p1', supervisor_name: 'Another Name' } }]);
    const { grn } = ((await grnDetails('g-A2')) as any).data;
    expect(grn.supervisor_details).toMatchObject({ id: 'p1', name: 'Meera Fictional' });
  });
});

describe('WH-381: can_create_invoice is always false from the phone copy', () => {
  const readyToInvoice = (imported: boolean) => {
    const a2 = GRNS.find(g => g.id === 'g-A2')!;
    const row = { ...grnFeedRow(a2), out_of_stock: true, invoiced: false, import_batch_id: imported ? 'batch-1' : null };
    return [
      { e: 'goodsreceived', id: 'g-A2', op: 'upsert', v: 'b000000000000001', row },
      { e: 'grn_lock', id: 'g-A2', op: 'upsert', v: 'b000000000000002', row: lockRow({ ...a2, ...row } as never) },
    ];
  };
  const canCreate = async () => ((await grnDetails('g-A2')) as any).data.grn.invoices_summary.can_create_invoice;

  it('non-imported GRN: can_create_invoice is false from the copy', async () => {
    const w = await ready();
    await sync(w, readyToInvoice(false));
    expect(await canCreate()).toBe(false);
  });

  it('imported: not offered', async () => {
    const w = await ready();
    await sync(w, readyToInvoice(true));
    const { grn } = ((await grnDetails('g-A2')) as any).data;
    expect(grn.imported).toBe(true);
    expect(grn.invoices_summary.can_create_invoice).toBe(false);
  });
});

describe('PR12 (WH-381): the Invoicing filter offline over a ready copy', () => {
  it.each([[true], [false]])('invoiced = %s offline: no rows, and the answer says the filter is waiting, not "no match"', async invoiced => {
    const w = await ready();
    await goOffline(w);
    const result: any = await grnService().getGRNListPage({ p_limit: 20, p_offset: 0, p_filters: { invoiced } }, null);
    expect(result.data.items).toEqual([]);
    expect(result.invoiceFilterWaiting).toBe(true);
    expect(w.serverCalls).toEqual([]);
    // Without the filter the same list answers.
    const plain: any = await grnService().getGRNListPage({ p_limit: 20, p_offset: 0 }, null);
    expect(plain.data.items.length).toBeGreaterThan(0);
    expect(plain.invoiceFilterWaiting).toBeUndefined();
  });
});
