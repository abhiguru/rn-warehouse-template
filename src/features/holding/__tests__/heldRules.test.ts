/**
 * WH-304, slices A-1 to A-3: the rules of the hand-over that no other WH-304 file pins down (Dev's note "For Test", card
 * product/board/WH-304-holding-list-for-refused-items.md; contract product/tech/app-offline-holding-list.md sections 3, 5.3, 12).
 *
 *  - R1: a record saved by a form (`form_row` set) is not handed over until the form's own Save wait (8 s) is over; the
 *    engine looks again by itself when it ends.
 *  - R2: a group whose hand-over the server refused for good is not asked again until the app starts again; a later,
 *    unrelated refused item still goes.
 *  - R3: the sync run's sweep removes held rows by `held_id`, only those the copy holds, never a refused row.
 *  - R4: an accepted row reaches "Sent today" only when decided on today's business day, and says which document it became.
 *
 * Real: the unsent-work store, queue, send engine, hand-over, list, phone copy. Faked at the edge: the server's RPC answers,
 * expo-sqlite, files, NetInfo, AppState, fake timers (as handOver.test.ts).
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { rawRows, rawRun, rpcKind, server, type RpcAnswer } from '@/tests/unsent/unsentPhone';
import {
  bootHolding,
  recorderHeldFeedRow,
  rpcCalls,
  serverRefusal,
  type HoldingPhone,
} from '@/tests/unsent/holdingPhone';
import type { ChangesAnswer, FeedRow } from '@/tests/phoneCopy/fakeFeed';

const SAVE = 'save_holding_rules';
const RATE_MISSING = (): RpcAnswer => serverRefusal('RATE_MISSING', 'Missing rate');

type ItemDbRow = { id: string; state: string; held_id: string | null; handover_failed: number; request_key: string; form_row: string | null };
const allItemRows = () => rawRows<ItemDbRow>('items', 'ORDER BY seq');
const loadList = async () => (require('@/features/unsent/unsentList') as typeof import('@/features/unsent/unsentList')).loadUnsentList();

/** Each item the server holds gets the next id (`prefix-1`, `prefix-2`, ...), across calls. */
const holdOk = (prefix: string) => {
  let next = 0;
  return (args: Record<string, any>): RpcAnswer => {
    const list = (args.p_items as { request_key: string }[]) ?? [];
    return { data: { success: true, held: list.map(item => ({ request_key: item.request_key, id: `${prefix}-${(next += 1)}`, state: 'held' })) }, error: null };
  };
};
const heldKeys = () => rpcCalls('hold_items').map(call => (call.args.p_items as { request_key: string }[]).map(item => item.request_key));

const sampleGrnBody = (localId: string, qty = 10) => ({
  v: 1,
  localId,
  lotLocalIds: [`${localId}-l1`],
  args: { p_gr_no: '', p_issue_number: true, p_date: '2026-11-27', p_customer_id: 'c1', p_items: [{ item_id: 'i1', qty }] },
  show: { customerName: 'asha Traders', lines: [{ itemName: 'Beans', packaging: 'Bag' }] },
});

const heldGrnFeedRow = (id: string): FeedRow => ({
  id,
  row: { id, kind: 'newGrn', state: 'held', needs_decision: true, lines: null },
});

async function startStaff(): Promise<HoldingPhone> {
  const phone = await bootHolding({ role: 'staff', withCopy: true });
  phone.kinds.registerSendKind('newGrn', rpcKind(phone, SAVE));
  return phone;
}
const enqueueGrn = (phone: HoldingPhone, localId: string, qty = 10) =>
  phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody(localId, qty), what: 'New GRN', customer: 'asha Traders' });

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-27T09:00:00+05:30'), doNotFake: ['setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask'] });
  resetEnv();
  files.reset();
  server.reset();
});
afterEach(async () => {
  jest.useRealTimers();
  await eraseEverything();
});

describe('R1: a record saved by a form waits out the form\'s 8 s Save wait before it is handed over', () => {
  it('is not handed over inside the wait, then goes by itself when the wait is over', async () => {
    const phone = await startStaff();
    await phone.offline();
    const item = await enqueueGrn(phone, '5f304000-0000-4000-8000-0000000000a1');
    // The record came from a form (its Save): the form still waits for the answer.
    await rawRun(`UPDATE items SET form_row = '{"hadForm":true}' WHERE id = '${item.id}'`);
    server.answers[SAVE] = RATE_MISSING;
    server.answers.hold_items = holdOk('held-r1');

    await phone.online();
    const first = phone.engine.sendNow('send-now');
    await jest.advanceTimersByTimeAsync(1_000);
    await first;
    expect(rpcCalls(SAVE)).toHaveLength(1);
    expect(rpcCalls('hold_items')).toHaveLength(0);
    expect((await allItemRows())[0]).toMatchObject({ state: 'refused', held_id: null, handover_failed: 0 });

    await jest.advanceTimersByTimeAsync(5_000);
    expect(rpcCalls('hold_items')).toHaveLength(0);

    await jest.advanceTimersByTimeAsync(3_000);
    expect(rpcCalls('hold_items')).toHaveLength(1);
    expect((await allItemRows())[0]).toMatchObject({ state: 'held', held_id: 'held-r1-1' });
  });

  it('a record with no form behind it is handed over at once, in the same pass', async () => {
    const phone = await startStaff();
    await phone.offline();
    await enqueueGrn(phone, '5f304000-0000-4000-8000-0000000000a2');
    server.answers[SAVE] = RATE_MISSING;
    server.answers.hold_items = holdOk('held-r1b');
    await phone.online();
    const pass = phone.engine.sendNow('send-now');
    await jest.advanceTimersByTimeAsync(1_000);
    await pass;
    expect(rpcCalls('hold_items')).toHaveLength(1);
    expect((await allItemRows())[0]).toMatchObject({ state: 'held' });
  });
});

describe('R2: a group refused for good is not asked again until the app starts again', () => {
  it('asks once over two passes, still asks for an unrelated item, and asks again after a restart', async () => {
    let phone = await startStaff();
    await phone.offline();
    const first = await enqueueGrn(phone, '5f304000-0000-4000-8000-0000000000b1');
    server.answers[SAVE] = RATE_MISSING;
    server.answers.hold_items = () => serverRefusal('HELD_BODY_TOO_LARGE', 'Body too large');
    await phone.online();

    await phone.pass();
    await phone.pass();
    expect(heldKeys()).toHaveLength(1);
    expect(await allItemRows()).toEqual([expect.objectContaining({ state: 'refused', held_id: null, handover_failed: 1 })]);

    // Another refused item is a new group: it is asked for, and the first one still is not.
    server.answers.hold_items = holdOk('held-r2');
    const second = await enqueueGrn(phone, '5f304000-0000-4000-8000-0000000000b2', 12);
    await phone.pass();
    expect(heldKeys()).toHaveLength(2);
    const [, secondCall] = heldKeys();
    const rows = await allItemRows();
    expect(secondCall).toEqual([rows.find(row => row.id === second.id)?.request_key]);
    expect(rows.find(row => row.id === first.id)).toMatchObject({ state: 'refused', held_id: null });

    // The app starts again: a new server release may be found, so the first item is asked for once more.
    phone = await restartHolding();
    await phone.online();
    await phone.pass();
    expect(heldKeys()).toHaveLength(3);
    expect(heldKeys()[2]).toEqual([rows.find(row => row.id === first.id)?.request_key]);
    expect((await allItemRows()).find(row => row.id === first.id)).toMatchObject({ state: 'held' });
  });

  async function restartHolding(): Promise<HoldingPhone> {
    const next = await bootHolding({ role: 'staff', withCopy: true });
    next.kinds.registerSendKind('newGrn', rpcKind(next, SAVE));
    return next;
  }
});

describe('R3: the sync run removes held rows by held_id, once the copy holds them', () => {
  const upsert = (position: string, id: string, version: string): ChangesAnswer => ({
    position,
    as_of: '2026-11-27T09:06:00+00:00',
    more: false,
    reload_all: null,
    reload: [],
    changes: [{ e: 'held_items', id, op: 'upsert', v: version, row: heldGrnFeedRow(id).row }],
  });

  it('removes only the row whose held id the copy now holds; a still-refused row and a held row not in the copy stay', async () => {
    const phone = await startStaff();
    await phone.offline();
    const a = await enqueueGrn(phone, '5f304000-0000-4000-8000-0000000000c1');
    const b = await enqueueGrn(phone, '5f304000-0000-4000-8000-0000000000c2', 12);
    server.answers[SAVE] = RATE_MISSING;
    server.answers.hold_items = holdOk('sw');
    await phone.online();
    await phone.pass();
    // A third item is refused and cannot be handed over: it never gets a held id.
    server.answers.hold_items = () => serverRefusal('HELD_BODY_TOO_LARGE', 'Body too large');
    const c = await enqueueGrn(phone, '5f304000-0000-4000-8000-0000000000c3', 15);
    await phone.pass();
    expect((await allItemRows()).map(r => [r.id, r.state, r.held_id])).toEqual([
      [a.id, 'held', 'sw-1'],
      [b.id, 'held', 'sw-2'],
      [c.id, 'refused', null],
    ]);

    // The copy brings the row of `sw-2` only, and a row whose id no phone row carries.
    env.feed.changeAnswers.push(upsert('1048577', 'sw-2', '0000000000000001'));
    await phone.sync();
    expect((await allItemRows()).map(r => [r.id, r.state, r.held_id])).toEqual([
      [a.id, 'held', 'sw-1'],
      [c.id, 'refused', null],
    ]);

    // Its own id arriving deletes the first one too; the refused one never goes by a sync.
    env.feed.changeAnswers.push(upsert('1048578', 'sw-1', '0000000000000002'));
    await phone.sync();
    expect((await allItemRows()).map(r => [r.id, r.state])).toEqual([[c.id, 'refused']]);
  });
});

describe('R4: accepted rows of the recorder (Sent today) and the document they became', () => {
  const accepted = (id: string, decidedAt: string, result: Record<string, unknown>, extra: Record<string, unknown> = {}): FeedRow =>
    recorderHeldFeedRow({
      id,
      kind: 'newGrn',
      what: { key: 'offline.unsent.whatNewGrn' },
      reason: 'noRate',
      reason_data: { lines: [{ item_name: 'Beans' }] },
      lines: null,
      body: sampleGrnBody(id),
      state: 'accepted',
      needs_decision: true,
      decided_by_name: 'Meera Fictional',
      decided_at: decidedAt,
      result,
      ...extra,
    });

  it('keeps an acceptance of today (even just after midnight), drops one from the minute before, and one from days ago', async () => {
    const phone = await bootHolding({
      role: 'staff',
      withCopy: true,
      heldFeedRows: [
        accepted('a-after-midnight', '2026-11-27T00:01:00+05:30', { grn_id: 'g-1', gr_no: 'G-1' }),
        accepted('a-before-midnight', '2026-11-26T23:59:00+05:30', { grn_id: 'g-2', gr_no: 'G-2' }),
        accepted('a-old', '2026-11-20T10:00:00+05:30', { grn_id: 'g-3', gr_no: 'G-3' }),
      ],
    });
    const { rows } = await loadList();
    expect(rows.map(r => r.id)).toEqual(['a-after-midnight']);
    expect(rows[0]).toMatchObject({ section: 'sent', tag: 'accepted', sentNumber: 'G-1', sentDoc: 'grn' });
    // An old acceptance is never counted as held either.
    expect(phone.store.getUnsentSummary()).toMatchObject({ count: 0, held: 0 });
  });

  it('both a new GRN and a field change say "grn", so the row can read "Accepted · GRN B1"', async () => {
    await bootHolding({
      role: 'staff',
      withCopy: true,
      heldFeedRows: [
        accepted('a-new', '2026-11-27T08:30:00+05:30', { grn_id: 'g-9', gr_no: 'G-9' }),
        accepted('a-grn', '2026-11-27T08:31:00+05:30', { grn_id: 'g-B1', gr_no: 'B1' }, { kind: 'lotChange', lines: null }),
      ],
    });
    const { rows } = await loadList();
    expect(rows.find(r => r.id === 'a-new')).toMatchObject({ sentDoc: 'grn', sentNumber: 'G-9' });
    expect(rows.find(r => r.id === 'a-grn')).toMatchObject({ sentDoc: 'grn', sentNumber: 'B1' });
  });
});
