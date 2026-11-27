/**
 * WH-161 S3 (product/tech/app-offline-new-records.md sections 6 and 7; updated for WH-381 GRN-only scope):
 *  - S3: a details page open on a GRN's local id moves to the server id once the record is sent
 *    (`useFollowSentRoute`), and nothing moves while it is not sent. Before the next sync brings the server row, the details read
 *    finds the just-sent record by its server id (the pre-sync lookup).
 *
 * Real: src/features/unsent (queue, engine, store, kinds, UnsentMarkers), the overlay and copy reads.
 * Faked at the edge: the server's answers (`server`), expo-sqlite, files, NetInfo, AppState, the signed-in
 * person (newRecordPhone.ts), and the router (its `replace` is what the page calls).
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { server } from '@/tests/unsent/unsentPhone';
import { bootNewRecords, grnPayload, grnSaved, type NewRecordPhone } from '@/tests/unsent/newRecordPhone';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() } }));
jest.mock('@/store/hooks', () => ({
  useAppStore: () => require('@/store').store,
  useAppDispatch: () => require('@/store').store.dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(require('@/store').store.getState()),
}));

const GRN_RPC = 'save_grn';

/** Modules loaded after the phone boots: bootPhone resets the registry, so the renderer and the screens share one React. */
function load() {
  // `pure` registers no matchers; these come from the same fresh registry so toBeOnTheScreen knows this renderer's screen.
  require('@testing-library/react-native/dist/matchers/extend-expect');
  return {
    rtl: require('@testing-library/react-native/pure') as typeof import('@testing-library/react-native/pure'),
    React: require('react') as typeof import('react'),
    markers: require('@/features/unsent/UnsentMarkers') as typeof import('@/features/unsent/UnsentMarkers'),
    offlineNew: require('@/features/unsent/offlineNew') as typeof import('@/features/unsent/offlineNew'),
    store: require('@/features/unsent/unsentStore') as typeof import('@/features/unsent/unsentStore'),
    replace: (require('expo-router') as { router: { replace: jest.Mock } }).router.replace,
  };
}
type Loaded = ReturnType<typeof load>;

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

async function saveOfflineGrn(phone: NewRecordPhone, m: Loaded): Promise<string> {
  await phone.offline();
  const saved = await m.offlineNew.saveNewGrn(grnPayload() as never, { numberMode: 'pending' });
  expect(saved.path).toBe('saved');
  await m.store.refreshUnsent();
  const row = m.store.loadedUnsentRows().find(r => r.kind === 'newGrn')!;
  return (JSON.parse(row.body) as { localId: string }).localId;
}

async function sendAll(phone: NewRecordPhone, m: Loaded) {
  await phone.online();
  await m.rtl.act(async () => {
    await phone.pass(1_000);
    await m.store.refreshUnsent();
  });
}

describe('S3: an open details page follows the record to its server id', () => {
  it('grn: stays on the local id while unsent, replaces the route with the server id once sent', async () => {
    const phone = await bootNewRecords();
    const m = load();
    const localId = await saveOfflineGrn(phone, m);
    function DetailsPage({ id }: { id: string }) {
      m.markers.useFollowSentRoute('grn', id);
      return null;
    }

    const page = await m.rtl.render(m.React.createElement(DetailsPage, { id: localId }));
    expect(m.replace).not.toHaveBeenCalled();

    server.answers[GRN_RPC] = () => grnSaved('312');
    await sendAll(phone, m);

    expect(m.replace).toHaveBeenCalledTimes(1);
    expect(m.replace).toHaveBeenCalledWith('/grn-details/grn-server-1');
    await page.unmount();
  });

  it('a page already on the server id does not move again', async () => {
    const phone = await bootNewRecords();
    const m = load();
    await saveOfflineGrn(phone, m);
    server.answers[GRN_RPC] = () => grnSaved('312');
    await sendAll(phone, m);
    function DetailsPage({ id }: { id: string }) {
      m.markers.useFollowSentRoute('grn', id);
      return null;
    }
    const page = await m.rtl.render(m.React.createElement(DetailsPage, { id: 'grn-server-1' }));
    expect(m.replace).not.toHaveBeenCalled();
    await page.unmount();
  });

  it('the server id is found from the sent item when the overlay no longer lists the record', async () => {
    const phone = await bootNewRecords();
    const m = load();
    const localId = await saveOfflineGrn(phone, m);
    expect(m.markers.sentServerIdOf('grn', localId, { newDocuments: () => [] } as never)).toBeNull();
    server.answers[GRN_RPC] = () => grnSaved('312');
    await sendAll(phone, m);
    expect(m.markers.sentServerIdOf('grn', localId, { newDocuments: () => [] } as never)).toBe('grn-server-1');
  });

  it('pre-sync lookup: before the next sync, GRN details read on the server id answer from the just-sent record', async () => {
    await bootNewRecords();
    const m = load();
    const { readCopyOnly } = require('@/features/phone-copy/readRoute') as typeof import('@/features/phone-copy/readRoute');
    const { readGrnDetails } = require('@/features/phone-copy/reads/grnDetails') as typeof import('@/features/phone-copy/reads/grnDetails');
    const before = await readCopyOnly(q => readGrnDetails(q, 'grn-server-1'));
    expect(before.kind === 'answer' && before.answer.value).toEqual({ kind: 'not-found' });

    // Reachable, a pending number: the GRN goes by the queue and is sent within the wait (P4). The sync that the send starts
    // does not end yet (the feed does not answer), so the server row is not on the phone: the moment of the pre-sync lookup.
    jest.setSystemTime(Date.now() + 60_000);
    env.feed.rpc = () => new Promise(() => undefined);
    server.answers[GRN_RPC] = () => grnSaved('312');
    const saving = m.offlineNew.saveNewGrn(grnPayload() as never, { numberMode: 'pending' });
    await jest.advanceTimersByTimeAsync(100);
    expect((await saving).path).toBe('sent');

    const after = await readCopyOnly(q => readGrnDetails(q, 'grn-server-1'));
    expect(after.kind).toBe('answer');
    const found = after.kind === 'answer' ? after.answer.value : null;
    expect(found).toMatchObject({ kind: 'found', grn: { id: 'grn-server-1', gr_no: '312' } });
  });
});
