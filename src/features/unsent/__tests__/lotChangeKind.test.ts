/**
 * WH-302 slice 2, test first (product/tech/app-offline-quick-change.md section 3, cases K1-K7; the card's PQ/DQ answers
 * change nothing here). The overlay (O) and the screens (S) are later.
 *
 * Real: src/features/unsent (queue, engine, registry, store) and the quick-change service. Faked at the edge: the server's
 * answer to `set_lot_rack_and_mark` (the client's `rpc`), expo-sqlite, files, NetInfo, AppState, the signed-in person.
 *
 * ===== AGREE WITH DEVELOPMENT (the contract is silent; ASSUMED) =====
 *  - `@/features/unsent/lotChangeKind` registers the kind `lotChange` when imported (as `photosKind.ts` does) and exports the
 *    types FieldChange and LotChangeBody.
 *  - The enqueue-or-merge step is `saveLotChange(input)` in `@/features/quick-change/lotChangeService`, with
 *    input { lotId, grnId, grnNumber, customer?, copy: { rack, package_mark }, rack?, package_mark? } (rack/mark = the new
 *    value the person typed, absent = field untouched; `copy` = what the phone's copy holds, NOT the overlay) and
 *    answer { id, requestKey, merged }. Section 3 describes the rule, not the function.
 *  - `mergeInto(id, patch, what?)`: the new `what` is an optional third argument (section 3 says only "optional new what").
 *  - Rack value 'C-2' etc. is normalised by trim and blank -> null; `what` reads "GRN 12: Rack, Mark changed" (en.offline.whatChange,
 *    fields in the order rack, mark).
 *  - K5 (WH-301 section 3 ruling): the dependant is state refused, reason 'dependsOnRefused' read from items.last_error (ASSUMED column), depends_on = the refused item; summary count 0.
 * ====================================================================
 */
import { env, eraseEverything, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { bootUnsent, GATEWAY_TIMEOUT, rawRows, restart, server, type RpcAnswer } from '@/tests/unsent/unsentPhone';

const RPC = 'set_lot_rack_and_mark';
const LOT = 'lot-0001';
const GRN = 'grn-0001';
const COPY = { rack: 'A-1', package_mark: 'M1' };
const T0 = '2026-11-26T03:30:00.000Z'; // the pinned phone time of the tests (09:00 in Kolkata)
const calls = () => server.calls.filter(c => c.name === RPC);
const answer = (rack: string): RpcAnswer => ({
  data: { success: true, lot: { id: LOT, gr_id: GRN, rack, package_mark: 'M1' }, grn: { id: GRN, gr_no: 12, updated_at: 'x' }, changed: ['rack'], replaced: [] },
  error: null,
});

type Phone = Awaited<ReturnType<typeof bootUnsent>>;
type Service = { saveLotChange(input: Record<string, unknown>): Promise<{ id: string; requestKey: string; merged: boolean }> };
let service: Service;
async function start(): Promise<Phone> {
  const phone = await bootUnsent();
  require('@/features/unsent/lotChangeKind');
  service = require('@/features/quick-change/lotChangeService');
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
const change = (extra: Record<string, unknown>, lotId = LOT) =>
  service.saveLotChange({ lotId, grnId: GRN, grnNumber: '12', customer: 'Asha Fictional Traders', copy: COPY, ...extra } as never);
const items = () => rawRows<{ id: string; kind: string; state: string; body: string; what: string; depends_on: string | null; attempts: number; request_key: string }>('items', 'ORDER BY seq');
const bodyOf = (row: { body: string }) => JSON.parse(row.body);
const listed = (phone: Phone) => phone.queue.listItems() as unknown as Promise<{ id: string; what: string; result: unknown }[]>;

beforeEach(() => { jest.useFakeTimers({ now: new Date('2026-11-26T09:00:00+05:30') }); resetEnv(); files.reset(); server.reset(); });
afterEach(async () => { jest.useRealTimers(); await eraseEverything(); });

describe('K1: send', () => {
  it('calls set_lot_rack_and_mark with the lot, the changes and the item request key, and keeps the answer', async () => {
    const phone = await start();
    await offline(phone);
    const saved = await change({ rack: 'B-2' });
    server.answers[RPC] = () => answer('B-2');
    await online(phone);
    await pass(phone);
    expect(calls()).toHaveLength(1);
    expect(calls()[0].args).toEqual({ p_lot_id: LOT, p_changes: { rack: { to: 'B-2', from: 'A-1' }, recorded_at: T0 }, p_request_key: saved.requestKey });
    const [row] = await items();
    expect(row.state).toBe('sent');
    expect(row.kind).toBe('lotChange');
    expect(((await listed(phone))[0].result as { grn: { gr_no: number } }).grn.gr_no).toBe(12);
  });

  it.each<[string, RpcAnswer, string]>([
    ['a refusal by code', { data: { success: false, error: 'Lot not found', code: 'LOT_NOT_FOUND' }, error: null }, 'refused'],
    ['a refusal answered 4xx', { data: null, error: { message: 'Forbidden', status: 403 } }, 'refused'],
    ['an unreadable answer (lost)', { data: null, error: null }, 'sending'],
    ['a session refusal (401)', { data: null, error: { message: 'JWT expired', status: 401 } }, 'saved'],
  ])('reads %s as the engine classifies it', async (_name, reply, state) => {
    const phone = await start();
    await offline(phone);
    await change({ rack: 'B-2' });
    server.answers[RPC] = () => reply;
    await online(phone);
    await pass(phone, 1_000);
    expect((await items())[0].state).toBe(state);
  });

  it('keeps the item for a later pass when the server could not be reached (nothing ran)', async () => {
    const phone = await start();
    await offline(phone);
    await change({ rack: 'B-2' });
    server.answers[RPC] = () => ({ data: null, error: { message: 'Too Many Requests', status: 429 } });
    await online(phone);
    await pass(phone, 1_000);
    const [row] = await items();
    expect(row.state).not.toBe('sent');
    expect(row.state).not.toBe('refused');
  });
});

describe('K2, K3, K4: one own item per lot while it can still change', () => {
  it('K2: two rack changes before any attempt are one item with the first from and the last to, and its title follows', async () => {
    const phone = await start();
    await offline(phone);
    await change({ rack: 'B-2' });
    await jest.advanceTimersByTimeAsync(5_000);
    await change({ rack: 'C-3' });
    const rows = await items();
    expect(rows).toHaveLength(1);
    // The merged item carries the later save's time.
    expect(bodyOf(rows[0])).toEqual({
      lotId: LOT,
      grnId: GRN,
      recordedAt: '2026-11-26T03:30:05.000Z',
      changes: { rack: { to: 'C-3', from: 'A-1' } },
      // Phone only (PQ7): the item as it was before the later save merged in.
      previous: { recordedAt: T0, changes: { rack: { to: 'B-2', from: 'A-1' } }, what: 'GRN 12: Rack changed' },
    });
    expect(rows[0].what).toBe('GRN 12: Rack changed');
    expect((await phone.queue.listItems())).toHaveLength(1);
  });

  it('K3: rack and then mark are one item with both fields, each from the copy, and the title names both', async () => {
    const phone = await start();
    await offline(phone);
    await change({ rack: 'B-2' });
    await change({ package_mark: 'M9' });
    const rows = await items();
    expect(rows).toHaveLength(1);
    expect(bodyOf(rows[0]).changes).toEqual({ rack: { to: 'B-2', from: 'A-1' }, package_mark: { to: 'M9', from: 'M1' } });
    expect(rows[0].what).toBe('GRN 12: Rack, Mark changed');
  });

  it('K4 (PQ6): every value put back to the copy before any send drops the item: not sent, not counted, not listed', async () => {
    const phone = await start();
    await offline(phone);
    await change({ rack: 'B-2' });
    await change({ rack: 'A-1' });
    expect(await items()).toEqual([]);
    expect(await phone.queue.listItems()).toEqual([]);
    expect(phone.store.getUnsentSummary().count).toBe(0);
    server.answers[RPC] = () => answer('A-1');
    await online(phone);
    await pass(phone);
    expect(calls()).toHaveLength(0);
  });

  it('K4 (PQ6): one field put back drops that field only; the other is still sent', async () => {
    const phone = await start();
    await offline(phone);
    await change({ rack: 'B-2', package_mark: 'M9' });
    await change({ rack: 'A-1' });
    const rows = await items();
    expect(rows).toHaveLength(1);
    expect(bodyOf(rows[0]).changes).toEqual({ package_mark: { to: 'M9', from: 'M1' } });
    expect(rows[0].what).toBe('GRN 12: Mark changed');
    server.answers[RPC] = () => answer('A-1');
    await online(phone);
    await pass(phone);
    expect(calls()).toHaveLength(1);
    expect(calls()[0].args.p_changes).toEqual({ package_mark: { to: 'M9', from: 'M1' }, recorded_at: T0 });
    expect(phone.store.getUnsentSummary().count).toBe(0);
  });

  it('K4 (PQ6): once an attempt was made the first item goes as it is, even when the value is put back after', async () => {
    const phone = await start();
    await offline(phone);
    await change({ rack: 'B-2' });
    server.answers[RPC] = () => GATEWAY_TIMEOUT;
    server.answers.get_submission_result = () => ({ data: null, error: { message: 'No internet connection', code: 'NETWORK' } });
    await online(phone);
    await pass(phone, 1_000);
    await offline(phone);
    await change({ rack: 'A-1' });
    const [first] = await items();
    expect(bodyOf(first).changes).toEqual({ rack: { to: 'B-2', from: 'A-1' } });
    server.answers[RPC] = () => answer('B-2');
    server.answers.get_submission_result = () => ({ data: { found: false }, error: null });
    await online(phone);
    await pass(phone);
    expect(calls().some(c => c.args.p_request_key === first.request_key && (c.args.p_changes as { rack: { to: string } }).rack.to === 'B-2')).toBe(true);
    expect((await items())[0].state).toBe('sent');
  });

  it('values are trimmed and a blank becomes null before they are stored', async () => {
    const phone = await start();
    await offline(phone);
    await change({ rack: '  B-2 ', package_mark: '   ' });
    expect(bodyOf((await items())[0]).changes).toEqual({ rack: { to: 'B-2', from: 'A-1' }, package_mark: { to: null, from: 'M1' } });
  });

  it('a second lot gets its own item', async () => {
    const phone = await start();
    await offline(phone);
    await change({ rack: 'B-2' });
    await change({ rack: 'B-2' }, 'lot-0002');
    expect(await items()).toHaveLength(2);
  });
});

describe('K5: a change after an attempt', () => {
  async function afterFirstAttempt() {
    const phone = await start();
    await offline(phone);
    const first = await change({ rack: 'B-2' });
    server.answers[RPC] = () => GATEWAY_TIMEOUT; // lost: the item was tried
    server.answers.get_submission_result = () => ({ data: null, error: { message: 'No internet connection', code: 'NETWORK' } });
    await online(phone);
    await pass(phone, 1_000);
    await offline(phone);
    return { phone, first };
  }

  it('is a new item that depends on the first, with from = the first one\'s to', async () => {
    const { first } = await afterFirstAttempt();
    expect((await items())[0].attempts).toBeGreaterThan(0);
    await change({ rack: 'C-3' });
    const rows = await items();
    expect(rows).toHaveLength(2);
    expect(rows[1].depends_on).toBe(rows[0].id);
    expect(rows[0].request_key).toBe(first.requestKey);
    expect(bodyOf(rows[0]).changes.rack).toEqual({ to: 'B-2', from: 'A-1' });
    expect(bodyOf(rows[1]).changes).toEqual({ rack: { to: 'C-3', from: 'B-2' } });
  });

  it('a field the first item did not carry takes the copy\'s value as from', async () => {
    await afterFirstAttempt();
    await change({ package_mark: 'M9' });
    expect(bodyOf((await items())[1]).changes).toEqual({ package_mark: { to: 'M9', from: 'M1' } });
  });

  it('K5: the dependant of a refused item is refused with its own reason, follows the refused item, is not sent and nothing is counted', async () => {
    const { phone } = await afterFirstAttempt();
    await change({ rack: 'C-3' });
    server.answers[RPC] = () => ({ data: { success: false, error: 'Lot not found', code: 'LOT_NOT_FOUND' }, error: null });
    server.answers.get_submission_result = () => ({ data: { found: false }, error: null });
    await online(phone);
    await pass(phone);
    const rows = await items();
    expect(rows[0].state).toBe('refused');
    expect(rows[1].state).toBe('refused');
    expect(rows[1].depends_on).toBe(rows[0].id);
    // Sharpened ruling (WH-304 PQ1): a refused item and its dependants count as unsent until the server holds them.
    expect(phone.store.getUnsentSummary().count).toBe(2);
    const reasons = await rawRows<{ last_error: string | null }>('items', 'ORDER BY seq');
    expect(reasons[1].last_error).toBe('dependsOnRefused'); // ASSUMED column: items.last_error
    expect(reasons[1].last_error).not.toBe(reasons[0].last_error);
    expect(calls().map(c => c.args.p_request_key)).not.toContain(rows[1].request_key);
  });

  it('is sent after the first when the first goes through', async () => {
    const { phone } = await afterFirstAttempt();
    const second = await change({ rack: 'C-3' });
    server.answers[RPC] = args => answer((args.p_changes as { rack: { to: string } }).rack.to);
    server.answers.get_submission_result = () => ({ data: { found: false }, error: null });
    await online(phone);
    await pass(phone);
    const sent = calls().map(c => (c.args.p_changes as { rack: { to: string } }).rack.to);
    expect(sent.slice(-2)).toEqual(['B-2', 'C-3']);
    expect(calls().at(-1)?.args.p_request_key).toBe(second.requestKey);
    expect((await items()).map(r => r.state)).toEqual(['sent', 'sent']);
  });
});

describe('K9: the phone time of the change (recorded_at)', () => {
  it('a save carries its time; a merge ten minutes later makes it the later time, and that is what is sent', async () => {
    const phone = await start();
    await offline(phone);
    await change({ rack: 'B-2' });
    expect(bodyOf((await items())[0]).recordedAt).toBe(T0);
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    await change({ rack: 'C-3' });
    const merged = '2026-11-26T03:40:00.000Z';
    expect(bodyOf((await items())[0]).recordedAt).toBe(merged);
    server.answers[RPC] = () => answer('C-3');
    await online(phone);
    await jest.setSystemTime(new Date(merged)); // the clock is not moved by the send itself
    await pass(phone, 1_000);
    expect(calls()[0].args.p_changes).toEqual({ rack: { to: 'C-3', from: 'A-1' }, recorded_at: merged });
  });

  it('a dependant made twenty minutes after has its own time and the first keeps its own', async () => {
    const phone = await start();
    await offline(phone);
    await change({ rack: 'B-2' });
    server.answers[RPC] = () => GATEWAY_TIMEOUT;
    server.answers.get_submission_result = () => ({ data: null, error: { message: 'No internet connection', code: 'NETWORK' } });
    await online(phone);
    await pass(phone, 1_000);
    await offline(phone);
    await jest.setSystemTime(new Date('2026-11-26T03:50:00.000Z'));
    await change({ rack: 'C-3' });
    const rows = await items();
    expect(rows).toHaveLength(2);
    expect(bodyOf(rows[0]).recordedAt).toBe(T0);
    expect(bodyOf(rows[1]).recordedAt).toBe('2026-11-26T03:50:00.000Z');
  });

  it('a resend after a lost answer carries the same time and the same key', async () => {
    const phone = await start();
    await offline(phone);
    const saved = await change({ rack: 'B-2' });
    server.answers[RPC] = () => GATEWAY_TIMEOUT;
    server.answers.get_submission_result = () => ({ data: null, error: { message: 'No internet connection', code: 'NETWORK' } });
    await online(phone);
    await pass(phone, 1_000);
    await jest.setSystemTime(new Date('2026-11-26T05:00:00.000Z'));
    server.answers[RPC] = () => answer('B-2');
    server.answers.get_submission_result = () => ({ data: { found: false }, error: null });
    await pass(phone);
    const sent = calls().map(c => c.args);
    expect(sent.length).toBeGreaterThanOrEqual(2);
    for (const args of sent) {
      expect((args.p_changes as { recorded_at: string }).recorded_at).toBe(T0);
      expect(args.p_request_key).toBe(saved.requestKey);
    }
  });

  it('a field put back keeps the item\'s time: the other field is sent with the time of the latest save', async () => {
    const phone = await start();
    await offline(phone);
    await change({ rack: 'B-2', package_mark: 'M9' });
    await jest.advanceTimersByTimeAsync(60_000);
    await change({ rack: 'A-1' });
    const [row] = await items();
    expect(bodyOf(row).recordedAt).toBe('2026-11-26T03:31:00.000Z');
    expect(Object.keys(bodyOf(row).changes)).toEqual(['package_mark']);
  });
});

describe('K6: another person\'s items', () => {
  it('are never merged into: the same lot by this person is a new item, and the other\'s body is unchanged', async () => {
    const phone = await start();
    await offline(phone);
    await change({ rack: 'B-2' });
    const [theirs] = await items();
    env.subject = 'user-2';
    const other = await restart();
    require('@/features/unsent/lotChangeKind');
    service = require('@/features/quick-change/lotChangeService');
    await other.phone.engine.setCopyOffline(true);
    await change({ rack: 'C-3' });
    const rows = await items();
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(theirs.id);
    expect(rows[0].body).toBe(theirs.body);
    expect(bodyOf(rows[1]).changes).toEqual({ rack: { to: 'C-3', from: 'A-1' } });
    expect(rows[1].depends_on).toBeNull();
    expect((await other.queue.listItems()).map(i => i.id)).not.toContain(theirs.id);
  });
});

describe('K7: a resend after a lost answer', () => {
  it('sends the identical body and request key', async () => {
    const phone = await start();
    await offline(phone);
    await change({ rack: 'B-2' });
    let n = 0;
    server.answers[RPC] = () => (n++ === 0 ? GATEWAY_TIMEOUT : answer('B-2'));
    server.answers.get_submission_result = () => ({ data: { found: false }, error: null });
    await online(phone);
    await pass(phone, 30_000);
    const sends = calls();
    expect(sends.length).toBeGreaterThanOrEqual(2);
    expect(sends.at(-1)?.args).toEqual(sends[0].args);
    expect(new Set(sends.map(c => c.args.p_request_key)).size).toBe(1);
    expect((await items())).toHaveLength(1);
  });
});

describe('mergeInto gains an optional what (WH-302 asks WH-301)', () => {
  it('changes the row title with the body, and leaves the title alone without it', async () => {
    const phone = await start();
    await offline(phone);
    const { id } = await phone.queue.enqueue({ kind: 'lotChange', body: { a: 1 }, what: 'old title' });
    const merge = phone.queue.mergeInto as (id: string, patch: (b: unknown) => unknown, what?: string) => Promise<boolean>;
    expect(await merge(id, () => ({ a: 2 }))).toBe(true);
    expect((await listed(phone))[0].what).toBe('old title');
    expect(await merge(id, () => ({ a: 3 }), 'new title')).toBe(true);
    const [row] = await listed(phone);
    expect(row.what).toBe('new title');
    expect(bodyOf((await items())[0])).toEqual({ a: 3 });
  });

  it('does not change the title when the merge is refused (the item was tried)', async () => {
    const phone = await start();
    await offline(phone);
    const { id } = await phone.queue.enqueue({ kind: 'lotChange', body: { a: 1 }, what: 'old title' });
    const { rawRun } = require('@/tests/unsent/unsentPhone') as typeof import('@/tests/unsent/unsentPhone');
    await rawRun(`UPDATE items SET attempts = 1, state = 'sending' WHERE id = '${id}'`);
    const merge = phone.queue.mergeInto as (id: string, patch: (b: unknown) => unknown, what?: string) => Promise<boolean>;
    expect(await merge(id, () => ({ a: 2 }), 'new title')).toBe(false);
    expect((await items())[0].what).toBe('old title');
  });
});

describe('K8: an unsent GRN edit of the same lot', () => {
  it('a quick change after it is a separate item, no dependsOn, with from = the edit\'s to', async () => {
    const phone = await start();
    await offline(phone);
    phone.kinds.registerSendKind('grnEdit', { lane: 'record', send: async () => ({ kind: 'sent', result: { success: true } }) });
    const editBody = { v: 1, grnId: GRN, loadedAt: '2026-11-26T03:00:00.000Z', recordedAt: '2026-11-26T03:20:00.000Z', lots: { [LOT]: { rack: { from: 'A-1', to: 'D-4' } } } };
    const edit = await phone.queue.enqueue({
      kind: 'grnEdit',
      body: editBody,
      targetRef: { grnId: GRN, lotIds: [LOT], number: '12' },
      what: 'GRN 12: edited',
    });
    await change({ rack: 'E-5' });
    const rows = await items();
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(edit.id);
    expect(bodyOf(rows[0])).toEqual(editBody);
    expect(rows[1].kind).toBe('lotChange');
    expect(rows[1].depends_on).toBeNull();
    expect(bodyOf(rows[1]).changes).toEqual({ rack: { to: 'E-5', from: 'D-4' } });
  });
});

describe('WH-302 Medium: an answer that did not come through is LOST, never a plain failure', () => {
  // Real postgrest-js puts the HTTP status on the answer itself, beside data and error (not inside error).
  const unreadable200 = { data: null, error: { message: 'Unexpected character at position 0' }, status: 200 };
  const empty200 = { data: null, error: null, status: 200 };
  const badGateway = { data: null, error: { message: 'upstream sent an invalid answer' }, status: 502 };
  const gatewayTimeout = { data: null, error: { message: 'upstream sent no answer' }, status: 504 };
  const cannotAsk: RpcAnswer = { data: null, error: { message: 'No internet connection', code: 'NETWORK' } };

  it.each<[string, unknown]>([
    ['an unreadable 200', unreadable200],
    ['an empty 200', empty200],
    ['a 502 page', badGateway],
    ['a 504 page', gatewayTimeout],
  ])('%s: the item stays tried, is checked by its request key, and is not marked sent', async (_name, reply) => {
    const phone = await start();
    await offline(phone);
    const saved = await change({ rack: 'B-2' });
    server.answers[RPC] = () => reply as RpcAnswer;
    server.answers.get_submission_result = () => cannotAsk;
    await online(phone);
    await pass(phone, 20_000); // the check waits 10 s after the send
    const [row] = await items();
    expect(row.state).toBe('sending');
    expect(row.attempts).toBeGreaterThan(0);
    expect(server.calls.filter(c => c.name === 'get_submission_result').map(c => c.args.p_key)).toContain(saved.requestKey);
    expect(phone.store.getUnsentSummary().count).toBe(1);
  });

  it.each<[string, unknown]>([
    ['an unreadable 200', unreadable200],
    ['an empty 200', empty200],
    ['a 502 page', badGateway],
    ['a 504 page', gatewayTimeout],
  ])('after %s a later change to the same lot is a new item that depends on the lost one, not merged into it', async (_name, reply) => {
    const phone = await start();
    await offline(phone);
    const first = await change({ rack: 'B-2' });
    server.answers[RPC] = () => reply as RpcAnswer;
    server.answers.get_submission_result = () => cannotAsk;
    await online(phone);
    await pass(phone, 1_000);
    await offline(phone);
    const second = await change({ rack: 'C-3' });
    const rows = await items();
    expect(rows).toHaveLength(2);
    expect(second.merged).toBe(false);
    expect(second.requestKey).not.toBe(first.requestKey);
    expect(rows[1].depends_on).toBe(rows[0].id);
    expect(bodyOf(rows[0]).changes).toEqual({ rack: { to: 'B-2', from: 'A-1' } });
    expect(bodyOf(rows[1]).changes).toEqual({ rack: { to: 'C-3', from: 'B-2' } });
  });

  it('server applied A, its answer was unreadable, the person changed again: B is sent under its own key and is not marked sent by A\'s replay', async () => {
    const phone = await start();
    await offline(phone);
    // A faithful server: applies a request once, keeps its answer under the request key, and replays it (idempotent) for the same key.
    const stored = new Map<string, RpcAnswer>();
    let rackOnServer = 'A-1';
    let firstAnswerLost = true;
    server.answers[RPC] = args => {
      const key = args.p_key ?? args.p_request_key;
      const replay = stored.get(key);
      if (replay) return { data: { ...(replay.data as object), idempotent: true }, error: null };
      rackOnServer = (args.p_changes as { rack: { to: string } }).rack.to;
      const done = answer(rackOnServer);
      stored.set(key, done);
      if (firstAnswerLost) { firstAnswerLost = false; return unreadable200 as RpcAnswer; }
      return done;
    };
    server.answers.get_submission_result = args => (stored.has(args.p_key) ? { data: { found: true, response: stored.get(args.p_key)!.data }, error: null } : { data: { found: false }, error: null });
    const a = await change({ rack: 'B-2' });
    await online(phone);
    await pass(phone, 1_000); // A applied on the server, the answer unreadable
    expect(rackOnServer).toBe('B-2');
    await offline(phone);
    const b = await change({ rack: 'C-3' });
    await online(phone);
    await pass(phone);
    const bCalls = calls().filter(c => c.args.p_request_key === b.requestKey);
    expect(b.requestKey).not.toBe(a.requestKey);
    expect(bCalls.length).toBeGreaterThan(0);
    expect(bodyOf((await items())[1]).changes.rack).toEqual({ to: 'C-3', from: 'B-2' });
    expect(rackOnServer).toBe('C-3');
    expect((await items()).map(r => r.state)).toEqual(['sent', 'sent']);
  });
});

describe('K10 (PQ7): a refusal told at once on the open sheet', () => {
  type Undo = { undoRefusedSave(saved: { id: string; merged: boolean }): Promise<void> };
  const refuse = () => ({ data: { success: false, error: 'Lot not found', code: 'LOT_NOT_FOUND' }, error: null });
  const undo = () => (service as unknown as Undo).undoRefusedSave;

  async function mergedAndRefused() {
    const phone = await start();
    await offline(phone);
    await change({ rack: 'B-2' });
    await jest.advanceTimersByTimeAsync(5_000);
    const merged = await change({ package_mark: 'M9' });
    expect(merged.merged).toBe(true);
    server.answers[RPC] = refuse;
    await online(phone);
    await pass(phone);
    const [row] = await items();
    expect(row.state).toBe('refused');
    return { phone, merged, refusedKey: row.request_key };
  }

  it('a merged item goes back to the earlier change alone: body, title, waiting, counted, and a new request key', async () => {
    const { phone, merged, refusedKey } = await mergedAndRefused();
    await undo()(merged);
    const rows = await items();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(merged.id);
    expect(rows[0].state).toBe('saved');
    expect(rows[0].attempts).toBe(0);
    expect(bodyOf(rows[0])).toMatchObject({ lotId: LOT, grnId: GRN, recordedAt: T0, changes: { rack: { to: 'B-2', from: 'A-1' } } });
    expect(bodyOf(rows[0]).changes.package_mark).toBeUndefined();
    expect(rows[0].what).toBe('GRN 12: Rack changed');
    expect(rows[0].request_key).not.toBe(refusedKey);
    expect(phone.store.getUnsentSummary().count).toBe(1);
  });

  it('the restored change is sent alone, with the earlier values only and its new key', async () => {
    const { phone, merged } = await mergedAndRefused();
    await undo()(merged);
    const before = calls().length;
    server.answers[RPC] = () => answer('B-2');
    await pass(phone);
    const sent = calls().slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0].args).toEqual({ p_lot_id: LOT, p_changes: { rack: { to: 'B-2', from: 'A-1' }, recorded_at: T0 }, p_request_key: (await items())[0].request_key });
    expect(JSON.stringify(sent[0].args)).not.toContain('M9');
    expect(JSON.stringify(sent[0].args)).not.toContain('previous');
    expect((await items())[0].state).toBe('sent');
  });

  it('the restored change refused on its own stays a refused item, not dropped (it goes Held)', async () => {
    const { phone, merged } = await mergedAndRefused();
    await undo()(merged);
    await pass(phone);
    const rows = await items();
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('refused');
    expect(phone.store.getUnsentSummary().count).toBe(1);
  });

  it('dependants of the refused item wait again, still attached to it (WH-301 section 3)', async () => {
    const phone = await start();
    await offline(phone);
    await change({ rack: 'B-2' });
    const merged = await change({ package_mark: 'M9' });
    let answerWith: (value: RpcAnswer) => void = () => undefined;
    server.answers[RPC] = () => new Promise(resolve => { answerWith = resolve; });
    server.answers.get_submission_result = () => ({ data: { found: false }, error: null });
    await online(phone);
    const done = phone.engine.sendNow('send-now');
    await jest.advanceTimersByTimeAsync(1_000);
    const later = await change({ rack: 'D-4' });
    expect(later.merged).toBe(false);
    answerWith(refuse());
    await jest.advanceTimersByTimeAsync(60_000);
    await done;
    expect((await items()).map(r => r.state)).toEqual(['refused', 'refused']);
    expect((await rawRows<{ last_error: string | null }>('items', 'ORDER BY seq'))[1].last_error).toBe('dependsOnRefused');
    await undo()(merged);
    const rows = await items();
    expect(rows.map(r => r.state)).toEqual(['saved', 'saved']);
    expect(rows[1].depends_on).toBe(merged.id);
    expect((await rawRows<{ last_error: string | null }>('items', 'ORDER BY seq')).map(r => r.last_error)).toEqual([null, null]);
    expect(phone.store.getUnsentSummary().count).toBe(2);
  });

  it('a refused item that was not merged is removed as before', async () => {
    const phone = await start();
    await offline(phone);
    const saved = await change({ rack: 'B-2' });
    expect(saved.merged).toBe(false);
    server.answers[RPC] = refuse;
    await online(phone);
    await pass(phone);
    expect((await items())[0].state).toBe('refused');
    await undo()(saved);
    expect(await items()).toEqual([]);
    expect(phone.store.getUnsentSummary().count).toBe(0);
  });
});
