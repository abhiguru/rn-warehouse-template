/**
 * WH-301 settled cases (contract sections 5, 6, 9 and 15 with the answers on the card, 2026-11-26): what stops new work at the
 * 2-hour limit, and what refuses sign-out, leaving the facility, switching and removing the account. Design DQ2 (an unreadable
 * unsent file), DQ4 (a refused item stays an unsent row until WH-304); Product PQ1 (unfinished forms do not refuse), PQ2 (waiting
 * photos count and refuse, but do not start the clock), PQ4a (another facility's items), PQ5 (a customer role keeps them
 * unsent), PQ6 (an online save in doubt is not unsent).
 *
 * Real: src/features/unsent (store, queue, gate, clock), `services/unfinishedSaves.ts`, `facilityCapabilities`, the auth reducer.
 * Faked at the edge: expo-sqlite, files, NetInfo, AppState, the signed-in person, the server's answers, the clock.
 * Nothing here asks whether the unsent file is encrypted (open question with the owner).
 *
 * ===== AGREE WITH DEVELOPMENT (ASSUMED; the contract does not give them) =====
 *  - Photos of a record already on the server are an item of kind `photos` (section 2.1); body `{}` is used because section
 *    2.1 gives no body shape. The clock leaves items of that kind out (PQ2).
 *  - An unfinished form is a row of `forms` (section 1 gives its columns); the gate reads it from the file, so a row written
 *    to the file and a restart is what "a form was saved" is here (the functions of formDrafts.ts are not named).
 *  - The engine reads the role from the auth slice of `@/store` (the contract says "role not customer", section 4).
 *  - `refused` is the state of an item the server refused; it counts (section 3) until WH-304.
 * ==========================================================================
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { addPhoto, bootUnsent, rawRows, rawRun, restart, rpcKind, server } from '@/tests/unsent/unsentPhone';

const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);
const HOUR = 3_600_000;
const waits = { kind: 'testRecord', body: { lines: [{ item: 'Potato', bags: 40 }] }, what: 'GRN for Asha Fictional Traders' };

type Phone = Awaited<ReturnType<typeof restart>>;
const register = (phone: Phone, outcome: 'transient' | 'refused' = 'transient') =>
  phone.kinds.registerSendKind('testRecord', {
    lane: 'record',
    send: async () => (outcome === 'refused' ? { kind: 'refused', reason: 'Not enough stock' } : { kind: 'transient' }),
  });
async function start(outcome: 'transient' | 'refused' = 'transient'): Promise<Phone> {
  const phone = await bootUnsent();
  register(phone, outcome);
  await phone.store.initUnsent();
  return phone;
}
async function kill(outcome: 'transient' | 'refused' = 'transient'): Promise<Phone> {
  const phone = await restart();
  register(phone, outcome);
  return phone;
}
const FORM_ROW = (scope: string, kind = 'grn') =>
  `INSERT INTO forms (id, scope, kind, grn_id, state, photos, customer, started_at, updated_at) VALUES ('form-1', '${scope.replace(/'/g, "''")}', '${kind}', NULL, '{}', '[]', 'Asha Fictional Traders', ${Date.now()}, ${Date.now()})`;

beforeEach(() => { jest.useFakeTimers({ now: new Date('2026-11-26T09:00:00+05:30') }); resetEnv(); files.reset(); server.reset(); });
afterEach(async () => { jest.useRealTimers(); await eraseEverything(); });

describe('G1, G3: the 2-hour limit stops new work', () => {
  it('canStartWork is refused at the limit, with the count and the age, and allowed again once the items are gone', async () => {
    const phone = await start();
    await phone.queue.enqueue(waits);
    await phone.queue.enqueue(waits);
    await advance(2 * HOUR);
    expect(phone.gate.canStartWork()).toEqual({ ok: false, count: 2, oldestAgeMs: 2 * HOUR });
    for (const item of await phone.queue.listItems()) await phone.queue.deleteItem(item.id);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
  });

  it('with the offline feature off it never refuses, whatever is waiting (criterion 14)', async () => {
    const phone = await start();
    await phone.queue.enqueue(waits);
    await advance(3 * HOUR);
    expect(phone.gate.canStartWork().ok).toBe(false);
    phone.setSyncCapability(false);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
  });

  it('is not a reason to refuse while the oldest item is under 2 hours, however many there are', async () => {
    const phone = await start();
    for (let i = 0; i < 5; i += 1) await phone.queue.enqueue(waits);
    await advance(HOUR);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
  });
});

describe('G4: what refuses an account action', () => {
  it('nothing waiting: sign-out, leaving and the rest are allowed', async () => {
    const phone = await start();
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: true });
  });

  it('one own unsent item refuses them, with the count', async () => {
    const phone = await start();
    await phone.queue.enqueue(waits);
    await phone.queue.enqueue(waits);
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: false, count: 2 });
  });

  it('a sent item no longer refuses', async () => {
    const phone = await bootUnsent();
    phone.kinds.registerSendKind('testRecord', { lane: 'record', send: async () => ({ kind: 'sent', result: { number: 'GRN 1' } }) });
    await phone.store.initUnsent();
    await phone.queue.enqueue(waits);
    await phone.engine.sendNow('send-now');
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: true });
  });

  it('with the offline feature off nothing is refused', async () => {
    const phone = await start();
    await phone.queue.enqueue(waits);
    phone.setSyncCapability(false);
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: true });
  });
});

describe('DQ4: a refused item before WH-304', () => {
  it('stays an unsent row: it is counted, it refuses the account actions and it is kept after a restart', async () => {
    const phone = await start('refused');
    const { id } = await phone.queue.enqueue(waits);
    await phone.engine.sendNow('send-now');
    expect((await phone.queue.listItems()).find(i => i.id === id)?.state).toBe('refused');
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: false, count: 1 });
    expect(phone.store.getUnsentSummary().count).toBe(1);
    const again = await kill('refused');
    expect((await again.queue.listItems()).map(i => i.state)).toEqual(['refused']);
  });

  it('still starts the 2-hour clock', async () => {
    const phone = await start('refused');
    await phone.queue.enqueue(waits);
    await phone.engine.sendNow('send-now');
    await advance(2 * HOUR);
    expect(phone.gate.canStartWork().ok).toBe(false);
  });
});

describe('PQ1: unfinished forms', () => {
  it('alone they do not refuse sign-out, are not in the count, and do not start the clock', async () => {
    const first = await start();
    await rawRun('SELECT 1'); // the file exists once the store has opened
    const scope = (await first.phone.scope())!;
    await rawRun(FORM_ROW(scope));
    const phone = await kill();
    expect(await rawRows('forms')).toHaveLength(1);
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: true });
    expect(phone.store.getUnsentSummary().count).toBe(0);
    await advance(3 * HOUR);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
  });

  it('beside an unsent item they change neither the count nor the refusal', async () => {
    const first = await start();
    await first.queue.enqueue(waits);
    await rawRun(FORM_ROW((await first.phone.scope())!));
    const phone = await kill();
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: false, count: 1 });
    expect(phone.store.getUnsentSummary().count).toBe(1);
  });
});

describe('PQ2: waiting photos', () => {
  const photos = (file: string) => ({ kind: 'photos', body: {}, what: 'Photos of GRN 312', photos: [{ file, role: 'goods' }] });

  it('count in the bar and refuse the account actions (they are the only copy)', async () => {
    const phone = await start();
    phone.kinds.registerSendKind('photos', { lane: 'photo', send: async () => ({ kind: 'transient' }) });
    phone.phone.engine.setCopyOffline(true); // nothing is sent while these wait (a photo answering transient is its own case in sendEngine.test.ts)
    await phone.queue.enqueue(photos(addPhoto('a.jpg')));
    expect(phone.store.getUnsentSummary().count).toBe(1);
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: false, count: 1 });
  });

  it('do not start the 2-hour clock: no limit however long they wait', async () => {
    const phone = await start();
    phone.kinds.registerSendKind('photos', { lane: 'photo', send: async () => ({ kind: 'transient' }) });
    phone.phone.engine.setCopyOffline(true); // nothing is sent while these wait (a photo answering transient is its own case in sendEngine.test.ts)
    await phone.queue.enqueue(photos(addPhoto('a.jpg')));
    await advance(5 * HOUR);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
    expect(phone.store.getUnsentSummary().limitReached).toBe(false);
  });

  it('a record saved after them is the one that starts the clock', async () => {
    const phone = await start();
    phone.kinds.registerSendKind('photos', { lane: 'photo', send: async () => ({ kind: 'transient' }) });
    phone.phone.engine.setCopyOffline(true); // nothing is sent while these wait (a photo answering transient is its own case in sendEngine.test.ts)
    await phone.queue.enqueue(photos(addPhoto('a.jpg')));
    await advance(5 * HOUR);
    await phone.queue.enqueue(waits);
    await advance(HOUR);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
    await advance(HOUR);
    expect(phone.gate.canStartWork().ok).toBe(false);
  });
});

describe('PQ4a: another facility\'s items', () => {
  it('are kept, but not counted, not limiting and not refusing here', async () => {
    const first = await start();
    const { id } = await first.queue.enqueue(waits);
    await rawRun(`UPDATE items SET scope = '["https://other-facility.example.test","instance-b","user-1"]' WHERE id = '${id}'`);
    const phone = await kill();
    expect(phone.store.getUnsentSummary().count).toBe(0);
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: true });
    await advance(3 * HOUR);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
    expect(await phone.queue.listItems()).toEqual([]);
    expect((await rawRows('items')).map(r => r.id)).toEqual([id]);
  });
});

describe('PQ5: the own role became customer', () => {
  it('the items are kept and not sent, and are not erased by the role change', async () => {
    const phone = await bootUnsent();
    phone.kinds.registerSendKind('testRecord', rpcKind(phone, 'save_test'));
    await phone.store.initUnsent();
    server.answers.save_test = () => ({ data: { success: true, number: 'GRN 1' }, error: null });
    jest.doMock('react-redux', () => ({ useSelector: () => undefined, useDispatch: () => () => undefined }));
    const { store } = require('@/store') as typeof import('@/store');
    const auth = require('@/store/slices/authSlice') as typeof import('@/store/slices/authSlice');
    store.dispatch(auth.setUserProfile({ id: 'profile-1', role: 'customer', name: 'Asha Fictional' } as never));
    const { id } = await phone.queue.enqueue(waits);
    await phone.engine.sendNow('send-now');
    await advance(5000);
    expect(server.calls.filter(c => c.name === 'save_test')).toHaveLength(0);
    expect((await rawRows('items')).map(r => [r.id, r.state])).toEqual([[id, 'saved']]);
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: false, count: 1 });
  });
});

describe('PQ6: an online save in doubt', () => {
  it('is not unsent work: it does not refuse sign-out and is not counted', async () => {
    const phone = await start();
    const { rememberUnfinishedSave } = require('@/services/unfinishedSaves') as typeof import('@/services/unfinishedSaves');
    await rememberUnfinishedSave({ kind: 'grn', requestKey: 'k-1', number: '312', customerName: 'Asha Fictional Traders' });
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: true });
    expect(phone.store.getUnsentSummary().count).toBe(0);
  });
});

describe('DQ2: the unsent file cannot be read', () => {
  it('refuses the account actions with the count unknown, and starts no new work', async () => {
    const first = await start();
    await first.queue.enqueue(waits);
    for (let i = 0; i < 40; i += 1) require('@/tests/phoneCopy/fakeExpoSqlite').failStatement(/./, new Error('database disk image is malformed'));
    const phone = await bootUnsent();
    await phone.store.initUnsent();
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: false, count: null });
    expect(phone.gate.canStartWork().ok).toBe(false);
    expect(phone.store.getUnsentSummary().limitReached).toBe(true);
  });
});

describe('G4b: the unreadable file, in the summary (contract section 1, section 2.1a)', () => {
  it('getUnsentSummary says unreadable, with no count and the limit reached; a readable file says it is not', async () => {
    const first = await start();
    await first.queue.enqueue(waits);
    expect(first.store.getUnsentSummary().unreadable).toBe(false);
    for (let i = 0; i < 40; i += 1) require('@/tests/phoneCopy/fakeExpoSqlite').failStatement(/./, new Error('database disk image is malformed'));
    const phone = await bootUnsent();
    await phone.store.initUnsent();
    expect(phone.store.getUnsentSummary()).toMatchObject({ unreadable: true, count: 0, limitReached: true });
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: false, count: null });
  });
});

describe("G4f: another person's unsent dispatch (PQ4b)", () => {
  // ASSUMED: section 2.1 does not give `OverlayPart`; here a kind's overlay answers the bags it takes off a lot as `{ lessUnsent: { [lotId]: bags } }`.
  const dispatchKind = { lane: 'record' as const, send: async () => ({ kind: 'transient' as const }), overlay: () => ({ lessUnsent: { 'lot-1': 12 } }) };

  it("is deducted as lessOthersUnsent and in deductions(), and is not this person's own unsent", async () => {
    const first = await bootUnsent();
    first.kinds.registerSendKind('testDispatch', dispatchKind as never);
    await first.store.initUnsent();
    await first.queue.enqueue({ kind: 'testDispatch', body: {}, what: 'Dispatch for Bina Fictional Stores' });
    // A kill and a second person signing in. `env` is the top-level import, the copy the fake session reads (a require after the module reset would be another copy).
    const phone = await bootUnsent();
    env.subject = 'user-2';
    phone.kinds.registerSendKind('testDispatch', dispatchKind as never);
    await phone.store.initUnsent();
    const { getUnsentOverlay } = require('@/features/phone-copy/unsentOverlay') as { getUnsentOverlay(): { lessOthersUnsent(l: string): number; lessUnsent(l: string): number; deductions(): ReadonlyMap<string, number>; lot(l: string): unknown } };
    const overlay = getUnsentOverlay();
    expect(overlay.lessOthersUnsent('lot-1')).toBe(12);
    expect(overlay.lessUnsent('lot-1')).toBe(0);
    expect(overlay.deductions().get('lot-1')).toBe(12);
    expect(overlay.lot('lot-1')).toBeNull();
  });

  it("the person's own dispatch is lessUnsent, not lessOthersUnsent, and still in deductions()", async () => {
    const phone = await bootUnsent();
    phone.kinds.registerSendKind('testDispatch', dispatchKind as never);
    await phone.store.initUnsent();
    await phone.queue.enqueue({ kind: 'testDispatch', body: {}, what: 'Dispatch for Bina Fictional Stores' });
    const { getUnsentOverlay } = require('@/features/phone-copy/unsentOverlay') as { getUnsentOverlay(): { lessOthersUnsent(l: string): number; lessUnsent(l: string): number; deductions(): ReadonlyMap<string, number> } };
    const overlay = getUnsentOverlay();
    expect(overlay.lessUnsent('lot-1')).toBe(12);
    expect(overlay.lessOthersUnsent('lot-1')).toBe(0);
    expect(overlay.deductions().get('lot-1')).toBe(12);
  });
});

describe('PQ5: waitingForAdmin in the summary (contract section 2.1b)', () => {
  async function customerWithItems(count: number) {
    const phone = await bootUnsent();
    phone.kinds.registerSendKind('testRecord', rpcKind(phone, 'save_test'));
    await phone.store.initUnsent();
    jest.doMock('react-redux', () => ({ useSelector: () => undefined, useDispatch: () => () => undefined }));
    const { store } = require('@/store') as typeof import('@/store');
    const auth = require('@/store/slices/authSlice') as typeof import('@/store/slices/authSlice');
    store.dispatch(auth.setUserProfile({ id: 'profile-1', role: 'customer', name: 'Asha Fictional' } as never));
    for (let i = 0; i < count; i += 1) await phone.queue.enqueue(waits);
    return phone;
  }

  it('counts the own items kept for an administrator: count 0, limit not reached, however old', async () => {
    const phone = await customerWithItems(2);
    await advance(3 * HOUR);
    expect(phone.store.getUnsentSummary()).toMatchObject({ count: 0, limitReached: false, unreadable: false, waitingForAdmin: 2 });
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
  });

  it('still refuses the account actions: the items are unsent', async () => {
    const phone = await customerWithItems(1);
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: false, count: 1 });
  });

  it('is 0 for a person who can send', async () => {
    const phone = await start();
    await phone.queue.enqueue(waits);
    expect(phone.store.getUnsentSummary()).toMatchObject({ count: 1, waitingForAdmin: 0 });
  });
});
