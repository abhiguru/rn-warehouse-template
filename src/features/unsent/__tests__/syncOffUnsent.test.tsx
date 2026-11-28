/**
 * WH-301 review Medium (Product 2026-11-28; Design 2026-11-28; Dev 94128ab9 and 8d6a1b9b): unsent work queued before the facility's
 * sync feature went off is never stranded. With `capabilities.sync` off and own unsent GRN work on the phone:
 *  - a start, a return to the foreground and a reconnect open the unsent store and send the items, through the real
 *    `PhoneCopyLifecycle`, with no phone copy opened and no feed call made;
 *  - the items are in Unsent items (the store's list), and the account actions are refused (workGate.test.ts G4);
 *  - no NEW unsent work is made: a new GRN is not queued, it is saved directly, as before the offline feature;
 *  - a customer account sends nothing.
 * The bar is tested in syncOffBar.test.tsx.
 *
 * Real: PhoneCopyLifecycle (rendered), the unsent store, queue, engine and kinds, the offline-new save path. Faked at the edge:
 * the server's answers (`server`), NetInfo, AppState, expo-sqlite, files (src/tests/unsent/unsentPhone.ts, newRecordPhone.ts).
 */
import { env, eraseEverything, resetEnv, setForeground, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { fakeDatabaseNames } from '@/tests/phoneCopy/fakeExpoSqlite';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { bootUnsent, NO_NETWORK, server } from '@/tests/unsent/unsentPhone';
import { bootNewRecords, grnPayload, grnSaved } from '@/tests/unsent/newRecordPhone';

const SAVE = 'save_grn';

/**
 * A phone that saved one new GRN while the offline feature was on and offline, then was closed; the facility has since turned the
 * feature off and the phone is opened again (no initUnsent here: the app's lifecycle has to do it). `reachable` is the network at open.
 */
async function reopenedWithFeatureOff(reachable: boolean) {
  const first = await bootNewRecords();
  await first.offline();
  const offlineNew = require('@/features/unsent/offlineNew') as typeof import('@/features/unsent/offlineNew');
  const saved = await offlineNew.saveNewGrn(grnPayload() as never, { numberMode: 'pending' });
  expect(saved.path).toBe('saved');

  server.calls = [];
  env.feed.calls.length = 0;
  await setReachable(reachable);
  const phone = await bootUnsent({ sync: false });
  require('@/features/unsent/newGrnKind');
  require('@/features/unsent/photosKind');
  return phone;
}

function mountLifecycle() {
  jest.doMock('@/store/hooks', () => ({ useAppSelector: () => false, useAppDispatch: () => () => undefined, useAppStore: () => ({}) }));
  jest.doMock('expo-router', () => ({ usePathname: () => '/', router: { push: jest.fn() } }));
  require('@testing-library/react-native/dist/matchers/extend-expect');
  const rtl = require('@testing-library/react-native/pure') as typeof import('@testing-library/react-native/pure');
  const React = require('react') as typeof import('react');
  const { PhoneCopyLifecycle } = require('@/features/phone-copy/components/PhoneCopyLifecycle') as typeof import('@/features/phone-copy/components/PhoneCopyLifecycle');
  return rtl.render(React.createElement(PhoneCopyLifecycle));
}

const settle = (ms = 0) => jest.advanceTimersByTimeAsync(ms);
const itemStates = async (phone: Awaited<ReturnType<typeof bootUnsent>>) => (await phone.queue.listItems()).map(item => item.state);
const saveCalls = () => server.calls.filter(call => call.name === SAVE);
const copyFiles = () => fakeDatabaseNames().filter(name => !name.includes('unsent-work'));

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date('2026-11-28T10:00:00+05:30'),
    doNotFake: ['setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask'],
  });
  resetEnv();
  files.reset();
  server.reset();
  env.subject = 'user-1';
});

afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  await eraseEverything();
});

describe('feature off, own unsent GRN work on the phone', () => {
  it('a start opens the store and sends the item; no phone copy is opened and no feed call is made', async () => {
    server.answers[SAVE] = () => grnSaved('312');
    const phone = await reopenedWithFeatureOff(true);
    const view = await mountLifecycle();
    await settle(100);

    expect(saveCalls()).toHaveLength(1);
    expect(await itemStates(phone)).toEqual(['sent']);
    expect(env.feed.calls).toHaveLength(0);
    expect(copyFiles()).toEqual([]);
    await view.unmount();
  });

  it('while the server cannot be reached the item stays, and shows in the store the Unsent items list reads', async () => {
    const phone = await reopenedWithFeatureOff(false);
    const view = await mountLifecycle();
    await settle(100);

    // The phone has told the app nothing about its network yet, so one send is tried; the server cannot be reached, the item stays.
    expect(await itemStates(phone)).toEqual(['saved']);
    expect(phone.store.getUnsentSummary()).toMatchObject({ count: 1, unreadable: false });
    const { loadUnsentList } = require('@/features/unsent/unsentList') as typeof import('@/features/unsent/unsentList');
    const list = await loadUnsentList();
    expect(list.rows.map(row => [row.section, row.title])).toEqual([['unsent', 'New GRN']]);
    await view.unmount();
  });

  it('coming back to the foreground sends it', async () => {
    server.answers[SAVE] = () => NO_NETWORK;
    const phone = await reopenedWithFeatureOff(true);
    const view = await mountLifecycle();
    await settle(100);
    expect(await itemStates(phone)).toEqual(['saved']);

    server.answers[SAVE] = () => grnSaved('312');
    await setForeground('background');
    await setForeground('active');
    await settle(100);

    expect(await itemStates(phone)).toEqual(['sent']);
    expect(env.feed.calls).toHaveLength(0);
    await view.unmount();
  });

  it('a reconnect sends it', async () => {
    const phone = await reopenedWithFeatureOff(false);
    const view = await mountLifecycle();
    await settle(100);
    expect(await itemStates(phone)).toEqual(['saved']);

    // The network is told down, then back up: the engine hears the change and sends.
    await setReachable(false);
    await settle(100);
    server.answers[SAVE] = () => grnSaved('312');
    await setReachable(true);
    await settle(100);

    expect(await itemStates(phone)).toEqual(['sent']);
    expect(env.feed.calls).toHaveLength(0);
    await view.unmount();
  });
});

describe('feature off: no new unsent work', () => {
  it('a new GRN is not queued: the save goes directly to the server (as without the offline feature), whatever the connection or older items', async () => {
    const phone = await reopenedWithFeatureOff(false);
    const offlineNew = require('@/features/unsent/offlineNew') as typeof import('@/features/unsent/offlineNew');
    // The older item is on the phone and the network is down: with the feature on this would queue the new GRN behind it.
    expect(offlineNew.offlineNewOn()).toBe(false);
    expect(offlineNew.savesByQueue({ numberMode: 'pending', ratesNotOnPhone: true })).toBe(false);
    expect(offlineNew.numberMode('grn')).toBe('online');

    server.answers[SAVE] = () => grnSaved('313');
    const saved = await offlineNew.saveNewGrn(grnPayload({ number: 'A-9' }) as never, { numberMode: 'online', suggestedNumber: 'A-9' });

    expect(saved.path).toBe('direct');
    expect(saveCalls()).toHaveLength(1);
    expect((await phone.queue.listItems()).map(item => item.state)).toEqual(['saved']);
  });

  it('with no connection the direct save fails and nothing is kept on the phone for it', async () => {
    const phone = await reopenedWithFeatureOff(false);
    const offlineNew = require('@/features/unsent/offlineNew') as typeof import('@/features/unsent/offlineNew');
    const saved = await offlineNew.saveNewGrn(grnPayload({ number: 'A-9' }) as never, { numberMode: 'online', suggestedNumber: 'A-9' });

    expect(saved.path).toBe('direct');
    // Only the older item is on the phone: the failed save was not kept as another.
    expect(await phone.queue.listItems()).toHaveLength(1);
  });
});

describe('a customer account', () => {
  it('opens nothing for sending: its unsent items (there are none to make) are never sent', async () => {
    server.answers[SAVE] = () => grnSaved('312');
    const phone = await reopenedWithFeatureOff(true);
    // The person signed in on this phone is a customer account: the engine sends nothing.
    jest.doMock('@/store', () => ({ store: { getState: () => ({ auth: { userProfile: { id: 'profile-c', role: 'customer' } } }) } }));
    const view = await mountLifecycle();
    await settle(100);

    expect(saveCalls()).toHaveLength(0);
    expect(await itemStates(phone)).toEqual(['saved']);
    await view.unmount();
  });
});

// Dev d3045325: the unsent-only bar's "Sending…" flag is session state, registered as 'unsent-sending-flag'. A session change clears
// it and tells the bar; the pass itself (engine.running) is NOT reset, so no second pass can start beside a running one.
describe('the sending flag is session state', () => {
  const waits = { kind: 'testRecord', body: {}, what: 'New GRN', customer: 'asha Traders' };

  async function slowPhone() {
    const phone = await bootUnsent();
    let sends = 0;
    let release: () => void = () => undefined;
    phone.kinds.registerSendKind('testRecord', { lane: 'record', send: () => { sends += 1; return new Promise(resolve => { release = () => resolve({ kind: 'transient' }); }); } });
    await phone.store.initUnsent();
    await phone.queue.enqueue(waits);
    return { phone, sends: () => sends, release: () => release() };
  }
  const engineModule = () => require('@/features/unsent/sendEngine') as typeof import('@/features/unsent/sendEngine');
  const endSession = (phone: Awaited<ReturnType<typeof bootUnsent>>) => phone.phone.registry.runSessionScopedClears({ dispatch: () => undefined } as never);

  it('a session change clears the flag and a subscriber hears it', async () => {
    const { phone, release } = await slowPhone();
    const heard = jest.fn();
    engineModule().subscribeSendingUnsent(heard);
    await settle(10);
    expect(engineModule().isSendingUnsent()).toBe(true); // the pass started by the enqueue is waiting on the server
    heard.mockClear();

    await endSession(phone);

    expect(engineModule().isSendingUnsent()).toBe(false);
    expect(heard).toHaveBeenCalled();
    release();
    await settle(10);
  });

  it('a pass still running across the reset does not let a second pass start', async () => {
    const { phone, sends, release } = await slowPhone();
    await settle(10);
    expect(sends()).toBe(1);

    await endSession(phone);
    const again = phone.engine.sendNow('send-now');
    await settle(10);

    expect(sends()).toBe(1);
    release();
    await again;
  });
});
