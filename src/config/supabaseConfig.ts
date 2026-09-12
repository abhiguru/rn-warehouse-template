import {
  createClient,
  SupabaseClient,
  Session,
  User,
} from '@supabase/supabase-js';
import type { UserProfile } from '@/types/user.types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { clearSecureSessionMarker } from '@/utils/secureSessionMarker';
import { checkOTPRateLimit, recordOTPRequest } from '@/utils/otpRateLimiter';
import { CACHE_DURATION_LONG_MS } from '@/config/cacheConfig';

// S2/S3 Fix: SecureStore keys for encrypted token storage
const SECURE_KEYS = {
  AUTH_TOKEN: 'secure_auth_token',
  REFRESH_TOKEN: 'secure_refresh_token',
  TOKEN_EXPIRES: 'secure_token_expires',
} as const;

// The backend uses custom OTP sessions, not GoTrue. Keep the bootstrap client anonymous.
let __supabaseInstance: SupabaseClient | undefined;
let __currentConfig: { url: string; anonKey: string } | undefined;
let __authenticatedClientInstance: SupabaseClient | undefined;
let __cachedAuthToken: string | undefined;

export const clearAuthenticatedClientCache = () => {
  __authenticatedClientInstance = undefined;
  __cachedAuthToken = undefined;
};

export const initializeSupabase = (
  url: string,
  anonKey: string
): SupabaseClient => {
  if (
    !__supabaseInstance ||
    __currentConfig?.url !== url ||
    __currentConfig?.anonKey !== anonKey
  ) {
    clearAuthenticatedClientCache();
    __currentConfig = { url, anonKey };
    __supabaseInstance = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return __supabaseInstance;
};

export const getSupabaseClient = (): SupabaseClient => {
  if (!__supabaseInstance)
    throw new Error('Configuration must be loaded first.');
  return __supabaseInstance;
};

export const getCurrentConfig = () => {
  if (!__currentConfig) throw new Error('Configuration must be loaded first.');
  return __currentConfig;
};

export const getSupabaseRPCClient = getSupabaseClient;

export const getAuthenticatedClient = async (): Promise<SupabaseClient> => {
  if (!(await ensureValidTokens())) {
    clearAuthenticatedClientCache();
    throw new Error('Sign in required');
  }
  const token = await getStoredToken();
  if (!token.authToken || !token.isValid) throw new Error('Sign in required');
  if (!__authenticatedClientInstance || __cachedAuthToken !== token.authToken) {
    const config = getCurrentConfig();
    __authenticatedClientInstance = createClient(config.url, config.anonKey, {
      global: { headers: { Authorization: 'Bearer ' + token.authToken } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    __cachedAuthToken = token.authToken;
  }
  return __authenticatedClientInstance;
};

export const getSupabaseWithJWT = getAuthenticatedClient;

// Phone authentication helper using custom RPC
export const signInWithPhone = async (phone: string) => {
  try {
    // Format phone number for backend (ensure 12 digits with country code 91)
    let formattedPhone = phone.replace(/^\+/, ''); // Remove + if present

    // If phone doesn't start with 91, add it
    if (!formattedPhone.startsWith('91')) {
      formattedPhone = `91${formattedPhone}`;
    }

    // Check rate limit before sending OTP (persistent, survives app restart)
    const rateLimit = await checkOTPRateLimit(formattedPhone);
    if (!rateLimit.allowed) {
      const retryAfterSec = rateLimit.retryAfterSeconds || 60;
      const reason =
        rateLimit.reason === 'daily'
          ? `Daily limit reached (20 requests). Try again tomorrow.`
          : `Please wait ${retryAfterSec} seconds before requesting another code.`;

      console.warn('[Auth] OTP rate limit exceeded:', {
        phone: formattedPhone.slice(-4),
        reason: rateLimit.reason,
        retryAfterSec,
        dailyRemaining: rateLimit.dailyRemaining,
      });

      return {
        success: false,
        error: reason,
      };
    }

    const { data, error } = await getSupabaseClient().rpc('send_otp', {
      p_phone_number: formattedPhone,
      p_purpose: 'login',
    });

    // Log full response for debugging

    if (error) {
      console.error('[Auth] Send OTP RPC error:', error);
      return { success: false, error: error.message };
    }

    // Check if OTP was sent successfully - RPC returns array
    const responseData = Array.isArray(data) ? data[0] : data;
    const isSuccess =
      responseData?.success === true || responseData?.status === 'success';

    if (isSuccess) {
      // Record successful OTP request for rate limiting
      await recordOTPRequest(formattedPhone);

      return { success: true, data: responseData };
    } else {
      const errorMsg =
        responseData?.message || responseData?.error || 'Failed to send OTP';
      console.error('[Auth] Send OTP failed:', errorMsg);
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    console.error('[Auth] Send OTP exception:', error);
    return { success: false, error: 'Failed to send OTP' };
  }
};

// ============================================================================
// AUTH HELPER FUNCTIONS (extracted for clarity - Issue #9, #28)
// ============================================================================

interface AuthSuccessResult {
  success: true;
  data: {
    session: Session | null;
    user: User | null;
    userProfile: UserProfile | null;
    action: string;
    customAuth?: boolean;
    accessToken?: string;
  };
}

interface AuthFailureResult {
  success: false;
  error: string;
}

type AuthResult = AuthSuccessResult | AuthFailureResult;

/**
 * Format phone number to standard format (12 digits with country code 91)
 */
const formatPhoneNumber = (phone: string): string => {
  let formatted = phone.replace(/^\+/, '');
  if (!formatted.startsWith('91')) {
    formatted = `91${formatted}`;
  }
  return formatted;
};

/**
 * S9 Fix: Validate JWT token structure and expiration
 * Returns decoded payload if valid, null otherwise
 */
const validateJWTToken = (
  token: string
): { valid: boolean; exp?: number; sub?: string } => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('[Auth] Invalid JWT: Expected 3 parts, got', parts.length);
      return { valid: false };
    }

    // Decode the payload (middle part) - Base64URL decode
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payloadJson = atob(payloadBase64);
    const payload = JSON.parse(payloadJson);

    // Check required claims
    if (!payload.exp) {
      console.warn('[Auth] Invalid JWT: Missing exp claim');
      return { valid: false };
    }

    // Check if token is already expired
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      console.warn('[Auth] Invalid JWT: Token already expired');
      return { valid: false };
    }

    return {
      valid: true,
      exp: payload.exp,
      sub: payload.sub,
    };
  } catch (error) {
    console.warn('[Auth] Invalid JWT: Failed to parse token', error);
    return { valid: false };
  }
};

// ============================================================================
// MAIN AUTH FUNCTIONS
// ============================================================================

/**
 * OTP verification using custom RPC
 *
 * Standardized backend response format:
 * {
 *   success: true,
 *   message: "Login successful",
 *   data: {
 *     user: { id, auth_user_id, name, mobile, role, ... },
 *     session: { access_token, refresh_token, expires_at, ... },
 *     action: "login" | "register"
 *   }
 * }
 *
 * @param phone - Phone number to verify
 * @param token - OTP code entered by user
 * @param userName - Optional user name for registration
 */
export const verifyOTP = async (
  phone: string,
  token: string,
  userName?: string
): Promise<AuthResult> => {
  try {
    const formattedPhone = formatPhoneNumber(phone);

    // Step 1: Call the verification RPC
    const { data, error } = await getSupabaseClient().rpc(
      'verify_otp_or_register',
      {
        p_phone_number: formattedPhone,
        p_otp_code: token,
        p_name: userName || null,
      }
    );

    if (error) {
      console.error('[Auth] OTP verification RPC error:', error);
      return { success: false, error: error.message };
    }

    // Handle array response from RPC
    const rpcResponse = Array.isArray(data) ? data[0] : data;
    const isSuccess = rpcResponse?.success === true;

    if (!isSuccess || !rpcResponse?.data) {
      const errorMsg = rpcResponse?.message || 'Verification failed';
      console.error('[Auth] OTP verification failed:', errorMsg);
      return { success: false, error: errorMsg };
    }

    // Extract standardized response structure:
    // { success: true, message: "...", data: { user: {...}, session: {...}, action: "..." } }
    const responseData = rpcResponse.data as {
      user: UserProfile;
      session: {
        access_token: string;
        refresh_token: string;
        expires_at: string;
        expires_in: number;
        token_type: string;
      };
      action: string;
    };

    // =========================================================================
    // AUTH: Extract JWT tokens from session object
    // =========================================================================
    const { session, user, action } = responseData;

    if (!session?.access_token || !session?.refresh_token) {
      console.error('[Auth] No JWT tokens in session object');
      return { success: false, error: 'No authentication tokens received' };
    }

    const accessTokenStr = String(session.access_token);
    const refreshTokenStr = String(session.refresh_token);

    // Validate JWT structure and expiration
    const validation = validateJWTToken(accessTokenStr);
    if (!validation.valid) {
      console.error('[Auth] ❌ Invalid JWT token received from backend');
      return { success: false, error: 'Invalid authentication token' };
    }

    // Calculate expiration time
    const expiresAt = validation.exp
      ? validation.exp * 1000
      : new Date(session.expires_at).getTime();

    // Store the JWT tokens
    await storeTokens(accessTokenStr, refreshTokenStr, expiresAt);

    // Clear cached authenticated client so it picks up the new token
    clearAuthenticatedClientCache();

    // Fetch customer assignments and cache profile with them
    let userProfileWithCustomers = user;
    if (user) {
      try {
        const authClient = await getAuthenticatedClient();
        const { data: customerIds, error: rpcError } = await authClient.rpc(
          'user_accessible_customers'
        );

        if (!rpcError && customerIds) {
          userProfileWithCustomers = {
            ...user,
            assignedCustomerIds: customerIds,
          };
        }
      } catch (err) {
        console.warn('[Auth] Failed to fetch customer assignments:', err);
      }
      await cacheUserProfile(userProfileWithCustomers);
    }

    return {
      success: true,
      data: {
        session: null,
        user: null,
        userProfile: userProfileWithCustomers,
        action: action || 'login',
        customAuth: true,
        accessToken: accessTokenStr,
      },
    };
  } catch (error) {
    console.error('[Auth] OTP verification exception:', error);
    return { success: false, error: 'OTP verification failed' };
  }
};

// Sign out helper - clear stored tokens and Supabase session
export const signOut = async () => {
  try {
    const stored = await getStoredToken();
    if (stored.refreshToken) {
      const { error } = await getSupabaseRPCClient().rpc('logout_session', {
        p_refresh_token: stored.refreshToken,
      });
      if (error)
        console.warn(
          '[Auth] Server logout unavailable; local credentials will still be cleared.'
        );
    }

    // Clear all stored tokens and session data
    await clearStoredTokens();

    // Clear secure session marker
    await clearSecureSessionMarker();

    // Clear any AsyncStorage data that might persist
    // Get all keys and remove any that contain 'auth' or 'session'
    const allKeys = await AsyncStorage.getAllKeys();
    const authKeys = allKeys.filter(
      key =>
        key.includes('auth') ||
        key.includes('session') ||
        key.includes('supabase') ||
        key.includes('sb-')
    );

    if (authKeys.length > 0) {
      await AsyncStorage.multiRemove(authKeys);
    }

    return { success: true };
  } catch (error) {
    console.error('[Auth] Sign out exception:', error);
    return { success: false, error: 'Sign out failed' };
  } finally {
    clearAuthenticatedClientCache();
    await clearStoredTokens();
    await clearSecureSessionMarker();
  }
};

// ============================================================================
// CUSTOM JWT TOKEN REFRESH
// ============================================================================

/**
 * Refresh custom JWT tokens using the stored refresh token.
 * Calls backend RPC to get new access/refresh tokens.
 *
 * @returns New token data if successful, null if refresh failed
 */
type RefreshedSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};
let refreshInFlight: Promise<RefreshedSession | null> | null = null;
export const refreshCustomJWT = (): Promise<RefreshedSession | null> => {
  if (!refreshInFlight) {
    refreshInFlight = refreshSession().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};
const refreshSession = async (): Promise<RefreshedSession | null> => {
  try {
    // Get stored refresh token from SecureStore
    const { refreshToken } = await getStoredToken();

    if (!refreshToken) {
      return null;
    }

    // Call backend RPC to refresh tokens
    const { data, error } = await getSupabaseClient().rpc('refresh_jwt_token', {
      p_refresh_token: refreshToken,
    });

    if (error) {
      console.error('[Auth] Token refresh RPC error:', error.message);
      // If refresh token is invalid/expired, clear stored tokens
      if (
        error.message.includes('invalid') ||
        error.message.includes('expired')
      ) {
        await clearStoredTokens();
      }
      return null;
    }

    // Handle array response from RPC
    const responseData = Array.isArray(data) ? data[0] : data;

    if (!responseData?.success || !responseData?.access_token) {
      if (responseData?.success === false) await clearStoredTokens();
      console.error(
        '[Auth] Token refresh failed:',
        responseData?.message || 'Unknown error'
      );
      return null;
    }

    const newAccessToken = String(responseData.access_token);
    const newRefreshToken = String(responseData.refresh_token || refreshToken);

    // Validate the new JWT
    const validation = validateJWTToken(newAccessToken);
    if (!validation.valid) {
      console.error('[Auth] Refreshed token is invalid');
      return null;
    }

    // Calculate expiration
    const expiresAt = validation.exp
      ? validation.exp * 1000
      : responseData.expires_at
        ? new Date(responseData.expires_at).getTime()
        : Date.now() + 24 * 60 * 60 * 1000; // Default 24h

    // Store the new tokens
    await storeTokens(newAccessToken, newRefreshToken, expiresAt);

    // Clear cached authenticated client so it picks up new token
    clearAuthenticatedClientCache();

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt,
    };
  } catch (error) {
    console.error('[Auth] Token refresh exception:', error);
    return null;
  }
};

/**
 * Check if stored tokens are expired and try to refresh them
 *
 * @returns true if tokens are valid (or were successfully refreshed), false otherwise
 */
export const ensureValidTokens = async (): Promise<boolean> => {
  try {
    const tokenData = await getStoredToken();

    // JWT tokens - check if we need to refresh
    if (tokenData.type === 'jwt') {
      const expiresAt = tokenData.expiresAt || 0;
      const now = Date.now();
      const bufferMs = 5 * 60 * 1000; // 5 minute buffer

      // Token still valid with buffer
      if (expiresAt > now + bufferMs) {
        return true;
      }

      // Token expired or about to expire - try refresh

      const refreshResult = await refreshCustomJWT();

      if (refreshResult) {
        return true;
      }

      // Refresh failed - tokens are invalid

      // A temporary network error must not destroy an otherwise unexpired session.
      const remaining = await getStoredToken();
      return remaining.isValid === true;
    }

    return false;
  } catch (error) {
    console.error('[Auth] ensureValidTokens error:', error);
    return false;
  }
};

// Session Management (supports both JWT tokens and session markers)
// S2/S3 Fix: Now uses SecureStore for encrypted token storage
export const getStoredToken = async (): Promise<{
  authToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  isValid: boolean;
  type?: 'jwt' | 'session';
}> => {
  try {
    // S2/S3 Fix: First check SecureStore for tokens
    let authToken = await SecureStore.getItemAsync(SECURE_KEYS.AUTH_TOKEN);
    let refreshToken = await SecureStore.getItemAsync(
      SECURE_KEYS.REFRESH_TOKEN
    );
    let expiresAtStr = await SecureStore.getItemAsync(
      SECURE_KEYS.TOKEN_EXPIRES
    );

    // Migration: If no tokens in SecureStore, check AsyncStorage and migrate
    if (!authToken || !refreshToken) {
      const legacyAuthToken = await AsyncStorage.getItem('auth_token');
      const legacyRefreshToken = await AsyncStorage.getItem('refresh_token');
      const legacyExpiresAt = await AsyncStorage.getItem('token_expires_at');

      if (legacyAuthToken && legacyRefreshToken) {
        // Decode legacy tokens and migrate to SecureStore
        authToken = decodeToken(legacyAuthToken);
        refreshToken = decodeToken(legacyRefreshToken);
        expiresAtStr = legacyExpiresAt;

        // Never use legacy credentials until secure persistence succeeds.
        await storeTokens(authToken, refreshToken, Number(expiresAtStr));
      }
    }

    if (authToken && refreshToken) {
      const expires = Number(expiresAtStr);
      // Expiry is written last as the completion marker. Reject partial writes.
      if (!Number.isFinite(expires) || expires <= 0) return { isValid: false };
      const now = Date.now();

      // Expired access tokens still carry a usable refresh token. Never delete it here.
      return {
        authToken,
        refreshToken,
        expiresAt: expires,
        isValid: expires > now,
        type: 'jwt',
      };
    }

    return { isValid: false };
  } catch {
    console.error('[Auth] Unable to read a securely persisted session.');
    return { isValid: false };
  }
};

// Read-only compatibility for migrating old sessions; never encode new tokens.
const decodeToken = (encoded: string): string => {
  try {
    // Check if it looks like base64 (contains only valid base64 characters)
    // Valid JWT tokens have periods, so if it has a period, it's likely already decoded/plain
    if (encoded.includes('.') || /^[a-f0-9]{64}$/i.test(encoded)) {
      return encoded; // Already a plain JWT token
    }
    return decodeURIComponent(escape(atob(encoded)));
  } catch {
    // Fallback for legacy plain-text tokens during migration
    return encoded;
  }
};

// Expiry is the completion marker for the three SecureStore values. Invalidate it
// before replacing either token, then write it only after the pair is persisted.
export const storeTokens = async (
  accessToken: string,
  refreshToken: string,
  expiresAt: number
) => {
  try {
    if (
      !accessToken ||
      !refreshToken ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= 0
    ) {
      throw new Error('Incomplete session');
    }
    clearAuthenticatedClientCache();
    await SecureStore.deleteItemAsync(SECURE_KEYS.TOKEN_EXPIRES);
    await AsyncStorage.multiRemove([
      'auth_token',
      'refresh_token',
      'token_expires_at',
    ]);
    await SecureStore.setItemAsync(SECURE_KEYS.AUTH_TOKEN, accessToken);
    await SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, refreshToken);
    await SecureStore.setItemAsync(
      SECURE_KEYS.TOKEN_EXPIRES,
      expiresAt.toString()
    );
  } catch {
    // Never downgrade to unencrypted storage or log native errors that may echo
    // the value being written. Login/refresh must fail when persistence fails.
    await clearStoredTokens();
    throw new Error('Unable to save session securely');
  }
};

// Clear all stored tokens
// S2/S3 Fix: Clears from both SecureStore and AsyncStorage
export const clearStoredTokens = async () => {
  clearAuthenticatedClientCache();
  try {
    // Clear from SecureStore
    await SecureStore.deleteItemAsync(SECURE_KEYS.AUTH_TOKEN).catch(() => {});
    await SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN).catch(
      () => {}
    );
    await SecureStore.deleteItemAsync(SECURE_KEYS.TOKEN_EXPIRES).catch(
      () => {}
    );
    // Obsolete alternate helper used this expiry spelling.
    await SecureStore.deleteItemAsync('secure_token_expires_at').catch(
      () => {}
    );
    await SecureStore.deleteItemAsync('cached_user_profile').catch(() => {});

    // Also clear any legacy tokens from AsyncStorage
    await AsyncStorage.multiRemove([
      'auth_token',
      'refresh_token',
      'token_expires_at',
      'cached_user_profile',
      'session_marker',
    ]);
  } catch (error) {
    console.error('[Auth] Error clearing tokens:', error);
  }
};

/// S8 Fix: Cache TTL for user profile - using centralized config
const PROFILE_CACHE_TTL_MS = CACHE_DURATION_LONG_MS;

interface CachedProfile {
  profile: unknown;
  cachedAt: number;
}

// Get cached user profile
// S8 Fix: Now uses SecureStore with TTL validation
export const getCachedUserProfile = async () => {
  try {
    // Try SecureStore first
    const cached = await SecureStore.getItemAsync('cached_user_profile');
    if (cached) {
      const parsed: CachedProfile = JSON.parse(cached);
      // Validate TTL
      if (Date.now() - parsed.cachedAt < PROFILE_CACHE_TTL_MS) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let profile = parsed.profile as any;

        // If cached profile is missing assignedCustomerIds, fetch them
        if (profile && !profile.assignedCustomerIds) {
          try {
            const authClient = await getAuthenticatedClient();
            const { data: customerIds, error: rpcError } = await authClient.rpc(
              'user_accessible_customers'
            );

            if (!rpcError && customerIds) {
              profile = { ...profile, assignedCustomerIds: customerIds };
              // Update cache with customer assignments
              await cacheUserProfile(profile);
            }
          } catch (err) {
            console.warn(
              '[Auth] Failed to fetch customer assignments for cached profile:',
              err
            );
          }
        }

        return profile;
      } else {
        // Cache expired, clean up
        await SecureStore.deleteItemAsync('cached_user_profile');
      }
    }

    // Migration: Check AsyncStorage for legacy cache
    const legacyCached = await AsyncStorage.getItem('cached_user_profile');
    if (legacyCached) {
      const profile = JSON.parse(legacyCached);
      // Migrate to SecureStore with new TTL format
      await cacheUserProfile(profile);
      await AsyncStorage.removeItem('cached_user_profile');

      return profile;
    }

    // A profile cache timeout is not a session timeout. Reload the active profile
    // through RLS instead of discarding a still-refreshable login.
    const client = await getAuthenticatedClient();
    const stored = await getStoredToken();
    const subject = stored.authToken
      ? validateJWTToken(stored.authToken).sub
      : undefined;
    if (!subject) return null;
    const { data: profile, error } = await client
      .from('user_profiles')
      .select('*')
      .eq('auth_user_id', subject)
      .eq('active', true)
      .single();
    if (error || !profile) return null;
    const { data: customerIds } = await client.rpc('user_accessible_customers');
    const result = { ...profile, assignedCustomerIds: customerIds || [] };
    await cacheUserProfile(result);
    return result;
  } catch (error) {
    console.error('[Auth] Error getting cached profile:', error);
  }
  return null;
};

// Store user profile in cache
// S8 Fix: Now uses SecureStore with TTL tracking
export const cacheUserProfile = async (profile: unknown) => {
  try {
    const cacheEntry: CachedProfile = {
      profile,
      cachedAt: Date.now(),
    };
    await SecureStore.setItemAsync(
      'cached_user_profile',
      JSON.stringify(cacheEntry)
    );
  } catch (error) {
    console.error('[Auth] Error caching profile:', error);
    // Fallback to AsyncStorage if SecureStore fails
    try {
      await AsyncStorage.setItem(
        'cached_user_profile',
        JSON.stringify(profile)
      );
      console.warn('[Auth] Profile cached in AsyncStorage (fallback)');
    } catch (fallbackError) {
      console.error('[Auth] Fallback caching also failed:', fallbackError);
    }
  }
};

// Export types for convenience
export type { User, Session } from '@supabase/supabase-js';
