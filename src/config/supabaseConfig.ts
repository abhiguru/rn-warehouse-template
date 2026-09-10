import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import type { UserProfile } from '@/types/user.types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createSecureSessionMarker, getSecureSessionMarker, clearSecureSessionMarker, migrateLegacySessionMarker } from '@/utils/secureSessionMarker';
import { checkOTPRateLimit, recordOTPRequest } from '@/utils/otpRateLimiter';
import { CACHE_DURATION_LONG_MS } from '@/config/cacheConfig';

// S2/S3 Fix: SecureStore keys for encrypted token storage
const SECURE_KEYS = {
  AUTH_TOKEN: 'secure_auth_token',
  REFRESH_TOKEN: 'secure_refresh_token',
  TOKEN_EXPIRES: 'secure_token_expires',
} as const;

// Custom storage implementation for React Native
const customStorage = {
  getItem: async (key: string) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error('AsyncStorage getItem error:', error);
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error('AsyncStorage setItem error:', error);
    }
  },
  removeItem: async (key: string) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('AsyncStorage removeItem error:', error);
    }
  },
};

// Global singleton instances to prevent multiple GoTrueClient warnings
let __supabaseInstance: SupabaseClient | undefined;
let __currentConfig: { url: string; anonKey: string } | undefined;

/**
 * Initialize or reinitialize Supabase client with new configuration
 * Always recreates on app startup to ensure fresh keys are used
 */
export const initializeSupabase = (
  url: string,
  anonKey: string
): SupabaseClient => {
  // Check if config changed
  const configChanged =
    !__currentConfig ||
    __currentConfig.url !== url ||
    __currentConfig.anonKey !== anonKey;

  console.log('[SupabaseConfig] initializeSupabase called:', {
    configChanged,
    hasExistingInstance: !!__supabaseInstance,
    newUrlPrefix: url?.substring(0, 30),
    newKeyPrefix: anonKey?.substring(0, 30) + '...',
    oldKeyPrefix: __currentConfig?.anonKey?.substring(0, 30) + '...',
  });

  if (configChanged) {
    console.log('[SupabaseConfig] Creating NEW Supabase client (config changed)');

    // Clear all cached client instances when keys change
    __supabaseInstance = undefined;
    __supabaseRPCInstance = undefined;
    __supabaseJWTInstance = undefined;
    __cachedJWTToken = undefined;
    clearAuthenticatedClientCache();

    __supabaseInstance = createClient(url, anonKey, {
      auth: {
        storage: customStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // Disable for React Native
        flowType: 'pkce',
      },
    });

    __currentConfig = { url, anonKey };
    console.log('[SupabaseConfig] New client created successfully');
  } else {
    console.log('[SupabaseConfig] Reusing existing client (config unchanged)');
  }

  return __supabaseInstance!;
};

// Main Supabase client singleton (getter)
export const getSupabaseClient = (): SupabaseClient => {
  if (!__supabaseInstance) {
    throw new Error('Supabase client not initialized. Configuration API must be loaded first.');
  }
  return __supabaseInstance;
};

/**
 * Get the current Supabase configuration
 */
export const getCurrentConfig = () => {
  if (!__currentConfig) {
    throw new Error('Configuration not loaded. Bootstrap config first.');
  }
  return __currentConfig;
};

// NOTE: Do not create singleton here - it must be initialized dynamically
// Always use getSupabaseClient() getter function instead

// Cached authenticated client instance
let __authenticatedClientInstance: SupabaseClient | undefined;
let __cachedAuthToken: string | null | undefined;
let __cachedTokenExpiresAt: number | undefined;
// Lock to prevent concurrent client creation race conditions
let __authClientInitPromise: Promise<SupabaseClient> | null = null;

/**
 * Check if cached token is still valid with a safety buffer
 * Returns false if token is expired or will expire within buffer period
 */
const isTokenValid = (expiresAt: number | undefined, bufferMinutes: number = 5): boolean => {
  if (!expiresAt) return false;
  const bufferMs = bufferMinutes * 60 * 1000;
  return Date.now() < (expiresAt - bufferMs);
};

/**
 * Clear the cached authenticated client (used when tokens expire)
 */
export const clearAuthenticatedClientCache = () => {
  __authenticatedClientInstance = undefined;
  __cachedAuthToken = undefined;
  __cachedTokenExpiresAt = undefined;
  __authClientInitPromise = null;
  console.log('[SupabaseConfig] Authenticated client cache cleared');
};

/**
 * Get an authenticated Supabase client for RPC calls
 * This function checks for stored JWT tokens and creates a client with proper auth headers
 * Uses singleton pattern with initialization lock to avoid race conditions
 * Enforces token expiration - will not return cached client if token is expired or about to expire
 */
export const getAuthenticatedClient = async (): Promise<SupabaseClient> => {
  const startTime = Date.now();

  // FAST PATH: Quick synchronous return if we have a valid cached client
  // This avoids AsyncStorage reads and race conditions for subsequent calls
  if (__authenticatedClientInstance && __cachedAuthToken && isTokenValid(__cachedTokenExpiresAt)) {
    return __authenticatedClientInstance;
  }

  // If already initializing, wait for that promise to prevent race conditions
  if (__authClientInitPromise) {
    console.log('[SupabaseConfig] getAuthenticatedClient - waiting for existing init promise');
    return __authClientInitPromise;
  }

  // Check for stored JWT tokens (only if not already cached)
  const tokenCheckStart = Date.now();
  const tokenData = await getStoredToken();
  console.log(`[SupabaseConfig] getStoredToken took ${Date.now() - tokenCheckStart}ms`);

  if (tokenData.isValid && tokenData.type === 'jwt' && tokenData.authToken) {
    // Return cached client if token matches (double-check after async getStoredToken)
    if (__authenticatedClientInstance && __cachedAuthToken === tokenData.authToken) {
      return __authenticatedClientInstance;
    }

    // Check if we need to create a new client (token changed)
    if (__authenticatedClientInstance && __cachedAuthToken !== tokenData.authToken) {
      console.log('[SupabaseConfig] Token changed, recreating authenticated client');
      clearAuthenticatedClientCache();
    }

    // Create initialization promise to prevent concurrent creation
    __authClientInitPromise = (async () => {
      const clientCreateStart = Date.now();
      try {
        const config = getCurrentConfig();
        console.log('[SupabaseConfig] Creating new authenticated client with URL:', config.url);
        // Create a new client with JWT in Authorization header
        const newClient = createClient(config.url, config.anonKey, {
          global: {
            headers: {
              Authorization: `Bearer ${tokenData.authToken}`,
              'apikey': config.anonKey
            }
          },
          auth: {
            storage: customStorage,
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
          }
        });
        __authenticatedClientInstance = newClient;
        __cachedAuthToken = tokenData.authToken;
        __cachedTokenExpiresAt = tokenData.expiresAt;
        console.log(`[SupabaseConfig] New client created in ${Date.now() - clientCreateStart}ms, total getAuthenticatedClient: ${Date.now() - startTime}ms`);
        return newClient;
      } finally {
        // Clear the promise after initialization completes
        __authClientInitPromise = null;
      }
    })();

    return __authClientInitPromise;
  }

  // Token is invalid or expired - ensure cache is cleared
  if (__authenticatedClientInstance) {
    console.log('[SupabaseConfig] Tokens invalid/expired, clearing authenticated client cache');
    clearAuthenticatedClientCache();
  }

  console.log('[SupabaseConfig] No valid JWT tokens found, returning regular client');
  return getSupabaseClient();
};

// Create a special client for RPC calls that handle their own auth
let __supabaseRPCInstance: SupabaseClient | undefined;

export const getSupabaseRPCClient = (): SupabaseClient => {
  if (!__supabaseRPCInstance) {
    const config = getCurrentConfig();
    console.log('[SupabaseConfig] Creating new Supabase RPC client instance');
    __supabaseRPCInstance = createClient(config.url, config.anonKey, {
      auth: {
        storage: customStorage,
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
        storageKey: 'sb-rpc-auth-token'
      }
    });
  }
  return __supabaseRPCInstance;
};

// JWT client singleton
let __supabaseJWTInstance: SupabaseClient | undefined;
let __cachedJWTToken: string | null | undefined;

/**
 * Get a Supabase client configured with JWT authentication
 * Uses AsyncStorage instead of localStorage for React Native
 */
export const getSupabaseWithJWT = async () => {
  const config = getCurrentConfig();
  console.log('[SupabaseConfig] Getting JWT-authenticated Supabase client');
  console.log('[SupabaseConfig] JWT client will use URL:', config.url);

  // First, try to get the session from the main Supabase client
  const mainClient = getSupabaseClient();
  const { data: sessionData } = await mainClient.auth.getSession();
  
  console.log('[SupabaseConfig] Session Check:', {
    hasSession: !!sessionData?.session,
    hasAccessToken: !!sessionData?.session?.access_token,
    tokenType: sessionData?.session?.token_type,
    expiresAt: sessionData?.session?.expires_at,
    userId: sessionData?.session?.user?.id
  });
  
  // If we have a valid session with JWT token, use it
  if (sessionData?.session?.access_token) {
    const token = sessionData.session.access_token;
    
    // S7 Fix: Only log token details in development
    if (__DEV__) {
      console.log('[SupabaseConfig] Using session JWT token:', {
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 20) + '...',
        tokenParts: token.split('.').length,
        isValidJWT: token.split('.').length === 3
      });
    }
    
    // Check if we already have a JWT client with the same token
    if (__supabaseJWTInstance && __cachedJWTToken === token) {
      console.log('[SupabaseConfig] Returning cached JWT client');
      return __supabaseJWTInstance;
    }

    console.log('[SupabaseConfig] Creating new JWT-authenticated client with session token');

    // Create the client with proper auth configuration
    __supabaseJWTInstance = createClient(config.url, config.anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
          'apikey': config.anonKey
        }
      },
      auth: {
        storage: customStorage,
        autoRefreshToken: false,
        persistSession: true,  // Changed to true to maintain session
        detectSessionInUrl: false
      }
    });

    // Set the session on the new client instance
    console.log('[SupabaseConfig] Setting session on JWT client');
    await __supabaseJWTInstance.auth.setSession({
      access_token: token,
      refresh_token: sessionData.session.refresh_token
    });

    __cachedJWTToken = token;
    return __supabaseJWTInstance;
  }

  // Fallback: Try to get stored tokens
  console.log('[SupabaseConfig] No session found, checking stored tokens...');
  const storedTokenResult = await getStoredToken();
  
  if (storedTokenResult.isValid && storedTokenResult.type === 'jwt' && storedTokenResult.authToken) {
    const token = storedTokenResult.authToken;
    
    console.log('[SupabaseConfig] Using stored JWT token:', {
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 20) + '...',
      tokenParts: token.split('.').length,
      isValidJWT: token.split('.').length === 3
    });

    // Check if we already have a JWT client with the same token
    if (__supabaseJWTInstance && __cachedJWTToken === token) {
      console.log('[SupabaseConfig] Returning cached JWT client');
      return __supabaseJWTInstance;
    }

    console.log('[SupabaseConfig] Creating new JWT-authenticated client with stored token');
    __supabaseJWTInstance = createClient(config.url, config.anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
          'apikey': config.anonKey
        }
      },
      auth: {
        storage: customStorage,
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });

    __cachedJWTToken = token;
    return __supabaseJWTInstance;
  }

  // Last resort: Check for custom auth token
  console.log('[SupabaseConfig] No JWT tokens found, checking for custom auth token...');
  const customToken = await AsyncStorage.getItem('auth_token');
  
  if (customToken) {
    // S7 Fix: Only log token details in development
    if (__DEV__) {
      console.log('[SupabaseConfig] Found custom auth token:', {
        tokenLength: customToken.length,
        tokenPrefix: customToken.substring(0, 20) + '...',
        tokenParts: customToken.split('.').length
      });
      console.warn('[SupabaseConfig] Using custom token format - this may have limited permissions');
    }
    
    __supabaseJWTInstance = createClient(config.url, config.anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${customToken}`,
          'apikey': config.anonKey
        }
      },
      auth: {
        storage: customStorage,
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });

    __cachedJWTToken = customToken;
    return __supabaseJWTInstance;
  }

  console.warn('[SupabaseConfig] No authentication tokens found, returning regular client');
  return getSupabaseClient();
};

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
      const reason = rateLimit.reason === 'daily'
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

    console.log('[Auth] Sending OTP:', {
      originalPhone: phone,
      formattedPhone: formattedPhone,
      purpose: 'login',
      dailyRemaining: rateLimit.dailyRemaining,
    });

    const { data, error } = await getSupabaseClient().rpc('send_otp', {
      p_phone_number: formattedPhone,
      p_purpose: 'login'
    });

    // Log full response for debugging
    console.log('[Auth] Send OTP RPC Response:', { data, error });

    if (error) {
      console.error('[Auth] Send OTP RPC error:', error);
      return { success: false, error: error.message };
    }

    // Check if OTP was sent successfully - RPC returns array
    const responseData = Array.isArray(data) ? data[0] : data;
    const isSuccess = responseData?.success === true || responseData?.status === 'success';

    if (isSuccess) {
      // Record successful OTP request for rate limiting
      await recordOTPRequest(formattedPhone);
      console.log('[Auth] OTP sent successfully:', responseData);
      return { success: true, data: responseData };
    } else {
      const errorMsg = responseData?.message || responseData?.error || 'Failed to send OTP';
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
const validateJWTToken = (token: string): { valid: boolean; exp?: number; sub?: string } => {
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

    console.log('[Auth] Verifying OTP:', {
      originalPhone: phone,
      formattedPhone,
      otpCode: token,
      userName: userName || 'User',
    });

    // Step 1: Call the verification RPC
    const { data, error } = await getSupabaseClient().rpc('verify_otp_or_register', {
      p_phone_number: formattedPhone,
      p_otp_code: token,
    });

    console.log('[Auth] RPC Response:', { data, error });

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

    console.log('[Auth] OTP verification successful');
    console.log('[Auth] Response structure:', {
      hasUser: !!responseData.user,
      hasSession: !!responseData.session,
      action: responseData.action,
    });

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

    console.log('[Auth] ✅ JWT tokens validated');
    console.log('[Auth] Token info:', {
      expiresAt: new Date(validation.exp! * 1000).toISOString(),
      subject: validation.sub,
    });

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
        const { data: customerIds, error: rpcError } = await authClient
          .rpc('user_accessible_customers');

        if (!rpcError && customerIds) {
          userProfileWithCustomers = {
            ...user,
            assignedCustomerIds: customerIds,
          };
          console.log('[Auth] Fetched customer assignments:', customerIds.length);
        }
      } catch (err) {
        console.warn('[Auth] Failed to fetch customer assignments:', err);
      }
      await cacheUserProfile(userProfileWithCustomers);
    }

    console.log('[Auth] ✅ Authentication complete');

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
    // Sign out from Supabase first
    const { error: signOutError } = await getSupabaseClient().auth.signOut();
    if (signOutError) {
      console.error('[Auth] Supabase sign out error:', signOutError);
    }

    // Clear all stored tokens and session data
    await clearStoredTokens();

    // Clear secure session marker
    await clearSecureSessionMarker();
    
    // Clear any AsyncStorage data that might persist
    // Get all keys and remove any that contain 'auth' or 'session'
    const allKeys = await AsyncStorage.getAllKeys();
    const authKeys = allKeys.filter(key => 
      key.includes('auth') || 
      key.includes('session') || 
      key.includes('supabase') ||
      key.includes('sb-')
    );
    
    if (authKeys.length > 0) {
      console.log('[Auth] Clearing auth-related keys:', authKeys);
      await AsyncStorage.multiRemove(authKeys);
    }
    
    console.log('[Auth] Sign out completed');
    return { success: true };
  } catch (error) {
    console.error('[Auth] Sign out exception:', error);
    return { success: false, error: 'Sign out failed' };
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
export const refreshCustomJWT = async (): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
} | null> => {
  try {
    // Get stored refresh token from SecureStore
    const refreshToken = await SecureStore.getItemAsync(SECURE_KEYS.REFRESH_TOKEN);

    if (!refreshToken) {
      console.log('[Auth] No refresh token available for custom JWT refresh');
      return null;
    }

    console.log('[Auth] Attempting custom JWT token refresh...');

    // Call backend RPC to refresh tokens
    const { data, error } = await getSupabaseClient().rpc('refresh_jwt_token', {
      p_refresh_token: refreshToken,
    });

    if (error) {
      console.error('[Auth] Token refresh RPC error:', error.message);
      // If refresh token is invalid/expired, clear stored tokens
      if (error.message.includes('invalid') || error.message.includes('expired')) {
        await clearStoredTokens();
      }
      return null;
    }

    // Handle array response from RPC
    const responseData = Array.isArray(data) ? data[0] : data;

    if (!responseData?.success || !responseData?.access_token) {
      console.error('[Auth] Token refresh failed:', responseData?.message || 'Unknown error');
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

    console.log('[Auth] ✅ Custom JWT tokens refreshed successfully');
    console.log('[Auth] New token expires at:', new Date(expiresAt).toISOString());

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

    // No tokens stored
    if (!tokenData.isValid) {
      return false;
    }

    // Session marker type - check expiration
    if (tokenData.type === 'session') {
      return true; // Session markers are valid until they expire
    }

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
      console.log('[Auth] Token expired or expiring soon, attempting refresh...');
      const refreshResult = await refreshCustomJWT();

      if (refreshResult) {
        console.log('[Auth] Token refresh successful, session restored');
        return true;
      }

      // Refresh failed - tokens are invalid
      console.log('[Auth] Token refresh failed, user needs to re-authenticate');
      return false;
    }

    return false;
  } catch (error) {
    console.error('[Auth] ensureValidTokens error:', error);
    return false;
  }
};

// Session Management (supports both JWT tokens and session markers)
// S2/S3 Fix: Now uses SecureStore for encrypted token storage
export const getStoredToken = async () => {
  try {
    // S2/S3 Fix: First check SecureStore for tokens
    let authToken = await SecureStore.getItemAsync(SECURE_KEYS.AUTH_TOKEN);
    let refreshToken = await SecureStore.getItemAsync(SECURE_KEYS.REFRESH_TOKEN);
    let expiresAtStr = await SecureStore.getItemAsync(SECURE_KEYS.TOKEN_EXPIRES);

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

        // Store in SecureStore
        await SecureStore.setItemAsync(SECURE_KEYS.AUTH_TOKEN, authToken);
        await SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, refreshToken);
        if (expiresAtStr) {
          await SecureStore.setItemAsync(SECURE_KEYS.TOKEN_EXPIRES, expiresAtStr);
        }

        // Clean up legacy storage
        await AsyncStorage.multiRemove(['auth_token', 'refresh_token', 'token_expires_at']);
        console.log('[Auth] Migrated tokens from AsyncStorage to SecureStore');
      }
    }

    if (authToken && refreshToken) {
      const expires = expiresAtStr ? parseInt(expiresAtStr) : 0;
      const now = Date.now();

      // Check if token is still valid (with 5-minute buffer)
      if (expires > now + (5 * 60 * 1000)) {
        return {
          authToken,
          refreshToken,
          expiresAt: expires,
          isValid: true,
          type: 'jwt'
        };
      } else {
        // Tokens expired - clean up from SecureStore
        await SecureStore.deleteItemAsync(SECURE_KEYS.AUTH_TOKEN);
        await SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN);
        await SecureStore.deleteItemAsync(SECURE_KEYS.TOKEN_EXPIRES);
      }
    }

    // Migrate legacy session markers if they exist
    await migrateLegacySessionMarker();

    // Check for secure session marker (with HMAC verification)
    const secureMarker = await getSecureSessionMarker();
    if (secureMarker) {
      console.log('[Auth] Valid secure session marker found');
      return {
        sessionData: secureMarker,
        isValid: true,
        type: 'session'
      };
    }

    return { isValid: false };
  } catch (error) {
    console.error('[Auth] Error getting stored session:', error);
    return { isValid: false };
  }
};

/**
 * Simple base64 encoding for token storage (React Native compatible)
 * NOTE: This is NOT encryption - it's basic obfuscation to prevent casual inspection.
 * Primary token storage now uses expo-secure-store (see authTokenUtils.ts).
 * This encoding is only used as a fallback for non-sensitive data.
 */
const encodeToken = (token: string): string => {
  // Use btoa which is available in React Native's JavaScript environment
  try {
    // Simple encoding to prevent plain-text storage inspection
    return btoa(unescape(encodeURIComponent(token)));
  } catch {
    return token; // Fallback to plain text if encoding fails
  }
};

const decodeToken = (encoded: string): string => {
  try {
    // Check if it looks like base64 (contains only valid base64 characters)
    // Valid JWT tokens have periods, so if it has a period, it's likely already decoded/plain
    if (encoded.includes('.')) {
      return encoded; // Already a plain JWT token
    }
    return decodeURIComponent(escape(atob(encoded)));
  } catch {
    // Fallback for legacy plain-text tokens during migration
    return encoded;
  }
};

// Store tokens with expiration
// S2/S3 Fix: Now uses SecureStore for encrypted token storage
export const storeTokens = async (accessToken: string, refreshToken: string, expiresAt: number) => {
  try {
    // S2/S3 Fix: Store tokens in SecureStore (uses Keychain on iOS, encrypted SharedPreferences on Android)
    await SecureStore.setItemAsync(SECURE_KEYS.AUTH_TOKEN, accessToken);
    await SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, refreshToken);
    await SecureStore.setItemAsync(SECURE_KEYS.TOKEN_EXPIRES, expiresAt.toString());
    console.log('[Auth] Tokens stored securely in SecureStore');
  } catch (error) {
    console.error('[Auth] Error storing tokens in SecureStore:', error);
    // Fallback to AsyncStorage with encoding if SecureStore fails
    try {
      await AsyncStorage.multiSet([
        ['auth_token', encodeToken(accessToken)],
        ['refresh_token', encodeToken(refreshToken)],
        ['token_expires_at', expiresAt.toString()]
      ]);
      console.warn('[Auth] Tokens stored in AsyncStorage (fallback)');
    } catch (fallbackError) {
      console.error('[Auth] Fallback storage also failed:', fallbackError);
    }
  }
};

// Clear all stored tokens
// S2/S3 Fix: Clears from both SecureStore and AsyncStorage
export const clearStoredTokens = async () => {
  try {
    // Clear from SecureStore
    await SecureStore.deleteItemAsync(SECURE_KEYS.AUTH_TOKEN).catch(() => {});
    await SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN).catch(() => {});
    await SecureStore.deleteItemAsync(SECURE_KEYS.TOKEN_EXPIRES).catch(() => {});

    // Also clear any legacy tokens from AsyncStorage
    await AsyncStorage.multiRemove(['auth_token', 'refresh_token', 'token_expires_at', 'cached_user_profile', 'session_marker']);
    console.log('[Auth] All tokens and session markers cleared');
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
        if (__DEV__) console.log('[Auth] Cached user profile found (SecureStore)');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let profile = parsed.profile as any;

        // If cached profile is missing assignedCustomerIds, fetch them
        if (profile && !profile.assignedCustomerIds) {
          try {
            const authClient = await getAuthenticatedClient();
            const { data: customerIds, error: rpcError } = await authClient
              .rpc('user_accessible_customers');

            if (!rpcError && customerIds) {
              profile = { ...profile, assignedCustomerIds: customerIds };
              // Update cache with customer assignments
              await cacheUserProfile(profile);
              if (__DEV__) console.log('[Auth] Added customer assignments to cached profile:', customerIds.length);
            }
          } catch (err) {
            console.warn('[Auth] Failed to fetch customer assignments for cached profile:', err);
          }
        }

        return profile;
      } else {
        // Cache expired, clean up
        await SecureStore.deleteItemAsync('cached_user_profile');
        if (__DEV__) console.log('[Auth] Cached profile expired, cleared');
        return null;
      }
    }

    // Migration: Check AsyncStorage for legacy cache
    const legacyCached = await AsyncStorage.getItem('cached_user_profile');
    if (legacyCached) {
      const profile = JSON.parse(legacyCached);
      // Migrate to SecureStore with new TTL format
      await cacheUserProfile(profile);
      await AsyncStorage.removeItem('cached_user_profile');
      if (__DEV__) console.log('[Auth] Migrated cached profile to SecureStore');
      return profile;
    }
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
    await SecureStore.setItemAsync('cached_user_profile', JSON.stringify(cacheEntry));
    if (__DEV__) console.log('[Auth] User profile cached in SecureStore');
  } catch (error) {
    console.error('[Auth] Error caching profile:', error);
    // Fallback to AsyncStorage if SecureStore fails
    try {
      await AsyncStorage.setItem('cached_user_profile', JSON.stringify(profile));
      console.warn('[Auth] Profile cached in AsyncStorage (fallback)');
    } catch (fallbackError) {
      console.error('[Auth] Fallback caching also failed:', fallbackError);
    }
  }
};

// Export types for convenience
export type { User, Session } from '@supabase/supabase-js';
