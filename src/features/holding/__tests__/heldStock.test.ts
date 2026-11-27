/**
 * WH-304 stock (contract product/tech/app-offline-holding-list.md section 4, 2.7, 11.7; cases T1-T4; Product PQ3; Design
 * offline-capture.md 2.4 `lessHeld`, 7.3 last bullet): a held dispatch takes its bags off its lots on every staff-side
 * phone until it is decided; the recorder's own held dispatch is taken off once, never twice; a customer account's phone
 * has no held rows and shows the server's figure.
 *
 * Real: the phone copy (sync engine, schema, apply), the unsent-work store and engine, `unsentOverlay` and `netLotStock`
 * (the one net-stock function every lot reader and the new dispatch form's limit share, reads/rows.ts).
 * Faked at the edge: the change feed (`env.feed`), the save and `hold_items` answers, expo-sqlite, NetInfo, AppState.
 *
 * Every case first checks the copy is readable at the held-items feed format (5): today SYNC_FORMATS stops at 3, so the
 * copy turns off and each case fails at that step (the format step of contract 2.7 is not built).
 *
 * ===== AGREE WITH DEVELOPMENT (ASSUMED) =====
 *  - The copy reads `held_items` rows by the keys of §11.7 (staff `id, kind, state, lines`; manager adds `needs_decision`;
 *    recorder the full row) and `getUnsentOverlay().lessHeld(lotId)` sums `lines[].qty` of `kind = 'newDispatch'`,
 *    `state = 'held'` rows; `deductions()` (hence `netLotStock`) includes it.
 *  - A send kind's `overlay(body, state)` gives `lessUnsent` for a dispatch (as WH-161's `newDispatch` will); for an own
 *    row in `refused` or `held` the overlay counts those bags under `lessHeld`, not `lessUnsent` (section 3 "Overlay").
 *    This file registers a stand-in `newDispatch` kind with that overlay because WH-161's kind is not in this worktree.
 *  - A recorder's own `held` file row and the copy's row with the same id (`held_id`) count once (section 4).
 * ============================================
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import type { FeedRow } from '@/tests/phoneCopy/fakeFeed';
import { rpcKind, server, type RpcAnswer } from '@/tests/unsent/unsentPhone';
import {
  bootHolding,
  heldDispatchFeedRow,
  recorderHeldFeedRow,
  sampleDispatchBody,
  serverRefusal,
  type HoldingPhone,
  type HoldingRole,
} from '@/tests/unsent/holdingPhone';

const SAVE = 'save_dispatch_test';
/** Lot l03 (Beans, GRN A2) has 19 bags in the fictional warehouse (grnDataset.ts). */
const LOT = 'l03';
const LOT_STOCK = 19;

const overlay = () =>
  (require('@/features/phone-copy/unsentOverlay') as typeof import('@/features/phone-copy/unsentOverlay')).getUnsentOverlay();
const netLotStock = (lotId: string, copyStock: number) =>
  (require('@/features/phone-copy/reads/rows') as typeof import('@/features/phone-copy/reads/rows')).netLotStock(lotId, copyStock);

/** A manager's copy row of another person's held dispatch: exactly `id, kind, state, needs_decision, lines` (§11.7). */
const managerRow = (id: string, qty: number): FeedRow => heldDispatchFeedRow(id, [{ lot_id: LOT, qty }]);
/** A staff copy row of another person's held dispatch: exactly `id, kind, state, lines` (§11.7). */
const staffRow = (id: string, qty: number): FeedRow => {
  const { needs_decision: _omit, ...row } = heldDispatchFeedRow(id, [{ lot_id: LOT, qty }]).row;
  return { id, row };
};

const holdOk = (prefix: string) => (args: Record<string, any>): RpcAnswer => ({
  data: { success: true, held: (args.p_items as { request_key: string }[]).map((item, i) => ({ request_key: item.request_key, id: `${prefix}-${i + 1}`, state: 'held' })) },
  error: null,
});

/** A change-feed page with one change of `held_items` (contract C298 section 3). */
const heldChange = (position: string, change: { id: string; op: 'upsert'; row: Record<string, unknown> } | { id: string; op: 'delete' }) => ({
  position,
  as_of: '2026-11-27T04:00:00+00:00',
  more: false,
  reload_all: null,
  reload: [],
  changes: [change.op === 'upsert' ? { e: 'held_items', id: change.id, op: 'upsert' as const, v: `000000000000000${position.slice(-1)}`, row: change.row } : { e: 'held_items', id: change.id, op: 'delete' as const }],
});

async function startWithCopy(role: HoldingRole, heldFeedRows: FeedRow[], profileId = `profile-${role}-1`, feedFormat?: number): Promise<HoldingPhone> {
  const phone = await bootHolding({ role, profileId, heldFeedRows, withCopy: true, ...(feedFormat === undefined ? {} : { feedFormat }) });
  // The copy must load at the held-items format; today it turns off here (SYNC_FORMATS has no 5).
  expect(phone.phone.engine.isCopyReadable()).toBe(true);
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

describe('T1: a held dispatch in the copy lowers its lots on staff-side phones until it is decided', () => {
  it.each([
    ['staff', staffRow('held-t1', 6)],
    ['supervisor', managerRow('held-t1', 6)],
    ['admin', managerRow('held-t1', 6)],
  ] as [HoldingRole, FeedRow][])('%s: lessHeld 6 and net stock 13 while held; back to 19 once the decided row leaves the copy', async (role, row) => {
    const phone = await startWithCopy(role, [row]);

    expect(overlay().lessHeld(LOT)).toBe(6);
    expect(overlay().lessUnsent(LOT)).toBe(0);
    expect(netLotStock(LOT, LOT_STOCK)).toBe(LOT_STOCK - 6);
    expect(overlay().lessHeld('l04')).toBe(0);

    // Accepted or rejected on the server: the row leaves this reader's set as a delete (§11.7, B-F3).
    env.feed.changeAnswers.push(heldChange('1048577', { id: 'held-t1', op: 'delete' }));
    await phone.sync();

    expect(overlay().lessHeld(LOT)).toBe(0);
    expect(netLotStock(LOT, LOT_STOCK)).toBe(LOT_STOCK);
  });

  it('only held newDispatch rows count: a held lotChange row and a row in another state take nothing off', async () => {
    await startWithCopy('supervisor', [
      managerRow('held-a', 4),
      { id: 'held-b', row: { id: 'held-b', kind: 'lotChange', state: 'held', needs_decision: true, lines: null } },
      heldDispatchFeedRow('held-c', [{ lot_id: LOT, qty: 5 }], { state: 'accepted' }),
    ]);
    expect(overlay().lessHeld(LOT)).toBe(4);
    expect(netLotStock(LOT, LOT_STOCK)).toBe(LOT_STOCK - 4);
  });
});

describe('T2: the recorder\'s own held dispatch is deducted once, before and after the sync that brings its row', () => {
  it('counts the bags once under lessHeld from the file, then once from the copy, never twice', async () => {
    const phone = await bootHolding({ role: 'staff', profileId: 'profile-staff-1' });
    const send = rpcKind(phone, SAVE);
    phone.kinds.registerSendKind('newDispatch', {
      ...send,
      overlay: (body: { args: { p_dispatch_items: { gr_trl_id: string; disp_qty: number }[] } }) => ({
        lessUnsent: Object.fromEntries(body.args.p_dispatch_items.map(line => [line.gr_trl_id, line.disp_qty])),
      }),
    } as never);
    await phone.phone.engine.startPhoneCopy();
    await phone.phone.engine.syncNow('open');
    expect(phone.phone.engine.isCopyReadable()).toBe(true);

    await phone.offline();
    await phone.queue.enqueue({ kind: 'newDispatch', body: sampleDispatchBody(LOT, 25), what: 'New dispatch', customer: 'asha Traders' });
    expect(overlay().lessUnsent(LOT)).toBe(25);

    server.answers[SAVE] = () => serverRefusal('STOCK_SHORT', 'Insufficient stock', { lines: [{ lot_id: LOT, item_name: 'Beans', available: 19, requested: 25 }] });
    server.answers.hold_items = holdOk('held-t2');
    await phone.online();
    await phone.pass();

    // Held, the copy has no row yet: the file gives the deduction, as held, once.
    expect(overlay().lessUnsent(LOT)).toBe(0);
    expect(overlay().lessHeld(LOT)).toBe(25);
    expect(netLotStock(LOT, LOT_STOCK)).toBe(LOT_STOCK - 25);

    // The sync brings the recorder's own row with the same id: still once.
    env.feed.changeAnswers.push(heldChange('1048577', {
      id: 'held-t2-1',
      op: 'upsert',
      row: recorderHeldFeedRow({ id: 'held-t2-1', body: sampleDispatchBody(LOT, 25), lines: [{ lot_id: LOT, qty: 25 }] }).row,
    }));
    await phone.sync();
    expect(overlay().lessHeld(LOT)).toBe(25);
    expect(netLotStock(LOT, LOT_STOCK)).toBe(LOT_STOCK - 25);
  });
});

describe('T3: the new dispatch form\'s limit uses the net figure', () => {
  it('netLotStock, which the dispatch form\'s lot limit reads, is the copy\'s stock less held and unsent bags together', async () => {
    const phone = await startWithCopy('staff', [staffRow('held-t3', 6)]);
    const send = rpcKind(phone, SAVE);
    phone.kinds.registerSendKind('newDispatch', {
      ...send,
      overlay: (body: { args: { p_dispatch_items: { gr_trl_id: string; disp_qty: number }[] } }) => ({
        lessUnsent: Object.fromEntries(body.args.p_dispatch_items.map(line => [line.gr_trl_id, line.disp_qty])),
      }),
    } as never);
    await phone.offline();
    await phone.queue.enqueue({ kind: 'newDispatch', body: sampleDispatchBody(LOT, 4), what: 'New dispatch', customer: 'asha Traders' });

    expect(overlay().deductions().get(LOT)).toBe(10);
    expect(netLotStock(LOT, LOT_STOCK)).toBe(LOT_STOCK - 6 - 4);
  });
});

describe('T4 (PQ3): a customer account\'s phone has no held rows and shows the server\'s figure', () => {
  it('never asks for held_items, and a lot shows the copy\'s stock with no held deduction', async () => {
    // The server would hold a held dispatch on this lot, but a customer account's feed never lists the entity.
    // A customer account's copy is read from feed format 7 (WH-306 CUSTOMER_COPY_FORMAT); below it the copy is off.
    await startWithCopy('customer', [managerRow('held-t4', 6)], 'profile-customer-1', 7);
    expect(env.feed.pagesOf('held_items')).toHaveLength(0);
    expect(overlay().lessHeld(LOT)).toBe(0);
    expect(netLotStock(LOT, LOT_STOCK)).toBe(LOT_STOCK);
  });
});
