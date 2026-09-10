/**
 * Service Authentication Utility
 *
 * Provides standardized authentication checking for all services.
 * Ensures consistent session validation across the application.
 *
 * Issue #32: Standardize auth session checking
 */

import { getSupabaseClient, getAuthenticatedClient } from '../config/supabaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from './logger';
import type { ServiceResponse } from '../types/service.types';

const logger = createLogger('ServiceAuth');

/**
 * Session information returned by auth check
 */
export interface SessionInfo {
  isValid: boolean;
  userId: string | null;
  source: 'supabase' | 'session_marker' | 'none';
  expiresAt?: number;
}

/**
 * Options for auth check
 */
export interface AuthCheckOptions {
  /** Whether authentication is required (default: true) */
  required?: boolean;
  /** Context for logging */
  context?: string;
}

/**
 * Check for valid authentication session
 *
 * This function checks for authentication in two ways:
 * 1. Supabase built-in session
 * 2. Custom session marker (for phone OTP auth)
 *
 * @returns SessionInfo with authentication status
 */
export async function checkAuthSession(
  options: AuthCheckOptions = {}
): Promise<SessionInfo> {
  const { context = 'ServiceAuth' } = options;

  try {
    // Method 1: Check Supabase built-in session
    const { data: { session }, error: sessionError } = await getSupabaseClient().auth.getSession();

    if (session?.user) {
      return {
        isValid: true,
        userId: session.user.id,
        source: 'supabase',
        expiresAt: session.expires_at ? session.expires_at * 1000 : undefined,
      };
    }

    // Method 2: Check custom session marker (for phone OTP auth)
    const sessionMarker = await AsyncStorage.getItem('session_marker');

    if (sessionMarker) {
      try {
        const parsedMarker = JSON.parse(sessionMarker);

        if (parsedMarker && parsedMarker.expires_at > Date.now()) {
          return {
            isValid: true,
            userId: parsedMarker.user_id,
            source: 'session_marker',
            expiresAt: parsedMarker.expires_at,
          };
        } else {
          // Session marker expired
          logger.info(`[${context}] Session marker expired`);
        }
      } catch (parseError) {
        logger.warn(`[${context}] Failed to parse session marker`, { error: parseError });
      }
    }

    // No valid session found
    return {
      isValid: false,
      userId: null,
      source: 'none',
    };
  } catch (error) {
    logger.error(`[${context}] Error checking auth session`, { error });
    return {
      isValid: false,
      userId: null,
      source: 'none',
    };
  }
}

/**
 * Require authentication before executing a service operation
 *
 * @param context - Context for logging
 * @returns SessionInfo if authenticated, throws error if not
 *
 * @example
 * ```typescript
 * const session = await requireAuth('GRNService');
 * // Use session.userId for the operation
 * ```
 */
export async function requireAuth(context: string): Promise<SessionInfo> {
  const session = await checkAuthSession({ context });

  if (!session.isValid) {
    throw new Error('Authentication required - no valid session');
  }

  return session;
}

/**
 * Get authenticated client with session validation
 *
 * @param context - Context for logging
 * @param options - Auth check options
 * @returns Authenticated Supabase client
 */
export async function getAuthenticatedClientWithCheck(
  context: string,
  options: AuthCheckOptions = {}
): Promise<ReturnType<typeof getAuthenticatedClient> extends Promise<infer T> ? T : never> {
  const { required = true } = options;

  if (required) {
    await requireAuth(context);
  }

  return getAuthenticatedClient();
}

/**
 * Create a response indicating authentication failure
 */
export function createAuthFailureResponse<T = unknown>(
  message: string = 'Authentication required'
): ServiceResponse<T> {
  return {
    success: false,
    message,
    error: 'No valid session',
    errorCode: 'AUTH_REQUIRED',
  };
}

/**
 * Wrapper for service functions that require authentication
 *
 * @example
 * ```typescript
 * export const getGRNItems = withAuth('GRNService', async (session, params) => {
 *   // session.userId is available here
 *   const client = await getAuthenticatedClient();
 *   // ... rest of implementation
 * });
 * ```
 */
export function withAuth<TArgs extends unknown[], TResult>(
  context: string,
  fn: (session: SessionInfo, ...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult | ServiceResponse<never>> {
  return async (...args: TArgs): Promise<TResult | ServiceResponse<never>> => {
    try {
      const session = await requireAuth(context);
      return await fn(session, ...args);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Authentication required')) {
        return createAuthFailureResponse();
      }
      throw error;
    }
  };
}

/**
 * Check if current session is about to expire (within threshold)
 *
 * @param thresholdMs - Time threshold in milliseconds (default: 5 minutes)
 * @returns true if session expires within threshold
 */
export async function isSessionExpiringSoon(
  thresholdMs: number = 5 * 60 * 1000
): Promise<boolean> {
  const session = await checkAuthSession();

  if (!session.isValid || !session.expiresAt) {
    return true; // No session or unknown expiry = treat as expiring
  }

  return session.expiresAt - Date.now() < thresholdMs;
}

/**
 * Get the current user ID from session (convenience function)
 *
 * @returns User ID or null if not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await checkAuthSession();
  return session.userId;
}
