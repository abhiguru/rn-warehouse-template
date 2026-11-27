/**
 * WH-304, the recorder's own view (contract product/tech/app-offline-holding-list.md sections 5.3, 2.8, 11.7; cases S9,
 * S12, S14's recorder row; Design offline-capture.md 7.4, 7.9 DQ5, DQ6, DQ8): "Unsent items" lists the person's held
 * items with their reason, a follower with `dependsOnRefused`, an accepted item under "Sent today" on its day only, a
 * rejected item on any day until opened once (then `mark_held_item_seen`, kept for later when offline), and the status
 * bar's line 2 says how many of the person's items are held when nothing is unsent.
 *
 * Real: the phone copy, the unsent-work store and list (`loadUnsentList`), `statusBarState`, i18n, WH-304's holding
 * modules. Faked at the edge: the change feed and RPC answers, expo-sqlite, NetInfo, AppState, fake timers.
 *
 * Not here: S10 (footnotes on the GRN card, lot row, dispatch row and the GRN details' `heldChangeStrip`): those need the
 * GRN and dispatch screens drawn from the copy, and are left for the screens' own tests when A-2 is built.
 *
 * ===== AGREE WITH DEVELOPMENT (ASSUMED) =====
 *  - `loadUnsentList()` merges the recorder's copy rows (§11.7 recorder keys) with the file: a held or rejected-unseen row
 *    is `section: 'held'` with `tag: 'held'` / `'rejected'`; an accepted row decided today is `section: 'sent'`,
 *    `tag: 'accepted'`, `sentNumber` = the result's number; a row's `id` is its held id.
 *  - `@/features/holding/heldRows` exports `markHeldSeen(heldId: string): Promise<void>` (what opening a rejected row calls;
 *    offline it keeps the id in the unsent file's `meta` key `held_seen` and sends it at the next sync).
 *  - `UnsentSummary` gains `held: number` (own Held-section rows, rejected unseen included); `deriveStatusBar` gives
 *    `line2 = { key: 'heldLine', count }` when nothing is unsent, and the bar's text is `components.offlineStatus.heldLine`.
 * ============================================
 */
import { eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import type { FeedRow } from '@/tests/phoneCopy/fakeFeed';
import { rawRows, server, type RpcAnswer } from '@/tests/unsent/unsentPhone';
import { bootHolding, recorderHeldFeedRow, rpcCalls, type HoldingPhone } from '@/tests/unsent/holdingPhone';
import { deriveStatusBar, line2OpensUnsent, type StatusBarInput } from '@/features/phone-copy/statusBarState';

const TODAY = '2026-11-27T08:30:00+05:30';
const YESTERDAY = '2026-11-26T18:00:00+05:30';

const loadList = async () =>
  (require('@/features/unsent/unsentList') as typeof import('@/features/unsent/unsentList')).loadUnsentList();
const heldRows = (): { markHeldSeen(heldId: string): Promise<void> } => require('@/features/holding/heldRows');

const own = (id: string, overrides: Record<string, unknown> = {}): FeedRow =>
  recorderHeldFeedRow({
    id,
    kind: 'newGrn',
    what: { key: 'offline.unsent.whatNewGrn' },
    reason: 'noRate',
    reason_data: { lines: [{ item_name: 'Beans' }] },
    lines: null,
    body: { v: 1, localId: id, args: { p_customer_id: 'c1', p_items: [] } },
    ...overrides,
  });
const accepted = (id: string, decidedAt: string, result: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  own(id, { state: 'accepted', needs_decision: true, decided_by_name: 'Meera Fictional', decided_at: decidedAt, result, ...extra });
const rejected = (id: string, decidedAt: string) =>
  own(id, { state: 'rejected', decided_by_name: 'Meera Fictional', decided_at: decidedAt, reject_reason: 'Duplicate entry' });

async function recorder(rows: FeedRow[]): Promise<HoldingPhone> {
  const phone = await bootHolding({ role: 'staff', profileId: 'profile-staff-1', heldFeedRows: rows, withCopy: true });
  // The copy must load at the held-items format (5); today it turns off here.
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
  const { setLanguage } = require('@/i18n') as typeof import('@/i18n');
  await setLanguage('en');
  await eraseEverything();
});

describe('S9: the recorder\'s Held, Accepted and Rejected rows in "Unsent items"', () => {
  it('a held item is under Held with its reason sentence; its follower is directly under it with dependsOnRefused', async () => {
    await recorder([
      own('held-1'),
      own('held-2', { kind: 'photos', reason: 'followsHeld', follows: 'held-1', needs_decision: false, lines: null, reason_data: {}, what: { key: 'offline.unsent.whatPhotosNewGrn', params: { count: 1 } } }),
    ]);
    const { rows } = await loadList();
    const held = rows.filter(r => r.section === 'held');
    expect(held.map(r => r.id)).toEqual(['held-1', 'held-2']);
    expect(held[0]).toMatchObject({ tag: 'held' });
    expect(held[0].reason).toMatch(/There is no rate for Beans for asha Traders\./);
    expect(held[1].reason).toBe('Not sent: the change before it was refused.');
  });

  it('an item accepted today is under "Sent today" as Accepted with its number; one accepted yesterday is gone', async () => {
    await recorder([
      accepted('acc-today', TODAY, { grn_id: 'g-17', gr_no: 'G-17' }),
      accepted('acc-old', YESTERDAY, { grn_id: 'g-16', gr_no: 'G-16' }),
    ]);
    const { rows } = await loadList();
    expect(rows.find(r => r.id === 'acc-today')).toMatchObject({ section: 'sent', tag: 'accepted', sentNumber: 'G-17' });
    expect(rows.find(r => r.id === 'acc-old')).toBeUndefined();
  });

  it('S14: an accepted field change reads as the GRN it changed', async () => {
    await recorder([
      accepted('acc-lc', TODAY, { grn_id: 'g-B1', gr_no: 'B1' }, { kind: 'lotChange', lines: null, what: { key: 'offline.unsent.whatChange', params: { number: 'B1', fields: ['rack'] } } }),
    ]);
    const { rows } = await loadList();
    expect(rows.find(r => r.id === 'acc-lc')).toMatchObject({ section: 'sent', tag: 'accepted', sentNumber: 'B1' });
  });

  it('a rejected item stays under Held the next day with the rejecter\'s reason, until opened; then mark_held_item_seen and gone', async () => {
    const phone = await recorder([rejected('rej-1', YESTERDAY)]);
    expect((await loadList()).rows.find(r => r.id === 'rej-1')).toMatchObject({ section: 'held', tag: 'rejected', reason: 'Duplicate entry' });

    server.answers.mark_held_item_seen = (): RpcAnswer => ({ data: { success: true }, error: null });
    await heldRows().markHeldSeen('rej-1');

    expect(rpcCalls('mark_held_item_seen').map(c => c.args)).toEqual([{ p_id: 'rej-1' }]);
    expect((await loadList()).rows.find(r => r.id === 'rej-1')).toBeUndefined();
    expect(phone.store.getUnsentSummary()).toMatchObject({ held: 0 });
  });

  it('opened offline: hidden at once, kept in the file, and sent at the next sync', async () => {
    const phone = await recorder([rejected('rej-2', YESTERDAY)]);
    await phone.offline();
    await heldRows().markHeldSeen('rej-2');

    expect(rpcCalls('mark_held_item_seen')).toHaveLength(0);
    expect((await loadList()).rows.find(r => r.id === 'rej-2')).toBeUndefined();
    const meta = await rawRows<{ key: string; value: string }>('meta');
    expect(meta.find(m => m.key === 'held_seen')?.value).toContain('rej-2');

    server.answers.mark_held_item_seen = (): RpcAnswer => ({ data: { success: true }, error: null });
    await phone.online();
    await phone.sync();
    expect(rpcCalls('mark_held_item_seen').map(c => c.args)).toEqual([{ p_id: 'rej-2' }]);
  });

  it('WH-381: historical newDispatch rows in held_items are filtered out of Unsent items and held summary count', async () => {
    const phone = await recorder([
      recorderHeldFeedRow({ id: 'legacy-disp-1', kind: 'newDispatch', state: 'held' }),
      own('grn-held-1'),
    ]);
    const { rows } = await loadList();
    expect(rows.map(r => r.id)).toEqual(['grn-held-1']);
    expect(phone.store.getUnsentSummary()).toMatchObject({ count: 0, held: 1 });
  });
});

describe('S12: the status bar\'s line 2 for held items (Design 7.9 DQ6)', () => {
  const input = (unsent: Record<string, unknown>): StatusBarInput => ({
    phase: 'ready', loading: false, offline: false, current: true, lastRunFailed: false, asOf: Date.now(), storageLow: false,
    unsent: { count: 0, sendBy: 0, limitReached: false, ...unsent } as StatusBarInput['unsent'], running: false,
  });
  const words = async (language: 'en' | 'gu', count: number) => {
    const i18n = require('@/i18n') as typeof import('@/i18n');
    await i18n.setLanguage(language);
    return i18n.t('components.offlineStatus.heldLine' as never, { count });
  };

  it('counts own held rows and rejected rows not yet opened, never accepted ones', async () => {
    const phone = await recorder([own('h-1'), rejected('r-1', YESTERDAY), accepted('a-1', TODAY, { grn_id: 'g-1', gr_no: 'G-1' })]);
    expect(phone.store.getUnsentSummary()).toMatchObject({ count: 0, held: 2 });
  });

  it('with only held rows: heldLine one / other, pressable to "Unsent items"', async () => {
    const one = deriveStatusBar(input({ held: 1 })).line2;
    expect(one).toEqual({ key: 'heldLine', count: 1 });
    expect(line2OpensUnsent(one)).toBe(true);
    expect(deriveStatusBar(input({ held: 2 })).line2).toEqual({ key: 'heldLine', count: 2 });
    expect(await words('en', 1)).toBe('1 of your items is held. Tap to see it.');
    expect(await words('en', 2)).toBe('2 of your items are held. Tap to see them.');
  });

  it('S11: heldLine in Gujarati with Gujarati digits', async () => {
    expect(await words('gu', 1)).toBe('તમારી ૧ એન્ટ્રી રોકેલી છે. જોવા ટૅપ કરો.');
    expect(await words('gu', 3)).toBe('તમારી ૩ એન્ટ્રી રોકેલી છે. જોવા ટૅપ કરો.');
  });

  it('an unsent item present: the unsent text wins', () => {
    expect(deriveStatusBar(input({ count: 1, held: 2 })).line2).toMatchObject({ key: 'sending', count: 1 });
    expect(deriveStatusBar({ ...input({ count: 1, held: 2 }), offline: true }).line2).toMatchObject({ key: 'unsent', count: 1 });
  });

  it('nothing held and nothing unsent: no line 2', () => {
    expect(deriveStatusBar(input({ held: 0 })).line2).toBeNull();
  });
});
