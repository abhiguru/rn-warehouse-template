/**
 * WH-346: after an offline start no change or new record is sent until the person's role and customer assignments have
 * been read again.
 *
 * Real: `verifySelectedOperator` (the launch and the identity gate's verifier), `initializeAuth` / `logout` with the app's
 * store and session teardown, `leaveFacility`, the token store, the real supabase client with its gated fetch,
 * `roleRecheck`. Faked: the network (`fetch`, src/tests/helpers/offlineRoleServer.ts) and native modules.
 */
// React bindings of the store: nothing here renders, and the package ships as ESM.
jest.mock('react-redux', () => ({ useDispatch: jest.fn(), useSelector: jest.fn(), useStore: jest.fn() }));
jest.mock('expo-constants',() => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
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

import type { SupabaseClient } from '@supabase/supabase-js';
import '@/tests/helpers/fakeTimersFirst';
import { operatorResumeGate } from '@/config/operatorResume';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import {
  acquireValidSession,
  createAuthenticatedFetch,
  createSessionReadFetch,
  getAuthenticatedClient,
  refreshCustomJWT,
  verifyOTP,
} from '@/config/supabaseConfig';
import { store } from '@/store';
import { leaveFacility } from '@/store/operatorSwitch';
import { initializeAuth, logout } from '@/store/slices/authSlice';
import {
  ASHA, CUSTOMERS_PATH, FACILITY, PROFILE_PATH, REFRESH_PATH, checkFacilityAgain, count, deferred, expireToken,
  leavePhone, paths, server, signedInPhone, startWithNoConnection,
} from '@/tests/helpers/offlineRoleServer';

const REFUSED = /identity verification required/i;

const flush = async () => {
  for (let i = 0; i < 20; i++) await jest.advanceTimersByTimeAsync(0);
};
const wait = async (ms: number) => {
  await jest.advanceTimersByTimeAsync(ms);
  await flush();
};

type Failure = { message?: string; context?: { message?: string }; originalError?: { message?: string } };
/** Everything an error says, wherever the client library keeps it; null when there is none. */
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

const WRITES: Write[] = [
  {
    name: 'an RPC that saves', method: 'POST', path: '/rest/v1/rpc/update_order_status',
    send: viaClient(client => client.rpc('update_order_status', { p_order_id: 'order-1' })),
  },
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
const RPC = WRITES[0]!;

const profileNow = () => store.getState().auth.userProfile;
const sentWrites = (write: Write = RPC) => server.sent.filter(sent => sent.path === write.path && sent.method === write.method);

/** The app launched with no connection and restored Asha's session from this phone. */
async function openedOffline({ expired = false } = {}) {
  if (expired) await expireToken();
  await startWithNoConnection();
  await store.dispatch(initializeAuth());
  await flush();
  expect(profileNow()).toMatchObject({ id: ASHA.id, role: 'staff' });
  server.sent = [];
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await signedInPhone();
});
afterEach(async () => {
  // Ends the session, so no hold or waiting read of this test is left for the next one.
  server.profileWait = undefined;
  await store.dispatch(logout({ localOnly: true }));
  await flush();
  leavePhone();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe.each([
  ['an unexpired token', false],
  ['an expired token', true],
])('after an offline start with %s, the server reachable again', (_label, expired) => {
  it.each(WRITES)('$name waits for the profile and assignments, then goes out once', async write => {
    await openedOffline({ expired });
    const answer = deferred();
    server.profileWait = answer.promise;
    server.up = true;
    expect(operatorResumeGate.isVerified()).toBe(false);

    const result = write.send();
    await flush();
    expect(count(PROFILE_PATH)).toBeGreaterThan(0); // the re-read is on the wire, unanswered
    expect(sentWrites(write)).toHaveLength(0);

    answer.open();
    await flush();
    await expect(result).resolves.toBeNull();
    expect(sentWrites(write)).toHaveLength(1);
    const order = paths();
    const writeAt = order.indexOf(`${write.method} ${write.path}`);
    expect(order.indexOf(`GET ${PROFILE_PATH}`)).toBeLessThan(writeAt);
    expect(order.indexOf(`POST ${CUSTOMERS_PATH}`)).toBeGreaterThan(-1);
    expect(order.indexOf(`POST ${CUSTOMERS_PATH}`)).toBeLessThan(writeAt);
    // An expired token is renewed first and never goes out on the write.
    expect(count(REFRESH_PATH) > 0).toBe(expired);
  });

  it.each(WRITES)('$name is refused unsent while the profile cannot be read', async write => {
    await openedOffline({ expired });
    server.up = true;
    server.profileFails = true;

    const result = write.send();
    await flush();

    await expect(result).resolves.toMatch(REFUSED);
    expect(sentWrites(write)).toHaveLength(0);
    await wait(10 * 60_000);
    expect(sentWrites(write)).toHaveLength(0);
  });
});

describe('the role and assignments the server holds now', () => {
  it.each(WRITES)('a lowered role and new assignments are in the store when $name reaches the wire', async write => {
    await openedOffline();
    server.up = true;
    server.role = 'customer';
    server.customers = ['customer-9'];
    const seen: unknown[] = [];
    server.onSend = sent => {
      if (sent.path === write.path && sent.method === write.method) seen.push(profileNow());
    };

    const result = write.send();
    await flush();

    await expect(result).resolves.toBeNull();
    expect(seen).toEqual([expect.objectContaining({ role: 'customer', assignedCustomerIds: ['customer-9'] })]);
  });

  it('changed assignments alone reach the store before the write', async () => {
    await openedOffline();
    server.up = true;
    server.customers = ['customer-1', 'customer-2'];
    let seen: unknown;
    server.onSend = sent => {
      if (sent.path === RPC.path) seen = profileNow()?.assignedCustomerIds;
    };

    await RPC.send();

    expect(seen).toEqual(['customer-1', 'customer-2']);
  });

  it('assignments that cannot be read refuse the write, and the kept profile stays', async () => {
    await openedOffline();
    server.up = true;
    server.role = 'supervisor';
    server.customersFail = true;

    await expect(RPC.send()).resolves.toMatch(REFUSED);

    expect(sentWrites()).toHaveLength(0);
    expect(profileNow()).toMatchObject({ role: 'staff', assignedCustomerIds: ['customer-1'] });
    server.customersFail = false;
    await expect(RPC.send()).resolves.toBeNull();
    expect(sentWrites()).toHaveLength(1);
    expect(profileNow()?.role).toBe('supervisor');
  });
});

describe('a failed re-read is repeated', () => {
  it('after 5, 15, 30 and then every 60 seconds, until it succeeds and no longer', async () => {
    await openedOffline();
    server.up = true;
    server.profileFails = true;
    await operatorResumeGate.ensureVerified(); // the server's first answer: the waits start from here
    await flush();
    expect(count(PROFILE_PATH)).toBe(1);

    let reads = 1;
    for (const seconds of [5, 15, 30, 60, 60]) {
      await wait(seconds * 1000 - 100);
      expect(count(PROFILE_PATH)).toBe(reads);
      await wait(100);
      reads += 1;
      expect(count(PROFILE_PATH)).toBe(reads);
    }

    server.profileFails = false;
    server.role = 'supervisor';
    await wait(60_000);
    expect(count(PROFILE_PATH)).toBe(reads + 1);
    expect(profileNow()?.role).toBe('supervisor'); // with no write and nothing the person did
    await wait(10 * 60_000);
    expect(count(PROFILE_PATH)).toBe(reads + 1);
    await expect(RPC.send()).resolves.toBeNull();
    expect(count(PROFILE_PATH)).toBe(reads + 1);
  });

  it('at once when the server first answers, without waiting out the current wait', async () => {
    await openedOffline();
    await wait(52_000); // 5 + 15 + 30 seconds of failures with no connection: the next wait is 60 s
    server.up = true;
    server.role = 'supervisor';
    server.sent = [];

    await checkFacilityAgain();
    await flush();

    expect(count(PROFILE_PATH)).toBe(1);
    expect(profileNow()?.role).toBe('supervisor');
  });

  it('a session restored a second time stays held', async () => {
    await openedOffline();
    server.up = true;
    server.profileFails = true;
    await store.dispatch(initializeAuth());
    await flush();

    await expect(RPC.send()).resolves.toMatch(REFUSED);
    expect(sentWrites()).toHaveLength(0);
  });

  it('a facility check answered before the session restore does not release the writes', async () => {
    await startWithNoConnection();
    server.up = true;
    server.profileFails = true;
    await operatorResumeGate.ensureVerified();
    await store.dispatch(initializeAuth());
    await flush();
    expect(profileNow()?.role).toBe('staff');

    await expect(RPC.send()).resolves.toMatch(REFUSED);
    expect(sentWrites()).toHaveLength(0);
  });
});

describe('a caller that gives up while its write is held', () => {
  const abortable: Write[] = [
    {
      name: 'an RPC', method: 'POST', path: RPC.path,
      send: signal => viaClient(client => client.rpc('update_order_status', { p_order_id: 'order-1' }).abortSignal(signal!))(),
    },
    { name: 'a print function call', method: 'POST', path: '/functions/v1/cancel-print-job', send: printCall },
  ];

  it.each(abortable)('$name is not sent late', async write => {
    await openedOffline();
    const answer = deferred();
    server.profileWait = answer.promise;
    server.up = true;
    const controller = new AbortController();
    const result = write.send(controller.signal);
    await flush();
    expect(count(PROFILE_PATH)).toBeGreaterThan(0);

    controller.abort();
    answer.open();
    await flush();
    await wait(10 * 60_000);

    await expect(result).resolves.not.toBeNull();
    expect(sentWrites(write)).toHaveLength(0);
  });
});

describe('what is never held, while the profile cannot be read', () => {
  async function unconfirmed() {
    await openedOffline();
    server.up = true;
    server.profileFails = true;
    await expect(RPC.send()).resolves.toMatch(REFUSED);
    server.sent = [];
  }

  it.each([
    ['a table read', 'GET /rest/v1/customers', viaClient(client => client.from('customers').select('id'))],
    ['a count (HEAD)', 'HEAD /rest/v1/customers', viaClient(client => client.from('customers').select('id', { head: true, count: 'exact' }))],
    ['a read RPC', 'POST /rest/v1/rpc/get_all_grn_items', viaClient(client => client.rpc('get_all_grn_items'))],
    ['signing a photo link', 'POST /storage/v1/object/sign/grn-images/grn-1/photo.webp',
      viaClient(client => client.storage.from('grn-images').createSignedUrl('grn-1/photo.webp', 60))],
    ['listing photos', 'POST /storage/v1/object/list/grn-images', viaClient(client => client.storage.from('grn-images').list('grn-1'))],
  ] as const)('%s goes out', async (_name, sent, read) => {
    await unconfirmed();

    await expect(read()).resolves.toBeNull();

    expect(paths()).toContain(sent);
  });

  it('the configuration read goes out', async () => {
    await unconfirmed();

    await createSessionReadFetch()(`${FACILITY.origin}/functions/v1/get-config`, { method: 'GET' });

    expect(paths()).toContain('GET /functions/v1/get-config');
  });

  // The print services send every request through the fetch that counts as a write; a read RPC is still known by its name.
  it('the print job list, a read RPC sent as the print service sends it, goes out', async () => {
    await unconfirmed();
    const session = await acquireValidSession();

    const response = await createAuthenticatedFetch()(`${FACILITY.origin}/rest/v1/rpc/get_print_jobs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.authToken}` },
      body: '{}',
    });

    expect(response.ok).toBe(true);
    expect(paths()).toContain('POST /rest/v1/rpc/get_print_jobs');
  });

  it('the token refresh goes out and renews the session', async () => {
    await unconfirmed();

    await expect(refreshCustomJWT()).resolves.toMatchObject({ refreshToken: 'b'.repeat(64) });

    expect(count(REFRESH_PATH)).toBe(1);
  });

  it('sign-out reaches the server', async () => {
    await unconfirmed();

    await store.dispatch(logout());

    expect(paths()).toContain('POST /rest/v1/rpc/logout_session');
    expect(profileNow()).toBeNull();
  });
});

describe('sessions that are not held', () => {
  it('an online start sends a write while its background profile read is still unanswered', async () => {
    const answer = deferred();
    server.profileWait = answer.promise;
    await store.dispatch(initializeAuth());
    await flush();
    expect(profileNow()?.role).toBe('staff');

    const result = RPC.send();
    await flush();

    expect(sentWrites()).toHaveLength(1);
    await expect(result).resolves.toBeNull();
    answer.open();
  });

  it('a sign-in after an offline start sends writes at once, and the old re-read stops', async () => {
    await openedOffline();
    server.up = true;
    server.profileFails = true;
    await expect(RPC.send()).resolves.toMatch(REFUSED);

    await expect(verifyOTP('9000000001', '000000')).resolves.toMatchObject({ success: true });
    await flush();
    server.sent = [];

    await expect(RPC.send()).resolves.toBeNull();
    expect(sentWrites()).toHaveLength(1);
    await wait(10 * 60_000);
    expect(count(PROFILE_PATH)).toBe(0);
  });
});

describe('the session changes while a write is held', () => {
  const changes: [string, () => Promise<void>][] = [
    ['sign-out', async () => {
      await store.dispatch(logout());
    }],
    ['a sign-in by another person', async () => {
      server.subject = 'user-ravi';
      const gate = server.profileWait;
      server.profileWait = undefined;
      await expect(verifyOTP('9000000002', '000000')).resolves.toMatchObject({ success: true });
      server.profileWait = gate;
    }],
    ['leaving the facility', async () => {
      await expect(leaveFacility(store.dispatch)).resolves.toBe('left');
    }],
  ];

  it.each(changes)('%s: the write is never sent', async (_name, change) => {
    await openedOffline();
    const answer = deferred();
    server.profileWait = answer.promise;
    server.up = true;
    const generation = getSessionGeneration();
    let outcome: string | null | undefined;
    void RPC.send().then(value => {
      outcome = value;
    });
    await flush();
    expect(count(PROFILE_PATH)).toBeGreaterThan(0);
    expect(sentWrites()).toHaveLength(0);

    await change();
    expect(getSessionGeneration()).not.toBe(generation);
    answer.open();
    await flush();
    server.sent = server.sent.filter(sent => sent.path !== PROFILE_PATH);
    await wait(10 * 60_000);

    expect(sentWrites()).toHaveLength(0);
    expect(outcome).toMatch(/session changed/i);
    expect(count(PROFILE_PATH)).toBe(0); // nothing goes on re-reading for the ended session
  });

  it('after another person signs in, their write goes out under their own token', async () => {
    await openedOffline();
    server.up = true;
    server.profileFails = true;
    await expect(RPC.send()).resolves.toMatch(REFUSED);
    server.subject = 'user-ravi';
    await expect(verifyOTP('9000000002', '000000')).resolves.toMatchObject({ success: true });
    await flush();
    server.sent = [];

    await expect(RPC.send()).resolves.toBeNull();

    const claims = JSON.parse(atob(sentWrites()[0]!.bearer.split('.')[1]!)) as { sub: string };
    expect(claims.sub).toBe('user-ravi');
  });
});
