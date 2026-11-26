/**
 * WH-352: a change the app reported as timed out or failed is never sent afterwards. A write that waits for the role
 * re-read, or for the facility check, gives up when its caller does and after 25 seconds at the latest.
 *
 * Real: `verifySelectedOperator` (the launch and the identity gate's verifier), `initializeAuth` / `logout` with the app's
 * store and session teardown, the token store, the real supabase client with its gated fetch, `roleRecheck`, and the
 * rate, sensor and photo upload services. Faked: the network (`fetch`, src/tests/helpers/offlineRoleServer.ts), the
 * clock and native modules (secure store, files).
 */
// React bindings of the store: nothing here renders, and the package ships as ESM.
jest.mock('react-redux', () => ({ useDispatch: jest.fn(), useSelector: jest.fn(), useStore: jest.fn() }));
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
// The phone's file system and image tools: every file is there, 4 bytes long.
jest.mock('expo-file-system', () => ({
  File: jest.fn(function File() { return { size: 4, exists: true, delete: jest.fn() }; }),
  Directory: jest.fn(),
  Paths: { cache: 'file:///cache/', document: 'file:///documents/' },
}));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp' }, manipulateAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));

import type { SupabaseClient } from '@supabase/supabase-js';
import '@/tests/helpers/fakeTimersFirst';
import { operatorResumeGate } from '@/config/operatorResume';
import { acquireValidSession, createAuthenticatedFetch, getAuthenticatedClient } from '@/config/supabaseConfig';
import { uploadDeferredDispatchImages } from '@/features/dispatch/services/dispatchImageService';
import { uploadGRNPhotos, type PendingGRNPhoto } from '@/features/grn/services/imageUploadService';
import { replaceItemRates, setStandardRate, undoRateChange } from '@/services/item-pricing-service';
import { updateDevice } from '@/services/sensor-service';
import { store } from '@/store';
import { initializeAuth, logout } from '@/store/slices/authSlice';
import type { DispatchImageData } from '@/types/dispatch.types';
import {
  CUSTOMERS_PATH, FACILITY, PROFILE_PATH, count, deferred, discoveryBody, json, leavePhone, paths, server,
  signedInPhone, startWithNoConnection,
} from '@/tests/helpers/offlineRoleServer';

const REFUSED = /identity verification required/i;
const ABORTED = /abort/i;
/** The longest a write may wait before it is sent (Product accepted 25 s, below every screen's own limit). */
const LIMIT = 25_000;

const flush = async () => {
  for (let i = 0; i < 20; i++) await jest.advanceTimersByTimeAsync(0);
};
const wait = async (ms: number) => {
  await jest.advanceTimersByTimeAsync(ms);
  await flush();
};

type Failure = { message?: string; context?: { message?: string }; originalError?: { message?: string } };
const failureText = (error: unknown): string | null => {
  if (!error) return null;
  const failure = error as Failure;
  return [failure.message, failure.context?.message, failure.originalError?.message].filter(Boolean).join(' | ');
};

type Write = { name: string; method: string; path: string; send: (signal?: AbortSignal) => Promise<string | null> };

const viaClient = (call: (client: SupabaseClient) => PromiseLike<{ error: unknown }>) => async () => {
  try {
    const client = await getAuthenticatedClient();
    return failureText((await call(client)).error);
  } catch (error) {
    return failureText(error);
  }
};

/** A function call as the print and document services make it. */
const printCall = async (signal?: AbortSignal) => {
  try {
    const session = await acquireValidSession();
    const response = await createAuthenticatedFetch()(`${FACILITY.origin}/functions/v1/cancel-print-job`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.authToken}` },
      body: '{}',
      ...(signal ? { signal } : {}),
    });
    await response.json();
    return null;
  } catch (error) {
    return failureText(error);
  }
};

const RPC: Write = {
  name: 'an RPC that saves', method: 'POST', path: '/rest/v1/rpc/update_order_status',
  send: viaClient(client => client.rpc('update_order_status', { p_order_id: 'order-1' })),
};
const WRITES: Write[] = [
  RPC,
  {
    name: 'a REST insert', method: 'POST', path: '/rest/v1/customers',
    send: viaClient(client => client.from('customers').insert({ name: 'Fictional Traders' })),
  },
  {
    name: 'a REST update', method: 'PATCH', path: '/rest/v1/items',
    send: viaClient(client => client.from('items').update({ name: 'Fictional Item' }).eq('id', 'item-1')),
  },
  {
    name: 'a REST delete', method: 'DELETE', path: '/rest/v1/orders',
    send: viaClient(client => client.from('orders').delete().eq('id', 'order-1')),
  },
  {
    name: 'a photo upload', method: 'POST', path: '/storage/v1/object/grn-images/grn-1/photo.webp',
    send: viaClient(client => client.storage.from('grn-images').upload('grn-1/photo.webp', new ArrayBuffer(4), { contentType: 'image/webp' })),
  },
  {
    name: 'a photo removal', method: 'DELETE', path: '/storage/v1/object/grn-images',
    send: viaClient(client => client.storage.from('grn-images').remove(['grn-1/photo.webp'])),
  },
  {
    name: 'an edge function call', method: 'POST', path: '/functions/v1/send-order-notification',
    send: viaClient(client => client.functions.invoke('send-order-notification', { body: {} })),
  },
  { name: 'a print function call', method: 'POST', path: '/functions/v1/cancel-print-job', send: printCall },
];

/** Requests whose caller can give up on them. */
const ABORTABLE: Write[] = [
  {
    name: 'an RPC', method: 'POST', path: RPC.path,
    send: signal => viaClient(client => client.rpc('update_order_status', { p_order_id: 'order-1' }).abortSignal(signal!))(),
  },
  {
    name: 'a REST insert', method: 'POST', path: '/rest/v1/customers',
    send: signal => viaClient(client => client.from('customers').insert({ name: 'Fictional Traders' }).abortSignal(signal!))(),
  },
  { name: 'a print function call', method: 'POST', path: '/functions/v1/cancel-print-job', send: printCall },
];

const sentTo = (path: string, method = 'POST') => server.sent.filter(sent => sent.path === path && sent.method === method);
const sentWrites = (write: Write) => sentTo(write.path, write.method);

/** Answers for single paths, in place of the helper's "success". The request is logged as every other one. */
let answers: Record<string, () => unknown> = {};

function answerMoreRequests() {
  const network = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const address = String(typeof input === 'object' && 'url' in input ? input.url : input);
    // A photo file on the phone (read by PhoneFileReader below).
    if (address.startsWith('file:')) return { blob: async () => ({}) } as unknown as Response;
    const response = await network(input, init);
    const own = answers[new URL(address).pathname];
    return own ? json(own()) : response;
  }) as typeof fetch;
}

/** React Native's FileReader is native: every photo file reads as 4 bytes. */
class PhoneFileReader {
  result: ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsArrayBuffer() {
    this.result = new ArrayBuffer(4);
    queueMicrotask(() => this.onload?.());
  }
}
const originalFileReader = global.FileReader;

/** Watches a promise without waiting for it. */
function watch<T>(promise: Promise<T>) {
  const seen: { done: boolean; value?: T } = { done: false };
  void promise.then(value => {
    seen.done = true;
    seen.value = value;
  });
  return seen;
}

/** The app launched with no connection and restored the session from this phone. */
async function openedOffline() {
  await startWithNoConnection();
  await store.dispatch(initializeAuth());
  await flush();
  expect(store.getState().auth.userProfile).toMatchObject({ role: 'staff' });
  server.sent = [];
}

/** As above, then the server is reachable again and does not yet answer the role re-read. */
async function heldBySlowReread() {
  await openedOffline();
  const answer = deferred();
  server.profileWait = answer.promise;
  server.up = true;
  return {
    /** The server answers the re-read now. */
    answerReread: async () => {
      server.profileWait = undefined;
      answer.open();
      await flush();
    },
  };
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  answers = {};
  await signedInPhone();
  answerMoreRequests();
  global.FileReader = PhoneFileReader as unknown as typeof FileReader;
});
afterEach(async () => {
  // Ends the session, so no hold or waiting read of this test is left for the next one.
  server.profileWait = undefined;
  server.discovery = undefined;
  await store.dispatch(logout({ localOnly: true }));
  // Lets every waiting request and upload run out.
  await wait(10 * 60_000);
  leavePhone();
  global.FileReader = originalFileReader;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe.each(WRITES)('$name held for a slow role re-read', write => {
  it('goes out once when the re-read is answered just inside the 25 seconds', async () => {
    const { answerReread } = await heldBySlowReread();
    const result = watch(write.send());
    await flush();
    await wait(LIMIT - 1);
    expect(result.done).toBe(false);
    expect(sentWrites(write)).toHaveLength(0);

    await answerReread();

    expect(result).toEqual({ done: true, value: null });
    expect(sentWrites(write)).toHaveLength(1);
    expect(paths().indexOf(`POST ${CUSTOMERS_PATH}`)).toBeLessThan(paths().indexOf(`${write.method} ${write.path}`));
  });

  it('is refused at 25 seconds and never sent, though the re-read then succeeds', async () => {
    const { answerReread } = await heldBySlowReread();
    const result = watch(write.send());
    await flush();

    await wait(LIMIT);
    expect(result.done).toBe(true);
    expect(result.value).toMatch(REFUSED);

    await wait(1_000);
    await answerReread();
    expect(count(CUSTOMERS_PATH)).toBe(1); // the re-read did succeed
    await wait(10 * 60_000);
    expect(sentWrites(write)).toHaveLength(0);
  });
});

describe('the 25 seconds', () => {
  it('a write made after a refused one goes out at once when the re-read has succeeded', async () => {
    const { answerReread } = await heldBySlowReread();
    const first = watch(RPC.send());
    await flush();
    await wait(LIMIT);
    await answerReread();

    await expect(RPC.send()).resolves.toBeNull();

    expect(first.value).toMatch(REFUSED);
    expect(sentWrites(RPC)).toHaveLength(1); // the second one only
  });

  it('counts by the clock too: time passed with the timers standing still (the app in the background)', async () => {
    const { answerReread } = await heldBySlowReread();
    const result = watch(RPC.send());
    await flush();

    jest.setSystemTime(Date.now() + LIMIT + 1_000);
    await answerReread();

    expect(result.done).toBe(true);
    expect(result.value).toMatch(REFUSED);
    await wait(10 * 60_000);
    expect(sentWrites(RPC)).toHaveLength(0);
  });
});

describe('the caller gives up while its write waits for the role re-read', () => {
  it.each(ABORTABLE)('$name ends at once, unanswered re-read or not, and is never sent', async write => {
    const { answerReread } = await heldBySlowReread();
    const controller = new AbortController();
    const result = watch(write.send(controller.signal));
    await flush();
    expect(result.done).toBe(false);

    controller.abort();
    await flush();

    expect(result.done).toBe(true);
    expect(result.value).toMatch(ABORTED);
    await answerReread();
    await wait(10 * 60_000);
    expect(sentWrites(write)).toHaveLength(0);
  });

  it.each(ABORTABLE)('$name already given up before it was made is not sent', async write => {
    const { answerReread } = await heldBySlowReread();
    const controller = new AbortController();
    controller.abort();

    const result = watch(write.send(controller.signal));
    await flush();

    expect(result.done).toBe(true);
    expect(result.value).toMatch(ABORTED);
    await answerReread();
    await wait(10 * 60_000);
    expect(sentWrites(write)).toHaveLength(0);
  });
});

describe('a write waiting for the facility check alone, with no role hold', () => {
  const DISCOVERY = '/functions/v1/get-public-config';

  /** Back at the front of a confirmed session: the facility check is owed and the server is slow to answer it. */
  function slowFacilityCheck() {
    const gate = deferred();
    server.discovery = async () => {
      await gate.promise;
      return json(discoveryBody());
    };
    operatorResumeGate.suspend();
    server.sent = [];
    return gate;
  }

  it('goes out once when the check passes after 14 seconds', async () => {
    const check = slowFacilityCheck();
    const result = watch(RPC.send());
    await flush();
    await wait(14_000);
    expect(sentWrites(RPC)).toHaveLength(0);

    check.open();
    await flush();

    expect(result).toEqual({ done: true, value: null });
    expect(sentWrites(RPC)).toHaveLength(1);
  });

  it('is refused and never sent when the check gets no answer', async () => {
    const check = slowFacilityCheck();
    const result = watch(RPC.send());
    await flush();

    await wait(LIMIT);

    expect(result.done).toBe(true);
    expect(result.value).toMatch(REFUSED);
    check.open();
    await wait(10 * 60_000);
    expect(count(DISCOVERY)).toBeGreaterThan(0);
    expect(sentWrites(RPC)).toHaveLength(0);
  });

  it.each(ABORTABLE)('$name given up during the check ends at once and is never sent', async write => {
    const check = slowFacilityCheck();
    const controller = new AbortController();
    const result = watch(write.send(controller.signal));
    await flush();

    controller.abort();
    await flush();

    expect(result.done).toBe(true);
    expect(result.value).toMatch(ABORTED);
    check.open();
    await wait(10 * 60_000);
    expect(sentWrites(write)).toHaveLength(0);
  });

  it('a list read keeps waiting for the check and goes out', async () => {
    const check = slowFacilityCheck();
    const read = watch(viaClient(client => client.from('items').select('id'))());
    await flush();
    await wait(14_000);

    check.open();
    await flush();

    expect(read).toEqual({ done: true, value: null });
    expect(sentTo('/rest/v1/items', 'GET')).toHaveLength(1);
  });

  it('the 25 seconds cover the facility check and the role re-read together', async () => {
    await openedOffline();
    const check = deferred();
    server.discovery = async () => {
      await check.promise;
      return json(discoveryBody());
    };
    const role = deferred();
    server.profileWait = role.promise;
    server.up = true;
    const result = watch(RPC.send());
    await flush();
    await wait(14_000);
    check.open();
    await flush();
    expect(count(PROFILE_PATH)).toBeGreaterThan(0); // the re-read is now the thing waited for

    await wait(LIMIT - 14_000);
    expect(result.done).toBe(true);
    expect(result.value).toMatch(REFUSED);

    server.profileWait = undefined;
    role.open();
    await wait(10 * 60_000);
    expect(sentWrites(RPC)).toHaveLength(0);
  });
});

describe('the rate and sensor services, whose screens give up after 30 seconds', () => {
  const RATE = {
    item_id: 'item-1', customer_id: null, price_type: 'monthly' as const, starts_on: '2027-01-01', bands: [],
  };
  const TIERS = [{ weight_min: 0, weight_max: 50, unit_price: 4, labour_rate: 1, tax_percent: 5 }];

  const SERVICES: [string, string, () => Promise<{ success: boolean }>][] = [
    ['a rate change (replace_item_rates)', '/rest/v1/rpc/replace_item_rates', () => replaceItemRates(RATE)],
    ['undoing a rate change (undo_rate_change)', '/rest/v1/rpc/undo_rate_change',
      () => undoRateChange({ itemId: 'item-1', customerId: null, priceType: 'monthly', startsOn: '2027-01-01' })],
    ['the standard rate (set_standard_rate)', '/rest/v1/rpc/set_standard_rate', () => setStandardRate(TIERS)],
    ['a sensor change (update_sensor_device)', '/rest/v1/rpc/update_sensor_device',
      () => updateDevice({ deviceId: 'sensor-1', name: 'Chamber 1', location: 'Ground floor', stalenessMinutes: 30 })],
  ];

  describe.each(SERVICES)('%s', (_name, path, save) => {
    it('is reported failed before 30 seconds and never sent afterwards', async () => {
      const { answerReread } = await heldBySlowReread();
      const result = watch(save());
      await flush();

      await wait(LIMIT);
      expect(result.done).toBe(true);
      expect(result.value).toMatchObject({ success: false });

      // The re-read succeeds after the screen's own 30 seconds would have run out.
      await wait(6_000);
      await answerReread();
      await wait(10 * 60_000);
      expect(count(CUSTOMERS_PATH)).toBe(1); // the re-read did succeed
      expect(sentTo(path)).toHaveLength(0);
    });

    it('is sent once and reported saved when the re-read is answered in time', async () => {
      const { answerReread } = await heldBySlowReread();
      const result = watch(save());
      await flush();
      await wait(20_000);
      expect(sentTo(path)).toHaveLength(0);

      await answerReread();

      expect(result.value).toMatchObject({ success: true });
      expect(sentTo(path)).toHaveLength(1);
    });
  });

  const CHECK = '/rest/v1/rpc/get_submission_result';
  const KEYED: [string, string, (signal: AbortSignal) => Promise<{ success: boolean }>][] = [
    ['a rate change with a request key', '/rest/v1/rpc/replace_item_rates',
      signal => replaceItemRates({ ...RATE, request_key: 'warehouse-rate-test-1' }, { signal })],
    ['the standard rate with a request key', '/rest/v1/rpc/set_standard_rate',
      signal => setStandardRate(TIERS, { requestKey: 'warehouse-rate-standard-test-1', signal })],
  ];

  describe.each(KEYED)('%s', (_name, path, save) => {
    it('is not reported failed while it is still to be sent: it asks, sends once when released, and succeeds', async () => {
      answers[CHECK] = () => ({ found: false });
      const { answerReread } = await heldBySlowReread();
      const result = watch(save(new AbortController().signal));
      await flush();
      await wait(LIMIT + 1_000);
      expect(count(CHECK)).toBe(1);
      expect(result.done).toBe(false);
      expect(sentTo(path)).toHaveLength(0);

      await answerReread();

      expect(result.value).toMatchObject({ success: true });
      await wait(10 * 60_000);
      expect(sentTo(path)).toHaveLength(1);
    });

    it('given up by leaving the screen after the refusal: never sent', async () => {
      answers[CHECK] = () => ({ found: false });
      const { answerReread } = await heldBySlowReread();
      const controller = new AbortController();
      const result = watch(save(controller.signal));
      await flush();
      controller.abort();
      await wait(LIMIT);
      expect(result.value).toMatchObject({ success: false, outcomeUnknown: true });

      await answerReread();
      await wait(10 * 60_000);
      expect(sentTo(path)).toHaveLength(0);
    });
  });
});

describe('more than four photos while writes are held (the save waits 30 seconds)', () => {
  let file = 0;
  const grnPhotos = (n: number): PendingGRNPhoto[] =>
    Array.from({ length: n }, (_, i) => {
      file += 1;
      return {
        image: {
          id: `temp_${file}`, fileName: `photo-${file}.webp`, imageUrl: `file:///cache/grn-${file}.webp`, fileSize: 4,
          mimeType: 'image/webp', uploadStatus: 'completed',
        } as PendingGRNPhoto['image'],
        imageType: 'header' as const,
        position: i + 1,
      };
    });
  const dispatchPhotos = (n: number): DispatchImageData[] =>
    Array.from({ length: n }, () => {
      file += 1;
      return { id: `temp_${file}`, file_name: `photo-${file}.webp`, image_url: `file:///cache/dispatch-${file}.webp`, upload_status: 'completed' as const };
    });

  type Outcome = { uploadedCount: number; failed: unknown[] };
  const KINDS: [string, 'grn' | 'dispatch', (n: number, waitMs?: number) => Promise<Outcome>][] = [
    ['GRN', 'grn', (n, waitMs) => uploadGRNPhotos('grn-1', grnPhotos(n), waitMs)],
    ['dispatch', 'dispatch', (n, waitMs) => uploadDeferredDispatchImages('dispatch-1', dispatchPhotos(n), waitMs)],
  ];

  describe.each(KINDS)('%s photos', (_name, kind, upload) => {
    const register = `/rest/v1/rpc/register_${kind}_image_upload`;
    const confirm = `/rest/v1/rpc/confirm_${kind}_image_upload`;

    beforeEach(() => {
      let registered = 0;
      answers[register] = () => {
        registered += 1;
        return { success: true, image_id: `image-${registered}`, storage_path: `${kind}-1/${registered}.webp`, upload_token: 'token' };
      };
    });

    it('all six are uploaded when the re-read is answered in time', async () => {
      const { answerReread } = await heldBySlowReread();
      const result = watch(upload(6));
      await flush();
      await wait(10_000);
      expect(sentTo(register)).toHaveLength(0);

      await answerReread();
      await flush();

      expect(result.value).toMatchObject({ uploadedCount: 6, failed: [] });
      expect(sentTo(register)).toHaveLength(6);
      expect(sentTo(confirm)).toHaveLength(6);
    });

    it('a queued photo that could not make the 30 seconds is not started, and none of the six is ever sent', async () => {
      const { answerReread } = await heldBySlowReread();
      const result = watch(upload(6));
      await flush();

      await wait(LIMIT);
      expect(result.done).toBe(true); // nothing is left running behind the report
      expect(result.value?.uploadedCount).toBe(0);
      expect(result.value?.failed).toHaveLength(6);

      await wait(2_000);
      await answerReread();
      await wait(10 * 60_000);
      expect(sentTo(register)).toHaveLength(0);
      expect(server.sent.filter(sent => sent.path.startsWith('/storage/'))).toHaveLength(0);
    });

    it('queued photos with time to spare in a longer wait are still started and uploaded', async () => {
      const { answerReread } = await heldBySlowReread();
      const result = watch(upload(6, 120_000));
      await flush();
      await wait(LIMIT + 1_000); // the first four are refused; the other two take their places

      await answerReread();
      await flush();

      expect(result.value?.uploadedCount).toBe(2);
      expect(result.value?.failed).toHaveLength(4);
      expect(sentTo(register)).toHaveLength(2);
    });
  });
});
