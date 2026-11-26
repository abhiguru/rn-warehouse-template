/**
 * WH-301 slice 1 (contract section 5, decision 6, criterion 11; cases C1-C8): the 2-hour clock of unsent work. It runs from
 * the oldest own unsent item, survives a kill, a reboot and a changed phone clock, and when the phone cannot tell, the limit
 * counts as passed. PQ2: waiting photos do not start it. Another person's items never count (card, Product answer 1).
 *
 * Real: the unsent store, queue, work clock and gate. Faked at the edge: the phone's clock (Jest's fake timers: `Date.now`
 * is the wall clock and is set with `setSystemTime`; `performance.now` is the monotonic clock and moves only with time
 * passing), expo-sqlite, files, NetInfo, AppState, the signed-in person.
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - The contract says "monotonicNow" without naming the source: these tests take it from `performance.now()`, as
 *    src/services/print-service.ts does, which is what Jest's fake timers move together with `Date.now()` and keep apart
 *    when only the wall clock is set. If Development reads another monotonic source, say so and the stand-in changes.
 *  - A kill is `restart()` (modules loaded again, `runId` new); the phone clock is moved while the app is dead by
 *    `jest.setSystemTime` with no timer advanced.
 *  - The ledger is the `meta` row with key `clock` (section 5).
 * ==================================================================
 */
import { eraseEverything, env, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { bootUnsent, rawRun, restart, server } from '@/tests/unsent/unsentPhone';

const MIN = 60_000;
const HOUR = 60 * MIN;
const START = new Date('2026-11-26T09:00:00+05:30');
const waits = { kind: 'testRecord', body: { lines: [{ item: 'Potato', bags: 40 }] }, what: 'GRN for Asha Fictional Traders' };
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);
const wall = () => Date.now();
const moveWall = (ms: number) => jest.setSystemTime(wall() + ms);

type Unsent = Awaited<ReturnType<typeof restart>>;
async function start(): Promise<Unsent> {
  const phone = await bootUnsent();
  phone.kinds.registerSendKind('testRecord', { lane: 'record', send: async () => ({ kind: 'transient' }) });
  await phone.store.initUnsent();
  return phone;
}
async function kill(): Promise<Unsent> {
  const phone = await restart();
  phone.kinds.registerSendKind('testRecord', { lane: 'record', send: async () => ({ kind: 'transient' }) });
  return phone;
}

beforeEach(() => { jest.useFakeTimers({ now: START }); resetEnv(); files.reset(); server.reset(); });
afterEach(async () => { jest.useRealTimers(); await eraseEverything(); });

describe('C1: the limit is 2 hours, to the second', () => {
  it('a new record can be started at 1:59:59 after the first unsent item and not at 2:00:00', async () => {
    const phone = await start();
    await phone.queue.enqueue(waits);
    await advance(2 * HOUR - 1000);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
    expect(phone.store.getUnsentSummary().limitReached).toBe(false);
    await advance(1000);
    expect(phone.gate.canStartWork()).toEqual({ ok: false, count: 1, oldestAgeMs: 2 * HOUR });
    expect(phone.store.getUnsentSummary().limitReached).toBe(true);
  });

  it('starts with the first unsent item, not with the app: no unsent work, no limit however long the app runs', async () => {
    const phone = await start();
    await advance(5 * HOUR);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
    expect(phone.store.getUnsentSummary().count).toBe(0);
  });

  it('counts from the OLDEST item: a second item saved later does not restart it', async () => {
    const phone = await start();
    await phone.queue.enqueue(waits);
    await advance(100 * MIN);
    await phone.queue.enqueue(waits);
    await advance(20 * MIN);
    expect(phone.gate.canStartWork()).toMatchObject({ ok: false, count: 2, oldestAgeMs: 2 * HOUR });
  });
});

describe('C2: the phone clock changed while the app runs', () => {
  it('a wall clock set back an hour does not stop the age growing', async () => {
    const phone = await start();
    await phone.queue.enqueue(waits);
    await advance(30 * MIN);
    moveWall(-HOUR);
    await advance(90 * MIN);
    expect(phone.gate.canStartWork()).toMatchObject({ ok: false, oldestAgeMs: 2 * HOUR });
  });

  it('a wall clock set forward an hour does not make the age jump while the app runs', async () => {
    const phone = await start();
    await phone.queue.enqueue(waits);
    await advance(30 * MIN);
    moveWall(HOUR);
    await advance(MIN);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
  });
});

describe('C3 to C5: the app was killed, or the phone restarted', () => {
  it('a restart with the wall clock 10 minutes behind where it was: the limit counts as passed (cannot tell)', async () => {
    const first = await start();
    await first.queue.enqueue(waits);
    await advance(10 * MIN);
    moveWall(-10 * MIN);
    const phone = await kill();
    expect(phone.gate.canStartWork().ok).toBe(false);
    expect(phone.store.getUnsentSummary().limitReached).toBe(true);
  });

  it('a restart with the wall clock 4 minutes behind (a correction): nothing changes, the age is what it was', async () => {
    const first = await start();
    await first.queue.enqueue(waits);
    await advance(10 * MIN);
    moveWall(-4 * MIN);
    const phone = await kill();
    const gate = phone.gate.canStartWork();
    expect(gate).toEqual({ ok: true });
    await advance(110 * MIN - 1000);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
    await advance(1000);
    expect(phone.gate.canStartWork().ok).toBe(false);
  });

  it('a restart three hours later (the phone was off): the limit has passed', async () => {
    const first = await start();
    await first.queue.enqueue(waits);
    await advance(10 * MIN);
    moveWall(3 * HOUR);
    const phone = await kill();
    expect(phone.gate.canStartWork()).toMatchObject({ ok: false, count: 1 });
  });

  it('a restart one hour later counts that hour (a phone clock moved forward counts, the safe side)', async () => {
    const first = await start();
    await first.queue.enqueue(waits);
    await advance(10 * MIN);
    moveWall(HOUR);
    const phone = await kill();
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
    await advance(50 * MIN);
    expect(phone.gate.canStartWork().ok).toBe(false);
  });

  it('the clock ledger missing or damaged while own items exist: the limit counts as passed', async () => {
    const first = await start();
    await first.queue.enqueue(waits);
    await advance(MIN);
    await rawRun("DELETE FROM meta WHERE key = 'clock'");
    const phone = await kill();
    expect(phone.gate.canStartWork().ok).toBe(false);
  });
});

describe('C6: when the phone could not tell, and the work is gone', () => {
  it('the unknown clears when the last own item is sent, and the next record starts a fresh clock', async () => {
    const first = await start();
    await first.queue.enqueue(waits);
    await advance(10 * MIN);
    moveWall(-10 * MIN);
    const phone = await restart();
    phone.kinds.registerSendKind('testRecord', { lane: 'record', send: async () => ({ kind: 'sent', result: { number: 'GRN 7' } }) });
    expect(phone.gate.canStartWork().ok).toBe(false);
    await phone.engine.sendNow('send-now');
    expect(phone.store.getUnsentSummary().count).toBe(0);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
    await phone.queue.enqueue(waits);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
    expect(phone.store.getUnsentSummary().limitReached).toBe(false);
  });
});

describe('C7: only the signed-in person\'s work counts', () => {
  it("another person's old unsent items neither count nor stop this person", async () => {
    const first = await start();
    await first.queue.enqueue(waits);
    await advance(3 * HOUR);
    expect(first.gate.canStartWork().ok).toBe(false);
    env.subject = 'user-2';
    const phone = await kill();
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
    expect(phone.store.getUnsentSummary()).toMatchObject({ count: 0, limitReached: false });
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: true });
  });
});

describe('C8: the time to send by', () => {
  it('is the oldest item\'s save time plus 2 hours, on an unchanged clock', async () => {
    const phone = await start();
    const savedAt = wall();
    await phone.queue.enqueue(waits);
    await advance(37 * MIN);
    const sendBy = phone.store.getUnsentSummary().sendBy;
    expect(Math.abs(sendBy - (savedAt + 2 * HOUR))).toBeLessThanOrEqual(1000);
  });
});
