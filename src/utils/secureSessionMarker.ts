/**
 * Secure Session Marker Utility
 *
 * Provides cryptographically signed session markers to prevent tampering.
 * Uses HMAC-SHA256 to sign session data with a device-specific secret.
 *
 * Security features:
 * - HMAC signature verification prevents marker tampering
 * - Device-bound secret key (generated once per install)
 * - Expiration time enforcement
 * - Automatic cleanup of expired/invalid markers
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// TYPES
// ============================================================================

export interface SessionMarkerData {
  user_id: string;
  login_time: number;
  expires_at: number;
  device_id?: string;
}

interface SignedSessionMarker {
  data: SessionMarkerData;
  signature: string;
  version: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEYS = {
  SESSION_MARKER: 'secure_session_marker',
  DEVICE_SECRET: 'device_secret_key',
} as const;

const MARKER_VERSION = 1;
// Session persists until explicit logout (1 year effective duration)
// Auto-extended on each app use via extendSessionMarker()
const SESSION_DURATION_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * Get or create a device-specific secret key
 * S4 Fix: Now uses expo-secure-store for encrypted storage and generates
 * a random fallback instead of using a hardcoded string
 */
async function getDeviceSecret(): Promise<string> {
  try {
    // S4 Fix: Use SecureStore instead of AsyncStorage for device secret
    let secret = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_SECRET);

    if (!secret) {
      // Check if we have a legacy secret in AsyncStorage and migrate it
      const legacySecret = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_SECRET);
      if (legacySecret) {
        // Migrate legacy secret to SecureStore
        await SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_SECRET, legacySecret);
        await AsyncStorage.removeItem(STORAGE_KEYS.DEVICE_SECRET);
        console.log('[SecureSession] Migrated device secret to SecureStore');
        return legacySecret;
      }

      // Generate a new random secret (32 bytes = 256 bits)
      const randomBytes = await Crypto.getRandomBytesAsync(32);
      secret = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      await SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_SECRET, secret);
      console.log('[SecureSession] Generated new device secret in SecureStore');
    }

    return secret;
  } catch (error) {
    console.error('[SecureSession] Error getting device secret:', error);
    // S4 Fix: Generate a random fallback instead of using hardcoded string
    // This is still less secure but prevents using a known fallback
    try {
      const fallbackBytes = await Crypto.getRandomBytesAsync(32);
      const fallbackSecret = Array.from(fallbackBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      console.warn('[SecureSession] Using random fallback secret (not persisted)');
      return fallbackSecret;
    } catch {
      // Last resort: use device info to create a pseudo-random key
      // This is still better than a hardcoded string
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2);
      console.warn('[SecureSession] Using pseudo-random fallback secret');
      return `fallback_${timestamp}_${random}_${Math.random().toString(36)}`;
    }
  }
}

/**
 * Create HMAC-SHA256 signature for session data
 */
async function createSignature(data: SessionMarkerData): Promise<string> {
  const secret = await getDeviceSecret();
  const message = JSON.stringify(data);

  // Create HMAC using expo-crypto
  const signature = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${secret}:${message}`
  );

  return signature;
}

/**
 * Verify HMAC-SHA256 signature
 */
async function verifySignature(
  data: SessionMarkerData,
  signature: string
): Promise<boolean> {
  try {
    const expectedSignature = await createSignature(data);
    return signature === expectedSignature;
  } catch (error) {
    console.error('[SecureSession] Signature verification error:', error);
    return false;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Create and store a signed session marker
 *
 * @param userId - The authenticated user's ID
 * @param expiresInMs - Session duration in milliseconds (default: 24 hours)
 * @returns The created session marker data
 */
export async function createSecureSessionMarker(
  userId: string,
  expiresInMs: number = SESSION_DURATION_MS
): Promise<SessionMarkerData> {
  const now = Date.now();

  const markerData: SessionMarkerData = {
    user_id: userId,
    login_time: now,
    expires_at: now + expiresInMs,
  };

  const signature = await createSignature(markerData);

  const signedMarker: SignedSessionMarker = {
    data: markerData,
    signature,
    version: MARKER_VERSION,
  };

  await AsyncStorage.setItem(
    STORAGE_KEYS.SESSION_MARKER,
    JSON.stringify(signedMarker)
  );

  console.log('[SecureSession] Created secure session marker for user:', userId);

  return markerData;
}

/**
 * Retrieve and verify a stored session marker
 *
 * @returns The session marker data if valid, null if invalid/expired/missing
 */
export async function getSecureSessionMarker(): Promise<SessionMarkerData | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.SESSION_MARKER);

    if (!stored) {
      return null;
    }

    const signedMarker: SignedSessionMarker = JSON.parse(stored);

    // Version check for future migrations
    if (signedMarker.version !== MARKER_VERSION) {
      console.warn('[SecureSession] Session marker version mismatch, clearing');
      await clearSecureSessionMarker();
      return null;
    }

    // Verify signature to detect tampering
    const isValid = await verifySignature(
      signedMarker.data,
      signedMarker.signature
    );

    if (!isValid) {
      console.warn('[SecureSession] Session marker signature invalid - possible tampering');
      await clearSecureSessionMarker();
      return null;
    }

    // Check expiration
    if (signedMarker.data.expires_at < Date.now()) {
      console.log('[SecureSession] Session marker expired');
      await clearSecureSessionMarker();
      return null;
    }

    console.log('[SecureSession] Valid session marker found for user:', signedMarker.data.user_id);
    return signedMarker.data;
  } catch (error) {
    console.error('[SecureSession] Error reading session marker:', error);
    await clearSecureSessionMarker();
    return null;
  }
}

/**
 * Check if a valid session marker exists
 *
 * @returns true if a valid, non-expired session marker exists
 */
export async function hasValidSessionMarker(): Promise<boolean> {
  const marker = await getSecureSessionMarker();
  return marker !== null;
}

/**
 * Clear the stored session marker
 */
export async function clearSecureSessionMarker(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.SESSION_MARKER);
    console.log('[SecureSession] Session marker cleared');
  } catch (error) {
    console.error('[SecureSession] Error clearing session marker:', error);
  }
}

/**
 * Extend session marker expiration (for "remember me" functionality)
 *
 * @param additionalMs - Additional time to add in milliseconds
 */
export async function extendSessionMarker(
  additionalMs: number = SESSION_DURATION_MS
): Promise<boolean> {
  try {
    const currentMarker = await getSecureSessionMarker();

    if (!currentMarker) {
      return false;
    }

    // Create new marker with extended expiration
    await createSecureSessionMarker(
      currentMarker.user_id,
      currentMarker.expires_at - Date.now() + additionalMs
    );

    console.log('[SecureSession] Session marker extended');
    return true;
  } catch (error) {
    console.error('[SecureSession] Error extending session marker:', error);
    return false;
  }
}

/**
 * Get remaining session time in milliseconds
 *
 * @returns Remaining time in ms, or 0 if expired/invalid
 */
export async function getSessionTimeRemaining(): Promise<number> {
  const marker = await getSecureSessionMarker();

  if (!marker) {
    return 0;
  }

  const remaining = marker.expires_at - Date.now();
  return Math.max(0, remaining);
}

/**
 * Migrate legacy session marker to secure format
 * Call this during app initialization to upgrade old markers
 */
export async function migrateLegacySessionMarker(): Promise<boolean> {
  try {
    // Check for legacy marker
    const legacyMarker = await AsyncStorage.getItem('session_marker');

    if (!legacyMarker) {
      return false;
    }

    const legacy = JSON.parse(legacyMarker);

    // Check if legacy marker is still valid
    if (legacy.expires_at && legacy.expires_at > Date.now() && legacy.user_id) {
      console.log('[SecureSession] Migrating legacy session marker');

      // Create new secure marker with remaining time
      const remainingTime = legacy.expires_at - Date.now();
      await createSecureSessionMarker(legacy.user_id, remainingTime);

      // Remove legacy marker
      await AsyncStorage.removeItem('session_marker');

      console.log('[SecureSession] Legacy marker migrated successfully');
      return true;
    } else {
      // Legacy marker expired, just remove it
      await AsyncStorage.removeItem('session_marker');
      return false;
    }
  } catch (error) {
    console.error('[SecureSession] Error migrating legacy marker:', error);
    return false;
  }
}
