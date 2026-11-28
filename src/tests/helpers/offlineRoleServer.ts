/**
 * A fictional facility behind `fetch`, for the offline-start role re-read tests (WH-346). Only the network and the
 * native secure store are stood in for: every request the app makes is logged here, in the order it reaches the wire.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { verifyForegroundOperator, verifySelectedOperator } from '@/config/operatorBootstrap';
import { loadOperatorServer, saveOperatorServer } from '@/config/operatorServer';
import { operatorResumeGate } from '@/config/operatorResume';
import { clearOfflineStarted } from '@/config/offlineStart';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { cacheUserProfile, initializeSupabase, storeTokens } from '@/config/supabaseConfig';

export const FACILITY = {
  origin: 'https://warehouse.example.test',
  instanceId: 'instance-a',
  displayName: 'Fictional Cold Store',
  companyName: 'Fictional Company',
};
const base64 = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
export const ANON_KEY = `header.${base64({ role: 'anon', exp: 9999999999 })}.signature`;

export const jwt = (subject: string, session: string, secondsLeft = 3600) => {
  const now = Math.floor(Date.now() / 1000);
  return `${base64({ alg: 'HS256' })}.${base64({ sub: subject, session_id: session, iat: now - 60, exp: now + secondsLeft, role: 'authenticated' })}.test-signature`;
};

export const ASHA = {
  id: 'profile-asha',
  auth_user_id: 'user-asha',
  name: 'Asha Fictional',
  role: 'staff',
  active: true,
  assignedCustomerIds: ['customer-1'],
};

export type Sent = { method: string; path: string; bearer: string };

/** A promise a test settles itself: a request the server has received and not yet answered. */
export const deferred = () => {
  let open!: () => void;
  const promise = new Promise<void>(resolve => {
    open = resolve;
  });
  return { promise, open };
};

export const json = (body: unknown, status = 200): Response => {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const response = {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers,
    url: '',
    body: null,
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: () => json(body, status),
  };
  return response as unknown as Response;
};

export const discoveryBody = () => ({
  success: true,
  data: {
    supabaseUrl: FACILITY.origin,
    anonKey: ANON_KEY,
    environment: 'production',
    version: '0.1.0',
    maintenanceMode: false,
    instanceId: FACILITY.instanceId,
    displayName: FACILITY.displayName,
    companyName: FACILITY.companyName,
    canonicalOrigin: FACILITY.origin,
    supportedApiVersions: ['1'],
    minimumClientVersion: '0.1.0',
    capabilities: { sync: server.sync },
    urls: {
      publicConfig: `${FACILITY.origin}/functions/v1/get-public-config`,
      fullConfig: `${FACILITY.origin}/functions/v1/get-config`,
    },
  },
});

export const server = {
  /** False: no request gets an answer (Expo's error for a lost connection). */
  up: true,
  sent: [] as Sent[],
  /** The role and assignments the server holds now. */
  role: 'staff',
  customers: ['customer-1'] as string[],
  profileFails: false,
  customersFail: false,
  /** The server answers that this person has no active profile. */
  profileMissing: false,
  /** The facility has the offline feature. */
  sync: true,
  /** The server refuses the refresh token. */
  refreshRefused: false,
  /** While set, the profile read is received and not answered. */
  profileWait: undefined as Promise<void> | undefined,
  /** The person whose profile is asked for. */
  subject: 'user-asha',
  /** Replaces the answer to the discovery request. */
  discovery: undefined as undefined | ((init?: RequestInit) => Promise<Response>),
  /** Called as each request reaches the wire. */
  onSend: undefined as undefined | ((sent: Sent) => void),
};

export const paths = () => server.sent.map(sent => `${sent.method} ${sent.path}`);
export const count = (path: string) => server.sent.filter(sent => sent.path === path).length;
export const PROFILE_PATH = '/rest/v1/user_profiles';
export const CUSTOMERS_PATH = '/rest/v1/rpc/user_accessible_customers';
export const REFRESH_PATH = '/rest/v1/rpc/refresh_jwt_token';

/** What Expo's fetch rejects with when the connection is lost. */
export const noAnswer = () => new Error('fetch failed: java.net.UnknownHostException: Unable to resolve host "warehouse.example.test"');

const answer = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(String(typeof input === 'object' && 'url' in input ? input.url : input));
  const headers = new Headers(init?.headers);
  const sent: Sent = {
    method: String(init?.method ?? 'GET').toUpperCase(),
    path: url.pathname,
    bearer: (headers.get('Authorization') ?? '').replace('Bearer ', ''),
  };
  server.sent.push(sent);
  server.onSend?.(sent);
  if (url.pathname === '/functions/v1/get-public-config' && server.discovery) return server.discovery(init);
  if (!server.up) throw noAnswer();
  if (url.pathname === '/functions/v1/get-public-config') return json(discoveryBody());
  if (url.pathname === REFRESH_PATH && server.refreshRefused)
    return json({ success: false, message: 'Invalid or expired refresh token' });
  if (url.pathname === REFRESH_PATH)
    return json({ success: true, access_token: jwt(server.subject, `session-${server.subject}`), refresh_token: 'b'.repeat(64), expires_in: 3600 });
  if (url.pathname === PROFILE_PATH) {
    await server.profileWait;
    if (server.profileMissing)
      return json({ code: 'PGRST116', details: 'The result contains 0 rows', message: 'JSON object requested, multiple (or no) rows returned' }, 406);
    if (server.profileFails) return json({ message: 'database unavailable' }, 500);
    return json({ ...ASHA, auth_user_id: server.subject, role: server.role, assignedCustomerIds: undefined });
  }
  if (url.pathname === CUSTOMERS_PATH)
    return server.customersFail ? json({ message: 'database unavailable' }, 500) : json(server.customers);
  if (url.pathname === '/functions/v1/operator-otp/verify')
    return json({
      success: true,
      data: {
        action: 'login',
        user: { ...ASHA, auth_user_id: server.subject, role: server.role },
        session: { access_token: jwt(server.subject, `session-${server.subject}`), refresh_token: 'c'.repeat(64), expires_in: 3600 },
      },
    });
  return json({ success: true });
};

/** What the phone's secure store holds. */
export const secure = new Map<string, string>();
const originalFetch = global.fetch;

const noCleanup = async () => {
  throw new Error('no cleanup expected here');
};
let removeVerifier = () => {};

/**
 * A phone on which Asha signed in and opened the facility with a connection: the session and her profile are stored and
 * the offline-start settings are kept. The identity check is wired as app/_layout.tsx wires it.
 */
export async function signedInPhone(): Promise<void> {
  secure.clear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => secure.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
    secure.set(key, value);
  });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => {
    secure.delete(key);
  });
  await AsyncStorage.clear();
  Object.assign(server, {
    up: true, role: 'staff', customers: ['customer-1'], profileFails: false, customersFail: false,
    profileWait: undefined, subject: 'user-asha', discovery: undefined, onSend: undefined,
    profileMissing: false, sync: true, refreshRefused: false,
  });
  global.fetch = answer as unknown as typeof fetch;
  clearOfflineStarted();
  await loadOperatorServer();
  await saveOperatorServer(FACILITY, false);
  initializeSupabase(FACILITY.origin, ANON_KEY);
  await storeTokens(jwt('user-asha', 'session-user-asha'), 'a'.repeat(64), Date.now() + 3600_000);
  await cacheUserProfile(ASHA);
  const online = await verifySelectedOperator(() => true, noCleanup);
  if (online.kind !== 'verified') throw new Error('setup: the online start did not verify');
  // The gate may still be shut from the test before.
  removeVerifier = operatorResumeGate.installVerifier(current =>
    verifyForegroundOperator(current, noCleanup, config => initializeSupabase(config.supabaseUrl, config.anonKey))
  );
  await operatorResumeGate.ensureVerified();
  server.sent = [];
}

export function leavePhone(): void {
  removeVerifier();
  global.fetch = originalFetch;
}

/** The stored access token is past its expiry (same person, same session). */
export const expireToken = () =>
  storeTokens(jwt('user-asha', 'session-user-asha', -60), 'a'.repeat(64), Date.now() - 60_000, getSessionGeneration(), { refresh: true });

/** Force-stop and launch with the network off, as app/_layout.tsx does it, up to the session restore. */
export async function startWithNoConnection(): Promise<void> {
  server.up = false;
  const result = await verifySelectedOperator(() => true, noCleanup);
  if (result.kind !== 'offline') throw new Error(`expected an offline start, got ${result.kind}`);
  operatorResumeGate.suspend();
}

/** The facility check the app makes when it returns to the foreground. */
export const checkFacilityAgain = () => verifySelectedOperator(() => true, noCleanup);
