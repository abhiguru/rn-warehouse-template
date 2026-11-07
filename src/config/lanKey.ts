/**
 * The warehouse network key of the signed-in session (WH-133, spec specs/sign-lan-fallback-requests.md steps 1-5).
 *
 * The server makes one 32-byte key per session (64 hex characters; its id is the session id). The phone keeps it in
 * secure storage beside the session's tokens, removes it with them (`clearStoredTokensRaw` in supabaseConfig.ts calls
 * `forgetLanKey` and deletes `LAN_KEY_STORE_KEY`), and never logs it, puts it in an error, a report or any request
 * other than as an HMAC key. A key is used only for the facility it was issued for.
 *
 * It arrives in a sign-in answer (`data.session.lan_key_id` and `lan_key`) or in the signed-in `get-config` answer
 * over the public https address (`data.lanKey = { id, key }`). A refresh answer never carries one.
 *
 * This file imports nothing from the session code, so the transport can use it.
 */
import * as SecureStore from 'expo-secure-store';
import { HEX64, UUID } from './lanSigner';

export const LAN_KEY_STORE_KEY = 'secure_lan_key';

export type LanKey = { id: string; key: string };
type Held = LanKey & { facility: string };

/** undefined: not read from secure storage yet. null: there is none. */
let held: Held | null | undefined;
let loading: Promise<void> | null = null;
/** Bumped by every store and forget: a read that started before one must not put its value back. */
let epoch = 0;

/** A key from an answer, or null when it is not a well-formed pair. */
export function parseLanKey(id: unknown, key: unknown): LanKey | null {
  return typeof id === 'string' && typeof key === 'string' && UUID.test(id) && HEX64.test(key) ? { id, key } : null;
}

/** The identity a key belongs to: the facility's public origin and instance id (the same as the session's). */
export const facilityOf = (canonical: string, instanceId: string): string => `${canonical}|${instanceId}`;

function readHeld(raw: string | null): Held | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { id?: unknown; key?: unknown; facility?: unknown };
    const key = parseLanKey(value.id, value.key);
    return key && typeof value.facility === 'string' && value.facility ? { ...key, facility: value.facility } : null;
  } catch {
    return null;
  }
}

/** Reads the stored key once (later calls wait for the same read). Never throws; a key that cannot be read is no key. */
export function loadLanKey(): Promise<void> {
  if (held !== undefined) return Promise.resolve();
  if (!loading) {
    const started = epoch;
    loading = SecureStore.getItemAsync(LAN_KEY_STORE_KEY).then(
      raw => {
        if (epoch === started) held = readHeld(raw);
      },
      () => {
        if (epoch === started) held = null;
      }
    ).finally(() => {
      loading = null;
    });
  }
  return loading;
}

/** The key of this facility's session, or null (none, another facility's, or not read yet: call `loadLanKey` first). */
export function lanKeyFor(canonical: string, instanceId: string): LanKey | null {
  if (!held || held.facility !== facilityOf(canonical, instanceId)) return null;
  return { id: held.id, key: held.key };
}

/** Keeps the key for this facility's session. Resolves false when it could not be written; then there is no key. */
export async function storeLanKey(key: LanKey, canonical: string, instanceId: string): Promise<boolean> {
  epoch += 1;
  const value: Held = { ...key, facility: facilityOf(canonical, instanceId) };
  held = null;
  try {
    await SecureStore.setItemAsync(LAN_KEY_STORE_KEY, JSON.stringify(value));
    held = value;
    return true;
  } catch {
    await SecureStore.deleteItemAsync(LAN_KEY_STORE_KEY).catch(() => {});
    return false;
  }
}

/** Drops the key from memory at once (the delete from secure storage is done with the session's other keys). */
export function forgetLanKey(): void {
  epoch += 1;
  held = null;
}

/** Drops the key from memory and secure storage. */
export async function clearLanKey(): Promise<void> {
  forgetLanKey();
  await SecureStore.deleteItemAsync(LAN_KEY_STORE_KEY).catch(() => {});
}

/** For tests: back to "not read yet". */
export function resetLanKeyForTests(): void {
  epoch += 1;
  held = undefined;
  loading = null;
}
