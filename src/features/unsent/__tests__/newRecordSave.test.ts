/**
 * WH-161, test first (product/tech/app-offline-new-records.md sections 3, 4, 5 and 10; cases K2, P1-P5, P7-P9, N6). The card's
 * PQ1, PQ2, PQ6 and Design 10.8 change no name here. The backend (B) has its own tests.
 *
 * Real: src/features/unsent (queue, engine, registry, store), the two kinds, the Save path, the number mode, the phone copy and
 * the services that build the save arguments. Faked at the edge: the server's answer to each RPC (`server`), expo-sqlite, files,
 * NetInfo, AppState, the signed-in person.
 *
 * ===== AGREE WITH DEVELOPMENT (the contract is silent; ASSUMED) =====
 *  - `@/features/unsent/offlineNew` (named in section 3) exports `offlineNewOn()`, `numberMode(type)` (section 4: it reads the
 *    phone: reachability, `numbering`, own record-lane items) and the two Save paths `saveNewGrn(payload, form)` and
 *    `saveNewDispatch(payload, form)`. `form` = `{ numberMode, suggestedNumber?, photos?, ratesNotOnPhone? }`; the payload is what
 *    `createGRN` / `createDispatch` take today.
 *  - They answer `{ path: 'direct', result } | { path: 'sent', result } | { path: 'saved', itemId } | { path: 'refused',
 *    answer } | { path: 'duplicate', warning }`. `sent` = queued and sent within the 8 s wait; `saved` = "Saved on this phone".
 *    `refused` and `duplicate` leave no item (PQ2). `direct` = today's `createGRN`/`createDispatch`, called unchanged.
 *  - `confirmDuplicate` is the form's second call: `saveNewGrn(payload, { ...form, warnDuplicate: false })`.
 *  - The item's body is `{ v, localId, lotLocalIds, args, show }` (section 5); a dispatch's `{ v, localId, args, show }`.
 *    `args.p_issue_number` / `args.p_dispatch_data.issue_number` hold the issue flag; the blank number is `''`.
 *  - A refused item keeps the server's `reason` in `items.last_error` (as C301 section 3 in the lotChange tests).
 * ====================================================================
 */
import { eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { rawRows, server } from '@/tests/unsent/unsentPhone';
import { bootNewRecords, callsOf, dispatchPayload, dispatchSaved, duplicateWarning, grnPayload, grnSaved, rateFailure, refusal } from '@/tests/unsent/newRecordPhone';
import type { RpcAnswer } from '@/tests/unsent/unsentPhone';

type Saved = { path: string; result?: any; itemId?: string; answer?: any; warning?: unknown };
type Form = Record<string, unknown>;
const offlineNew = () =>
  require('@/features/unsent/offlineNew') as {
    offlineNewOn(): boolean;
    numberMode(type: 'grn' | 'dispatch'): 'online' | 'pending' | 'typed';
    saveNewGrn(payload: unknown, form: Form): Promise<Saved>;
    saveNewDispatch(payload: unknown, form: Form): Promise<Saved>;
  };
const items = () => rawRows<{ id: string; kind: string; state: string; body: string; last_error: string | null; depends_on: string | null; request_key: string }>('items', 'ORDER BY seq');
const bodyOf = (row: { body: string }) => JSON.parse(row.body);
const GRN_RPC = 'save_grn';
const DISPATCH_RPC = 'create_dispatch_with_stock_check';

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-27T09:00:00+05:30') });
  resetEnv();
  files.reset();
  server.reset();
});
afterEach(async () => {
  jest.useRealTimers();
  await eraseEverything();
});

/** Runs the Save and moves the clock, so the 8 s wait of section 3 can end. */
async function saving<T>(work: Promise<T>, ms = 0): Promise<T> {
  if (ms > 0) await jest.advanceTimersByTimeAsync(ms);
  return work;
}

describe('K2: what the kind sends for each number mode', () => {
  it('pending: a blank number and issue on, recorded time and the duplicate warning on, no source order', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    const saved = await offlineNew().saveNewGrn(grnPayload(), { numberMode: 'pending' });
    expect(saved.path).toBe('saved');
    const [row] = await items();
    const { args } = bodyOf(row);
    expect(args).toMatchObject({ p_gr_no: '', p_issue_number: true, p_warn_duplicate: true, p_customer_id: 'c1' });
    expect(typeof args.p_recorded_at).toBe('string');
    expect(args).not.toHaveProperty('p_idempotency_key');
  });

  it('typed: the number the person typed and issue off', async () => {
    const phone = await bootNewRecords({ scheme: 'free' });
    await phone.offline();
    await offlineNew().saveNewGrn(grnPayload({ number: 'G-501' }), { numberMode: 'typed' });
    expect(bodyOf((await items())[0]).args).toMatchObject({ p_gr_no: 'G-501', p_issue_number: false });
  });

  it('a dispatch: pending gives a blank disp_no and issue_number true inside p_dispatch_data; typed gives the number and false', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    await offlineNew().saveNewDispatch(dispatchPayload(), { numberMode: 'pending' });
    const first = bodyOf((await items())[0]).args;
    expect(first.p_dispatch_data).toMatchObject({ disp_no: '', issue_number: true, warn_duplicate: true });
    expect(first.p_dispatch_data.source_order_id ?? null).toBeNull();
    expect(first).toMatchObject({ p_generate_invoice: true, p_retry_count: 0 });
    expect(first.p_dispatch_items).toEqual([{ gr_trl_id: 'l06', disp_qty: 4 }]);

    await offlineNew().saveNewDispatch(dispatchPayload({ number: 'D-9', lotId: 'l03' }), { numberMode: 'typed' });
    expect(bodyOf((await items())[1]).args.p_dispatch_data).toMatchObject({ disp_no: 'D-9', issue_number: false });
  });

  it('an online form that ends in the queue (an own item is unsent): the suggested number is not sent, a changed one is', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    await offlineNew().saveNewGrn(grnPayload(), { numberMode: 'pending' }); // an own record item is unsent
    await phone.online();
    server.answers[GRN_RPC] = () => grnSaved('A-7');
    const unchanged = offlineNew().saveNewGrn(grnPayload({ number: 'A-7' }), { numberMode: 'online', suggestedNumber: 'A-7' });
    await saving(unchanged, 100);
    const changed = offlineNew().saveNewGrn(grnPayload({ number: 'A-9' }), { numberMode: 'online', suggestedNumber: 'A-7' });
    await saving(changed, 100);
    const rows = await items();
    expect(bodyOf(rows[1]).args).toMatchObject({ p_gr_no: '', p_issue_number: true });
    expect(bodyOf(rows[2]).args).toMatchObject({ p_gr_no: 'A-9', p_issue_number: false });
  });
});

describe('P1, P2, P3: which path Save takes', () => {
  it('P1: the facility without the topic keeps today\'s call and queues nothing', async () => {
    const phone = await bootNewRecords();
    require('@/config/backendFeatures').resetFacilityRelease();
    expect(offlineNew().offlineNewOn()).toBe(false);
    server.answers[GRN_RPC] = () => grnSaved('A-1');
    const saved = await offlineNew().saveNewGrn(grnPayload({ number: 'A-1' }), { numberMode: 'online', suggestedNumber: 'A-1' });
    expect(saved.path).toBe('direct');
    expect(await items()).toHaveLength(0);
    expect(callsOf(GRN_RPC)).toHaveLength(1);
    expect(phone.gate.canStartWork()).toEqual({ ok: true });
  });

  it('P2: reachable, nothing unsent, a number from the server: a direct save and no item', async () => {
    await bootNewRecords();
    server.answers[GRN_RPC] = () => grnSaved('A-1');
    const saved = await offlineNew().saveNewGrn(grnPayload({ number: 'A-1' }), { numberMode: 'online', suggestedNumber: 'A-1' });
    expect(saved.path).toBe('direct');
    expect(await items()).toHaveLength(0);
  });

  it('P3: offline, the form is saved as an item and the server is not called', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    const saved = await offlineNew().saveNewGrn(grnPayload(), { numberMode: 'pending' });
    expect(saved.path).toBe('saved');
    const [row] = await items();
    expect(row).toMatchObject({ kind: 'newGrn', state: 'saved' });
    expect(callsOf(GRN_RPC)).toHaveLength(0);
  });
});

describe('P4: reachable with a pending number waits for this item', () => {
  it('an item sent within 8 s ends in the success path with the issued number', async () => {
    await bootNewRecords();
    server.answers[GRN_RPC] = () => grnSaved('312');
    const saved = await saving(offlineNew().saveNewGrn(grnPayload(), { numberMode: 'pending' }), 100);
    expect(saved.path).toBe('sent');
    expect(saved.result).toMatchObject({ grn_id: 'grn-server-1', gr_no: '312' });
    expect((await items())[0].state).toBe('sent');
    expect(callsOf(GRN_RPC)[0].args).toMatchObject({ p_gr_no: '', p_issue_number: true, p_idempotency_key: (await items())[0].request_key });
  });

  it('a dispatch\'s success carries the number and the order effects of the answer', async () => {
    await bootNewRecords();
    const effects = [{ order_no: 'O-5', status: 'completed' }];
    server.answers[DISPATCH_RPC] = () => dispatchSaved('77', effects);
    const saved = await saving(offlineNew().saveNewDispatch(dispatchPayload(), { numberMode: 'pending' }), 100);
    expect(saved.path).toBe('sent');
    expect(saved.result).toMatchObject({ dispatch_id: 'disp-server-1', disp_no: '77', order_effects: effects });
  });

  it('no answer in 8 s: "Saved on this phone", and the item goes on by itself', async () => {
    await bootNewRecords();
    server.answers[GRN_RPC] = () => new Promise(() => undefined); // never answers
    const saved = await saving(offlineNew().saveNewGrn(grnPayload(), { numberMode: 'pending' }), 8_500);
    expect(saved.path).toBe('saved');
    expect((await items())).toHaveLength(1);
  });

  it('a second tap while it waits makes no second item', async () => {
    await bootNewRecords();
    server.answers[GRN_RPC] = () => grnSaved('312');
    const first = offlineNew().saveNewGrn(grnPayload(), { numberMode: 'pending' });
    const second = offlineNew().saveNewGrn(grnPayload(), { numberMode: 'pending' });
    await saving(Promise.all([first, second]), 100);
    expect(await items()).toHaveLength(1);
    expect(callsOf(GRN_RPC)).toHaveLength(1);
  });
});

describe('P5: reachable with an own unsent record', () => {
  it('queues behind it and waits: "Saved on this phone" when the older item is still waiting, in order', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    await offlineNew().saveNewGrn(grnPayload(), { numberMode: 'pending' });
    await phone.online();
    server.answers[GRN_RPC] = () => new Promise(() => undefined); // the older one is not answered
    const saved = await saving(offlineNew().saveNewDispatch(dispatchPayload(), { numberMode: 'pending' }), 8_500);
    expect(saved.path).toBe('saved');
    expect((await items()).map(row => row.kind)).toEqual(['newGrn', 'newDispatch']);
    expect(callsOf(DISPATCH_RPC)).toHaveLength(0); // never ahead of the older record (criterion 15)
  });
});

describe('P7: a refusal within the wait is told on the form and nothing is kept', () => {
  it.each<[string, RpcAnswer, Record<string, unknown>]>([
    ['number taken', refusal('NUMBER_TAKEN', { number: 'G-501' }), { reason: 'NUMBER_TAKEN' }],
    // a rate failure has its code in error_code and no reason (grn_rate_failure): the app must read error_code
    ['a rate', rateFailure('RATE_MISSING', { lines: [{ index: 0, item_name: 'Peas' }] }), { error_code: 'RATE_MISSING', data: { lines: [{ index: 0, item_name: 'Peas' }] } }],
    ['SERIES_FULL', refusal('SERIES_FULL'), { reason: 'SERIES_FULL' }],
  ])('%s: no item, the form is given back with its photos', async (_name, answer, expected) => {
    await bootNewRecords();
    const photo = (await import('@/tests/unsent/unsentPhone')).addPhoto('bags.jpg');
    server.answers[GRN_RPC] = () => answer;
    const saved = await saving(
      offlineNew().saveNewGrn(grnPayload({ number: 'G-501' }), { numberMode: 'typed', photos: [{ file: photo, role: 'header' }] }),
      100
    );
    expect(saved.path).toBe('refused');
    expect(saved.answer).toMatchObject({ success: false, ...expected }); // the server's answer, unchanged (17.1)
    expect(await items()).toHaveLength(0);
    expect(files.held.has(photo)).toBe(true); // the photo file is not erased
    expect(server.calls.filter(call => call.name.includes('image'))).toHaveLength(0);
  });

  it('stock short on a dispatch gives the form back, and the bar counts nothing', async () => {
    const phone = await bootNewRecords();
    server.answers[DISPATCH_RPC] = () => refusal('STOCK_SHORT', { lines: [{ lot_id: 'l06', item_name: 'Peas', available: 2, requested: 4 }] });
    const saved = await saving(offlineNew().saveNewDispatch(dispatchPayload(), { numberMode: 'pending' }), 100);
    expect(saved.path).toBe('refused');
    expect(await items()).toHaveLength(0);
    expect(phone.store.getUnsentSummary().count).toBe(0);
  });

  it('the same refusal after the wait is a refused item (C301 section 3)', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    await offlineNew().saveNewGrn(grnPayload({ number: 'G-501' }), { numberMode: 'typed' });
    server.answers[GRN_RPC] = () => refusal('NUMBER_TAKEN', { number: 'G-501' });
    await phone.online();
    await phone.pass();
    const [row] = await items();
    expect(row.state).toBe('refused');
    expect(row.last_error).toContain('NUMBER_TAKEN');
  });
});

describe('P8: a possible duplicate within the wait', () => {
  const warning = () => duplicateWarning('grn');

  it('asks today\'s duplicate question and keeps nothing; confirming saves again as a new item with the warning off and a new key', async () => {
    await bootNewRecords();
    server.answers[GRN_RPC] = () => warning();
    const asked = await saving(offlineNew().saveNewGrn(grnPayload(), { numberMode: 'pending' }), 100);
    expect(asked.path).toBe('duplicate');
    expect(asked.warning).toMatchObject({ reason: 'POSSIBLE_DUPLICATE', existing_number: 'A-3', existing_id: 'grn-existing-1', kind: 'grn', window_minutes: 30 });
    expect(await items()).toHaveLength(0);
    const firstKey = callsOf(GRN_RPC)[0].args.p_idempotency_key;

    server.answers[GRN_RPC] = args => (args.p_warn_duplicate === false ? grnSaved('313') : warning());
    const saved = await saving(offlineNew().saveNewGrn(grnPayload(), { numberMode: 'pending', warnDuplicate: false }), 100);
    expect(saved.path).toBe('sent');
    const second = callsOf(GRN_RPC)[1].args;
    expect(second.p_warn_duplicate).toBe(false);
    expect(second.p_idempotency_key).not.toBe(firstKey);
    expect(await items()).toHaveLength(1);
  });

  it('cancelling leaves no item', async () => {
    await bootNewRecords();
    server.answers[GRN_RPC] = () => warning();
    expect((await saving(offlineNew().saveNewGrn(grnPayload(), { numberMode: 'pending' }), 100)).path).toBe('duplicate');
    expect(await items()).toHaveLength(0);
    expect(callsOf(GRN_RPC)).toHaveLength(1);
  });
});

describe('P9: a GRN form with the rates footnote (PQ1)', () => {
  it('reachable with nothing unsent and a typed number still takes the queue path, with no p_rates', async () => {
    await bootNewRecords({ scheme: 'free' });
    server.answers[GRN_RPC] = () => grnSaved('G-502');
    const saved = await saving(
      offlineNew().saveNewGrn(grnPayload({ number: 'G-502' }), { numberMode: 'typed', ratesNotOnPhone: true }),
      100
    );
    expect(saved.path).toBe('sent');
    expect(await items()).toHaveLength(1);
    expect(callsOf(GRN_RPC)[0].args).not.toHaveProperty('p_rates');
  });
});

describe('N6: the number box when an own record-lane item is unsent (PQ6)', () => {
  it('reachable with an unsent record, the server issues: pending, and still pending once the older one is sent', async () => {
    const phone = await bootNewRecords();
    expect(offlineNew().numberMode('grn')).toBe('online');
    await phone.offline();
    await offlineNew().saveNewGrn(grnPayload(), { numberMode: 'pending' });
    await phone.online();
    server.answers[GRN_RPC] = () => new Promise(() => undefined);
    expect(offlineNew().numberMode('grn')).toBe('pending');
    expect(offlineNew().numberMode('dispatch')).toBe('pending');
    // the form was opened pending: the mode is kept in the form, so asking again after the send changes nothing for it
    server.answers[GRN_RPC] = () => grnSaved('312');
    await phone.pass();
    expect((await items())[0].state).toBe('sent');
    expect(offlineNew().numberMode('grn')).toBe('online'); // a form opened now is online again; one already open keeps its mode
  });

  it('a lot quick change counts as an unsent record-lane item', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    require('@/features/unsent/lotChangeKind');
    const service = require('@/features/quick-change/lotChangeService');
    await service.saveLotChange({ lotId: 'l06', grnId: 'g-B1', grnNumber: 'B1', customer: 'asha Traders', copy: { rack: 'D-4', package_mark: 'pk-99' }, rack: 'D-5' });
    await phone.online();
    expect(offlineNew().numberMode('grn')).toBe('pending');
  });

  it('a store that types its numbers stays editable, and the number is sent as typed', async () => {
    const phone = await bootNewRecords({ scheme: 'free' });
    await phone.offline();
    await offlineNew().saveNewGrn(grnPayload({ number: 'G-1' }), { numberMode: 'typed' });
    await phone.online();
    expect(offlineNew().numberMode('grn')).toBe('typed');
    await offlineNew().saveNewGrn(grnPayload({ number: 'G-2' }), { numberMode: 'typed' });
    expect(bodyOf((await items())[1]).args).toMatchObject({ p_gr_no: 'G-2', p_issue_number: false });
  });
});
