/**
 * Opening a facility with no connection (WH-298, product/tech/app-offline-copy-and-sync.md section 3).
 *
 * The app keeps the last public configuration of the selected facility (only what any caller can fetch without
 * signing in: no token, no key), so a cold start with no answer from the server can open into that facility when
 * the person is signed in on this phone and the facility has the offline feature (`capabilities.sync`). A facility
 * never opened on this phone still needs the server.
 *
 * "Offline-started" is true from such a start until the server next answers the facility check: while it is true,
 * nothing has been heard from the server in this run, so an access token past its expiry has not been refused, only
 * not renewed yet. The session restore (src/store/slices/authSlice.ts) relies on that, and on nothing else.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PublicConfig } from '@/services/configService';
import { getCurrentConfig, getStoredToken, RequestTimeoutError } from './supabaseConfig';
import { getActiveOperatorServer, type OperatorServer } from './operatorServer';
import { getSessionGeneration, onCredentialsSettled } from './sessionLifecycle';
import { registerSessionScoped } from './sessionScopedRegistry';

const STORAGE_KEY = 'offline_start_v1';

/** The roles the phone copy and the offline start are for; customer accounts keep today's behaviour (Product's P5). */
export const COPY_ROLES: readonly string[] = ['admin', 'supervisor', 'staff'];
export const isCopyRole = (role: unknown): boolean => typeof role === 'string' && COPY_ROLES.includes(role);

export interface OfflineStartRecord {
  origin: string;
  instanceId: string;
  config: PublicConfig;
  savedAt: number;
}

/** True when the public config says the facility has the offline feature. */
export function hasSyncCapability(config: Pick<PublicConfig, 'capabilities'>): boolean {
  return config.capabilities.sync === true;
}

/** Keeps the selected facility's last public config (one record; another facility replaces it). Never throws. */
export async function rememberOfflineStart(server: Pick<OperatorServer, 'origin' | 'instanceId'>, config: PublicConfig): Promise<void> {
  const record: OfflineStartRecord = { origin: server.origin, instanceId: server.instanceId, config, savedAt: Date.now() };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Not kept: this facility then needs the server at the next start, as before WH-298.
  }
}

/**
 * What `initializeAuth` is rejected with when the secure store stays unreadable after the retries (WH-360): whether a
 * person is signed in is not known, so the root shows the load-error screen and nothing is signed out or erased.
 */
export const SESSION_STORE_UNREADABLE = 'auth/session-store-unreadable';

/** The kept config for this facility, or null unless origin AND instance id match. */
export async function readOfflineStart(server: Pick<OperatorServer, 'origin' | 'instanceId'>): Promise<PublicConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as Partial<OfflineStartRecord> | null;
    if (record?.origin !== server.origin || record.instanceId !== server.instanceId) return null;
    const config = record.config;
    if (typeof config?.supabaseUrl !== 'string' || typeof config.anonKey !== 'string') return null;
    if (!config.capabilities || typeof config.capabilities !== 'object') return null;
    return config;
  } catch {
    return null;
  }
}

// The config last adopted in this run, in memory only. The kept record is erased with each session (sign-out,
// session teardown), and a person may sign in again at the same facility with no further facility check.
let adopted: { server: Pick<OperatorServer, 'origin' | 'instanceId'>; config: PublicConfig } | null = null;

/** Keeps the record again for a new session of the facility whose config is in use. Never throws. */
async function keepForNewSession(): Promise<void> {
  const generation = getSessionGeneration();
  try {
    const kept = adopted;
    if (!kept || !(await getStoredToken()).authToken) return;
    const active = getActiveOperatorServer();
    if (active?.origin !== kept.server.origin || active.instanceId !== kept.server.instanceId) return;
    // Keys replaced since: the next facility check keeps the current ones.
    if (getCurrentConfig().anonKey !== kept.config.anonKey) return;
    // A session that ended meanwhile keeps nothing: its teardown erases the record.
    if (generation !== getSessionGeneration()) return;
    await rememberOfflineStart(kept.server, kept.config);
  } catch {
    // Not kept: the next facility check keeps it.
  }
}

onCredentialsSettled(() => void keepForNewSession());

/**
 * Where the app adopts a facility's public config (every verified start, opening a facility from My facilities, an SMS
 * sign-in to it, pairing a local facility, break-glass sign-in): keeps it for an offline start while the facility has
 * the feature, and removes the record when it has not. Never throws.
 */
export async function keepOfflineStart(server: Pick<OperatorServer, 'origin' | 'instanceId'>, config: PublicConfig): Promise<void> {
  // A config without capabilities (an older server) has no feature: no record.
  const capabilities = (config as { capabilities?: Record<string, unknown> | null }).capabilities;
  const offered = capabilities?.sync === true;
  adopted = offered ? { server, config } : null;
  if (offered) await rememberOfflineStart(server, config);
  else await forgetOfflineStart();
}

/** Erases the kept record: with the phone copy at the end of a session, and when the feature is off. Never throws. */
export async function forgetOfflineStart(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing kept is harmless: the next verified start writes it again.
  }
}

// Erased with the phone copy when a session ends: sign-out, forced sign-out, leaving the facility (WH-346).
registerSessionScoped('offline-start', () => forgetOfflineStart());

/**
 * Expo's fetch (installed as the global fetch since SDK 57) rejects only when no answer came, with its FetchError,
 * whose message always starts like this ("fetch failed: java.net.UnknownHostException: ..." on Android). An answer
 * with an error status never rejects fetch.
 */
const EXPO_FETCH_FAILED = 'fetch failed: ';

/**
 * True for a failure where the server gave no answer: a lost connection (React Native's fetch TypeError, Expo's fetch
 * FetchError), a request the app gave up waiting for, or an abort. False for anything the server answered, whatever
 * its status or code, and for a failure marked `answered`: one raised after the answer began, such as a body that
 * could not be read, which fails with the same errors as a lost connection (discoverOperator marks them).
 */
export function isNoAnswer(error: unknown): boolean {
  if (error instanceof RequestTimeoutError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const fields = error as { name?: unknown; noAnswer?: unknown; answered?: unknown; status?: unknown; message?: unknown };
  if (fields.answered === true) return false;
  if (fields.noAnswer === true) return true;
  if (fields.status !== undefined) return false;
  if (error instanceof TypeError) return true;
  if (typeof fields.message === 'string' && fields.message.startsWith(EXPO_FETCH_FAILED)) return true;
  return fields.name === 'TimeoutError' || fields.name === 'AbortError';
}

// The failures of a facility check after which the kept profile was refused for its age alone (WH-351). Marked on
// the failure itself, so a start and a return to the front read it the same way.
const pastLimitFailures = new WeakSet<object>();

/** No answer, and the kept profile is past the offline limit (src/config/offlineLimit.ts). */
export function markPastOfflineLimit(failure: unknown): void {
  if (typeof failure === 'object' && failure !== null) pastLimitFailures.add(failure);
}

/** True for a failure marked so: the screen then says that the phone was away too long. */
export function isPastOfflineLimit(failure: unknown): boolean {
  return typeof failure === 'object' && failure !== null && pastLimitFailures.has(failure);
}

// In memory only: a new run starts online until its facility check says otherwise.
const startState = {
  offline: false,
  /** The session generation whose role has not been confirmed since the server gave no answer; null once it has. */
  unconfirmed: null as number | null,
  /** How many times the role has been marked unconfirmed in this run. */
  marks: 0,
  onAnswer: new Set<() => void>(),
  onUnconfirmed: new Set<() => void>(),
};

/** The facility check of this run had no answer and the app opened from the kept config. */
export function markOfflineStarted(): void {
  startState.offline = true;
  markRoleUnconfirmed();
}

/**
 * The server gave no answer, or the open app was closed because the kept profile may no longer open it (WH-350):
 * nothing is written until the person's role has been read from the server. The `onRoleUnconfirmed` listeners run each
 * time, so the writes are held at once, whoever marked the role (WH-353).
 */
export function markRoleUnconfirmed(): void {
  startState.unconfirmed = getSessionGeneration();
  startState.marks += 1;
  for (const listener of [...startState.onUnconfirmed]) listener();
}

/** Runs `listener` every time the role is marked unconfirmed. Returns a cancel function. */
export function onRoleUnconfirmed(listener: () => void): () => void {
  startState.onUnconfirmed.add(listener);
  return () => {
    startState.onUnconfirmed.delete(listener);
  };
}

/**
 * True from such a start until the person's role has been read from the server again (WH-346). Unlike
 * `isOfflineStarted` it stays true when the server answers the facility check: that answer says nothing about the role.
 */
export function isRoleUnconfirmed(): boolean {
  return startState.unconfirmed === getSessionGeneration();
}

/** Changes with every mark: a read of the role begun before the latest one confirms nothing (WH-358). */
export const roleMarkCount = (): number => startState.marks;

export function noteRoleConfirmed(): void {
  startState.unconfirmed = null;
}

/**
 * The server answered the facility check: from now on the server decides about the session, as before WH-298. The
 * waiting `onFirstServerAnswer` listeners run once, after an offline start only.
 */
export function clearOfflineStarted(): void {
  if (!startState.offline) return;
  startState.offline = false;
  const waiting = [...startState.onAnswer];
  startState.onAnswer.clear();
  for (const listener of waiting) listener();
}

export function isOfflineStarted(): boolean {
  return startState.offline;
}

/** Runs `listener` once when the server first answers after an offline start. Returns a cancel function. */
export function onFirstServerAnswer(listener: () => void): () => void {
  startState.onAnswer.add(listener);
  return () => {
    startState.onAnswer.delete(listener);
  };
}
