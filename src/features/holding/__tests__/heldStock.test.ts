/**
 * WH-381 Section 3.3 (supersedes WH-304 held-dispatch stock deductions T1-T3; keeps T4 customer account check):
 * offline dispatches are dropped, so `lessHeld`, `lessUnsent`, `lessOthersUnsent`, and `deductions()` are always
 * `0` / empty and `netLotStock` equals server stock (plus GRN edit deltas), even when historical `newDispatch` rows
 * remain in `held_items` or an item emits `lessUnsent`.
 *
 * Real: the phone copy (sync engine, schema, apply), the unsent-work store, `unsentOverlay`, and `netLotStock`.
 * Faked at the edge: the change feed (`env.feed`), expo-sqlite, NetInfo, AppState.
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import type { FeedRow } from '@/tests/phoneCopy/fakeFeed';
import { server } from '@/tests/unsent/unsentPhone';
import {
  bootHolding,
  heldDispatchFeedRow,
  sampleDispatchBody,
  type HoldingPhone,
  type HoldingRole,
} from '@/tests/unsent/holdingPhone';

/** Lot l03 (Beans, GRN A2) has 19 bags in the fictional warehouse (grnDataset.ts). */
const LOT = 'l03';
const LOT_STOCK = 19;

const overlay = () =>
  (require('@/features/phone-copy/unsentOverlay') as typeof import('@/features/phone-copy/unsentOverlay')).getUnsentOverlay();
const netLotStock = (lotId: string, copyStock: number) =>
  (require('@/features/phone-copy/reads/rows') as typeof import('@/features/phone-copy/reads/rows')).netLotStock(lotId, copyStock);

const managerRow = (id: string, qty: number): FeedRow => heldDispatchFeedRow(id, [{ lot_id: LOT, qty }]);
const staffRow = (id: string, qty: number): FeedRow => {
  const { needs_decision: _omit, ...row } = heldDispatchFeedRow(id, [{ lot_id: LOT, qty }]).row;
  return { id, row };
};

async function startWithCopy(role: HoldingRole, heldFeedRows: FeedRow[], profileId = `profile-${role}-1`, feedFormat?: number): Promise<HoldingPhone> {
  const phone = await bootHolding({ role, profileId, heldFeedRows, withCopy: true, ...(feedFormat === undefined ? {} : { feedFormat }) });
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

describe('WH-381 stock overlay: zero dispatch deductions on every role', () => {
  it.each([
    ['staff', staffRow('held-t1', 6)],
    ['supervisor', managerRow('held-t1', 6)],
    ['admin', managerRow('held-t1', 6)],
  ] as [HoldingRole, FeedRow][])('%s: historical held newDispatch row deducts 0 bags; netLotStock stays at server stock 19', async (role, row) => {
    await startWithCopy(role, [row]);

    expect(overlay().lessHeld(LOT)).toBe(0);
    expect(overlay().lessUnsent(LOT)).toBe(0);
    expect(overlay().lessOthersUnsent?.(LOT) ?? 0).toBe(0);
    expect(overlay().deductions().size).toBe(0);
    expect(netLotStock(LOT, LOT_STOCK)).toBe(LOT_STOCK);
  });

  it('legacy unsent item with lessUnsent plus historical held dispatch still yields 0 deductions and full server stock', async () => {
    const phone = await startWithCopy('staff', [staffRow('held-t3', 6)]);
    phone.kinds.registerSendKind('legacyDispatch', {
      lane: 'record',
      send: async () => ({ kind: 'transient' }),
      overlay: () => ({ lessUnsent: { [LOT]: 4 } }),
    } as never);
    await phone.offline();
    await phone.queue.enqueue({ kind: 'legacyDispatch', body: sampleDispatchBody(LOT, 4), what: 'Legacy dispatch', customer: 'asha Traders' });

    expect(overlay().lessUnsent(LOT)).toBe(0);
    expect(overlay().lessHeld(LOT)).toBe(0);
    expect(overlay().deductions().size).toBe(0);
    expect(netLotStock(LOT, LOT_STOCK)).toBe(LOT_STOCK);
  });
});

describe('T4 (PQ3): a customer account\'s phone has no held rows and shows the server\'s figure', () => {
  it('never asks for held_items, and a lot shows the copy\'s stock with no held deduction', async () => {
    // A customer account's copy is read from feed format 7 (WH-306 CUSTOMER_COPY_FORMAT); below it the copy is off.
    await startWithCopy('customer', [managerRow('held-t4', 6)], 'profile-customer-1', 7);
    expect(env.feed.pagesOf('held_items')).toHaveLength(0);
    expect(overlay().lessHeld(LOT)).toBe(0);
    expect(netLotStock(LOT, LOT_STOCK)).toBe(LOT_STOCK);
  });
});
