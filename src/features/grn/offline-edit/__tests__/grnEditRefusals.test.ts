/**
 * WH-303: what a refused item keeps, and a refused photo removal.
 *  - A refused item keeps the server's whole answer (its figures, such as how many have left the lot), so the wait alert and
 *    the holding list can show them.
 *  - A refused photo removal (the server answered and said no) is held and not tried again; a removal that failed because the
 *    network failed is tried again.
 * Real: src/features/unsent (queue, engine, kinds), the GRN edit kind, the photo kind, imageDeletion. Faked at the edge: the
 * server's answers to the RPCs, expo-sqlite, files, NetInfo, AppState (src/tests/unsent/unsentPhone.ts).
 */
import { eraseEverything, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { addPhoto, bootUnsent, rawRows, server, type RpcAnswer } from '@/tests/unsent/unsentPhone';

const RPC = 'apply_grn_changes';
const GRN = 'g-B1';
const META = { grnNumber: 'B1', customer: 'asha Traders' };
const rackBody = {
  v: 1, grnId: GRN, loadedAt: '2026-11-25T10:00:00+00:00', recordedAt: '2026-11-27T09:00:00.000Z', lots: { l06: { rack: { from: 'D-4', to: 'C-2' } } },
};
const belowDispatched = (): RpcAnswer => ({
  data: { success: false, reason: 'QTY_BELOW_DISPATCHED', code: 'QTY_BELOW_DISPATCHED', error: 'Quantity below dispatched', message: 'Quantity below dispatched', dispatched: 41, requested: 30, lot_id: 'l06' },
  error: null,
});

type Phone = Awaited<ReturnType<typeof bootUnsent>>;
type Kind = {
  saveGrnEditOffline(grnId: string, body: unknown, photos: unknown[], meta: Record<string, unknown>): Promise<{ id: string }>;
  saveGrnEditAndWait(grnId: string, body: unknown, photos: unknown[], meta: Record<string, unknown>): Promise<{ outcome: string; answer?: Record<string, unknown> }>;
};
let kind: Kind;
async function start(): Promise<Phone> {
  const phone = await bootUnsent();
  kind = require('@/features/grn/offline-edit/grnEditKind');
  await phone.store.initUnsent();
  return phone;
}
async function pass(phone: Phone, ms = 60_000) {
  const done = phone.engine.sendNow('send-now');
  await jest.advanceTimersByTimeAsync(ms);
  await done;
}
const items = () => rawRows<{ id: string; kind: string; state: string; last_error: string | null; result: string | null }>('items', 'ORDER BY seq');
const deleteCalls = () => server.calls.filter(c => c.name === 'delete_grn_image');

beforeEach(() => { jest.useFakeTimers({ now: new Date('2026-11-27T09:00:00+05:30') }); resetEnv(); files.reset(); server.reset(); });
afterEach(async () => { jest.useRealTimers(); await eraseEverything(); });

describe('a refused item keeps the server\'s whole answer', () => {
  it('after the wait: the held item has the figures and the code in its result', async () => {
    const phone = await start();
    await setReachable(true);
    let release: (answer: RpcAnswer) => void = () => undefined;
    server.answers[RPC] = () => new Promise<RpcAnswer>(resolve => { release = resolve; });
    const run = kind.saveGrnEditAndWait(GRN, rackBody, [], META);
    await jest.advanceTimersByTimeAsync(8_500);
    expect((await run).outcome).toBe('later');
    release(belowDispatched());
    await jest.advanceTimersByTimeAsync(1_000);
    const [row] = await items();
    expect(row.state).toBe('refused');
    expect(JSON.parse(row.result as string)).toMatchObject({ code: 'QTY_BELOW_DISPATCHED', answer: { dispatched: 41, requested: 30, lot_id: 'l06' } });
  });

  it('during the wait: the answer handed to the screen has the figures', async () => {
    const phone = await start();
    await setReachable(true);
    server.answers[RPC] = belowDispatched;
    const run = kind.saveGrnEditAndWait(GRN, rackBody, [], META);
    await jest.advanceTimersByTimeAsync(1_000);
    const out = await run;
    expect(out.outcome).toBe('refused');
    expect(out.answer).toMatchObject({ success: false, code: 'QTY_BELOW_DISPATCHED', dispatched: 41, requested: 30 });
    expect(phone.store.getUnsentSummary().count).toBe(0);
  });
});

describe('a photo the person removed in an offline edit (the photos kind, sent as the engine sends it)', () => {
  // The kind is what the engine calls; it decides between "held" (refused) and "tried again" (transient).
  const send = async (): Promise<{ kind: string; reason?: string; code?: string }> => {
    await start();
    await setReachable(true);
    const photos = (require('@/features/unsent/sendKinds') as typeof import('@/features/unsent/sendKinds')).getSendKind('photos');
    return (photos as unknown as { send(body: unknown, ctx: unknown): Promise<{ kind: string; reason?: string; code?: string }> })
      .send({ doc: 'grn', recordId: GRN, remove: ['ph-1'] }, { itemId: 'no-such-item', requestKey: 'warehouse-photos-k', resolved: {} });
  };

  it('asks the server to delete the photo by its id', async () => {
    server.answers.delete_grn_image = () => ({ data: { success: true, data: { storage_path: null } }, error: null });
    await send();
    expect(deleteCalls().map(c => c.args)).toEqual([{ p_image_id: 'ph-1' }]);
  });

  it('is held when the server refuses it (the last photo of a GRN stays): refused, with the code', async () => {
    server.answers.delete_grn_image = () => ({ data: { success: false, reason: 'GRN_PHOTO_REQUIRED' }, error: null });
    expect(await send()).toMatchObject({ kind: 'refused', code: 'GRN_PHOTO_REQUIRED' });
  });

  it('is held on a 4xx answer that is not a session or rate-limit one', async () => {
    server.answers.delete_grn_image = () => ({ data: null, error: { message: 'Forbidden', status: 403 } });
    expect((await send()).kind).toBe('refused');
  });

  it.each([
    ['the network failed', { data: null, error: { message: 'No internet connection', code: 'NETWORK' } }],
    ['the server timed out', { data: null, error: { message: 'Gateway Timeout', status: 504 } }],
    ['the session ended (401)', { data: null, error: { message: 'JWT expired', status: 401 } }],
    ['the server asked to slow down (429)', { data: null, error: { message: 'Too many requests', status: 429 } }],
  ])('is tried again, not held, when %s', async (_name, reply) => {
    server.answers.delete_grn_image = () => reply;
    expect((await send()).kind).toBe('transient');
  });
});
