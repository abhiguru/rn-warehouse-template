/**
 * WH-301 slice 2 (contract sections 3 and 4, cases Q1-Q12; section 6 for the held sends of PQ5): the queue's order, one record
 * in flight, a permanent request ID, the answer classification, the lost answer, the retry steps, the triggers, and the
 * photo lane. Test first: nothing is built.
 *
 * Real: src/features/unsent (queue, engine, kinds registry, store), `checkSubmission` (src/utils/lostAnswer.ts), `isLostAnswer`
 * and the rest of serverText, the session-scoped registry. Faked at the edge: the server's answers to the RPCs (the client's
 * `rpc`), expo-sqlite, files, NetInfo, AppState, the clock (fake timers), the signed-in person. The kinds that go into the
 * queue are later cards' (WH-302/303/161): the tests register a kind that sends one RPC and reads its answer with the real
 * `classify`; that stand-in is the record kind, not the unit under test.
 *
 * ===== AGREE WITH DEVELOPMENT (names or behaviour the contract leaves open; ASSUMED) =====
 *  - `registerSendKind(name, kind)` in sendKinds.ts; `initUnsent()` in unsentStore.ts; `classify` is exported from sendEngine.ts.
 *  - Offline (`setCopyOffline(true)`, the flag section 4 names for 'reconnect') makes no send attempt: `attempts` stays 0.
 *  - A request that comes back lost counts as an attempt (`attempts` 1, state 'sending'); a held write that never left does not decide this.
 *  - The engine checks an item's photo files before handing it to the kind: a file gone sets `item_photos.missing = 1`, the
 *    kind is still called. (Section 3 puts the missing file under the photo lane; if the kind does it, say so.)
 *  - The 4-at-a-time photo uploads and the real `photos` kind need that kind's body shape (section 2.1 does not give it): not tested here.
 *  - A dependant is "skipped" when what it depends on is refused or unsent; a refused one takes its dependants with it (section 3).
 * =====================================================================================
 */
import { env, eraseEverything, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { DOCUMENT_DIRECTORY, files } from '@/tests/phoneCopy/fakeFiles';
import { addPhoto, bootUnsent, GATEWAY_TIMEOUT, NO_NETWORK, rawRows, restart, rpcKind, server, type RpcAnswer } from '@/tests/unsent/unsentPhone';

const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);
const ok = (number: string): RpcAnswer => ({ data: { success: true, number }, error: null });
const SAVE = 'save_test';
const saves = () => server.calls.filter(c => c.name === SAVE);
const savedKeys = () => saves().map(c => c.args.p_key);
const lookups = () => server.calls.filter(c => c.name === 'get_submission_result');
const body = (n: number) => ({ lines: [{ item: 'Potato', bags: n }] });
const input = (n: number, extra: Record<string, unknown> = {}) => ({ kind: 'testRecord', body: body(n), what: `GRN ${n} for Asha Fictional Traders`, ...extra });

type Phone = Awaited<ReturnType<typeof bootUnsent>>;
async function start(): Promise<Phone> {
  const phone = await bootUnsent();
  phone.kinds.registerSendKind('testRecord', rpcKind(phone, SAVE));
  phone.kinds.registerSendKind('testPhoto', rpcKind(phone, 'save_photo', 'photo'));
  await phone.store.initUnsent();
  return phone;
}
async function offline(phone: Phone) { await setReachable(false); phone.phone.engine.setCopyOffline(true); }
async function online(phone: Phone) { await setReachable(true); phone.phone.engine.setCopyOffline(false); }
/** One pass, run to its end: the time it needs (waits of the lost answer) is given. */
async function pass(phone: Phone, reason: Parameters<Phone['engine']['sendNow']>[0] = 'send-now', ms = 60_000) {
  const done = phone.engine.sendNow(reason);
  await advance(ms);
  await done;
}
const states = async () => (await rawRows<{ state: string; request_key: string }>('items', 'ORDER BY seq')).map(r => r.state);
const gate = <T>() => { let release!: (v: T) => void; const promise = new Promise<T>(resolve => { release = resolve; }); return { promise, release }; };

beforeEach(() => { jest.useFakeTimers({ now: new Date('2026-11-26T09:00:00+05:30') }); resetEnv(); files.reset(); server.reset(); });
afterEach(async () => {
  // A retry still armed when the test ends must not fire after the file is torn down: end the pass, reset the session, drop the timers.
  await jest.advanceTimersByTimeAsync(50);
  await eraseEverything();
  await jest.advanceTimersByTimeAsync(50);
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('Q1, Q2: the order', () => {
  it('sends records in the order they were saved, even when the phone clock was set back between the saves', async () => {
    const phone = await start();
    await offline(phone);
    const a = await phone.queue.enqueue(input(1));
    jest.setSystemTime(Date.now() - 3_600_000);
    const b = await phone.queue.enqueue(input(2));
    jest.setSystemTime(Date.now() - 3_600_000);
    const c = await phone.queue.enqueue(input(3));
    server.answers[SAVE] = () => ok('GRN 1');
    await online(phone);
    await pass(phone, 'reconnect');
    expect(savedKeys()).toEqual([a.requestKey, b.requestKey, c.requestKey]);
    expect(await states()).toEqual(['sent', 'sent', 'sent']);
  });

  it('sends one record at a time: the next waits for the answer to the one before', async () => {
    const phone = await start();
    await offline(phone);
    const a = await phone.queue.enqueue(input(1));
    const b = await phone.queue.enqueue(input(2));
    const hold = gate<RpcAnswer>();
    server.answers[SAVE] = args => (args.p_key === a.requestKey ? hold.promise : ok('GRN 2'));
    await online(phone);
    const running = phone.engine.sendNow('reconnect');
    await advance(1000);
    expect(savedKeys()).toEqual([a.requestKey]);
    hold.release(ok('GRN 1'));
    await advance(1000);
    await running;
    expect(savedKeys()).toEqual([a.requestKey, b.requestKey]);
  });

  it('hands what a record answered to the item that depends on it', async () => {
    const phone = await start();
    await offline(phone);
    const a = await phone.queue.enqueue(input(1));
    await phone.queue.enqueue({ ...input(2), dependsOn: a.id });
    server.answers[SAVE] = args => ok(args.p_key === a.requestKey ? 'GRN 312' : 'GRN 313');
    await online(phone);
    await pass(phone, 'reconnect');
    expect(saves()[1].args.resolved).toEqual({ [a.id]: { success: true, number: 'GRN 312' } });
  });

  it('an item whose dependency was refused is not sent, goes with it, and later independent items still go', async () => {
    const phone = await start();
    await offline(phone);
    const a = await phone.queue.enqueue(input(1));
    const dependant = await phone.queue.enqueue({ ...input(2), dependsOn: a.id });
    const later = await phone.queue.enqueue(input(3));
    server.answers[SAVE] = args => (args.p_key === a.requestKey
      ? { data: { success: false, error: 'Not enough stock', code: 'insufficient_stock' }, error: null }
      : ok('GRN 9'));
    await online(phone);
    await pass(phone, 'reconnect');
    expect(savedKeys()).toEqual([a.requestKey, later.requestKey]);
    expect(savedKeys()).not.toContain(dependant.requestKey);
    expect(await states()).toEqual(['refused', 'refused', 'sent']);
    // The ruling of 2026-11-26 (contract, end of the file): the dependant says why in its own words, names what it follows, and is not unsent work.
    const rows = await rawRows<{ last_error: string; depends_on: string }>('items', 'ORDER BY seq');
    expect(rows[1]).toMatchObject({ last_error: 'dependsOnRefused', depends_on: a.id }); // ASSUMED column for the reason: last_error
    expect(rows[0].last_error).toBe('Not enough stock');
    // Sharpened ruling (WH-304 PQ1): both stay unsent work until the server holds them.
    expect(phone.store.getUnsentSummary().count).toBe(2);
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: false, count: 2 });
  });
});

describe('Q3, Q12: waiting photos', () => {
  const photoItem = (record: { id: string }, ...uris: string[]) => ({
    kind: 'testPhoto', body: { grn: 'x' }, what: 'Photos of the GRN', dependsOn: record.id, photos: uris.map(file => ({ file, role: 'goods' })),
  });

  it('go only after their record is sent', async () => {
    const phone = await start();
    await offline(phone);
    const record = await phone.queue.enqueue(input(1));
    await phone.queue.enqueue(photoItem(record, addPhoto('a.jpg')));
    server.answers.save_photo = () => ok('photo');
    server.answers[SAVE] = () => NO_NETWORK;
    await online(phone);
    await pass(phone, 'reconnect', 1000);
    expect(server.calls.filter(c => c.name === 'save_photo')).toHaveLength(0);
    server.answers[SAVE] = () => ok('GRN 1');
    await pass(phone, 'send-now', 120_000);
    expect(server.calls.filter(c => c.name === 'save_photo')).toHaveLength(1);
    expect(await states()).toEqual(['sent', 'sent']);
  });

  it('never delay the next record: a slow photo upload does not hold the record lane', async () => {
    const phone = await start();
    await offline(phone);
    const first = await phone.queue.enqueue(input(1));
    await phone.queue.enqueue(photoItem(first, addPhoto('a.jpg')));
    const second = await phone.queue.enqueue(input(2));
    const slow = gate<RpcAnswer>();
    server.answers.save_photo = () => slow.promise;
    server.answers[SAVE] = () => ok('GRN 1');
    await online(phone);
    const running = phone.engine.sendNow('reconnect');
    await advance(5000);
    expect(savedKeys()).toEqual([first.requestKey, second.requestKey]);
    expect(server.calls.filter(c => c.name === 'save_photo')).toHaveLength(1);
    slow.release(ok('photo'));
    await advance(1000);
    await running;
  });

  it('a photo file gone from the phone is marked missing and does not stop the others or the record', async () => {
    const phone = await start();
    await offline(phone);
    const record = await phone.queue.enqueue(input(1));
    const kept = addPhoto('kept.jpg');
    const gone = addPhoto('gone.jpg');
    await phone.queue.enqueue(photoItem(record, kept, gone));
    const stored = await rawRows<{ file: string; client_photo_id: string }>('item_photos');
    const goneRow = stored.find(r => r.file.endsWith('gone.jpg'))!;
    files.held.delete(`${DOCUMENT_DIRECTORY}${goneRow.file}`); // stored relative to the documents folder (WH-301p)
    server.answers[SAVE] = () => ok('GRN 1');
    server.answers.save_photo = () => ok('photo');
    await online(phone);
    await pass(phone, 'reconnect');
    const rows = await rawRows<{ file: string; missing: number }>('item_photos');
    expect(rows.find(r => r.file === goneRow.file)!.missing).toBe(1);
    expect(rows.find(r => r.file !== goneRow.file)!.missing).toBeFalsy();
    expect(await states()).toEqual(['sent', 'sent']);
  });
});

describe('Q4: a change to something already queued', () => {
  it('before its first attempt it is merged into the one item, and the key stays', async () => {
    const phone = await start();
    await offline(phone);
    const a = await phone.queue.enqueue(input(1));
    expect((await rawRows<{ attempts: number }>('items'))[0].attempts).toBe(0);
    expect(await phone.queue.mergeInto(a.id, current => ({ ...(current as object), lines: [{ item: 'Potato', bags: 55 }] }))).toBe(true);
    const rows = await rawRows<{ body: string; request_key: string }>('items');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].body).lines[0].bags).toBe(55);
    expect(rows[0].request_key).toBe(a.requestKey);
  });

  it('after the first attempt the request is frozen: mergeInto says no and the stored body is unchanged', async () => {
    const phone = await start();
    server.answers[SAVE] = () => GATEWAY_TIMEOUT;
    server.answers.get_submission_result = () => ({ data: null, error: NO_NETWORK.error });
    const a = await phone.queue.enqueue(input(1));
    await advance(1000);
    expect((await rawRows<{ attempts: number }>('items'))[0].attempts).toBeGreaterThan(0);
    expect(await phone.queue.mergeInto(a.id, () => ({ lines: [] }))).toBe(false);
    expect(JSON.parse((await rawRows<{ body: string }>('items'))[0].body)).toEqual(body(1));
  });
});

describe('Q5: the same request every time', () => {
  it('a lost answer, then "not found", is sent again with the same key and the identical body', async () => {
    const phone = await start();
    let answers = 0;
    server.answers[SAVE] = () => (answers++ === 0 ? GATEWAY_TIMEOUT : ok('GRN 5'));
    server.answers.get_submission_result = () => ({ data: { found: false }, error: null });
    const a = await phone.queue.enqueue(input(1));
    await advance(30_000);
    expect(saves()).toHaveLength(2);
    expect(saves()[0].args).toEqual(saves()[1].args);
    expect(saves()[1].args.p_key).toBe(a.requestKey);
    expect(saves()[1].args.p_body).toEqual(body(1));
  });

  it('a retry after the app was killed sends the same key as before', async () => {
    const phone = await start();
    server.answers[SAVE] = () => NO_NETWORK;
    const a = await phone.queue.enqueue(input(1));
    await advance(1000);
    const again = await restart();
    again.kinds.registerSendKind('testRecord', rpcKind(again, SAVE));
    server.answers[SAVE] = () => ok('GRN 6');
    await pass(again, 'open');
    expect(savedKeys().at(-1)).toBe(a.requestKey);
    expect(new Set(savedKeys()).size).toBe(1);
  });
});

describe('Q6: what an answer means (contract section 4 table)', () => {
  const kindOf = (phone: Phone, result: unknown, error: unknown) => phone.engine.classify(result, error).kind;
  const SUCCESS = { success: true, number: 'GRN 1' };

  it('success true is sent, with the answer kept as the result', async () => {
    const phone = await start();
    expect(phone.engine.classify(SUCCESS, null)).toEqual({ kind: 'sent', result: SUCCESS });
  });

  it.each([
    ['a business refusal (success false with a code)', { success: false, error: 'Not enough stock', code: 'insufficient_stock' }, null],
    ['P0001 raised by the function', null, { message: 'Not allowed', code: 'P0001', status: 400 }],
    ['a unique violation 23505', null, { message: 'duplicate key', code: '23505', status: 409 }],
    ['42501 permission denied', null, { message: 'permission denied', code: '42501', status: 403 }],
    ['a PostgREST 400', null, { message: 'bad request', code: 'PGRST100', status: 400 }],
  ])('%s is refused', async (_name, result, error) => {
    const phone = await start();
    expect(kindOf(phone, result, error)).toBe('refused');
  });

  it.each([
    ['a gateway 504', null, GATEWAY_TIMEOUT.error],
    ['a gateway 502', null, { message: 'Bad Gateway', status: 502 }],
    ['a timeout after the request left', null, { name: 'TimeoutError', message: 'TimeoutError: The operation timed out' }],
  ])('%s is a lost answer', async (_name, result, error) => {
    const phone = await start();
    expect(kindOf(phone, result, error)).toBe('lost');
  });

  it.each([
    ['no network before sending', null, NO_NETWORK.error],
    ['the write was held and given up (WH-352)', null, { message: 'Error: Warehouse identity verification required' }],
    ['429 too many requests', null, { message: 'Too many requests', status: 429, code: '429' }],
    ['the server is being upgraded (503, code upgrading)', null, { message: 'upgrading', status: 503, code: 'upgrading' }],
  ])('%s is transient', async (_name, result, error) => {
    const phone = await start();
    expect(kindOf(phone, result, error)).toBe('transient');
  });

  it.each([
    ['a 401', null, { message: 'JWT expired', status: 401, code: 'PGRST301' }],
    ['the session changed', null, { message: 'Error: Session changed' }],
  ])('%s ends the pass (stop)', async (_name, result, error) => {
    const phone = await start();
    expect(kindOf(phone, result, error)).toBe('stop');
  });
});

describe('Q7: a lost answer', () => {
  it('asks the server about that request key, and "found" is the answer: the item is sent with that response', async () => {
    const phone = await start();
    server.answers[SAVE] = () => GATEWAY_TIMEOUT;
    server.answers.get_submission_result = () => ({ data: { found: true, response: { success: true, number: 'GRN 77' } }, error: null });
    const a = await phone.queue.enqueue(input(1));
    await advance(30_000);
    expect(saves()).toHaveLength(1);
    expect(lookups().map(c => c.args)).toEqual([{ p_key: a.requestKey }]);
    expect(await states()).toEqual(['sent']);
    expect(JSON.parse((await rawRows<{ result: string }>('items'))[0].result)).toMatchObject({ number: 'GRN 77' });
  });

  it('"not found" sends the identical request once more', async () => {
    const phone = await start();
    let n = 0;
    server.answers[SAVE] = () => (n++ === 0 ? GATEWAY_TIMEOUT : ok('GRN 78'));
    server.answers.get_submission_result = () => ({ data: { found: false }, error: null });
    await phone.queue.enqueue(input(1));
    await advance(30_000);
    expect(saves()).toHaveLength(2);
    expect(await states()).toEqual(['sent']);
  });

  it('sends nothing else from the record lane while the answer is in doubt, and the item stays "sending"', async () => {
    const phone = await start();
    server.answers[SAVE] = () => GATEWAY_TIMEOUT;
    const never = gate<RpcAnswer>();
    server.answers.get_submission_result = () => never.promise;
    await phone.queue.enqueue(input(1));
    await phone.queue.enqueue(input(2));
    await advance(60_000);
    await phone.engine.sendNow('send-now').catch(() => undefined);
    expect(saves()).toHaveLength(1);
    expect(await states()).toEqual(['sending', 'saved']);
    never.release({ data: { found: false }, error: null });
  });

  it('waits the lost-answer minimum (10 s after the send) before it asks', async () => {
    const phone = await start();
    server.answers[SAVE] = () => GATEWAY_TIMEOUT;
    server.answers.get_submission_result = () => ({ data: { found: true, response: ok('GRN 9').data }, error: null });
    await phone.queue.enqueue(input(1));
    await advance(9000);
    expect(lookups()).toHaveLength(0);
    await advance(2000);
    expect(lookups()).toHaveLength(1);
  });
});

describe('Q8: a write that was held', () => {
  it('is tried again after 5, 15, 30 and then every 60 seconds', async () => {
    const phone = await start();
    server.answers[SAVE] = () => ({ data: null, error: { message: 'Error: Warehouse identity verification required' } });
    await phone.queue.enqueue(input(1));
    await advance(0);
    const count = () => saves().length;
    expect(count()).toBe(1);
    await advance(4_999); expect(count()).toBe(1);
    await advance(1); expect(count()).toBe(2);
    await advance(14_999); expect(count()).toBe(2);
    await advance(1); expect(count()).toBe(3);
    await advance(29_999); expect(count()).toBe(3);
    await advance(1); expect(count()).toBe(4);
    await advance(59_999); expect(count()).toBe(4);
    await advance(1); expect(count()).toBe(5);
    await advance(59_999); expect(count()).toBe(5);
    await advance(1); expect(count()).toBe(6);
    expect(await states()).toEqual(['saved']);
  });
});

describe('Q9: the session ended', () => {
  it('a 401 ends the pass: nothing is sent after it, and both items are still unsent', async () => {
    const phone = await start();
    await offline(phone);
    await phone.queue.enqueue(input(1));
    await phone.queue.enqueue(input(2));
    server.answers[SAVE] = () => ({ data: null, error: { message: 'JWT expired', status: 401, code: 'PGRST301' } });
    await online(phone);
    await pass(phone, 'reconnect', 1000);
    expect(saves()).toHaveLength(1);
    expect((await states()).every(s => s !== 'sent' && s !== 'refused')).toBe(true);
  });
});

describe('Q10: what starts a pass', () => {
  const triggers = ['open', 'foreground', 'reconnect', 'send-now', 'sync', 'retry-timer'] as const;
  it.each(triggers)('%s starts a pass that sends what is waiting', async trigger => {
    const phone = await start();
    server.answers[SAVE] = () => NO_NETWORK;
    await phone.queue.enqueue(input(1));
    await advance(100);
    const before = saves().length;
    server.answers[SAVE] = () => ok('GRN 1');
    await pass(phone, trigger, 100);
    expect(saves().length).toBe(before + 1);
    expect(await states()).toEqual(['sent']);
  });

  it('saving an item while reachable sends it at once, with no other trigger', async () => {
    const phone = await start();
    server.answers[SAVE] = () => ok('GRN 1');
    await phone.queue.enqueue(input(1));
    await advance(100);
    expect(saves()).toHaveLength(1);
    expect(await states()).toEqual(['sent']);
  });

  it('two triggers at once share the one running pass: the request goes out once', async () => {
    const phone = await start();
    await offline(phone);
    await phone.queue.enqueue(input(1));
    const hold = gate<RpcAnswer>();
    server.answers[SAVE] = () => hold.promise;
    await online(phone);
    const first = phone.engine.sendNow('foreground');
    const second = phone.engine.sendNow('reconnect');
    await advance(500);
    hold.release(ok('GRN 1'));
    await advance(500);
    await Promise.all([first, second]);
    expect(saves()).toHaveLength(1);
  });
});

describe('Q11: whose items are sent', () => {
  it("another person's items are never sent, and this person's are", async () => {
    const first = await start();
    server.answers[SAVE] = () => NO_NETWORK;
    const theirs = await first.queue.enqueue(input(1));
    await advance(100);
    env.subject = 'user-2';
    const phone = await restart();
    phone.kinds.registerSendKind('testRecord', rpcKind(phone, SAVE));
    server.answers[SAVE] = () => ok('GRN 2');
    const mine = await phone.queue.enqueue(input(2));
    await pass(phone, 'open');
    expect(savedKeys().filter(k => k === theirs.requestKey).length).toBe(1); // only the first, failed try of user-1
    expect(savedKeys().at(-1)).toBe(mine.requestKey);
    const rows = await rawRows<{ id: string; state: string }>('items');
    expect(rows.find(r => r.id === theirs.id)!.state).toBe('saved');
  });
});

describe('a photo that could not be sent now', () => {
  it('is tried once in the pass, not again at once: the retry timer asks again', async () => {
    const phone = await start();
    let calls = 0;
    phone.kinds.registerSendKind('testPhoto', { lane: 'photo', send: async () => { calls += 1; return calls > 25 ? { kind: 'sent', result: {} } : { kind: 'transient' }; } });
    await offline(phone);
    const record = await phone.queue.enqueue(input(1));
    await phone.queue.enqueue({ kind: 'testPhoto', body: {}, what: 'Photos of the GRN', dependsOn: record.id, photos: [{ file: addPhoto('a.jpg'), role: 'goods' }] });
    server.answers[SAVE] = () => ok('GRN 1');
    await online(phone);
    await pass(phone, 'reconnect', 1000);
    expect(calls).toBe(1);
    await advance(5000);
    expect(calls).toBe(2);
  });
});

describe('WH-301 retry: a retry belongs to the session that armed it (d845cb1b)', () => {
  const sessionChange = () => (require('@/config/sessionLifecycle') as typeof import('@/config/sessionLifecycle')).advanceSessionGeneration();
  /** Records the callbacks of the engine's own retry timers, so a timer that was already due can be run by hand. */
  const watchTimers = () => {
    const armed: { wait: number; run: () => void }[] = [];
    const real = global.setTimeout;
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, wait?: number, ...rest: unknown[]) => {
      if (wait !== undefined && [5000, 15000, 30000, 60000].includes(wait)) armed.push({ wait, run: fn });
      return real(fn, wait, ...rest);
    }) as typeof setTimeout);
    return armed;
  };

  it('(a) a transient pass that ends after a session change arms no retry', async () => {
    const phone = await start();
    const hold = gate<RpcAnswer>();
    server.answers[SAVE] = () => hold.promise;
    await phone.queue.enqueue(input(1));
    await advance(100);
    expect(saves()).toHaveLength(1);
    sessionChange();
    hold.release(NO_NETWORK);
    await advance(100);
    await advance(120_000);
    expect(saves()).toHaveLength(1);
  });

  it('(b) a session change clears a pending retry and starts the back-off again', async () => {
    const phone = await start();
    server.answers[SAVE] = () => NO_NETWORK;
    await phone.queue.enqueue(input(1));
    await advance(100);
    expect(saves()).toHaveLength(1);
    await advance(5000); // first retry (5 s); the next wait is now 15 s
    expect(saves()).toHaveLength(2);
    sessionChange();
    await advance(60_000); // the pending 15 s retry of the old session never sends
    expect(saves()).toHaveLength(2);
    await phone.engine.sendNow('send-now'); // a new pass in the new session fails again: its wait is the first step, 5 s
    expect(saves()).toHaveLength(3);
    await advance(4900);
    expect(saves()).toHaveLength(3);
    await advance(100);
    expect(saves()).toHaveLength(4);
  });

  it('(c) a retry timer that is already due does not send once the session has changed', async () => {
    const armed = watchTimers();
    const phone = await start();
    server.answers[SAVE] = () => NO_NETWORK;
    await phone.queue.enqueue(input(1));
    await advance(100);
    expect(saves()).toHaveLength(1);
    const due = armed.find(timer => timer.wait === 5000)!;
    expect(due).toBeDefined();
    sessionChange();
    due.run();
    await advance(100);
    expect(saves()).toHaveLength(1);
  });

  it('(d) in one session the waits grow 5, 15, 30, 60 s and start again after a clean pass', async () => {
    const phone = await start();
    server.answers[SAVE] = () => NO_NETWORK;
    await phone.queue.enqueue(input(1));
    await advance(500);
    let expected = 1;
    // The clock stays 500 ms past each retry, so every step is checked 500 ms before and 500 ms after it is due.
    for (const wait of [5000, 15000, 30000, 60000, 60000]) {
      await advance(wait - 1000);
      expect(saves()).toHaveLength(expected);
      await advance(1000);
      expected += 1;
      expect(saves()).toHaveLength(expected);
    }
    server.answers[SAVE] = () => ok('GRN 1');
    await advance(60_000);
    expect(await states()).toEqual(['sent']);
    expected = saves().length;
    server.answers[SAVE] = () => NO_NETWORK;
    await phone.queue.enqueue(input(2));
    await advance(100);
    expect(saves()).toHaveLength(expected + 1);
    await advance(5000); // back to the first step
    expect(saves()).toHaveLength(expected + 2);
  });
});
