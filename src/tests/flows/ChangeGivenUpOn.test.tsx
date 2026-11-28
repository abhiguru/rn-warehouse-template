/**
 * WH-359: a rate or sensor change that a screen gives up on (30 seconds from its start) is aborted at that moment and is
 * never applied later, also when it waited in the app behind the role re-read and was released late. When its answer is
 * lost, the server is asked what became of it before anything is said: applied counts as saved; not applied, or not
 * answerable, shows the neutral "couldn't confirm" title, and a refusal keeps today's title.
 *
 * Real: the rate and sensor services, the supabase client and its gated fetch (the write hold, `roleRecheck`), the
 * session restore and the app's store, `useRateActions` and the Edit sensor screen. Faked: the network (`fetch`, a
 * facility server that applies a change only if its request was not aborted, on top of
 * src/tests/helpers/offlineRoleServer.ts), the clock, native modules, the router, the alert and toast presenters, the
 * confirmation dialog, and the screen's sensor query.
 */
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
jest.mock('@/config/sentryConfig', () => ({
  setSentryUser: jest.fn(), clearSentryUser: jest.fn(), captureException: jest.fn(), captureMessage: jest.fn(), addBreadcrumb: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    addEventListener: jest.fn(() => () => {}),
    fetch: jest.fn(async () => ({ type: 'wifi', isConnected: true, isInternetReachable: true, details: null })),
    refresh: jest.fn(async () => ({})),
  },
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 's7' }),
}));
jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 0 }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/ConfirmDialog', () => {
  const { Pressable, Text } = require('react-native');
  // The dialog's confirm button, as the person presses it.
  return {
    ConfirmDialog: ({ visible, confirmText, onConfirm }: { visible: boolean; confirmText: string; onConfirm: () => void }) =>
      visible ? <Pressable accessibilityRole="button" onPress={onConfirm}><Text>{confirmText}</Text></Pressable> : null,
  };
});
jest.mock('@/features/item-pricing/contract', () => ({ notifyRatesChanged: jest.fn(), stopPath: jest.fn() }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));
jest.mock('@/features/sensors/sensorQueries', () => ({ invalidateSensorQueries: jest.fn() }));
jest.mock('@/features/sensors/useSensorQueries', () => ({
  useSensorDevice: () => ({
    data: { device: { id: 's7', device_name: 'Ripening room probe', mac_address: '', location: 'Chamber 7', active: true, staleness_threshold_minutes: 30, min_temperature: 2, max_temperature: 8 } },
    loading: false, error: null, retry: jest.fn(),
  }),
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

import '@/tests/helpers/fakeTimersFirst';
import React from 'react';
import { act, render, renderHook, screen, userEvent } from '@testing-library/react-native';
import SensorEditScreen from '../../../app/sensor-edit/[id]';
import { useRateActions, type RateScope } from '@/features/item-pricing/useRateActions';
import { initializeAuth, logout } from '@/store/slices/authSlice';
import { store } from '@/store';
import { replaceItemRates, setStandardRate, undoRateChange } from '@/services/item-pricing-service';
import { updateDevice } from '@/services/sensor-service';
import { t } from '@/i18n';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { router } from 'expo-router';
import {
  ASHA, deferred, json, leavePhone, server, signedInPhone, startWithNoConnection,
} from '@/tests/helpers/offlineRoleServer';

const flush = async () => {
  for (let i = 0; i < 20; i++) await jest.advanceTimersByTimeAsync(0);
};
const wait = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 20; i++) await jest.advanceTimersByTimeAsync(0);
  });
};

// ---- the facility's server for the changes -------------------------------------------------------------------------
type Call = { name: string; signal: AbortSignal | null | undefined };
type Answer = 'hang' | (() => Response);
const facility = {
  /** How each function answers; a function not listed gets the shared server's answer. */
  answers: new Map<string, Answer>(),
  calls: [] as Call[],
  /** Changes the server has applied: a request it received and that was not aborted when it was let through. */
  applied: [] as string[],
  held: [] as (() => void)[],
};
const abortError = () => Object.assign(new Error('Aborted'), { name: 'AbortError' });
let sharedFetch: typeof fetch;

const facilityFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(typeof input === 'object' && 'url' in input ? input.url : input));
  const name = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname)?.[1];
  const answer = name ? facility.answers.get(name) : undefined;
  if (!name || answer === undefined) return sharedFetch(input, init);
  facility.calls.push({ name, signal: init?.signal });
  if (answer !== 'hang') return answer();
  return new Promise<Response>((resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(abortError()), { once: true });
    facility.held.push(() => {
      if (init?.signal?.aborted) return;
      facility.applied.push(name);
      resolve(json({ success: true, data: {} }));
    });
  });
}) as typeof fetch;
const callsTo = (name: string) => facility.calls.filter(call => call.name === name);
/** The server finishes the changes it holds, as a slow database does after the phone has given up. */
const finishHeldChanges = async () => {
  await act(async () => { facility.held.splice(0).forEach(finish => finish()); });
  await flush();
};
const rows = (list: object[]) => () =>
  json({ success: true, data: list, pagination: { total_count: list.length, total: list.length, limit: 200, offset: 0, has_more: false } });
const rate = (id: string, from: string, to: string | null) => ({
  id, item_id: 'item-1', item_name: 'Potatoes', customer_id: null, customer_name: null, price_type: 'monthly', unit_price: 10,
  weight_min: 0, weight_max: 100, labour_rate: 0, tax_percent: 0, effective_from: from, effective_to: to, created_at: '2026-01-01', created_by: 'u',
});
const device = (over: object = {}) => ({
  id: 's7', device_name: 'Chamber 7 probe', mac_address: '', location: 'Chamber 7', active: true, staleness_threshold_minutes: 30,
  first_reading_at: null, hub: null, ...over,
});
const sensorRead = (over?: object) => () => json({ success: true, data: device(over) });

const undoInput = { itemId: 'item-1', customerId: null, priceType: 'monthly' as const, startsOn: '2027-01-01' };
const sensorUpdate = { deviceId: 's7', name: 'Chamber 7 probe', location: 'Chamber 7', stalenessMinutes: 30 };
const replaceInput = {
  item_id: 'item-1', customer_id: null, price_type: 'monthly' as const, tiers: [{ weight_min: 0, weight_max: 100, unit_price: 12, labour_rate: 0, tax_percent: 0 }],
  effective_from: '2027-01-01',
} as unknown as Parameters<typeof replaceItemRates>[0];

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  facility.answers.clear();
  facility.calls = [];
  facility.applied = [];
  facility.held = [];
  await signedInPhone();
  sharedFetch = global.fetch;
  global.fetch = facilityFetch;
});
afterEach(async () => {
  server.profileWait = undefined;
  await store.dispatch(logout({ localOnly: true }));
  await flush();
  leavePhone();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('a change that waits for the facility longer than 30 seconds is aborted, and the server never applies it', () => {
  const changes: [string, string, () => Promise<{ success: boolean; outcomeUnknown?: boolean }>][] = [
    ['replace rates', 'replace_item_rates', () => replaceItemRates(replaceInput)],
    ['standard rate', 'set_standard_rate', () => setStandardRate([{ weight_min: 0, weight_max: 100, unit_price: 12, labour_rate: 0, tax_percent: 0 }] as never)],
    ['undo a rate change', 'undo_rate_change', () => undoRateChange(undoInput)],
    ['save a sensor', 'update_sensor_device', () => updateDevice(sensorUpdate)],
  ];

  it.each(changes)('%s: the request is aborted at 30 seconds, and finishing it later applies nothing', async (_name, fn, send) => {
    facility.answers.set(fn, 'hang');
    facility.answers.set('get_item_storage_prices', rows([rate('r2', '2027-01-01', null)])); // the read-back: not undone
    facility.answers.set('get_sensor_device', sensorRead({ device_name: 'Old name' })); // the read-back: not saved
    let result: Awaited<ReturnType<typeof send>> | undefined;
    void send().then(value => { result = value; });

    await wait(29_000);
    expect(result).toBeUndefined();
    expect(callsTo(fn)).toHaveLength(1);
    expect(callsTo(fn)[0]!.signal?.aborted).toBe(false);
    await wait(1_500);

    expect(callsTo(fn)[0]!.signal?.aborted).toBe(true);
    expect(result).toMatchObject({ success: false });
    await finishHeldChanges();
    expect(facility.applied).toEqual([]);
  });

  it.each([
    ['undo a rate change', 'undo_rate_change', () => undoRateChange(undoInput)],
    ['save a sensor', 'update_sensor_device', () => updateDevice(sensorUpdate)],
  ] as const)('%s: released from the role re-read at 24 seconds, it is aborted 30 seconds after it began', async (_name, fn, send) => {
    await startWithNoConnection();
    await store.dispatch(initializeAuth());
    await flush();
    expect(store.getState().auth.userProfile).toMatchObject({ id: ASHA.id });
    facility.answers.set(fn, 'hang');
    facility.answers.set('get_item_storage_prices', rows([rate('r2', '2027-01-01', null)]));
    facility.answers.set('get_sensor_device', sensorRead({ device_name: 'Old name' }));
    const reread = deferred();
    server.profileWait = reread.promise;
    server.up = true;
    let result: Awaited<ReturnType<typeof send>> | undefined;
    void send().then(value => { result = value; });

    await wait(24_000);
    expect(callsTo(fn)).toHaveLength(0); // still held in the app
    await act(async () => { reread.open(); });
    await wait(500);
    expect(callsTo(fn)).toHaveLength(1);
    expect(callsTo(fn)[0]!.signal?.aborted).toBe(false);
    await wait(6_000);

    expect(callsTo(fn)[0]!.signal?.aborted).toBe(true);
    expect(result).toMatchObject({ success: false });
    await finishHeldChanges();
    expect(facility.applied).toEqual([]);
  });
});

describe('a lost answer is read back before anything is said', () => {
  const lost = () => { facility.answers.set('undo_rate_change', 'hang'); };

  it('undo: the rates show it undone, so it is a success', async () => {
    lost();
    facility.answers.set('get_item_storage_prices', rows([rate('r1', '2026-04-01', null)]));
    let result: Awaited<ReturnType<typeof undoRateChange>> | undefined;
    void undoRateChange(undoInput).then(value => { result = value; });
    await wait(31_000);
    expect(result).toEqual({ success: true });
  });

  it.each([
    ['a rate still starts on that day', [rate('r2', '2027-01-01', null)]],
    ['a rate still ends the day before', [rate('r1', '2026-04-01', '2026-12-31')]],
  ])('undo: %s, so it could not be confirmed', async (_why, list) => {
    lost();
    facility.answers.set('get_item_storage_prices', rows(list));
    let result: Awaited<ReturnType<typeof undoRateChange>> | undefined;
    void undoRateChange(undoInput).then(value => { result = value; });
    await wait(31_000);
    expect(result).toMatchObject({ success: false, outcomeUnknown: true, message: t('pricing.error.undoUnconfirmed') });
  });

  it('undo: rates that cannot be read back leave it unconfirmed', async () => {
    lost();
    facility.answers.set('get_item_storage_prices', () => json({ message: 'database unavailable' }, 500));
    let result: Awaited<ReturnType<typeof undoRateChange>> | undefined;
    void undoRateChange(undoInput).then(value => { result = value; });
    await wait(31_000);
    expect(result).toMatchObject({ success: false, outcomeUnknown: true });
  });

  it('sensor: the sensor holds the saved name, so it is a success', async () => {
    facility.answers.set('update_sensor_device', 'hang');
    facility.answers.set('get_sensor_device', sensorRead());
    let result: Awaited<ReturnType<typeof updateDevice>> | undefined;
    void updateDevice(sensorUpdate).then(value => { result = value; });
    await wait(31_000);
    expect(result).toEqual({ success: true });
  });

  it.each([
    ['holds the old name', { device_name: 'Old name' }],
    ['holds another place', { location: 'Dock' }],
    ['holds another threshold', { staleness_threshold_minutes: 60 }],
  ])('sensor: the sensor %s, so it could not be confirmed', async (_why, over) => {
    facility.answers.set('update_sensor_device', 'hang');
    facility.answers.set('get_sensor_device', sensorRead(over));
    let result: Awaited<ReturnType<typeof updateDevice>> | undefined;
    void updateDevice(sensorUpdate).then(value => { result = value; });
    await wait(31_000);
    expect(result).toMatchObject({ success: false, outcomeUnknown: true });
  });

  it('sensor: limits that were sent are compared too', async () => {
    facility.answers.set('update_sensor_device', 'hang');
    facility.answers.set('get_sensor_device', sensorRead({ alert_config: { temperature_min: 1, temperature_max: 9 } }));
    let result: Awaited<ReturnType<typeof updateDevice>> | undefined;
    void updateDevice({ ...sensorUpdate, limits: { min: 2, max: 8 } }).then(value => { result = value; });
    await wait(31_000);
    expect(result).toMatchObject({ success: false, outcomeUnknown: true });
  });

  it('sensor: a refusal from the server is not a lost answer and is not read back', async () => {
    facility.answers.set('update_sensor_device', () => json({ success: false, error: 'Name taken', error_code: 'NAME_TAKEN' }));
    facility.answers.set('get_sensor_device', sensorRead());
    const result = await updateDevice(sensorUpdate);
    expect(result.success).toBe(false);
    expect(result.outcomeUnknown).toBeUndefined();
    expect(callsTo('get_sensor_device')).toHaveLength(0);
  });
});

describe('the titles of the alerts', () => {
  const scope = {
    priceType: 'monthly', customerId: null, bands: [], stopsAfter: '2026-12-31', seenRows: ['r1'],
    upcoming: { startsOn: '2027-01-01', rows: [{ unit_price: 12 }] },
  } as unknown as RateScope;
  const refused = () => json({ success: false, error: 'Nothing to undo', error_code: 'NOTHING_TO_UNDO', data: {} });
  const shown = () => jest.mocked(showAlert).mock.calls.map(call => call[0]);

  it('undo stop, answer lost and not confirmed: the neutral title, with the body unchanged', async () => {
    facility.answers.set('undo_rate_change', 'hang');
    facility.answers.set('get_item_storage_prices', rows([rate('r2', '2027-01-01', null)]));
    const { result } = await renderHook(() => useRateActions({ id: 'item-1', name: 'Potatoes' }));
    await act(async () => { void result.current.undoStop(scope); });
    await wait(31_000);
    expect(showAlert).toHaveBeenCalledWith("Couldn't confirm the stop was undone", t('pricing.error.undoUnconfirmed'));
  });

  it('undo stop, refused: today\'s title', async () => {
    facility.answers.set('undo_rate_change', refused);
    const { result } = await renderHook(() => useRateActions({ id: 'item-1', name: 'Potatoes' }));
    await act(async () => { await result.current.undoStop(scope); });
    expect(shown()).toEqual(["Couldn't undo the stop"]);
  });

  it('undo stop, answer lost but undone: a success, no alert', async () => {
    facility.answers.set('undo_rate_change', 'hang');
    facility.answers.set('get_item_storage_prices', rows([rate('r1', '2026-04-01', null)]));
    const { result } = await renderHook(() => useRateActions({ id: 'item-1', name: 'Potatoes' }));
    await act(async () => { void result.current.undoStop(scope); });
    await wait(31_000);
    expect(showAlert).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(t('pricing.undo.done'));
  });

  /** The Cancel new rate dialog of the item page, opened for `scope` and confirmed by the person. */
  async function cancelNewRate() {
    const user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
    let open!: () => void;
    const Page = () => {
      const actions = useRateActions({ id: "item-1", name: "Potatoes" });
      open = () => actions.askCancel(scope);
      return actions.dialog;
    };
    await render(<Page />);
    await act(async () => { open(); });
    await user.press(screen.getByRole("button", { name: "Cancel new rate" }));
  }

  it("cancel new rate, answer lost and not confirmed: the neutral title", async () => {
    facility.answers.set("undo_rate_change", "hang");
    facility.answers.set("get_item_storage_prices", rows([rate("r2", "2027-01-01", null)]));
    await cancelNewRate();
    await wait(31_000);
    expect(shown()).toEqual(["Couldn't confirm the new rate was cancelled"]);
  });

  it("cancel new rate, refused: today's title", async () => {
    facility.answers.set("undo_rate_change", refused);
    await cancelNewRate();
    await wait(1_000);
    expect(shown()).toEqual(["Couldn't cancel the new rate"]);
  });


  async function pressSave() {
    const user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
    await render(<SensorEditScreen />);
    const name = screen.getByDisplayValue('Ripening room probe');
    await user.clear(name);
    await user.type(name, 'Chamber 7 probe');
    await user.press(screen.getByRole('button', { name: 'Save sensor' }));
  }

  it('save sensor, answer lost and not confirmed: the neutral title, with the body unchanged', async () => {
    facility.answers.set('update_sensor_device', 'hang');
    facility.answers.set('get_sensor_device', sensorRead({ device_name: 'Old name' }));
    await pressSave();
    await wait(31_000);
    expect(showAlert).toHaveBeenCalledWith("Couldn't confirm the sensor was saved", expect.stringContaining('saved'));
    expect(router.back).not.toHaveBeenCalled();
  });

  it('save sensor, refused: today\'s title', async () => {
    facility.answers.set('update_sensor_device', () => json({ success: false, error: 'Server busy', error_code: 'BUSY' }));
    await pressSave();
    await wait(1_000);
    expect(shown()).toEqual(["Couldn't save the sensor"]);
  });

  it('save sensor, answer lost but saved: the screen closes with the saved message', async () => {
    facility.answers.set('update_sensor_device', 'hang');
    facility.answers.set('get_sensor_device', sensorRead());
    await pressSave();
    await wait(31_000);
    expect(showAlert).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Sensor Chamber 7 probe saved.');
    expect(router.back).toHaveBeenCalled();
  });
});
