/**
 * WH-161 S3 and S10 (product/tech/app-offline-new-records.md sections 6 and 7, PQ5).
 *  - S3: a details page open on a GRN or dispatch's local id moves to the server id once the record is sent
 *    (`useFollowSentRoute`), and nothing moves while it is not sent. Before the next sync brings the server row, the details read
 *    finds the just-sent record by its server id (the pre-sync lookup).
 *  - S10: a sent dispatch whose answer changed open orders shows "Orders changed:" and one line per affected order line, on its
 *    "Sent today" row of Unsent items and under the hero of Dispatch details (`dispatch-details-order-notes`); nothing when the
 *    answer changed no order.
 *
 * Real: src/features/unsent (queue, engine, store, kinds, UnsentMarkers, UnsentRow, unsentList), the overlay and copy reads, the
 * order-effects wording. Faked at the edge: the server's answers (`server`), expo-sqlite, files, NetInfo, AppState, the signed-in
 * person (newRecordPhone.ts), and the router (its `replace` is what the page calls).
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { server } from '@/tests/unsent/unsentPhone';
import { bootNewRecords, dispatchPayload, dispatchSaved, grnPayload, grnSaved, type NewRecordPhone } from '@/tests/unsent/newRecordPhone';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() } }));
jest.mock('@/store/hooks', () => ({
  useAppStore: () => require('@/store').store,
  useAppDispatch: () => require('@/store').store.dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(require('@/store').store.getState()),
}));

const GRN_RPC = 'save_grn';
const DISPATCH_RPC = 'create_dispatch_with_stock_check';
/** One order line the dispatch reduced (fictional), as `order_effects` carries it. */
const REDUCED = {
  change: 'reduced',
  customer_id: 'c1',
  customer_name: 'asha Traders',
  order_id: 'order-5',
  order_no: 'O-5',
  order_item_id: 'oi-1',
  grn_item_id: 'l06',
  item_name: 'Peas',
  grn_no: 'G-12',
  packaging: 'Bag',
  old_quantity: 10,
  new_quantity: 6,
};

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

async function saveOffline(phone: NewRecordPhone, m: Loaded, kind: 'grn' | 'dispatch'): Promise<string> {
  await phone.offline();
  const saved = kind === 'grn'
    ? await m.offlineNew.saveNewGrn(grnPayload() as never, { numberMode: 'pending' })
    : await m.offlineNew.saveNewDispatch(dispatchPayload() as never, { numberMode: 'pending' });
  expect(saved.path).toBe('saved');
  await m.store.refreshUnsent();
  const row = m.store.loadedUnsentRows().find(r => r.kind === (kind === 'grn' ? 'newGrn' : 'newDispatch'))!;
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
  it.each([
    ['grn', GRN_RPC, grnSaved('312'), '/grn-details/grn-server-1'],
    ['dispatch', DISPATCH_RPC, dispatchSaved('77'), '/dispatch-details/disp-server-1'],
  ] as const)('%s: stays on the local id while unsent, replaces the route with the server id once sent', async (kind, rpc, answer, route) => {
    const phone = await bootNewRecords();
    const m = load();
    const localId = await saveOffline(phone, m, kind);
    function DetailsPage({ id }: { id: string }) {
      m.markers.useFollowSentRoute(kind, id);
      return null;
    }

    const page = await m.rtl.render(m.React.createElement(DetailsPage, { id: localId }));
    expect(m.replace).not.toHaveBeenCalled();

    server.answers[rpc] = () => answer;
    await sendAll(phone, m);

    expect(m.replace).toHaveBeenCalledTimes(1);
    expect(m.replace).toHaveBeenCalledWith(route);
    await page.unmount();
  });

  it('a page already on the server id does not move again', async () => {
    const phone = await bootNewRecords();
    const m = load();
    await saveOffline(phone, m, 'grn');
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
    const localId = await saveOffline(phone, m, 'grn');
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

describe('S10: order notes of a sent dispatch', () => {
  async function sentDispatch(effects: unknown[]) {
    const phone = await bootNewRecords();
    const m = load();
    const localId = await saveOffline(phone, m, 'dispatch');
    server.answers[DISPATCH_RPC] = () => dispatchSaved('77', effects);
    await sendAll(phone, m);
    return { m, localId };
  }

  it('Dispatch details shows "Orders changed:" and the affected line, by its server id and by its local id', async () => {
    const { m, localId } = await sentDispatch([REDUCED]);
    for (const id of ['disp-server-1', localId]) {
      const view = await m.rtl.render(m.React.createElement(m.markers.DispatchSentOrderNotes, { id }));
      const notes = m.rtl.screen.getByTestId('dispatch-details-order-notes');
      expect(notes).toHaveTextContent(/^Orders changed:\s*• asha Traders' order: Peas \(G-12\)/);
      expect(notes).toHaveTextContent(/10 → 6/);
      await view.unmount();
    }
  });

  it('Dispatch details shows nothing for a sent dispatch that changed no order, or another dispatch', async () => {
    const { m } = await sentDispatch([]);
    const view = await m.rtl.render(m.React.createElement(m.markers.DispatchSentOrderNotes, { id: 'disp-server-1' }));
    expect(m.rtl.screen.queryByTestId('dispatch-details-order-notes')).not.toBeOnTheScreen();
    await view.unmount();
  });

  it('a different dispatch\'s page shows none of these notes', async () => {
    const { m } = await sentDispatch([REDUCED]);
    const view = await m.rtl.render(m.React.createElement(m.markers.DispatchSentOrderNotes, { id: 'disp-other-9' }));
    expect(m.rtl.screen.queryByTestId('dispatch-details-order-notes')).not.toBeOnTheScreen();
    await view.unmount();
  });

  it('Unsent items, Sent today: the dispatch row shows the notes and speaks them in its label', async () => {
    const { m } = await sentDispatch([REDUCED]);
    const { loadUnsentList } = require('@/features/unsent/unsentList') as typeof import('@/features/unsent/unsentList');
    const { UnsentRow } = require('@/features/unsent/UnsentRow') as typeof import('@/features/unsent/UnsentRow');
    const list = await loadUnsentList();
    const row = list.rows.find(r => r.section === 'sent')!;
    expect(row.target).toMatchObject({ dispatchId: 'disp-server-1' });

    const view = await m.rtl.render(m.React.createElement(UnsentRow, { row, divider: false, onOpen: jest.fn(), onDelete: jest.fn() }));
    const notes = m.rtl.screen.getByTestId(`unsent-row-order-notes-${row.id}`);
    expect(notes).toHaveTextContent(/^Orders changed:\s*• asha Traders' order: Peas \(G-12\)/);
    expect(m.rtl.screen.getByRole('button', { name: /Sent · Dispatch 77, Orders changed:\s+• asha Traders' order: Peas \(G-12\) 10 → 6 bags$/ })).toBeOnTheScreen();
    await view.unmount();
  });

  it('Unsent items, Sent today: a dispatch that changed no order has no notes line', async () => {
    const { m } = await sentDispatch([]);
    const { loadUnsentList } = require('@/features/unsent/unsentList') as typeof import('@/features/unsent/unsentList');
    const { UnsentRow } = require('@/features/unsent/UnsentRow') as typeof import('@/features/unsent/UnsentRow');
    const row = (await loadUnsentList()).rows.find(r => r.section === 'sent')!;
    const view = await m.rtl.render(m.React.createElement(UnsentRow, { row, divider: false, onOpen: jest.fn(), onDelete: jest.fn() }));
    expect(m.rtl.screen.queryByTestId(`unsent-row-order-notes-${row.id}`)).not.toBeOnTheScreen();
    expect(m.rtl.screen.queryByText(/Orders changed/)).not.toBeOnTheScreen();
    await view.unmount();
  });
});
