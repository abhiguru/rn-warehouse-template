/**
 * WH-303 slice A-3, test first (product/tech/app-offline-edit-grn.md sections 3.3-3.5, 6 and 10: Q1, Q3 in part, P4, P7, P8
 * with Product's PQ9 ruling on the card). `src/features/grn/offline-edit/grnEditKind.ts` does not exist yet: these fail
 * until it is built.
 *
 * Real: src/features/unsent (queue, engine, registry, store), the kind and its save. Faked at the edge: the server's answer
 * to `apply_grn_changes` (the client's `rpc`), expo-sqlite, files, NetInfo, AppState, the signed-in person.
 *
 * ===== AGREE WITH DEVELOPMENT (the contract is silent; ASSUMED) =====
 *  - `@/features/grn/offline-edit/grnEditKind` registers the kind `grnEdit` when imported and exports
 *    `saveGrnEditOffline(grnId, body, photos, meta)` and `saveGrnEditAndWait(grnId, body, photos, meta)`; `meta` =
 *    { grnNumber: string; customer?: string } (section 3.2 gives `targetRef.number` and `customer`, not where they come from).
 *    Both answer { id, requestKey, merged }; the second also { outcome: 'sent' | 'later' | 'refused', reason?: string }.
 *    `photos` = [{ file, role: 'header' | 'item', lineRef? }] as `enqueue` takes them.
 *  - The during-the-wait refusal (PQ9) is done by `saveGrnEditAndWait` (section 3.4 says "the item and its photo item are
 *    removed (deleteItem)"; the screen only shows the reason). It waits `QUICK_CHANGE_WAIT_MS` (8,000).
 *  - Merging an unattempted item: a second save of the same GRN is one item (`mergeInto`), `what` = "GRN B1: Rack, Note changed".
 *  - A second save after the first item was tried is a new item with `depends_on` = the first (section 3.3).
 * ====================================================================
 */
import { eraseEverything, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { addPhoto, bootUnsent, rawRows, server, type RpcAnswer } from '@/tests/unsent/unsentPhone';

const RPC = 'apply_grn_changes';
const GRN = 'g-B1';
const calls = () => server.calls.filter(c => c.name === RPC);
const META = { grnNumber: 'B1', customer: 'asha Traders' };
const rackBody = (from: string, to: string, extra: Record<string, unknown> = {}) => ({
  v: 1, grnId: GRN, loadedAt: '2026-11-25T10:00:00+00:00', recordedAt: '2026-11-27T09:00:00.000Z', lots: { l06: { rack: { from, to } } }, ...extra,
});
const success = (): RpcAnswer => ({ data: { success: true, grn_id: GRN, gr_no: 'B1', updated_at: 'x', applied: { header: [], lots: { l06: ['rack'] } }, lines_added: [], lines_removed: [], replaced: [] }, error: null });
const refusal = (code: string): RpcAnswer => ({ data: { success: false, reason: code, code, error: 'Refused', message: 'Refused' }, error: null });

type Phone = Awaited<ReturnType<typeof bootUnsent>>;
type Saved = { id: string; requestKey: string; merged: boolean; outcome?: 'sent' | 'later' | 'refused'; reason?: string | null };
type Meta = { grnNumber: string; customer?: string };
type Kind = {
  saveGrnEditOffline(grnId: string, body: unknown, photos: unknown[], meta: Meta): Promise<Saved>;
  saveGrnEditAndWait(grnId: string, body: unknown, photos: unknown[], meta: Meta): Promise<Saved>;
};
let kind: Kind;
async function start(): Promise<Phone> {
  const phone = await bootUnsent();
  kind = require('@/features/grn/offline-edit/grnEditKind');
  await phone.store.initUnsent();
  return phone;
}
async function offline(phone: Phone) { await setReachable(false); phone.phone.engine.setCopyOffline(true); }
async function online(phone: Phone) { await setReachable(true); phone.phone.engine.setCopyOffline(false); }
async function pass(phone: Phone, ms = 60_000) {
  const done = phone.engine.sendNow('send-now');
  await jest.advanceTimersByTimeAsync(ms);
  await done;
}
const items = () => rawRows<{ id: string; kind: string; state: string; body: string; what: string; depends_on: string | null; request_key: string }>('items', 'ORDER BY seq');

beforeEach(() => { jest.useFakeTimers({ now: new Date('2026-11-27T09:00:00+05:30') }); resetEnv(); files.reset(); server.reset(); });
afterEach(async () => { jest.useRealTimers(); await eraseEverything(); });

describe('Q1: send', () => {
  it('calls apply_grn_changes with the GRN, the frozen body and the item request key, and keeps the answer', async () => {
    const phone = await start();
    await offline(phone);
    const saved = await kind.saveGrnEditOffline(GRN, rackBody('D-4', 'C-2'), [], META);
    server.answers[RPC] = success;
    await online(phone);
    await pass(phone);
    expect(calls()).toHaveLength(1);
    expect(calls()[0].args).toEqual({ p_grn_id: GRN, p_changes: rackBody('D-4', 'C-2'), p_request_key: saved.requestKey });
    const [row] = await items();
    expect(row.kind).toBe('grnEdit');
    expect(row.state).toBe('sent');
  });

  it.each<[string, RpcAnswer, string]>([
    ['a refusal by code', refusal('QTY_BELOW_DISPATCHED'), 'refused'],
    ['a refusal answered 4xx', { data: null, error: { message: 'Forbidden', status: 403 } }, 'refused'],
    ['an unreadable answer (lost)', { data: null, error: null }, 'sending'],
  ])('reads %s as the engine classifies it', async (_name, reply, state) => {
    const phone = await start();
    await offline(phone);
    await kind.saveGrnEditOffline(GRN, rackBody('D-4', 'C-2'), [], META);
    server.answers[RPC] = () => reply;
    await online(phone);
    await pass(phone, 1_000);
    expect((await items())[0].state).toBe(state);
  });

  it('an older server without the function (PGRST202) refuses the item with SERVER_TOO_OLD', async () => {
    const phone = await start();
    await offline(phone);
    await kind.saveGrnEditOffline(GRN, rackBody('D-4', 'C-2'), [], META);
    server.answers[RPC] = () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await online(phone);
    await pass(phone, 1_000);
    const [row] = await items();
    expect(row.state).toBe('refused');
    expect(JSON.stringify(row)).toContain('SERVER_TOO_OLD');
  });
});

describe('merge and order (section 3.3)', () => {
  it('two saves before any attempt are one item: earlier from kept, later to taken, one title', async () => {
    const phone = await start();
    await offline(phone);
    const first = await kind.saveGrnEditOffline(GRN, rackBody('D-4', 'C-2'), [], META);
    const second = await kind.saveGrnEditOffline(GRN, rackBody('C-2', 'E-9', { header: { note: { from: null, to: 'x' } } }), [], META);
    expect(second.merged).toBe(true);
    expect(second.id).toBe(first.id);
    const rows = await items();
    expect(rows).toHaveLength(1);
    const body = JSON.parse(rows[0].body);
    expect(body.lots.l06.rack).toEqual({ from: 'D-4', to: 'E-9' });
    expect(body.header.note).toEqual({ from: null, to: 'x' });
    expect(rows[0].what).toBe('GRN B1: Note, Rack changed');
    expect(phone.store.getUnsentSummary().count).toBe(1);
  });

  it('a save after the first item was tried is a new item that depends on it', async () => {
    const phone = await start();
    await offline(phone);
    const first = await kind.saveGrnEditOffline(GRN, rackBody('D-4', 'C-2'), [], META);
    server.answers[RPC] = () => ({ data: null, error: null }); // lost: the item was attempted
    await online(phone);
    await pass(phone, 1_000);
    await offline(phone);
    const second = await kind.saveGrnEditOffline(GRN, rackBody('C-2', 'E-9'), [], META);
    expect(second.merged).toBe(false);
    expect(second.id).not.toBe(first.id);
    const rows = await items();
    expect(rows).toHaveLength(2);
    expect(rows[1].depends_on).toBe(first.id);
  });
});

describe('PQ9, P4, P7, P8: Save while the server is reachable (the 8 s wait)', () => {
  it('P7: an item sent within the wait gives outcome sent and leaves nothing waiting', async () => {
    const phone = await start();
    await online(phone);
    server.answers[RPC] = success;
    const run = kind.saveGrnEditAndWait(GRN, rackBody('D-4', 'C-2'), [], META);
    await jest.advanceTimersByTimeAsync(1_000);
    expect((await run).outcome).toBe('sent');
    expect(calls()).toHaveLength(1);
  });

  it('P7: no outcome in 8 s gives later, and the item stays queued', async () => {
    const phone = await start();
    await online(phone);
    server.answers[RPC] = () => new Promise<RpcAnswer>(() => undefined); // the server never answers
    const run = kind.saveGrnEditAndWait(GRN, rackBody('D-4', 'C-2'), [], META);
    await jest.advanceTimersByTimeAsync(7_000);
    let settled = false;
    void run.then(() => { settled = true; });
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1_500);
    expect((await run).outcome).toBe('later');
    expect(await items()).toHaveLength(1);
    expect(phone.store.getUnsentSummary().count).toBe(1);
  });

  it('P7: an older unsent item in front of it ends the wait at once with later', async () => {
    const phone = await start();
    await offline(phone);
    await kind.saveGrnEditOffline('g-A2', { ...rackBody('B-3', 'B-4'), grnId: 'g-A2' }, [], { grnNumber: 'A2' });
    const older = (await items())[0];
    server.answers[RPC] = () => new Promise<RpcAnswer>(() => undefined);
    await online(phone);
    const run = kind.saveGrnEditAndWait(GRN, rackBody('D-4', 'C-2'), [], META);
    await jest.advanceTimersByTimeAsync(100);
    expect((await run).outcome).toBe('later');
    expect(older.state).toBe('saved');
  });

  it('P8 (PQ9): a refusal during the wait is told at once, and the item and its photo item are removed and not counted', async () => {
    const phone = await start();
    await online(phone);
    server.answers[RPC] = () => refusal('QTY_BELOW_DISPATCHED');
    const photo = addPhoto('shelf.jpg');
    const run = kind.saveGrnEditAndWait(GRN, rackBody('D-4', 'C-2'), [{ file: photo, role: 'header' }], META);
    await jest.advanceTimersByTimeAsync(1_000);
    const out = await run;
    expect(out.outcome).toBe('refused');
    expect(await items()).toEqual([]);
    expect(await rawRows('item_photos')).toEqual([]);
    expect(phone.store.getUnsentSummary().count).toBe(0);
    // Nothing is sent again by a later pass.
    await pass(phone, 5_000);
    expect(calls()).toHaveLength(1);
  });

  it('P8: a refusal that arrives after the wait has ended stays as a refused item', async () => {
    const phone = await start();
    await online(phone);
    let release: (answer: RpcAnswer) => void = () => undefined;
    server.answers[RPC] = () => new Promise<RpcAnswer>(resolve => { release = resolve; });
    const run = kind.saveGrnEditAndWait(GRN, rackBody('D-4', 'C-2'), [], META);
    await jest.advanceTimersByTimeAsync(8_500);
    expect((await run).outcome).toBe('later');
    release(refusal('QTY_BELOW_DISPATCHED'));
    await jest.advanceTimersByTimeAsync(1_000);
    const rows = await items();
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('refused');
  });

  it('P4: two taps on Save are one item', async () => {
    const phone = await start();
    await offline(phone);
    const body = rackBody('D-4', 'C-2');
    await Promise.all([kind.saveGrnEditOffline(GRN, body, [], META), kind.saveGrnEditOffline(GRN, body, [], META)]);
    expect(await items()).toHaveLength(1);
  });
});

describe('Q3: photos of an offline edit', () => {
  it('a photo of the edit waits as a photo item that depends on the edit', async () => {
    const phone = await start();
    await offline(phone);
    const saved = await kind.saveGrnEditOffline(GRN, rackBody('D-4', 'C-2'), [{ file: addPhoto('a.jpg'), role: 'header' }], META);
    const rows = await items();
    const photoItem = rows.find(r => r.kind === 'photos');
    expect(photoItem?.depends_on).toBe(saved.id);
    expect(phone.store.getUnsentSummary().count).toBe(2);
  });
});
