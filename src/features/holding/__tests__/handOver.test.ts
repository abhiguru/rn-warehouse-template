/**
 * WH-304 (contract product/tech/app-offline-holding-list.md sections 2.2, 3, 7, 8 cases K1-K12, 11.1-11.3; Product PQ1,
 * PQ2, PQ7, PQ10; Design offline-capture.md 7.9 DQ8, 7.11): unsent-work schema step 2 (`items.held_id`), `held` state,
 * hand-over of refused items and their followers via `hold_items`, PQ1 count/clock/account-action lifecycle, PQ2 waiting
 * photos, transient retry, permanent hand-over refusal + PQ10 Delete, leaving the phone after sync, overlay clearing, and
 * administrator "Move to the holding list" (`p_recorder`).
 *
 * Real: src/features/unsent (schema, db, rows, queue, store, sendEngine, workGate, unsentList, lotChangeKind),
 * src/features/phone-copy/unsentOverlay, and WH-304's `src/features/holding/handOver`.
 * Faked at the edge: server RPCs, expo-sqlite (Node SQLite), files, NetInfo, AppState, fake timers.
 *
 * ===== AGREE WITH DEVELOPMENT (ASSUMED) =====
 *  - `src/features/holding/handOver.ts` exports:
 *      - `holdingOn(): boolean` (`hasCapability('sync') && backendHasFeature('holdingList')`, contract section 3).
 *      - `moveOtherPersonToHolding(subject: string): Promise<{ moved: number; remaining: number; failed?: string }>`
 *        (administrator move of another person's rows in `saved`/`sending`/`refused` of this facility via `hold_items`
 *        with `p_recorder = subject`; rejects or returns `{ moved: 0, ... }` for non-admins or offline).
 *  - `unsentSchema.ts` bumps `UNSENT_SCHEMA_VERSION` to at least 2 and adds `held_id TEXT` (and any hand-over-failed flag
 *    column, e.g. `handover_failed` or JSON field in `last_error`) to `items`, migrating schema-1 databases in place.
 *  - `sendEngine.ts` keeps a server refusal in `items.result` as JSON `{ code, answer }` (as WH-161 does; contract section 12),
 *    while `last_error` keeps the reason text, and calls hand-over after the record lane (and at the start of a pass)
 *    whenever `holdingOn()` is true.
 *  - `unsentList.ts` maps:
 *      - a `refused` item with `holdingOn()` true and no failed hand-over yet -> `section: 'unsent'`, `tag: 'sending'`,
 *        reason text matching `offline.holding.handingOver`;
 *      - a `refused` item after a failed hand-over attempt (PQ10, Design 7.11) -> `section: 'unsent'`,
 *        `tag: 'notPassedOn'`, reason text matching `offline.holding.notPassedOnText` (dependants keep `dependsOnRefused`);
 *      - a `held` item -> `section: 'held'`, `tag: 'held'`.
 *  - `deleteItem(id)` deletes a `refused` (unhandable / PQ10) item and its dependants, and refuses/no-ops on a row whose
 *    `state === 'held'` (already on the server; Design 7.4 "No swipe Delete on a row the server holds").
 * ============================================
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { fakeDatabaseNames } from '@/tests/phoneCopy/fakeExpoSqlite';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { addPhoto, GATEWAY_TIMEOUT, NO_NETWORK, rawRows, rawRun, rpcKind, server, type RpcAnswer } from '@/tests/unsent/unsentPhone';
import {
  bootHolding,
  rpcCalls,
  sampleLotChangeBody,
  serverRefusal,
  type HoldingPhone,
} from '@/tests/unsent/holdingPhone';

const HOUR = 3_600_000;
const SAVE = 'save_holding_test';

const sampleGrnBody = (localId = '5f304000-0000-4000-8000-0000000000d1', qty = 10) => ({
  v: 1,
  localId,
  lotLocalIds: [`${localId}-l1`],
  args: {
    p_gr_no: '',
    p_issue_number: true,
    p_date: '2026-11-27',
    p_customer_id: 'c1',
    p_items: [{ item_id: 'i1', qty }],
  },
  show: { customerName: 'asha Traders', lines: [{ itemName: 'Beans', packaging: 'Bag' }] },
});

const heldGrnFeedRow = (id: string) => ({
  id,
  row: { id, kind: 'newGrn', state: 'held', needs_decision: true, lines: null },
});

interface HandOverModule {
  holdingOn(): boolean;
  moveOtherPersonToHolding(subject: string): Promise<{ moved: number; remaining: number; failed?: string }>;
}
const handOver = (): HandOverModule => require('@/features/holding/handOver');
const overlay = () =>
  (require('@/features/phone-copy/unsentOverlay') as typeof import('@/features/phone-copy/unsentOverlay')).getUnsentOverlay();
const loadList = () =>
  (require('@/features/unsent/unsentList') as typeof import('@/features/unsent/unsentList')).loadUnsentList();

type ItemDbRow = {
  id: string;
  seq: number;
  scope: string;
  kind: string;
  request_key: string;
  state: string;
  depends_on: string | null;
  last_error: string | null;
  result: string | null;
  held_id?: string | null;
};

const allItemRows = () => rawRows<ItemDbRow>('items', 'ORDER BY seq');

const holdOk = (prefix = 'held-uuid'): ((args: Record<string, any>) => RpcAnswer) => args => {
  const list = (args.p_items as { request_key: string }[]) ?? [];
  return {
    data: {
      success: true,
      held: list.map((item, idx) => ({ request_key: item.request_key, id: `${prefix}-${idx + 1}`, state: 'held' })),
    },
    error: null,
  };
};

async function startStaff(options: Parameters<typeof bootHolding>[0] = {}): Promise<HoldingPhone> {
  const phone = await bootHolding({ role: 'staff', ...options });
  phone.kinds.registerSendKind('newGrn', rpcKind(phone, SAVE));
  phone.kinds.registerSendKind('testFollow', rpcKind(phone, 'save_follow_test'));
  return phone;
}

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

describe('K8: unsent-work schema step 2 (items.held_id) migrates in place', () => {
  it('bumps UNSENT_SCHEMA_VERSION to at least 2 and includes held_id on newly created items', async () => {
    const schema = require('@/features/unsent/unsentSchema') as { UNSENT_SCHEMA_VERSION: number };
    expect(schema.UNSENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
    const phone = await startStaff();
    await phone.offline();
    await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody(), what: 'New GRN', customer: 'asha Traders' });
    const [row] = await allItemRows();
    expect('held_id' in row).toBe(true);
    expect(row.held_id).toBeNull();
  });

  it('migrates an existing schema-1 unsent database in place without losing GRN rows', async () => {
    // Seed a schema-1 database directly before the app opens it.
    const sqlite = require('expo-sqlite') as {
      openDatabaseAsync(name: string): Promise<{ execAsync(sql: string): Promise<void>; runAsync(sql: string, p?: unknown[]): Promise<unknown> }>;
    };
    const phone0 = await bootHolding({ role: 'staff' });
    const scope = (await phone0.phone.scope())!;
    const dbName = fakeDatabaseNames().find(n => n.includes('unsent-work'))!;
    const db = await sqlite.openDatabaseAsync(dbName);
    await db.execAsync('DROP TABLE IF EXISTS items;');
    await db.execAsync(`CREATE TABLE items (
      id TEXT PRIMARY KEY, seq INTEGER NOT NULL UNIQUE, scope TEXT NOT NULL, recorder_name TEXT NOT NULL,
      kind TEXT NOT NULL, request_key TEXT NOT NULL UNIQUE, body TEXT NOT NULL, depends_on TEXT,
      target_ref TEXT, what TEXT NOT NULL, customer TEXT, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      first_sent_at INTEGER, last_sent_at INTEGER, last_error TEXT, recorded_at INTEGER NOT NULL,
      recorded_tick INTEGER NOT NULL, result TEXT, sent_day TEXT
    );`);
    await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '1')");
    await db.runAsync(
      `INSERT INTO items (id, seq, scope, recorder_name, kind, request_key, body, what, customer, state, attempts, recorded_at, recorded_tick)
       VALUES ('legacy-1', 1, ?, 'Ravi Fictional', 'newGrn', 'rk-legacy-1', '{}', 'New GRN', 'asha Traders', 'refused', 1, ?, ?)`,
      [scope, Date.now(), Date.now()],
    );

    const reopened = await bootHolding({ role: 'staff' });
    await reopened.offline();
    const rows = await allItemRows();
    expect(rows.map(r => r.id)).toEqual(['legacy-1']);
    expect('held_id' in rows[0]).toBe(true);
    expect(rows[0].held_id).toBeNull();
    const version = (await rawRows<{ key: string; value: string }>('meta')).find(m => m.key === 'schema_version')?.value;
    expect(Number(version)).toBeGreaterThanOrEqual(2);
  });
});

describe('K1: refused item and followers handed over together in one hold_items call', () => {
  it('keeps the refusal in result as { code, answer }, calls hold_items in seq order with follows_key, and transitions both to held with held_id', async () => {
    const phone = await startStaff();
    await phone.offline();
    const root = await phone.queue.enqueue({
      kind: 'newGrn',
      body: sampleGrnBody('5f304000-0000-4000-8000-000000000001', 25),
      what: 'New GRN',
      customer: 'asha Traders',
    });
    const follower = await phone.queue.enqueue({
      kind: 'testFollow',
      body: { note: 'follows grn' },
      dependsOn: root.id,
      what: 'Follow-up change',
      customer: 'asha Traders',
    });

    const lines = [{ item_name: 'Beans' }];
    server.answers[SAVE] = () => serverRefusal('RATE_MISSING', 'Missing rate', { lines });
    server.answers.hold_items = holdOk('srv-held');

    await phone.online();
    await phone.pass();

    const calls = rpcCalls('hold_items');
    expect(calls).toHaveLength(1);
    const itemsArg = calls[0].args.p_items as Record<string, any>[];
    expect(itemsArg).toHaveLength(2);
    expect(itemsArg[0]).toMatchObject({
      request_key: root.requestKey,
      kind: 'newGrn',
      refusal: { code: 'RATE_MISSING', data: { lines } },
    });
    expect(itemsArg[0].follows_key).toBeUndefined();
    expect(itemsArg[1]).toMatchObject({
      request_key: follower.requestKey,
      kind: 'testFollow',
      follows_key: root.requestKey,
    });
    expect(itemsArg[0].seq).toBeLessThan(itemsArg[1].seq);

    const rows = await allItemRows();
    expect(rows.map(r => [r.state, r.held_id])).toEqual([
      ['held', 'srv-held-1'],
      ['held', 'srv-held-2'],
    ]);
    const refusal = JSON.parse(rows[0].result ?? '{}') as Record<string, unknown>;
    expect(refusal).toMatchObject({ code: 'RATE_MISSING', answer: { lines } });
  });
});

describe('K2, K3 (PQ1): refused + dependants stay counted/clocked/blocking until held, then free the phone', () => {
  it('transient hand-over failure keeps both refused and counted, blocks sign-out and 2-hour clock, and retries the identical hold_items call', async () => {
    const phone = await startStaff();
    await phone.offline();
    const root = await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody('5f304000-0000-4000-8000-000000000002', 25), what: 'New GRN', customer: 'asha Traders' });
    const follower = await phone.queue.enqueue({ kind: 'testFollow', body: { step: 2 }, dependsOn: root.id, what: 'Follow-up', customer: 'asha Traders' });

    server.answers[SAVE] = () => serverRefusal('RATE_MISSING', 'Missing rate', { lines: [{ item_name: 'Beans' }] });
    server.answers.hold_items = () => GATEWAY_TIMEOUT;

    await phone.online();
    await phone.pass();

    // Still refused, not held yet: PQ1 says both count, start the clock, and refuse account actions.
    const rowsBefore = await allItemRows();
    expect(rowsBefore.map(r => [r.state, r.held_id])).toEqual([
      ['refused', null],
      ['refused', null],
    ]);
    expect(phone.store.getUnsentSummary().count).toBe(2);
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: false, count: 2 });

    await jest.advanceTimersByTimeAsync(2 * HOUR);
    expect(phone.store.getUnsentSummary().limitReached).toBe(true);
    expect(phone.gate.canStartWork().ok).toBe(false);

    // Server recovers: next pass sends the identical hold_items payload and frees the phone.
    const firstPayload = rpcCalls('hold_items')[0].args.p_items;
    server.answers.hold_items = holdOk('srv-held');
    await phone.pass();

    const calls = rpcCalls('hold_items');
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[calls.length - 1].args.p_items).toEqual(firstPayload);

    const rowsAfter = await allItemRows();
    expect(rowsAfter.map(r => [r.state, r.held_id])).toEqual([
      ['held', 'srv-held-1'],
      ['held', 'srv-held-2'],
    ]);
    expect(phone.store.getUnsentSummary().count).toBe(0);
    expect(phone.store.getUnsentSummary().limitReached).toBe(false);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: true });
  });
});

describe('K4 (PQ2): photos of a held item still to upload', () => {
  it('counts waiting photos and refuses sign-out while files remain unuploaded, but never starts the 2-hour clock', async () => {
    const phone = await startStaff();
    await phone.offline();
    const photoUri = addPhoto('held-doc.jpg');
    const root = await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody('5f304000-0000-4000-8000-000000000003', 25), what: 'New GRN', customer: 'asha Traders' });
    await phone.queue.enqueue({
      kind: 'photos',
      body: { doc: 'grn' },
      dependsOn: root.id,
      what: 'Photos',
      customer: 'asha Traders',
      photos: [{ file: photoUri, role: 'header' }],
    });

    server.answers[SAVE] = () => serverRefusal('RATE_MISSING', 'Missing rate', { lines: [{ item_name: 'Beans' }] });
    server.answers.hold_items = holdOk('srv-held');
    // Photo upload RPCs remain unreachable (NO_NETWORK), so the photo file stays unuploaded.
    await phone.online();
    await phone.pass();

    // The GRN itself is held (leaves the clock), while the unuploaded photos item stays waiting (PQ2).
    await jest.advanceTimersByTimeAsync(3 * HOUR);
    const summary = phone.store.getUnsentSummary();
    expect(summary.count).toBe(1);
    expect(summary.limitReached).toBe(false);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: false, count: 1 });
  });
});

describe('K5, K7: when no hand-over is ever attempted', () => {
  it.each([
    ['transient', NO_NETWORK],
    ['lost', GATEWAY_TIMEOUT],
    ['stop (401)', { data: null, error: { message: 'Session changed', status: 401 } }],
    ['SERVER_TOO_OLD', serverRefusal('SERVER_TOO_OLD', 'Server too old')],
  ] as [string, RpcAnswer][])('does not call hold_items on %s outcome', async (_label, answer) => {
    const phone = await startStaff();
    await phone.offline();
    await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody(), what: 'New GRN', customer: 'asha Traders' });
    server.answers[SAVE] = () => answer;
    server.answers.hold_items = holdOk();
    await phone.online();
    await phone.pass(10_000);
    expect(rpcCalls('hold_items')).toHaveLength(0);
  });

  it('K7: when holdingOn() is false (older backend without holdingList), makes no hold_items call and keeps refused rows counted', async () => {
    const phone = await startStaff({ holdingFeature: false });
    expect(handOver().holdingOn()).toBe(false);
    await phone.offline();
    await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody(), what: 'New GRN', customer: 'asha Traders' });
    server.answers[SAVE] = () => serverRefusal('RATE_MISSING', 'Missing rate');
    server.answers.hold_items = holdOk();
    await phone.online();
    await phone.pass();
    expect(rpcCalls('hold_items')).toHaveLength(0);
    expect((await allItemRows())[0].state).toBe('refused');
    expect(phone.store.getUnsentSummary().count).toBe(1);
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: false, count: 1 });
    // C301's Held look is kept with the feature off (section 3 "Its look while not yet held", section 7).
    const [row] = (await loadList()).rows;
    expect(row).toMatchObject({ section: 'held', tag: 'held' });
  });
});

describe('K11 (PQ10): every way the hand-over itself can be refused', () => {
  it.each([
    ['the gate refuses it (42501)', { data: null, error: { code: '42501', message: 'permission denied for function hold_items' } }],
    ['the body is too large', serverRefusal('HELD_BODY_TOO_LARGE', 'Body too large', { request_key: 'any' })],
    ['the server is too old (no hold_items)', serverRefusal('SERVER_TOO_OLD', 'Server too old')],
  ] as [string, RpcAnswer][])('%s: the rows stay refused with no held id and stay counted', async (_label, answer) => {
    const phone = await startStaff();
    await phone.offline();
    const root = await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody(), what: 'New GRN', customer: 'asha Traders' });
    await phone.queue.enqueue({ kind: 'testFollow', body: { step: 2 }, dependsOn: root.id, what: 'Follow-up', customer: 'asha Traders' });
    server.answers[SAVE] = () => serverRefusal('RATE_MISSING', 'Missing rate');
    server.answers.hold_items = () => answer;

    await phone.online();
    await phone.pass();

    expect(rpcCalls('hold_items')).toHaveLength(1);
    expect((await allItemRows()).map(r => [r.state, r.held_id])).toEqual([
      ['refused', null],
      ['refused', null],
    ]);
    expect(phone.store.getUnsentSummary().count).toBe(2);
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: false, count: 2 });
  });
});

describe('K11, K12, PQ10: permanent hand-over refusal, list states, and person Delete', () => {
  it('K12: before hand-over finishes, a refused item is in "Not sent yet" tagged Sending with handingOver; once held, it is in Held', async () => {
    const phone = await startStaff();
    await phone.offline();
    const item = await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody(), what: 'New GRN', customer: 'asha Traders' });

    // Hold the hand-over RPC open so we can inspect the in-flight state between refusal and held.
    let releaseHold!: (a: RpcAnswer) => void;
    const holdPending = new Promise<RpcAnswer>(resolve => { releaseHold = resolve; });
    server.answers[SAVE] = () => serverRefusal('RATE_MISSING', 'Missing rate');
    server.answers.hold_items = () => holdPending;

    await phone.online();
    await jest.advanceTimersByTimeAsync(1_000);

    const midList = await loadList();
    const midRow = midList.rows.find(r => r.id === item.id);
    expect(midRow).toMatchObject({ section: 'unsent', tag: 'sending' });
    expect(midRow?.reason).toContain('Passing it to a supervisor');

    releaseHold(holdOk('srv-held')({ p_items: [{ request_key: item.requestKey }] }));
    await jest.advanceTimersByTimeAsync(1_000);

    const afterList = await loadList();
    const heldRow = afterList.rows.find(r => r.id === item.id);
    expect(heldRow).toMatchObject({ section: 'held', tag: 'held' });
  });

  it('K11 & PQ10: refused hand-over (42501 / HELD_BODY_TOO_LARGE) keeps rows refused & counted, tags "Not passed on", and Delete frees the phone', async () => {
    const phone = await startStaff();
    await phone.offline();
    const root = await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody(), what: 'New GRN', customer: 'asha Traders' });
    const follower = await phone.queue.enqueue({ kind: 'testFollow', body: { step: 2 }, dependsOn: root.id, what: 'Follow-up', customer: 'asha Traders' });

    server.answers[SAVE] = () => serverRefusal('RATE_MISSING', 'Missing rate');
    server.answers.hold_items = () => serverRefusal('HELD_BODY_TOO_LARGE', 'Body too large');

    await phone.online();
    await phone.pass();

    expect((await allItemRows()).map(r => [r.state, r.held_id])).toEqual([
      ['refused', null],
      ['refused', null],
    ]);
    expect(phone.store.getUnsentSummary().count).toBe(2);
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: false, count: 2 });

    // Design 7.11: row shows "Not passed on" (not endless "Sending…"), dependant shows same tag with dependsOnRefused footnote.
    const list = await loadList();
    const rootRow = list.rows.find(r => r.id === root.id);
    const followerRow = list.rows.find(r => r.id === follower.id);
    expect(rootRow).toMatchObject({ section: 'unsent', tag: 'notPassedOn' });
    expect(rootRow?.reason).toContain("couldn't be passed to a supervisor");
    expect(followerRow).toMatchObject({ section: 'unsent', tag: 'notPassedOn' });

    // PQ10: the person's own Delete removes the unhandable refused item (and its dependant) and frees the phone.
    await phone.queue.deleteItem(root.id);
    expect(await allItemRows()).toHaveLength(0);
    expect(phone.store.getUnsentSummary().count).toBe(0);
    expect(phone.gate.accountActionAllowed()).toEqual({ ok: true });
  });

  it('Design 7.4: deleteItem does not delete a row that the server already holds (state = held)', async () => {
    const phone = await startStaff();
    await phone.offline();
    const item = await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody(), what: 'New GRN', customer: 'asha Traders' });
    server.answers[SAVE] = () => serverRefusal('RATE_MISSING', 'Missing rate');
    server.answers.hold_items = holdOk('srv-held');
    await phone.online();
    await phone.pass();
    expect((await allItemRows())[0].state).toBe('held');

    await phone.queue.deleteItem(item.id).catch(() => undefined);
    expect((await allItemRows()).map(r => r.id)).toEqual([item.id]);
  });
});

describe('K6, K10: leaving the phone after sync & overlay clearing', () => {
  it('K6: a held row stays in the unsent DB until a sync completes whose copy holds its held_items row', async () => {
    const phone = await startStaff({ withCopy: true });
    await phone.offline();
    await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody(), what: 'New GRN', customer: 'asha Traders' });

    server.answers[SAVE] = () => serverRefusal('RATE_MISSING', 'Missing rate');
    server.answers.hold_items = holdOk('held-k6');

    await phone.online();
    await phone.pass();
    expect((await allItemRows()).map(r => [r.state, r.held_id])).toEqual([['held', 'held-k6-1']]);

    // Sync runs, but server feed does NOT have held-k6-1 yet -> local row must stay.
    env.feed.changeAnswers.push({ position: '1048577', as_of: '2026-11-27T09:05:00+00:00', more: false, reload_all: null, reload: [], changes: [] });
    await phone.sync();
    expect((await allItemRows()).map(r => r.held_id)).toEqual(['held-k6-1']);

    // Next sync delivers held-k6-1 in held_items -> local held row is cleaned up.
    env.feed.changeAnswers.push({
      position: '1048578',
      as_of: '2026-11-27T09:06:00+00:00',
      more: false,
      reload_all: null,
      reload: [],
      changes: [{ e: 'held_items', id: 'held-k6-1', op: 'upsert', v: '0000000000000001', row: heldGrnFeedRow('held-k6-1').row }],
    });
    await phone.sync();
    expect(await allItemRows()).toHaveLength(0);
  });

  it('K10 (PQ8): a refused or held lotChange contributes no field value and no unsent marker to the overlay', async () => {
    const phone = await bootHolding({ role: 'staff', withCopy: true });
    await phone.offline();
    await phone.queue.enqueue({
      kind: 'lotChange',
      body: sampleLotChangeBody('l06', 'g-B1', 'D-4', 'C-2'),
      what: 'GRN B1: Rack changed',
      customer: 'asha Traders',
      targetRef: { grnId: 'g-B1', lotIds: ['l06'] },
    });
    // While saved, the overlay shows the new rack.
    expect(overlay().lot('l06')).toMatchObject({ rack: 'C-2' });
    expect(overlay().marker('lot', 'l06')).toBe('notSent');

    // Server refuses and holds it -> overlay must stop overriding the lot's value (server's value shows).
    server.answers.set_lot_rack_and_mark = () => serverRefusal('LOT_NOT_FOUND', 'Lot deleted');
    server.answers.hold_items = holdOk('held-lc');
    await phone.online();
    await phone.pass();

    expect((await allItemRows())[0].state).toBe('held');
    expect(overlay().lot('l06')).toBeNull();
    expect(overlay().marker('lot', 'l06')).toBeNull();
  });
});

describe('K9 (PQ7): administrator "Move to the holding list" (p_recorder)', () => {
  async function seedOtherPersonItems(otherSubject: string) {
    // Staff signs in offline and saves 2 chained items, then admin signs in on the same phone.
    env.subject = otherSubject;
    const staffPhone = await startStaff();
    await staffPhone.offline();
    const first = await staffPhone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody('5f304000-0000-4000-8000-000000000005', 5), what: 'New GRN', customer: 'asha Traders' });
    const second = await staffPhone.queue.enqueue({ kind: 'testFollow', body: { step: 2 }, dependsOn: first.id, what: 'Follow-up', customer: 'asha Traders' });

    env.subject = 'admin-user-1';
    const adminPhone = await bootHolding({ role: 'admin', profileId: 'profile-admin-1', profileName: 'Neha Fictional' });
    return { adminPhone, first, second };
  }

  it('admin moves another person\'s unsent items in seq order with p_recorder and follows_key, deleting confirmed rows', async () => {
    const { adminPhone, first, second } = await seedOtherPersonItems('staff-user-7');
    expect(await adminPhone.queue.otherPeople()).toEqual([{ name: 'Ravi Fictional', count: 2 }]);

    server.answers.hold_items = holdOk('moved-held');
    await adminPhone.online();
    const outcome = await handOver().moveOtherPersonToHolding('staff-user-7');

    expect(outcome).toMatchObject({ moved: 2, remaining: 0 });
    const calls = rpcCalls('hold_items');
    expect(calls).toHaveLength(1);
    expect(calls[0].args.p_recorder).toBe('staff-user-7');
    const sent = calls[0].args.p_items as Record<string, any>[];
    expect(sent.map(i => i.request_key)).toEqual([first.requestKey, second.requestKey]);
    expect(sent[1].follows_key).toBe(first.requestKey);
    expect(await allItemRows()).toHaveLength(0);
    expect(await adminPhone.queue.otherPeople()).toEqual([]);
  });

  it('a failure leaves unconfirmed items untouched and preserves the strip count', async () => {
    const { adminPhone } = await seedOtherPersonItems('staff-user-8');
    server.answers.hold_items = () => NO_NETWORK;
    await adminPhone.online();

    const outcome = await handOver().moveOtherPersonToHolding('staff-user-8');
    expect(outcome.moved).toBe(0);
    expect(outcome.remaining).toBe(2);
    expect(await allItemRows()).toHaveLength(2);
    expect(await adminPhone.queue.otherPeople()).toEqual([{ name: 'Ravi Fictional', count: 2 }]);
  });

  it('is refused for a supervisor or staff account, and never calls hold_items while offline', async () => {
    const { adminPhone } = await seedOtherPersonItems('staff-user-9');
    server.answers.hold_items = holdOk('moved-held');

    // Offline admin -> no RPC.
    await adminPhone.offline();
    const offlineOutcome = await handOver().moveOtherPersonToHolding('staff-user-9');
    expect(offlineOutcome.moved).toBe(0);
    expect(rpcCalls('hold_items')).toHaveLength(0);

    // Online supervisor -> not an administrator -> no RPC.
    await adminPhone.online();
    adminPhone.setRole('supervisor', 'profile-sup-1', 'Meera Fictional');
    const supOutcome = await handOver().moveOtherPersonToHolding('staff-user-9');
    expect(supOutcome.moved).toBe(0);
    expect(rpcCalls('hold_items')).toHaveLength(0);
    expect(await allItemRows()).toHaveLength(2);
  });
});

describe('WH-303: an item whose form still waits for its save is not handed over yet', () => {
  const saveWait = () => require('@/features/unsent/saveWait') as typeof import('@/features/unsent/saveWait');
  const holdCalls = () => rpcCalls('hold_items').flatMap(call => (call.args.p_items as { request_key: string }[]).map(item => item.request_key));

  async function twoRefused() {
    const phone = await startStaff();
    await phone.offline();
    const waiting = await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody('5f304000-0000-4000-8000-000000000006', 25), what: 'New GRN', customer: 'asha Traders' });
    const other = await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody('5f304000-0000-4000-8000-000000000007', 26), what: 'New GRN', customer: 'asha Traders' });
    server.answers[SAVE] = () => serverRefusal('RATE_MISSING', 'Missing rate');
    server.answers.hold_items = holdOk('srv-held');
    return { phone, waiting, other };
  }

  it('leaves the item with an open wait alone, hands over the other item of the same pass, and the waiting one once the wait is closed', async () => {
    const { phone, waiting, other } = await twoRefused();
    const closeWait = saveWait().openSaveWait(waiting.id);
    await phone.online();
    await phone.pass(1_000);

    expect(holdCalls()).toEqual([other.requestKey]);
    expect((await allItemRows()).map(r => [r.id === waiting.id ? 'waiting' : 'other', r.state])).toEqual([['waiting', 'refused'], ['other', 'held']]);

    closeWait();
    await phone.pass(1_000);
    expect(holdCalls()).toEqual([other.requestKey, waiting.requestKey]);
    expect((await allItemRows()).every(r => r.state === 'held')).toBe(true);
  });

  it('closeSaveWait (the form has handled the outcome) lets the item go at once, with the wait still running', async () => {
    const { phone, waiting } = await twoRefused();
    saveWait().openSaveWait(waiting.id, saveWait().SAVE_WAIT_MS + saveWait().SAVE_WAIT_SAFETY_MS);
    await phone.online();
    await phone.pass(1_000);
    expect(holdCalls()).not.toContain(waiting.requestKey);

    saveWait().closeSaveWait(waiting.id);
    await phone.pass(1_000);
    expect(holdCalls()).toContain(waiting.requestKey);
  });

  it('a form that never closes the wait does not hold the item for ever: after the 8 s wait and the safety time it goes', async () => {
    const { phone, waiting } = await twoRefused();
    saveWait().openSaveWait(waiting.id, saveWait().SAVE_WAIT_MS + saveWait().SAVE_WAIT_SAFETY_MS);
    await phone.online();
    await phone.pass(1_000);
    await phone.pass(saveWait().SAVE_WAIT_MS); // the 8 s wait is over, the safety time is not
    expect(holdCalls()).not.toContain(waiting.requestKey);

    await phone.pass(saveWait().SAVE_WAIT_SAFETY_MS);
    expect(holdCalls()).toContain(waiting.requestKey);
    expect((await allItemRows()).find(r => r.id === waiting.id)?.state).toBe('held');
  });
});

describe('session end: what the hand-over remembered about the first person is gone', () => {
  const endSession = () =>
    (require('@/config/sessionScopedRegistry') as typeof import('@/config/sessionScopedRegistry')).runSessionScopedClears({ dispatch: () => undefined });

  it('a hand-over the server refused for good is asked again after the session registry runs, as for a person who has not met the refusal', async () => {
    const phone = await startStaff();
    await phone.offline();
    await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody(), what: 'New GRN', customer: 'asha Traders' });
    server.answers[SAVE] = () => serverRefusal('RATE_MISSING', 'Missing rate');
    server.answers.hold_items = () => serverRefusal('HELD_BODY_TOO_LARGE', 'Body too large');
    await phone.online();
    await phone.pass();
    expect(rpcCalls('hold_items')).toHaveLength(1);

    // Refused for good: another pass does not ask again.
    await phone.pass();
    expect(rpcCalls('hold_items')).toHaveLength(1);

    await endSession();
    await phone.pass();
    expect(rpcCalls('hold_items')).toHaveLength(2);
  });
});

describe('WH-410: the phone names itself with a held item', () => {
  const asSamsung = () => {
    const { Platform } = require('react-native') as typeof import('react-native');
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
    Object.defineProperty(Platform, 'constants', { configurable: true, get: () => ({ Manufacturer: 'samsung', Model: 'SM-A156E' }) });
  };
  async function handedOver(schemaHead: string, named: boolean) {
    const phone = await startStaff();
    const features = require('@/config/backendFeatures') as typeof import('@/config/backendFeatures');
    const { getActiveOperatorServer } = require('@/config/operatorServer') as typeof import('@/config/operatorServer');
    features.setFacilityRelease(getActiveOperatorServer()!, { schemaHead });
    if (named) asSamsung();
    await phone.offline();
    await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody(), what: 'New GRN', customer: 'asha Traders' });
    server.answers[SAVE] = () => serverRefusal('RATE_MISSING', 'Missing rate');
    server.answers.hold_items = holdOk();
    await phone.online();
    await phone.pass();
    expect(rpcCalls('hold_items')).toHaveLength(1);
    return rpcCalls('hold_items')[0].args;
  }

  it('sends p_device_name to a server that takes it', async () => {
    const args = await handedOver('00000000000246_held_item_device_name', true);
    expect(args.p_device_name).toMatch(/^Samsung SM-A156E \([0-9A-F]{4}\)$/);
  });

  it('sends no p_device_name to an older server', async () => {
    const args = await handedOver('00000000000245_grn_missing_photos', true);
    expect(args).not.toHaveProperty('p_device_name');
  });

  it('sends no p_device_name when the phone has no name', async () => {
    const args = await handedOver('00000000000246_held_item_device_name', false);
    expect(args).not.toHaveProperty('p_device_name');
  });
});

describe('WH-413: a hand-over whose session ends while it is out', () => {
  it('writes nothing: the row stays refused and not held, and a later pass hands it over', async () => {
    const phone = await startStaff();
    await phone.offline();
    await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody(), what: 'New GRN', customer: 'asha Traders' });
    server.answers[SAVE] = () => serverRefusal('RATE_MISSING', 'Missing rate');
    let release!: () => void;
    server.answers.hold_items = args => new Promise<RpcAnswer>(resolve => { release = () => resolve(holdOk('late')(args)); });
    await phone.online();
    await jest.advanceTimersByTimeAsync(1000);
    expect(rpcCalls('hold_items')).toHaveLength(1);
    (require('@/config/sessionLifecycle') as typeof import('@/config/sessionLifecycle')).advanceSessionGeneration();
    release();
    await jest.advanceTimersByTimeAsync(1000);
    const [row] = await rawRows<{ state: string; held_id: string | null; handover_failed: number | null }>('items');
    expect(row).toMatchObject({ state: 'refused', held_id: null });
    expect(row.handover_failed ?? 0).toBe(0);

    server.answers.hold_items = holdOk('again');
    await phone.pass();
    expect((await rawRows<{ state: string; held_id: string | null }>('items'))[0]).toMatchObject({ state: 'held', held_id: 'again-1' });
  });
});
