/**
 * WH-381 (supersedes WH-299 slice 4): Dispatch list is server-only and NEVER reads from the phone copy
 * (online or offline, with or without search/filters/pagination).
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { seedDocuments } from '@/tests/phoneCopy/documentsDataset';
import { bootWarehouse, goOffline, loadCopy, sourceOf } from '@/tests/phoneCopy/wh299Phone';

const DROPPED = new Set(['dispatch', 'dispatch_trl', 'dispatch_images', 'invoice', 'invoice_trl', 'payments', 'orders', 'order_items']);

beforeEach(() => {
  resetEnv();
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

const list = (params: Record<string, unknown> = {}) =>
  (require('@/services/dispatch-service') as typeof import('@/services/dispatch-service')).getDispatchListWithItems(params as never);

describe('WH-381: dispatch list always queries the server, never the phone copy', () => {
  it.each<[string, Record<string, unknown>]>([
    ['default list', {}],
    ['search query', { p_filters: { search: 'ASHA' } }],
    ['customer filter', { p_customer_id: 'c1' }],
    ['paged list', { p_limit: 2, offset: 0 }],
  ])('%s: calls get_dispatch_list_with_items on server online and offline over a ready copy', async (_label, params) => {
    const w = await bootWarehouse({ role: 'admin' });
    await loadCopy(w);

    const online = await list(params);
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_dispatch_list_with_items']);
    expect(sourceOf(online)).toBeUndefined();

    w.serverCalls.length = 0;
    await goOffline(w);
    const offline = await list(params);
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_dispatch_list_with_items']);
    expect(sourceOf(offline)).toBeUndefined();
  });
});
