/**
 * The phone copy's database key (WH-298, contract 4.1): 32 random bytes, kept in secure storage readable only while
 * the phone is unlocked and never moved to a backup or another phone. A new key for every new copy. The key never
 * leaves secure storage except into `PRAGMA key`, and is never logged.
 */
import * as SecureStore from 'expo-secure-store';
import { getRandomBytesAsync } from 'expo-crypto';

export interface CopyKey {
  /** The session the copy belongs to (getSessionCacheScope). */
  scope: string;
  /** 64 lower-case hex characters. */
  keyHex: string;
}

const KEY_NAME = 'secure_phone_copy_key';

const toHex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

export async function loadCopyKey(): Promise<CopyKey | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_NAME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CopyKey> | null;
    if (typeof parsed?.scope !== 'string' || typeof parsed.keyHex !== 'string' || !/^[0-9a-f]{64}$/.test(parsed.keyHex))
      return null;
    return { scope: parsed.scope, keyHex: parsed.keyHex };
  } catch {
    return null;
  }
}

/** Makes a new key for `scope`, replacing any earlier one. */
export async function makeCopyKey(scope: string): Promise<CopyKey> {
  const key: CopyKey = { scope, keyHex: toHex(await getRandomBytesAsync(32)) };
  await SecureStore.setItemAsync(KEY_NAME, JSON.stringify(key), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

/** Never throws. */
export async function forgetCopyKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_NAME);
  } catch {
    // A key that cannot be removed opens nothing: the file it belonged to is deleted first.
  }
}
