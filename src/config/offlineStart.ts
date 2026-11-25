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
import { RequestTimeoutError } from './supabaseConfig';
import type { OperatorServer } from './operatorServer';

const STORAGE_KEY = 'offline_start_v1';

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

/** Never throws. */
export async function forgetOfflineStart(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing kept is harmless: the next verified start writes it again.
  }
}

/**
 * True for a failure where the server gave no answer: a lost connection (fetch's TypeError), a request the app gave
 * up waiting for, or an abort. False for anything the server answered, whatever its status or code.
 */
export function isNoAnswer(error: unknown): boolean {
  if (error instanceof RequestTimeoutError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const fields = error as { name?: unknown; noAnswer?: unknown; status?: unknown };
  if (fields.noAnswer === true) return true;
  if (fields.status !== undefined) return false;
  if (error instanceof TypeError) return true;
  return fields.name === 'TimeoutError' || fields.name === 'AbortError';
}

// In memory only: a new run starts online until its facility check says otherwise.
const startState = { offline: false };

/** The facility check of this run had no answer and the app opened from the kept config. */
export function markOfflineStarted(): void {
  startState.offline = true;
}

/** The server answered the facility check: from now on the server decides about the session, as before WH-298. */
export function clearOfflineStarted(): void {
  startState.offline = false;
}

export function isOfflineStarted(): boolean {
  return startState.offline;
}
