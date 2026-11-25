/**
 * WH-298, spec A step 3 and the card's "Sync" and "Current" (contract 6.1, 6.3, 6.6, 7.1; T34, T35, T36, T38, T39): after
 * the first load the phone fetches changes on opening, on coming to the foreground, on reconnecting and about every minute
 * while the server is reachable; never while the app is in the background; one run at a time; a failed run is retried with
 * a growing wait; "current" means a full sync within the last minute and the server reachable.
 *
 * Real: `PhoneCopyLifecycle` (rendered), the engine, the store, `useIsOffline`. Faked at the edge: the server's answers,
 * the phone's connectivity (NetInfo events), the app's foreground (AppState events) and the device clock (fake timers).
 *
 * ===== AGREE WITH DEVELOPMENT (names the contract gives; the open points are marked) =====
 *  - `@/features/phone-copy/components/PhoneCopyLifecycle`: default or named export `PhoneCopyLifecycle`, no props; it renders
 *    nothing; it needs no Redux Provider here and starts when `capabilities.sync` is true for a signed-in session (the test
 *    sets the capability with `setFacilityCapabilities` and a session scope with `getSessionIdentity`). If the build also reads
 *    the signed-in role from the store, give the lifecycle's input in this test the same way as src/tests/navigation does.
 *  - Interval: 45 s after each full sync. Backoff after a failed run while reachable: 5 s, 15 s, 30 s, then every 60 s.
 *  - `getSyncSnapshot().current`, `.asOf` (ISO string of the server's `as_of`).
 * ===========================================================================================
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { env, resetEnv, setForeground, setReachable, controlAppState } from '../tests/phoneEnv';
import { defaultV, grnRow, hex } from '../tests/fakeFeed';
import { setFacilityCapabilities, resetFacilityCapabilities } from '@/config/facilityCapabilities';
import * as engine from '@/features/phone-copy/syncEngine';
import * as syncStore from '@/features/phone-copy/syncStore';
import * as copyDb from '@/features/phone-copy/copyDb';
import { PhoneCopyLifecycle } from '@/features/phone-copy/components/PhoneCopyLifecycle';

jest.mock('expo-sqlite', () => require('../tests/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('../tests/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('../tests/phoneEnv').mockFactories.fileSystem());
jest.mock('@/config/supabaseConfig', () => require('../tests/phoneEnv').mockFactories.supabase());
jest.mock('@react-native-community/netinfo', () => require('../tests/phoneEnv').mockFactories.netinfo());
jest.mock('@/config/lanTransport', () => require('../tests/phoneEnv').mockFactories.lan());

const server = { origin: 'https://warehouse.example.test', instanceId: 'instance-a' };
const changeCalls = () => env.feed.named('get_sync_changes').length;
const settle = (ms = 0) => jest.advanceTimersByTimeAsync(ms);
const page = (position: string, asOf: string, changes: never[] = [], more = false) =>
  ({ position, as_of: asOf, more, reload_all: null, reload: [], changes }) as never;

beforeEach(async () => {
  jest.useFakeTimers({ now: Date.parse('2026-11-25T07:00:00Z') });
  resetEnv();
  controlAppState();
  resetFacilityCapabilities();
  setFacilityCapabilities(server as never, { sync: true });
  env.feed.rows.goodsreceived.push(grnRow('g1'));
});
afterEach(async () => {
  await engine.stopPhoneCopy();
  await copyDb.eraseCopy();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** A phone with a finished first load; the schedule not running yet. */
async function loadedPhone() {
  await engine.startPhoneCopy();
  expect(await engine.syncNow('open')).toBe('done');
  await engine.stopPhoneCopy();
  env.feed.calls.length = 0;
}
async function mountLifecycle() {
  const view = await render(<PhoneCopyLifecycle />);
  await settle();
  return view;
}

describe('T34: when the phone fetches changes', () => {
  it('on opening: a phone with no copy runs the first load', async () => {
    await mountLifecycle();
    await settle(50);
    expect(env.feed.named('get_sync_start')).toHaveLength(1);
    expect(syncStore.getSyncSnapshot().phase).toBe('ready');
  });

  it('on opening: a phone with a copy fetches changes once', async () => {
    await loadedPhone();
    await mountLifecycle();
    expect(changeCalls()).toBe(1);
    expect(env.feed.named('get_sync_start')).toHaveLength(0);
  });

  it('about every minute while the server is reachable: 45 s after each full sync', async () => {
    await loadedPhone();
    await mountLifecycle();
    const afterOpen = changeCalls();
    await settle(44_000);
    expect(changeCalls()).toBe(afterOpen);
    await settle(2_000);
    expect(changeCalls()).toBe(afterOpen + 1);
    await settle(45_000);
    expect(changeCalls()).toBe(afterOpen + 2);
  });

  it('not while the server is unreachable: no tick, and nothing is shown as failed', async () => {
    await loadedPhone();
    await mountLifecycle();
    await setReachable(false);
    await settle();
    const before = changeCalls();
    await settle(5 * 60_000);
    expect(changeCalls()).toBe(before);
    expect(syncStore.getSyncSnapshot().lastRunFailed).toBe(false);
  });

  it('on reconnecting: one sync at once, and the ticks go on', async () => {
    await loadedPhone();
    await mountLifecycle();
    await setReachable(false);
    await settle(3 * 60_000);
    const before = changeCalls();
    await setReachable(true);
    await settle();
    expect(changeCalls()).toBe(before + 1);
    await settle(46_000);
    expect(changeCalls()).toBe(before + 2);
  });

  it('coming back to the foreground is "opening the app": one sync at once', async () => {
    await loadedPhone();
    await mountLifecycle();
    await setForeground('background');
    await settle(10 * 60_000);
    const before = changeCalls();
    await setForeground('active');
    await settle();
    expect(changeCalls()).toBe(before + 1);
  });

  it('never in the background: no tick goes out, and a reconnection in the background starts nothing', async () => {
    await loadedPhone();
    await mountLifecycle();
    await setForeground('background');
    await settle();
    const before = changeCalls();
    await settle(10 * 60_000);
    await setReachable(false);
    await setReachable(true);
    await settle(10 * 60_000);
    expect(changeCalls()).toBe(before);
  });

  it('a request in flight when the app goes to the background is dropped: its answer is not applied and its position not stored', async () => {
    await loadedPhone();
    const gate = env.feed.hold(c => c.name === 'get_sync_changes');
    env.feed.changeAnswers.push({
      position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [],
      changes: [{ e: 'goodsreceived', id: 'g1', op: 'upsert', v: hex('v-late'), row: { id: 'g1', gr_no: 'G-late' } }],
    });
    await mountLifecycle();
    await gate.opened;
    await setForeground('background');
    gate.release();
    await settle(100);
    const db = await copyDb.openCopy(JSON.stringify([server.origin, server.instanceId, 'user-1']));
    expect(await db.all("SELECT v FROM goodsreceived WHERE id = 'g1'")).toEqual([{ v: defaultV('g1') }]);
    expect(await db.all("SELECT v FROM meta WHERE k = 'position'")).toEqual([{ v: env.feed.startPosition }]);
    expect(syncStore.getSyncSnapshot().running).toBeNull();
  });

  it('unmounting stops the schedule and its listeners', async () => {
    await loadedPhone();
    const view = await mountLifecycle();
    await view.unmount();
    const before = changeCalls();
    await settle(5 * 60_000);
    await setReachable(false);
    await setReachable(true);
    await setForeground('background');
    await setForeground('active');
    await settle();
    expect(changeCalls()).toBe(before);
    expect(env.netListeners).toHaveLength(0);
    expect(env.appListeners).toHaveLength(0);
  });
});

describe('T35: one run at a time', () => {
  it('a second syncNow during a run answers busy-queued and yields one more run after it, never two in parallel', async () => {
    await loadedPhone();
    await engine.startPhoneCopy();
    let running = 0; let most = 0;
    const original = env.feed.rpc;
    env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
      if (name === 'get_sync_changes') { running += 1; most = Math.max(most, running); }
      try { return await original(name, args); } finally { if (name === 'get_sync_changes') running -= 1; }
    };
    const gate = env.feed.hold(c => c.name === 'get_sync_changes' && env.feed.named('get_sync_changes').length === 1);
    const first = engine.syncNow('pull-to-refresh');
    await gate.opened;
    expect(await engine.syncNow('after-send')).toBe('busy-queued');
    expect(await engine.syncNow('interval')).toBe('busy-queued');
    gate.release();
    expect(await first).toBe('done');
    await settle(50);
    expect(changeCalls()).toBe(2);              // the run, and exactly one more for the two queued asks
    expect(most).toBe(1);
  });

  it('"Try again" while a run is going does nothing', async () => {
    await loadedPhone();
    await engine.startPhoneCopy();
    const gate = env.feed.hold(c => c.name === 'get_sync_changes');
    const first = engine.syncNow('pull-to-refresh');
    await gate.opened;
    await engine.syncNow('retry');
    gate.release();
    await first;
    await settle(50);
    expect(changeCalls()).toBe(1);
  });
});

describe('T36: after a failed run', () => {
  it('retries after 5 s, 15 s, 30 s, then every 60 s; a success resets the wait', async () => {
    await loadedPhone();
    env.feed.failWhen = c => c.name === 'get_sync_changes';
    await mountLifecycle();
    expect(changeCalls()).toBe(1);
    const waits = [5, 15, 30, 60, 60];
    let expected = 1;
    for (const wait of waits) {
      await settle(wait * 1000 - 500);
      expect(changeCalls()).toBe(expected);
      await settle(1000);
      expected += 1;
      expect(changeCalls()).toBe(expected);
    }
    env.feed.failWhen = null;
    await settle(60_500);
    expect(syncStore.getSyncSnapshot().lastRunFailed).toBe(false);
    const afterSuccess = changeCalls();
    env.feed.failWhen = c => c.name === 'get_sync_changes';
    await settle(46_000);                       // the interval after the success fails once...
    expect(changeCalls()).toBe(afterSuccess + 1);
    await settle(5_500);                        // ...and the wait started again from 5 s
    expect(changeCalls()).toBe(afterSuccess + 2);
  });

  it('a reconnection retries at once, whatever the wait', async () => {
    await loadedPhone();
    env.feed.failWhen = c => c.name === 'get_sync_changes';
    await mountLifecycle();
    await settle(20_000);
    await setReachable(false);
    await setReachable(true);
    const before = changeCalls();
    await settle();
    expect(changeCalls()).toBeGreaterThanOrEqual(before);
    env.feed.failWhen = null;
    await setReachable(false);
    await setReachable(true);
    await settle();
    expect(syncStore.getSyncSnapshot().lastRunFailed).toBe(false);
  });
});

describe('T38, T39: "current" and the time shown', () => {
  it('is true right after a full sync while reachable, and the time is the server\'s as_of', async () => {
    await loadedPhone();
    env.feed.changeAnswers.push(page('1048700', '2026-11-25T05:30:00.000+00:00'));
    await engine.startPhoneCopy();
    await engine.syncNow('pull-to-refresh');
    expect(syncStore.getSyncSnapshot()).toMatchObject({ current: true, asOf: '2026-11-25T05:30:00.000+00:00' });
  });

  it('T39: the time is the as_of of the last stored page, never the phone\'s clock (the phone\'s clock is hours later)', async () => {
    await loadedPhone();
    await engine.startPhoneCopy();
    await engine.syncNow('pull-to-refresh');
    jest.setSystemTime(Date.parse('2026-12-31T00:00:00Z'));
    expect(syncStore.getSyncSnapshot().asOf).toBe(env.feed.asOf);
  });

  it('is false 60 s after the last full sync when no new one finished, without anything else happening', async () => {
    await loadedPhone();
    await engine.startPhoneCopy();
    await engine.syncNow('open');
    expect(syncStore.getSyncSnapshot().current).toBe(true);
    await settle(59_000);
    expect(syncStore.getSyncSnapshot().current).toBe(true);
    await settle(2_000);
    expect(syncStore.getSyncSnapshot().current).toBe(false);
  });

  it('is false at once when the connection is lost', async () => {
    await loadedPhone();
    await mountLifecycle();
    expect(syncStore.getSyncSnapshot().current).toBe(true);
    await setReachable(false);
    await settle();
    expect(syncStore.getSyncSnapshot().current).toBe(false);
  });

  it('is false after a cold start until a full sync ends, even though the copy is on the phone', async () => {
    await loadedPhone();
    const gate = env.feed.hold(c => c.name === 'get_sync_changes');
    await mountLifecycle();
    await gate.opened;
    expect(syncStore.getSyncSnapshot()).toMatchObject({ phase: 'ready', current: false, running: 'changes' });
    gate.release();
    await settle(50);
    expect(syncStore.getSyncSnapshot().current).toBe(true);
  });
});

