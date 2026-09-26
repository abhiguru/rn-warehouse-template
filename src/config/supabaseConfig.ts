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
import { getActiveOperatorServer } from '@/config/operatorServer';
import {
  advanceSessionGeneration,
  getSessionGeneration,
  serializeCredentials,
} from './sessionLifecycle';

// S2/S3 Fix: SecureStore keys for encrypted token storage
const SECURE_KEYS = {
  AUTH_TOKEN: 'secure_auth_token',
  REFRESH_TOKEN: 'secure_refresh_token',
  TOKEN_EXPIRES: 'secure_token_expires',
  ENROLLMENT_TOKEN: 'secure_enrollment_token',
  OPERATOR_IDENTITY: 'secure_operator_identity',
} as const;

// The backend uses custom OTP sessions, not GoTrue. Keep the bootstrap client anonymous.
let __supabaseInstance: SupabaseClient | undefined;
let __currentConfig: { url: string; anonKey: string } | undefined;
let __authenticatedClientInstance: SupabaseClient | undefined;
let __cachedAuthToken: string | undefined;
let operatorSwitching = false;
const activeRequests = new Set<{ controller: AbortController; mutation: boolean }>();

async function trackedSessionFetch(input: RequestInfo | URL, init: RequestInit | undefined, generation: number, mutation: boolean): Promise<Response> {
  if (operatorSwitching || generation !== getSessionGeneration()) throw new Error('Session changed');
  const controller = new AbortController();
  const request = { controller, mutation };
  const abort = () => controller.abort();
  if (init?.signal?.aborted) controller.abort();
  else init?.signal?.addEventListener('abort', abort, { once: true });
  activeRequests.add(request);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if (operatorSwitching || generation !== getSessionGeneration()) throw new Error('Session changed');
    // Body parsing can finish after fetch resolves. Check again before callers
    // can use a late document, print result, or warehouse response.
    return new Proxy(response, {
      get(target, property) {
        const value = Reflect.get(target, property);
        if (typeof value !== 'function') return value;
        if (['json', 'text', 'arrayBuffer', 'blob', 'formData'].includes(String(property))) {
          return async (...args: unknown[]) => {
            const body = await value.apply(target, args);
            if (operatorSwitching || generation !== getSessionGeneration()) throw new Error('Session changed');
            return body;
          };
        }
        return value.bind(target);
      },
    });
  } finally {
    activeRequests.delete(request);
    init?.signal?.removeEventListener('abort', abort);
  }
}

export function createAuthenticatedFetch() {
  const generation = getSessionGeneration();
  return (input: RequestInfo | URL, init?: RequestInit) => trackedSessionFetch(input, init, generation, true);
}

export function createSessionReadFetch() {
  const generation = getSessionGeneration();
  return (input: RequestInfo | URL, init?: RequestInit) => trackedSessionFetch(input, init, generation, false);
}

export function beginOperatorSwitch(): boolean {
  if (operatorSwitching || [...activeRequests].some(request => request.mutation)) return false;
  operatorSwitching = true;
  for (const request of activeRequests) if (!request.mutation) request.controller.abort();
  return true;
}

export function endOperatorSwitch(): void { operatorSwitching = false; }

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
    if (__currentConfig && __currentConfig.url !== url)
      void clearStoredTokens();
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
  if (operatorSwitching) throw new Error('Server switch in progress');
  const generation = getSessionGeneration();
  if (!(await ensureValidTokens())) {
    clearAuthenticatedClientCache();
    throw new Error('Sign in required');
  }
  const token = await getStoredToken();
  if (
    generation !== getSessionGeneration() ||
    operatorSwitching ||
    !token.authToken ||
    !token.isValid
  )
    throw new Error('Sign in required');
  if (!__authenticatedClientInstance || __cachedAuthToken !== token.authToken) {
    const config = getCurrentConfig();
    __authenticatedClientInstance = createClient(config.url, config.anonKey, {
      global: {
        headers: { Authorization: 'Bearer ' + token.authToken },
        fetch: (input, init) => trackedSessionFetch(input, init, generation, true),
      },
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

async function boundedAuthRPC(name: string, args: Record<string, unknown>) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = getSupabaseRPCClient().rpc(name, args);
    const pending =
      typeof request.abortSignal === 'function'
        ? request.abortSignal(controller.signal)
        : request;
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Authentication request timed out'));
        }, 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

type OperatorEnvelope = {
  success: boolean;
  error?: string;
  message?: string;
  data?: Record<string, unknown>;
};

async function operatorOtpRequest(
  action: 'request' | 'verify' | 'status' | 'signout',
  body: Record<string, unknown>
): Promise<OperatorEnvelope> {
  const generation = getSessionGeneration();
  const { url, anonKey } = getCurrentConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const request = `${url}/functions/v1/operator-otp/${action}`;
    const options: RequestInit = {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(body),
    };
    const response = action === 'signout'
      ? await fetch(request, options)
      : await trackedSessionFetch(request, options, generation, action !== 'status');
    const result = (await response.json()) as OperatorEnvelope;
    if (!response.ok || result.success !== true) {
      return { success: false, error: result.error || result.message || `Request failed (HTTP ${response.status})` };
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export const getPendingEnrollmentToken = () =>
  SecureStore.getItemAsync(SECURE_KEYS.ENROLLMENT_TOKEN);

export const clearPendingEnrollment = () =>
  SecureStore.deleteItemAsync(SECURE_KEYS.ENROLLMENT_TOKEN);

export const getEnrollmentStatus = async () => {
  const enrollmentToken = await getPendingEnrollmentToken();
  if (!enrollmentToken) return { success: false as const, error: 'Enrollment session unavailable' };
  try {
    const result = await operatorOtpRequest('status', { enrollment_token: enrollmentToken });
    if (!result.success) return { success: false as const, error: result.error || 'Could not check enrollment' };
    const status = result.data?.status;
    if (!['pending', 'approved', 'rejected', 'disabled'].includes(String(status)))
      return { success: false as const, error: 'Invalid enrollment status' };
    return { success: true as const, status: status as 'pending' | 'approved' | 'rejected' | 'disabled' };
  } catch {
    return { success: false as const, error: 'Could not check enrollment' };
  }
};

export const signOutPendingEnrollment = async () => {
  const enrollmentToken = await getPendingEnrollmentToken();
  try {
    if (enrollmentToken) await operatorOtpRequest('signout', { enrollment_token: enrollmentToken });
  } finally {
    await clearPendingEnrollment();
  }
};

// Request a one-time code from the operator authentication edge function.
export const signInWithPhone = async (phone: string) => {
  const generation = getSessionGeneration();
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

      console.warn('[Auth] OTP rate limit exceeded:');

      return {
        success: false,
        error: reason,
      };
    }

    const responseData = await operatorOtpRequest('request', { phone_number: formattedPhone });
    const isSuccess = responseData.success === true;

    if (isSuccess) {
      // Record successful OTP request for rate limiting
      await recordOTPRequest(formattedPhone);
      if (generation !== getSessionGeneration() || operatorSwitching)
        return { success: false, error: 'Session changed' };

      return { success: true, data: responseData };
    } else {
      const errorMsg = responseData.error || responseData.message || 'Failed to send OTP';
      console.error('[Auth] Send OTP failed:');
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    console.error('[Auth] Send OTP exception:');
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
    action: 'login';
    customAuth?: boolean;
    accessToken?: string;
  };
}

interface AuthPendingResult {
  success: true;
  data: { action: 'pending'; pendingEnrollment: true; userProfile: null };
}

interface AuthFailureResult {
  success: false;
  error: string;
}

type AuthResult = AuthSuccessResult | AuthPendingResult | AuthFailureResult;

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
      console.warn('[Auth] Invalid JWT: Expected 3 parts, got');
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
    console.warn('[Auth] Invalid JWT: Failed to parse token');
    return { valid: false };
  }
};

// ============================================================================
// MAIN AUTH FUNCTIONS
// ============================================================================

/**
 * OTP verification through the operator authentication edge function.
 *
 * Standardized backend response format:
 * {
 *   success: true,
 *   message: "Login successful",
 *   data: {
 *     user: { id, auth_user_id, name, mobile, role, ... },
 *     session: { access_token, refresh_token, expires_at, ... },
 *     action: "login"
 *   }
 * }
 *
 * @param phone - Phone number to verify
 * @param token - OTP code entered by user
 * @param userName - Optional name for a new pending enrollment
 */
export const verifyOTP = async (
  phone: string,
  token: string,
  userName?: string
): Promise<AuthResult> => {
  const generation = advanceSessionGeneration();
  await serializeCredentials(clearStoredTokensRaw);
  try {
    const formattedPhone = formatPhoneNumber(phone);

    const rpcResponse = await operatorOtpRequest('verify', {
      phone_number: formattedPhone,
      otp_code: token,
      ...(userName ? { name: userName } : {}),
    });

    if (generation !== getSessionGeneration()) {
      const refresh = (rpcResponse.data?.session as { refresh_token?: unknown } | undefined)?.refresh_token;
      if (typeof refresh === 'string') await revokeSession(refresh);
      return { success: false, error: 'Session changed' };
    }
    const isSuccess = rpcResponse?.success === true;

    if (!isSuccess || !rpcResponse?.data) {
      const errorMsg = rpcResponse?.error || rpcResponse?.message || 'Verification failed';
      console.error('[Auth] OTP verification failed:');
      return { success: false, error: errorMsg };
    }

    if (rpcResponse.data.action === 'pending') {
      const enrollmentToken = rpcResponse.data.enrollment_token;
      if (typeof enrollmentToken !== 'string' || !enrollmentToken)
        return { success: false, error: 'Invalid enrollment response' };
      await SecureStore.setItemAsync(SECURE_KEYS.ENROLLMENT_TOKEN, enrollmentToken);
      return { success: true, data: { action: 'pending', pendingEnrollment: true, userProfile: null } };
    }
    if (rpcResponse.data.action !== 'login')
      return { success: false, error: 'Invalid authentication response' };

    // Extract standardized response structure:
    // { success: true, message: "...", data: { user: {...}, session: {...}, action: "..." } }
    const responseData = rpcResponse.data as unknown as {
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
    const { session, user } = responseData;

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
    await storeTokens(accessTokenStr, refreshTokenStr, expiresAt, generation);
    await clearPendingEnrollment();

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
        console.warn('[Auth] Failed to fetch customer assignments:');
      }
      await cacheUserProfile(userProfileWithCustomers, generation);
    }

    if (generation !== getSessionGeneration())
      return { success: false, error: 'Session changed' };
    return {
      success: true,
      data: {
        session: null,
        user: null,
        userProfile: userProfileWithCustomers,
        action: 'login',
        customAuth: true,
        accessToken: accessTokenStr,
      },
    };
  } catch (error) {
    console.error('[Auth] OTP verification exception:');
    return { success: false, error: 'OTP verification failed' };
  }
};

// Sign out helper - clear stored tokens and Supabase session
export const signOut = async () => {
  // Queue the read before invalidating pending work; preserve the credential for
  // server revocation while local cleanup proceeds independently of the network.
  const storedPromise = serializeCredentials(readStoredToken);
  advanceSessionGeneration();
  const cleanup = serializeCredentials(async () => {
    await clearStoredTokensRaw();
    await clearSecureSessionMarker();
  });
  const stored = await storedPromise;
  await cleanup;
  if (stored.refreshToken) await revokeSession(stored.refreshToken);
  return { success: true };
};

async function revokeSession(refreshToken: string) {
  try {
    await boundedAuthRPC('logout_session', { p_refresh_token: refreshToken });
  } catch {
    console.warn(
      '[Auth] Server logout unavailable; local credentials cleared.'
    );
  }
}

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
let refreshInFlight: {
  generation: number;
  promise: Promise<RefreshedSession | null>;
} | null = null;
export const refreshCustomJWT = (): Promise<RefreshedSession | null> => {
  const generation = getSessionGeneration();
  if (refreshInFlight?.generation === generation)
    return refreshInFlight.promise;
  const promise = refreshSession(generation).finally(() => {
    if (refreshInFlight?.promise === promise) refreshInFlight = null;
  });
  refreshInFlight = { generation, promise };
  return promise;
};
const refreshSession = async (
  generation: number
): Promise<RefreshedSession | null> => {
  try {
    // Get stored refresh token from SecureStore
    const { refreshToken } = await getStoredToken();

    if (!refreshToken || generation !== getSessionGeneration()) {
      return null;
    }

    // Call backend RPC to refresh tokens
    const { data, error } = await boundedAuthRPC('refresh_jwt_token', {
      p_refresh_token: refreshToken,
    });

    if (generation !== getSessionGeneration()) {
      const obsolete = Array.isArray(data) ? data[0] : data;
      if (obsolete?.success && obsolete.refresh_token)
        await revokeSession(String(obsolete.refresh_token));
      return null;
    }
    if (error) {
      console.error('[Auth] Token refresh RPC error:');
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
      console.error('[Auth] Token refresh failed:');
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
    await storeTokens(newAccessToken, newRefreshToken, expiresAt, generation);

    // Clear cached authenticated client so it picks up new token
    clearAuthenticatedClientCache();

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt,
    };
  } catch (error) {
    console.error('[Auth] Token refresh exception:');
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
    console.error('[Auth] ensureValidTokens error:');
    return false;
  }
};

// Session Management (supports both JWT tokens and session markers)
// S2/S3 Fix: Now uses SecureStore for encrypted token storage
const readStoredToken = async (): Promise<{
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
    const operator = getActiveOperatorServer();
    if (operator && authToken) {
      const identity = await SecureStore.getItemAsync(SECURE_KEYS.OPERATOR_IDENTITY);
      if (identity !== `${operator.origin}|${operator.instanceId}`) {
        await clearStoredTokensRaw();
        return { isValid: false };
      }
    }

    // Migration: If no tokens in SecureStore, check AsyncStorage and migrate
    if (!operator && (!authToken || !refreshToken)) {
      const legacyAuthToken = await AsyncStorage.getItem('auth_token');
      const legacyRefreshToken = await AsyncStorage.getItem('refresh_token');
      const legacyExpiresAt = await AsyncStorage.getItem('token_expires_at');

      if (legacyAuthToken && legacyRefreshToken) {
        // Decode legacy tokens and migrate to SecureStore
        authToken = decodeToken(legacyAuthToken);
        refreshToken = decodeToken(legacyRefreshToken);
        expiresAtStr = legacyExpiresAt;

        // Never use legacy credentials until secure persistence succeeds.
        await storeTokensRaw(authToken, refreshToken, Number(expiresAtStr));
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

export const getStoredToken = async () => {
  const generation = getSessionGeneration();
  const stored = await serializeCredentials(readStoredToken);
  return generation === getSessionGeneration()
    ? stored
    : ({ isValid: false } as Awaited<ReturnType<typeof readStoredToken>>);
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
const storeTokensRaw = async (
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
    const operator = getActiveOperatorServer();
    if (operator) await SecureStore.setItemAsync(SECURE_KEYS.OPERATOR_IDENTITY, `${operator.origin}|${operator.instanceId}`);
    await SecureStore.setItemAsync(
      SECURE_KEYS.TOKEN_EXPIRES,
      expiresAt.toString()
    );
  } catch {
    // Never downgrade to unencrypted storage or log native errors that may echo
    // the value being written. Login/refresh must fail when persistence fails.
    await clearStoredTokensRaw();
    throw new Error('Unable to save session securely');
  }
};

export const storeTokens = (
  accessToken: string,
  refreshToken: string,
  expiresAt: number,
  expectedGeneration?: number
) => {
  const generation = expectedGeneration ?? advanceSessionGeneration();
  return serializeCredentials(async () => {
    if (generation !== getSessionGeneration())
      throw new Error('Session changed');
    await storeTokensRaw(accessToken, refreshToken, expiresAt);
    if (generation !== getSessionGeneration()) {
      await clearStoredTokensRaw();
      throw new Error('Session changed');
    }
  });
};

export const clearStoredTokens = () => {
  advanceSessionGeneration();
  return serializeCredentials(clearStoredTokensRaw);
};

// Clear all stored tokens
// S2/S3 Fix: Clears from both SecureStore and AsyncStorage
const clearStoredTokensRaw = async () => {
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
    await SecureStore.deleteItemAsync(SECURE_KEYS.OPERATOR_IDENTITY).catch(() => {});
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
    console.error('[Auth] Error clearing tokens:');
  }
};

/// S8 Fix: Cache TTL for user profile - using centralized config
const PROFILE_CACHE_TTL_MS = CACHE_DURATION_LONG_MS;

interface CachedProfile {
  profile: unknown;
  cachedAt: number;
  scope: string;
}

// Get cached user profile
// S8 Fix: Now uses SecureStore with TTL validation
export const getCachedUserProfile = async () => {
  const generation = getSessionGeneration();
  try {
    const scope = await profileScope();
    if (!scope || generation !== getSessionGeneration()) return null;
    // Try SecureStore first
    const cached = await SecureStore.getItemAsync('cached_user_profile');
    if (cached) {
      const parsed: CachedProfile = JSON.parse(cached);
      // Validate TTL
      if (
        parsed.scope === scope &&
        Date.now() >= parsed.cachedAt &&
        Date.now() - parsed.cachedAt < PROFILE_CACHE_TTL_MS
      ) {
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
              await cacheUserProfile(profile, generation);
            }
          } catch (err) {
            console.warn(
              '[Auth] Failed to fetch customer assignments for cached profile:'
            );
          }
        }

        return generation === getSessionGeneration() ? profile : null;
      } else {
        // Cache expired, clean up
        await SecureStore.deleteItemAsync('cached_user_profile');
      }
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
    await cacheUserProfile(result, generation);
    return generation === getSessionGeneration() ? result : null;
  } catch (error) {
    console.error('[Auth] Error getting cached profile:');
  }
  return null;
};

// Store user profile in cache
// S8 Fix: Now uses SecureStore with TTL tracking
async function profileScope(): Promise<string | null> {
  const stored = await getStoredToken();
  if (!stored.authToken || !stored.isValid) return null;
  try {
    const claims = JSON.parse(
      atob(stored.authToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    if (!claims.sub || !claims.session_id) return null;
    return JSON.stringify([
      getCurrentConfig().url,
      claims.sub,
      claims.session_id,
    ]);
  } catch {
    return null;
  }
}

export const cacheUserProfile = async (
  profile: unknown,
  generation = getSessionGeneration()
) => {
  const scope = await profileScope();
  if (!scope || generation !== getSessionGeneration()) return;
  const subject = JSON.parse(scope)[1];
  if (
    !profile ||
    typeof profile !== 'object' ||
    !('auth_user_id' in profile) ||
    profile.auth_user_id !== subject
  )
    return;
  await serializeCredentials(async () => {
    if (generation !== getSessionGeneration()) return;
    try {
      const entry: CachedProfile = { profile, cachedAt: Date.now(), scope };
      await SecureStore.setItemAsync(
        'cached_user_profile',
        JSON.stringify(entry)
      );
    } catch {
      /* Profile caching is optional; never persist an unscoped fallback. */
    }
  });
};

// Export types for convenience
export type { User, Session } from '@supabase/supabase-js';
