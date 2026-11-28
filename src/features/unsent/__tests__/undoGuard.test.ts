/**
 * WH-387 (card product/board/WH-387): the undo of an offline edit deletes the row only while it is still `saved` with no attempt,
 * decided in the same transaction as the delete (`deleteItems(scope, ids, untriedOnly)` through `deleteUntriedItem`). When sending
 * has begun the undo is a new change that depends on the row, so the server always ends on the value the person undid to.
 *
 * Real: the unsent store, queue, send engine, the GRN edit kind and the lot change service. Faked at the edge: the server's answer
 * (held for the race), expo-sqlite, files, NetInfo, AppState, the clock.
 *
 * The race is driven with the real engine: just after the undo has read its rows, a send starts and marks the row `sending`
 * (its answer is held), and only then does the undo's delete run.
 */
import { eraseEverything, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { bootUnsent, rawRows, rawRun, server, type RpcAnswer } from '@/tests/unsent/unsentPhone';

const GRN = 'g-B1';
const LOT = 'lot-0001';
const COPY = { rack: 'A-1', package_mark: 'M1' };
const GRN_RPC = 'apply_grn_changes';
const LOT_RPC = 'set_lot_rack_and_mark';
const META = { grnNumber: 'B1', customer: 'asha Traders' };
const base = { v: 1, grnId: GRN, loadedAt: '2026-11-25T10:00:00+00:00', recordedAt: '2026-11-27T09:00:00.000Z' };
// A line added, and the undo that takes it off again: together they leave nothing (grnEditChanges E5), so an untried edit is deleted.
const addBody = { ...base, linesAdded: [{ clientLineId: 'new-1', item_id: 'i3', item_name: 'Rice', packaging: null, qty: 4, weight: 24, rack: null, package_mark: null }] };
const removeBody = { ...base, linesRemoved: [{ lotId: 'new-1', item_name: 'Rice', qty: 4 }] };
const grnOk = (): RpcAnswer => ({ data: { success: true, grn_id: GRN, gr_no: 'B1', updated_at: 'x', applied: { header: [], lots: { l06: ['rack'] } }, lines_added: [], lines_removed: [], replaced: [] }, error: null });
const lotOk = (rack: string): RpcAnswer => ({ data: { success: true, lot: { id: LOT, gr_id: 'grn-0001', rack, package_mark: 'M1' }, grn: { id: 'grn-0001', gr_no: 12, updated_at: 'x' }, changed: ['rack'], replaced: [] }, error: null });

type Phone = Awaited<ReturnType<typeof bootUnsent>>;
type Row = { id: string; kind: string; state: string; body: string; depends_on: string | null; attempts: number; request_key: string };
const items = () => rawRows<Row>('items', 'ORDER BY seq');
const bodyOf = (row: { body: string }) => JSON.parse(row.body);
const callsOf = (name: string) => server.calls.filter(c => c.name === name);

type GrnKind = { saveGrnEditOffline(id: string, body: unknown, photos: unknown[], meta: typeof META): Promise<{ id: string; merged: boolean }> };
type LotService = { saveLotChange(input: Record<string, unknown>): Promise<{ id: string; merged: boolean; dropped?: boolean }> };
let grnKind: GrnKind;
let lotService: LotService;

async function start(): Promise<Phone> {
  const phone = await bootUnsent();
  grnKind = require('@/features/grn/offline-edit/grnEditKind');
  require('@/features/unsent/lotChangeKind');
  lotService = require('@/features/quick-change/lotChangeService');
  await phone.store.initUnsent();
  await setReachable(false);
  phone.phone.engine.setCopyOffline(true);
  return phone;
}
const goOnline = async (phone: Phone) => { await setReachable(true); phone.phone.engine.setCopyOffline(false); };
const lotChange = (extra: Record<string, unknown>) =>
  lotService.saveLotChange({ lotId: LOT, grnId: 'grn-0001', grnNumber: '12', customer: 'Asha Fictional Traders', copy: COPY, ...extra });

/**
 * Makes the next read of the person's items (the first thing an undo does) be followed by the start of a real send whose answer is
 * held: when the undo's delete runs, the row is `sending`. Returns what the server was asked, and a function that lets the answer go.
 */
function sendBeginsAfterTheUndoRead(phone: Phone, rpc: string, answer: () => RpcAnswer) {
  const rows = require('@/features/unsent/unsentRows') as typeof import('@/features/unsent/unsentRows');
  const real = rows.itemsOfScope;
  let release: () => void = () => undefined;
  const held = new Promise<void>(resolve => { release = resolve; });
  let first = true;
  server.answers[rpc] = async () => {
    if (first) { first = false; await held; }
    return answer();
  };
  const spy = jest.spyOn(rows, 'itemsOfScope').mockImplementationOnce(async scope => {
    const read = await real(scope);
    await goOnline(phone);
    void phone.engine.sendNow('send-now');
    await jest.advanceTimersByTimeAsync(200);
    return read;
  });
  return { release: () => release(), spy };
}

beforeEach(() => { jest.useFakeTimers({ now: new Date('2026-11-27T09:00:00+05:30') }); resetEnv(); files.reset(); server.reset(); });
afterEach(async () => { jest.restoreAllMocks(); jest.useRealTimers(); await eraseEverything(); });

describe('WH-387: undo of a GRN edit', () => {
  it('an edit that was saved and not tried goes away with its undo, as before', async () => {
    const phone = await start();
    await grnKind.saveGrnEditOffline(GRN, addBody, [], META);
    const undone = await grnKind.saveGrnEditOffline(GRN, removeBody, [], META);
    expect(undone.merged).toBe(true);
    expect(await items()).toHaveLength(0);
    expect(phone.store.getUnsentSummary().count).toBe(0);
  });

  it('the race: sending begins between the undo\'s read and its delete: the row survives and the undo is a new change that depends on it, sent after it', async () => {
    const phone = await start();
    const first = await grnKind.saveGrnEditOffline(GRN, addBody, [], META);
    const { release } = sendBeginsAfterTheUndoRead(phone, GRN_RPC, grnOk);

    const undone = await grnKind.saveGrnEditOffline(GRN, removeBody, [], META);

    const rows = await items();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: first.id, state: 'sending' });
    expect(undone.merged).toBe(false);
    expect(rows[1]).toMatchObject({ id: undone.id, depends_on: first.id });
    expect(bodyOf(rows[1]).linesRemoved).toEqual(removeBody.linesRemoved);

    release();
    await jest.advanceTimersByTimeAsync(60_000);
    await phone.engine.sendNow('send-now');
    await jest.advanceTimersByTimeAsync(60_000);

    // The server got the edit (it was already on its way) and then the undo: it ends on the value the person undid to.
    const sent = callsOf(GRN_RPC).map(call => call.args.p_changes as typeof addBody & typeof removeBody);
    expect(sent).toHaveLength(2);
    expect(sent[0].linesAdded).toHaveLength(1);
    expect(sent[1].linesRemoved).toEqual(removeBody.linesRemoved);
    expect((await items()).map(row => row.state)).toEqual(['sent', 'sent']);
  });

  it('the person\'s own Delete from Unsent items still removes an item that was tried', async () => {
    const phone = await start();
    const first = await grnKind.saveGrnEditOffline(GRN, addBody, [], META);
    await rawRun(`UPDATE items SET state = 'refused', attempts = 1 WHERE id = '${first.id}'`);
    await phone.queue.deleteItem(first.id);
    expect(await items()).toHaveLength(0);
  });
});

describe('WH-387: undo of a rack or mark change', () => {
  it('a change that was saved and not tried goes away with its undo, as before', async () => {
    const phone = await start();
    await lotChange({ rack: 'B-2' });
    const undone = await lotChange({ rack: 'A-1' });
    expect(undone).toMatchObject({ merged: true, dropped: true });
    expect(await items()).toHaveLength(0);
    expect(phone.store.getUnsentSummary().count).toBe(0);
  });

  it('a change already sending is not deleted by its undo: the undo is a new change that depends on it', async () => {
    const phone = await start();
    const first = await lotChange({ rack: 'B-2' });
    await rawRun(`UPDATE items SET state = 'sending', attempts = 1 WHERE id = '${first.id}'`);
    const undone = await lotChange({ rack: 'A-1' });
    const rows = await items();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: first.id, state: 'sending' });
    expect(rows[1]).toMatchObject({ id: undone.id, depends_on: first.id });
    expect(bodyOf(rows[1]).changes.rack).toEqual({ to: 'A-1', from: 'B-2' });
    expect(phone.store.getUnsentSummary().count).toBe(2);
  });

  it('the race: sending begins between the undo\'s read and its delete: the row survives, the undo follows it, and the server ends on the undone value', async () => {
    const phone = await start();
    const first = await lotChange({ rack: 'B-2' });
    const { release } = sendBeginsAfterTheUndoRead(phone, LOT_RPC, () => lotOk('B-2'));

    const undone = await lotChange({ rack: 'A-1' });

    const rows = await items();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: first.id, state: 'sending' });
    expect(undone).toMatchObject({ merged: false });
    expect(rows[1]).toMatchObject({ id: undone.id, depends_on: first.id });

    server.answers[LOT_RPC] = async () => lotOk('A-1');
    release();
    await jest.advanceTimersByTimeAsync(60_000);
    await phone.engine.sendNow('send-now');
    await jest.advanceTimersByTimeAsync(60_000);

    const racks = callsOf(LOT_RPC).map(call => (call.args.p_changes as { rack: { to: string } }).rack.to);
    expect(racks[racks.length - 1]).toBe('A-1');
    expect(racks[0]).toBe('B-2');
    expect((await items()).map(row => row.state)).toEqual(['sent', 'sent']);
  });
});
