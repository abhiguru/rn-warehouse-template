/**
 * WH-299, contract product/tech/app-offline-read-from-copy.md section 11.1 (PR9, Q1 and Q3 at their source): the engine
 * says, once per finished run that changed something, which kinds of record changed. A run that changed nothing says
 * nothing, so nothing re-reads.
 *
 * Real: the engine and the copy. Faked at the edge: the server and the phone's native modules.
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - `@/features/phone-copy/copyChanges` exports `subscribeCopyChanges(listener)`, which answers its own unsubscribe;
 *    the listener is given `{ seq: number; kinds: Set<EntityName> }`. The contract names the function and that shape,
 *    not the signature.
 * ==================================
 */
import { bootPhone, env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { grnNamed, lotNamed, seedWarehouse } from '@/tests/phoneCopy/grnDataset';

type Published = { seq: number; kinds: Set<string> };
type CopyChanges = { subscribeCopyChanges: (listener: (change: Published) => void) => () => void };

beforeEach(() => {
  resetEnv();
  seedWarehouse();
});
afterEach(async () => { await eraseEverything(); });

async function watching() {
  const phone = bootPhone();
  await phone.engine.startPhoneCopy();
  expect(await phone.engine.syncNow('open')).toBe('done');
  const heard: Published[] = [];
  const { subscribeCopyChanges } = require('@/features/phone-copy/copyChanges') as CopyChanges;
  const stop = subscribeCopyChanges(change => heard.push({ seq: change.seq, kinds: new Set(change.kinds) }));
  return { phone, heard, stop };
}
const upsert = (e: string, id: string, row: unknown) => ({ e, id, op: 'upsert', v: 'a3f09c2b11d4e5f6', row });
const page = (changes: unknown[], more = false, position = '1048600', reload: string[] = []) =>
  env.feed.changeAnswers.push({ position, as_of: env.feed.asOf, more, reload_all: null, reload, changes: changes as never });
const kindsOf = (change: Published) => [...change.kinds].sort();

describe('subscribeCopyChanges', () => {
  it('says nothing after a run that brought no change', async () => {
    const { phone, heard } = await watching();
    expect(await phone.engine.syncNow('pull-to-refresh')).toBe('done');
    expect(heard).toEqual([]);
  });

  it('says once which kinds a run changed, over all its pages', async () => {
    const { phone, heard } = await watching();
    page([upsert('goodsreceived_trl', 'l04', { ...lotNamed('l04'), rack: 'Z-9' })], true, '1048600');
    page([{ e: 'goodsreceived', id: 'g-B1', op: 'delete' }, upsert('goodsreceived_trl', 'l01', lotNamed('l01'))], false, '1048601');
    await phone.engine.syncNow('pull-to-refresh');
    expect(heard).toHaveLength(1);
    expect(kindsOf(heard[0])).toEqual(['goodsreceived', 'goodsreceived_trl']);
  });

  it('names only what changed, with a later number each time', async () => {
    const { phone, heard } = await watching();
    page([upsert('dispatch', 'd9', { id: 'd9', disp_no: 'D9', customer_id: 'c1' })]);
    await phone.engine.syncNow('pull-to-refresh');
    page([upsert('goodsreceived', 'g-B1', grnNamed('B1'))], false, '1048601');
    await phone.engine.syncNow('pull-to-refresh');
    expect(heard.map(kindsOf)).toEqual([['dispatch'], ['goodsreceived']]);
    expect(heard[1].seq).toBeGreaterThan(heard[0].seq);
  });

  it('says which kinds a reload brought', async () => {
    const { phone, heard } = await watching();
    page([], false, '1048600', ['grn_lock']);
    await phone.engine.syncNow('pull-to-refresh');
    expect(heard).toHaveLength(1);
    expect(kindsOf(heard[0])).toEqual(['grn_lock']);
  });

  it('says nothing after a run that failed', async () => {
    const { phone, heard } = await watching();
    env.feed.failWhen = call => call.name === 'get_sync_changes';
    await phone.engine.syncNow('pull-to-refresh');
    expect(heard).toEqual([]);
  });

  it('stops telling a listener that unsubscribed', async () => {
    const { phone, heard, stop } = await watching();
    stop();
    page([upsert('goodsreceived', 'g-B1', grnNamed('B1'))]);
    await phone.engine.syncNow('pull-to-refresh');
    expect(heard).toEqual([]);
  });
});
