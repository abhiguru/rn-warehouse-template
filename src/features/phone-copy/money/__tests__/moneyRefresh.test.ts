/**
 * WH-305, contract product/tech/app-offline-dues-statement.md 4, 6, 8 and T4-T9, T15, T16, with Product's rulings of
 * 2026-11-27 (card): every listed customer's statement is fetched gently after the first load (PQ1); the first sync of a day
 * fetches dues again, statements are not refetched for a new day (PQ2); dues are refetched at most every 10 minutes while
 * marks keep arriving (PQ6).
 *
 * Real: the refresh pass, the store, the sync engine, the copy, the two report services. Faked at the edge: the server's
 * answers (including how long a request takes), the phone's native modules, the connection and the app's foreground.
 * The clock is faked for `Date` only; timers are real (the gap between requests is waited for, so these cases take seconds).
 *
 * ===== AGREE WITH DEVELOPMENT (the contract describes the pass, not its entry points) =====
 *  - `@/features/phone-copy/money/moneyRefresh` exports `startMoneyRefresh()` and `stopMoneyRefresh()`. Start is idempotent; it
 *    subscribes to the sync run end (`subscribeSyncRunEnd`). In the app PhoneCopyLifecycle calls them; these tests call them.
 *  - The kept dues answer's age for the 10-minute rule is `Date.now()` minus its `as_of`.
 *  - "The first sync of a day" is a run end on a business day later than the kept dues answer's `today`.
 *  - A refusal is a body `{ success: false, error_code: '42501', error: 'Access denied' }` or (the server raises it) an error with code 42501 and no body; "Customer not found" is the
 *    body's `error` text (the contract names the text only).
 * ==========================================================================================
 */
import { env, eraseEverything, resetEnv, setForeground } from '@/tests/phoneCopy/phoneEnv';
import { bootWarehouse, goOffline, loadCopy, LOST, type Role, type Warehouse } from '@/tests/phoneCopy/wh299Phone';
import { duesBody, mark, NAMES, NOW, queueRun, seedMoney, statementBody } from '@/tests/phoneCopy/moneyDataset';
import { businessDate } from '@/features/phone-copy/pgCompat';

const MIN = 60_000;
// The pass waits 2,000 ms between statement requests for real, so even a first load takes several seconds.
jest.setTimeout(30000);
let clock = Date.parse(NOW);
let stopPass: (() => void) | null = null;
let inflight = 0;
let maxInflight = 0;
let times: Array<{ name: string; id?: string; at: number }> = [];
let dues = { ids: ['c3', 'c1', 'c2'] as string[], calls: 0 };
let statements: Record<string, number> = {};
let statementAnswer: (id: string) => { data: unknown; error: unknown } | null = () => null;

const iso = () => new Date(clock).toISOString();
const setClock = (ms: number) => { clock = ms; jest.setSystemTime(ms); };

beforeEach(() => {
  jest.useFakeTimers({ now: clock = Date.parse(NOW), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance'] });
  resetEnv();
  seedMoney();
  inflight = 0; maxInflight = 0; times = []; statements = {}; statementAnswer = () => null;
  dues = { ids: ['c3', 'c1', 'c2'], calls: 0 };
});
afterEach(async () => {
  stopPass?.();
  stopPass = null;
  await eraseEverything();
  jest.useRealTimers();
});

const ok = (data: unknown) => ({ data, error: null });
async function until(done: () => boolean | Promise<boolean>, ms = 9000) {
  const started = performance.now();
  while (!(await done())) {
    if (performance.now() - started > ms) throw new Error('timed out waiting');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** A phone with the first load done and the server answering dues and statements as the case's variables say. */
async function ready(role: Role = 'admin', opts: { capability?: boolean } = {}): Promise<Warehouse> {
  const w = await bootWarehouse({ role, capability: opts.capability });
  w.answers.get_customer_dues = () => { dues.calls += 1; return ok(duesBody({ asOf: iso(), today: businessDate(clock), ids: dues.ids })); };
  w.answers.get_customer_dues_for = () => LOST;
  w.answers.get_customer_statement = args => {
    const id = String(args.p_customer_id);
    statements[id] = (statements[id] ?? 0) + 1;
    return statementAnswer(id) ?? ok(statementBody(id, { asOf: iso(), today: businessDate(clock), invoiceTotal: 1000 + statements[id] }));
  };
  // Every read takes a moment, so two requests at once would show; the time of each start is written down.
  const inner = env.feed.rpc;
  env.feed.rpc = async (name, args = {}) => {
    if (name === 'get_customer_dues' || name === 'get_customer_statement' || name === 'get_customer_dues_for') {
      // The wrapped server answers a read at once and does not look at held calls, so a held money read waits here.
      for (const gate of env.feed.gates) {
        if (gate.matches({ name, args })) { gate.onHit(); await gate.wait; }
      }
      times.push({ name, id: args.p_customer_id as string | undefined, at: performance.now() });
      inflight += 1; maxInflight = Math.max(maxInflight, inflight);
      await pause(30);
      inflight -= 1;
    }
    return inner(name, args);
  };
  await loadCopy(w);
  return w;
}
const pass = () => require('@/features/phone-copy/money/moneyRefresh') as { startMoneyRefresh: () => void; stopMoneyRefresh: () => void };
function startPass() {
  const m = pass();
  m.startMoneyRefresh();
  stopPass = () => m.stopMoneyRefresh();
}
const statementIds = (w: Warehouse) => w.serverCalls.filter(c => c.name === 'get_customer_statement').map(c => (c.args as { p_customer_id: string }).p_customer_id);
const duesCalls = (w: Warehouse) => w.serverCalls.filter(c => c.name === 'get_customer_dues').length;
async function runEnd(w: Warehouse, changes: unknown[] = []) {
  queueRun(changes);
  expect(await w.phone.engine.syncNow('interval')).toBe('done');
}
async function db(w: Warehouse) { return w.phone.copyDb.openCopy((await w.phone.scope())!); }
async function money(w: Warehouse) {
  return (await (await db(w)).all<{ kind: string; key: string; body: string; as_of: string }>('SELECT kind, key, body, as_of FROM money_answers ORDER BY kind, key'));
}
async function stale(w: Warehouse) {
  return (await (await db(w)).all<{ customer_id: string }>('SELECT customer_id FROM money_stale ORDER BY customer_id')).map(r => r.customer_id);
}
async function metaDuesStale(w: Warehouse) {
  const [row] = await (await db(w)).all<{ v: string }>("SELECT v FROM meta WHERE k = 'money_dues_stale'");
  return row?.v ?? null;
}
/** The first money load done: one dues answer and one statement per customer kept. */
async function firstMoneyLoad(w: Warehouse) {
  startPass();
  await runEnd(w);
  await until(async () => (await money(w)).length === 4);
  w.serverCalls.length = 0;
}

describe('T7: the first money load', () => {
  it('asks dues once, then each listed customer\'s statement once in the list\'s order, never dues_for', async () => {
    const w = await ready();
    startPass();
    await runEnd(w);
    await until(async () => (await money(w)).length === 4, 15000);
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_customer_dues', 'get_customer_statement', 'get_customer_statement', 'get_customer_statement']);
    expect(statementIds(w)).toEqual(['c3', 'c1', 'c2']);
    expect(w.serverCalls.some(c => c.name === 'get_customer_dues_for')).toBe(false);
    expect((await money(w)).map(r => `${r.kind}:${r.key}`)).toEqual(['dues:', 'statement:c1', 'statement:c2', 'statement:c3']);
  }, 25000);

  it('T1: what is kept is the server\'s answer, byte for byte', async () => {
    const w = await ready();
    startPass();
    await runEnd(w);
    await until(async () => (await money(w)).length === 4, 15000);
    const keptDues = JSON.parse((await money(w)).find(r => r.kind === 'dues')!.body);
    expect(keptDues).toEqual(duesBody({ asOf: iso(), today: businessDate(clock), ids: dues.ids }));
    expect(keptDues.totals.invoices_amount).toBe(3007); // the server's own sum; the rows add up to 3,003
  }, 25000);
});

describe('T5: the pass', () => {
  it('sends one request at a time, at least 2,000 ms between starts', async () => {
    const w = await ready();
    startPass();
    await runEnd(w);
    await until(async () => (await money(w)).length === 4, 15000);
    expect(maxInflight).toBe(1);
    const statementStarts = times.filter(t => t.name === 'get_customer_statement').map(t => t.at);
    expect(statementStarts).toHaveLength(3);
    for (let n = 1; n < statementStarts.length; n += 1) expect(statementStarts[n] - statementStarts[n - 1]).toBeGreaterThanOrEqual(1950);
  }, 20000);

  it('does not start without a sync run end, and does not repeat on a timer of its own', async () => {
    const w = await ready();
    startPass();
    await pause(2500);
    expect(w.serverCalls).toEqual([]);
    await runEnd(w);
    await until(async () => (await money(w)).length === 4, 15000);
    w.serverCalls.length = 0;
    await pause(2600);
    expect(w.serverCalls).toEqual([]);
  }, 25000);

  it('does not refetch dues inside 10 minutes, and does at 10 minutes once changes have arrived', async () => {
    const w = await ready();
    await firstMoneyLoad(w);
    setClock(clock + 5 * MIN);
    await runEnd(w, [mark('c1')]);
    await until(async () => (await stale(w)).length === 0 && statementIds(w).length === 1);
    expect(statementIds(w)).toEqual(['c1']);
    expect(duesCalls(w)).toBe(0);
    expect(await metaDuesStale(w)).toBe('1');
    setClock(clock + 6 * MIN); // 11 minutes since dues were computed
    await runEnd(w);
    await until(() => duesCalls(w) === 1);
    await until(async () => (await metaDuesStale(w)) === null);
    expect(duesCalls(w)).toBe(1);
  }, 30000);

  it('stops when the app goes to the background', async () => {
    const w = await ready();
    startPass();
    const gate = env.feed.hold(call => call.name === 'get_customer_statement');
    await runEnd(w);
    await gate.opened;
    await setForeground('background');
    gate.release();
    await pause(2600);
    expect(statementIds(w)).toHaveLength(1);
    await setForeground('active');
  }, 20000);

  it('stops when the phone goes offline', async () => {
    const w = await ready();
    startPass();
    const gate = env.feed.hold(call => call.name === 'get_customer_statement');
    await runEnd(w);
    await gate.opened;
    await goOffline(w);
    gate.release();
    await pause(2600);
    expect(statementIds(w)).toHaveLength(1);
  }, 20000);

  it('stops when a new sync run begins, and takes the rest up at that run\'s end', async () => {
    const w = await ready();
    startPass();
    const first = env.feed.hold(call => call.name === 'get_customer_statement');
    await runEnd(w);
    await first.opened;
    const changes = env.feed.hold(call => call.name === 'get_sync_changes');
    queueRun([]);
    const second = w.phone.engine.syncNow('interval');
    await changes.opened;
    first.release();
    await pause(2600);
    expect(statementIds(w)).toHaveLength(1); // nothing sent while the new run is going
    changes.release();
    expect(await second).toBe('done');
    await until(async () => (await money(w)).filter(r => r.kind === 'statement').length === 3, 15000);
    expect(new Set(statementIds(w))).toEqual(new Set(['c3', 'c1', 'c2']));
  }, 30000);

  it('three failures in a row end the pass until the next run end', async () => {
    dues.ids = ['c1', 'c2', 'c3', 'c4', 'c5'];
    NAMES.c4 = 'Dhruv Fictional'; NAMES.c5 = 'Esha Fictional';
    statementAnswer = () => LOST;
    const w = await ready();
    startPass();
    await runEnd(w);
    await until(() => statementIds(w).length === 3, 15000);
    await pause(2600);
    expect(statementIds(w)).toHaveLength(3);
    statementAnswer = () => null;
    await runEnd(w);
    await until(async () => (await money(w)).filter(r => r.kind === 'statement').length === 5, 20000);
    delete NAMES.c4; delete NAMES.c5;
  }, 40000);
});

describe('T4: marks', () => {
  it('a mark refetches that customer\'s statement alone and clears the mark; the answer is replaced', async () => {
    const w = await ready();
    await firstMoneyLoad(w);
    await runEnd(w, [mark('c1')]);
    await until(async () => statementIds(w).length === 1 && (await stale(w)).length === 0);
    expect(statementIds(w)).toEqual(['c1']);
    const kept = JSON.parse((await money(w)).find(r => r.key === 'c1')!.body);
    expect(kept.invoices[0].total).toBe(1002);
  });

  it('a mark for "all" becomes one request per wanted customer', async () => {
    const w = await ready();
    await firstMoneyLoad(w);
    await runEnd(w, [mark('all')]);
    await until(async () => statementIds(w).length === 3, 15000);
    expect([...statementIds(w)].sort()).toEqual(['c1', 'c2', 'c3']);
    expect(await stale(w)).toEqual([]);
  }, 20000);

  it('a mark for a customer outside the wanted set is deleted and asks nothing', async () => {
    const w = await ready();
    await firstMoneyLoad(w);
    await runEnd(w, [mark('c9')]);
    await until(async () => (await stale(w)).length === 0);
    await pause(300);
    expect(statementIds(w)).toEqual([]);
  });

  it('the first run of a new day fetches dues again, and no statement', async () => {
    const w = await ready();
    await firstMoneyLoad(w);
    setClock(Date.parse('2026-11-28T04:00:00.000Z'));
    await runEnd(w);
    await until(() => duesCalls(w) === 1);
    await pause(2600);
    expect(statementIds(w)).toEqual([]);
    await runEnd(w);
    await pause(500);
    expect(duesCalls(w)).toBe(1); // the day's second run asks nothing more
  }, 20000);
});

describe('T6: a mark that arrives while its request is out', () => {
  it('is not lost: the customer is asked again and the newer answer is the one kept', async () => {
    const w = await ready();
    await firstMoneyLoad(w);
    const gate = env.feed.hold(call => call.name === 'get_customer_statement' && call.args.p_customer_id === 'c1');
    await runEnd(w, [mark('c1')]);
    await gate.opened;
    await runEnd(w, [mark('c1')]); // the server changed c1 again while the first answer is being fetched
    gate.release();
    await until(async () => statementIds(w).length === 2 && (await stale(w)).length === 0, 15000);
    expect(statementIds(w)).toEqual(['c1', 'c1']);
    expect(JSON.parse((await money(w)).find(r => r.key === 'c1')!.body).invoices[0].total).toBe(1003);
  }, 25000);
});

describe('T9: refusals and failures', () => {
  it('an access refusal erases every kept answer and mark', async () => {
    const w = await ready();
    await firstMoneyLoad(w);
    statementAnswer = id => (id === 'c2' ? ok({ success: false, error_code: '42501', error: 'Access denied' }) : null);
    await runEnd(w, [mark('c1'), mark('c2'), mark('c3')]);
    await until(async () => (await money(w)).length === 0);
    expect(await stale(w)).toEqual([]);
  }, 20000);

  it('an access refusal the server RAISES (the client delivers error.code 42501, no body) erases every kept answer and mark', async () => {
    const w = await ready();
    await firstMoneyLoad(w);
    statementAnswer = id => (id === 'c2' ? { data: null, error: { code: '42501', message: 'Access denied', details: null, hint: null } } : null);
    await runEnd(w, [mark('c1'), mark('c2'), mark('c3')]);
    await until(async () => (await money(w)).length === 0);
    expect(await stale(w)).toEqual([]);
  }, 20000);

  it('"Customer not found" removes that statement and its mark only', async () => {
    const w = await ready();
    await firstMoneyLoad(w);
    statementAnswer = id => (id === 'c2' ? ok({ success: false, error: 'Customer not found' }) : null);
    await runEnd(w, [mark('c2')]);
    await until(async () => (await money(w)).every(r => r.key !== 'c2'));
    expect((await money(w)).map(r => `${r.kind}:${r.key}`)).toEqual(['dues:', 'statement:c1', 'statement:c3']);
    expect(await stale(w)).toEqual([]);
  });

  it('a timeout keeps the kept answer and puts the mark back', async () => {
    const w = await ready();
    await firstMoneyLoad(w);
    const before = (await money(w)).find(r => r.key === 'c1')!.body;
    statementAnswer = () => LOST;
    await runEnd(w, [mark('c1')]);
    await until(() => statementIds(w).length >= 1);
    await until(async () => (await stale(w)).includes('c1'));
    expect((await money(w)).find(r => r.key === 'c1')!.body).toBe(before);
  });
});

describe('T15: who keeps what', () => {
  it.each(['staff', 'customer'] as const)('%s: no dues or statement row and no request of the pass', async role => {
    const w = await ready(role);
    startPass();
    await runEnd(w, [mark('c1')]);
    await pause(2600);
    expect(w.serverCalls.filter(c => c.name.startsWith('get_customer_'))).toEqual([]);
    expect(await money(w)).toEqual([]);
  }, 20000);

  it('a supervisor is kept like an administrator', async () => {
    const w = await ready('supervisor');
    startPass();
    await runEnd(w);
    await until(async () => (await money(w)).length === 4, 15000);
  }, 20000);
});

describe('T16: off', () => {
  it('feed format below the money step: nothing is asked and nothing kept', async () => {
    env.feed.format = 3; // every build reads 3; the money step is 6 (the older server writes the narrower marks)
    const w = await ready();
    startPass();
    await runEnd(w, [mark('c1')]);
    await pause(2600);
    expect(w.serverCalls).toEqual([]);
    expect(await money(w)).toEqual([]);
  }, 20000);

  it('the feature off (facility without the sync capability): nothing is asked and nothing kept', async () => {
    const w = await bootWarehouse({ role: 'admin', capability: false });
    startPass();
    await pause(2600);
    expect(w.serverCalls).toEqual([]);
  }, 20000);

  it('the copy is on the money step: the feed says 6 or more', async () => {
    const w = await ready();
    expect(w.phone.syncStore.getSyncSnapshot().format).toBeGreaterThanOrEqual(6);
  });
});
