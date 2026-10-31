import { createLogger } from '@/utils/logger';
import {
  createSlice,
  PayloadAction,
  createAsyncThunk,
  createSelector,
} from '@reduxjs/toolkit';
import type { User, Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  signOut,
  getStoredToken,
  getCachedUserProfile,
  reloadUserProfile,
  ensureValidTokens,
  cacheUserProfile,
  clearStoredTokens,
  getSupabaseClient,
  refreshCustomJWT,
  initializeSupabase,
} from '@/config/supabaseConfig';
import { extendSessionMarker } from '@/utils/secureSessionMarker';
import ConfigService from '@/services/configService';
import { getUserByIdDirect } from '@/services/user-core-service';
import { fetchFullConfig, clearFullConfig } from './configSlice';
import { getSessionGeneration, renewAheadMs } from '@/config/sessionLifecycle';
import { isCentralLoginConfigured } from '@/config/envConfig';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { isStaleFacility } from '@/config/staleFacilitySession';
import { setSentryUser, clearSentryUser } from '@/config/sentryConfig';
import { CACHE_PREFIXES } from '@/config/cacheConfig';
// Privacy cleanup services - clear user-specific data on logout
import { RecentCustomersService } from '@/services/recent-customers-service';
import { SessionRecentItemsService } from '@/services/session-recent-items-service';
import { clearAllRateLimits } from '@/utils/otpRateLimiter';
import { UserService } from '@/services/user-service';
import { UserProfile } from '@/types/user.types';
import { clearSessionScopedState } from '../sessionScopedState';
import { AppError } from '@/utils/appError';
import { t } from '@/i18n';
import { serverText } from '@/utils/serverText';

const authSliceLogger = createLogger('AuthSlice');

interface AuthState {
  // Loading states
  isLoading: boolean;
  isAuthenticating: boolean;
  isVerifyingOTP: boolean;

  // Authentication state
  session: Session | null;
  user: User | null;
  userProfile: UserProfile | null;

  // Phone authentication
  phoneNumber: string;
  otpSent: boolean;
  error: string | null;

  /**
   * Why the session was ended without the person asking (a forced sign-out), shown once on
   * My facilities / the facility Sign in screen until dismissed or the next sign-in.
   */
  signOutReason: string | null;
  /**
   * Whether the session restore (initializeAuth) has run for the session
   * generation in `initializeGeneration`. The root restores at start; the tabs
   * layout restores again only when this is not 'pending' or 'settled' for the
   * current generation (after a sign-in or a facility switch began a new one).
   * Absent until the first restore starts, which means 'idle'.
   */
  initializeStatus?: 'idle' | 'pending' | 'settled';
  initializeGeneration?: number;
  initializeRequest?: string;
  refreshRequest?: string;
  profileRequest?: string;
  logoutRequest?: string;
  deleteRequest?: string;
  forceLogoutRequest?: string;
}

const initialState: AuthState = {
  isLoading: false,
  isAuthenticating: false,
  isVerifyingOTP: false,
  session: null,
  user: null,
  userProfile: null,
  phoneNumber: '',
  otpSent: false,
  error: null,
  signOutReason: null,
};

// Helper to safely execute async operations with logging
const safeAsyncOp = async <T>(
  operation: () => Promise<T>,
  fallback: T,
  errorContext: string
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    authSliceLogger.warn(`${errorContext}:`, error);
    return fallback;
  }
};

// Older builds persisted protected GRN details and signed image URLs without
// an account scope. Current detail screens do not persist them; remove any
// legacy entries before restoration and during every session teardown.
const clearProtectedDetailCaches = async (): Promise<void> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const protectedKeys = keys.filter(key => key.startsWith('grn_detail_'));
    if (protectedKeys.length > 0) {
      await AsyncStorage.multiRemove(protectedKeys);
    }
  } catch {
    // Best effort for legacy data. Current detail screens never persist it.
  }
};

// Guard to prevent multiple concurrent fetchFullConfig calls
// This prevents race conditions when initializeAuth hits multiple code paths
let configFetchPromise: Promise<void> | null = null;

const fetchConfigOnce = (
  dispatch: any, // Redux dispatch from thunk API
  supabaseClient: ReturnType<typeof getSupabaseClient>
): void => {
  // If already fetching, skip
  if (configFetchPromise) {
    authSliceLogger.info(
      'Config fetch already in progress, skipping duplicate call'
    );
    return;
  }

  authSliceLogger.info('Starting config fetch (guarded)');
  configFetchPromise = dispatch(fetchFullConfig(supabaseClient))
    .unwrap()
    .then(() => {
      authSliceLogger.info('Config fetch completed successfully');
    })
    .catch((configError: unknown) => {
      authSliceLogger.warn('Full config fetch failed:', configError);
    })
    .finally(() => {
      // Reset the guard after completion (success or failure)
      configFetchPromise = null;
    });
};

// Async thunks
export const initializeAuth = createAsyncThunk.withTypes<{
  pendingMeta: { generation: number };
}>()(
  'auth/initialize',
  async (_, { dispatch, rejectWithValue }) => {
    const generation = getSessionGeneration();
    const result = await (async () => {
      try {
        await clearProtectedDetailCaches();

        // Central login with no facility selected (docs/CENTRAL_LOGIN.md): the app shell
        // runs before any facility backend is known, so there is no client to ask and no
        // facility session to restore. That is how such a build normally starts, not a
        // failure: asking for the client here would throw "Configuration must be loaded
        // first", log it as an error and leave it in `auth.error`.
        if (isCentralLoginConfigured() && getActiveOperatorServer() === null)
          return { session: null, user: null, userProfile: null };
        // A facility whose session may belong to an earlier central sign-in (an exchange that
        // finished after the person changed, src/config/staleFacilitySession.ts) is never
        // restored: whoever starts the app now goes to My facilities, and the cleanup that
        // the root runs at start ends that session.
        const selected = getActiveOperatorServer();
        if (isCentralLoginConfigured() && selected && (await isStaleFacility(selected.origin, selected.instanceId)))
          return { session: null, user: null, userProfile: null };

        // STEP 1: Ensure we have Supabase client (fallback to initialized one)
        const supabaseClient = getSupabaseClient();

        // Restore from the stored JWT tokens first
        let tokenData = await safeAsyncOp(
          () => getStoredToken(),
          { isValid: false as const },
          'Failed to get stored token'
        );

        // Check if we have JWT tokens (valid or expired)
        if (tokenData.type === 'jwt') {
          // Check if token is expired or about to expire
          const expiresAt = tokenData.expiresAt || 0;
          const now = Date.now();
          const bufferMs = 5 * 60 * 1000; // 5 minute buffer
          const isTokenExpired = expiresAt <= now + bufferMs;

          if (isTokenExpired && tokenData.refreshToken) {
            authSliceLogger.info(
              'JWT token expired, attempting refresh...'
            );

            // Try to refresh the token
            const refreshResult = await safeAsyncOp(
              () => refreshCustomJWT(),
              null,
              'Failed to refresh JWT token'
            );

            if (refreshResult) {
              authSliceLogger.info('Token refresh successful!');
              // Re-fetch token data after refresh
              tokenData = await safeAsyncOp(
                () => getStoredToken(),
                { isValid: false as const },
                'Failed to get refreshed token'
              );
            } else {
              authSliceLogger.info(
                'Token refresh failed, will require re-authentication'
              );
              // The session manager clears only definitive rejections, never transient network errors.
              tokenData = await getStoredToken();
              if (!tokenData.isValid)
                return { session: null, user: null, userProfile: null };
            }
          }
        }

        // Check if we have valid JWT tokens
        if (tokenData.isValid && tokenData.type === 'jwt') {
          authSliceLogger.info(
            'Found valid JWT tokens, checking cached profile'
          );
          const cachedProfile = await safeAsyncOp(
            () => getCachedUserProfile(),
            null,
            'Failed to get cached profile for JWT auth'
          );

          if (cachedProfile) {
            authSliceLogger.info(
              'Restoring auth with cached profile (custom JWT auth)'
            );

            // Auto-extend session to persist until logout
            extendSessionMarker().catch(err => {
              authSliceLogger.warn(
                'Failed to extend session marker:',
                err
              );
            });

            // Fetch config (guarded to prevent race conditions)
            fetchConfigOnce(dispatch, supabaseClient);

            // Set user context for crash reporting
            setSentryUser(cachedProfile.role);

            // The cached copy may be up to a day old: ask the server in the
            // background and show what it says now.
            void reconcileCachedProfile(dispatch, cachedProfile);

            return { session: null, user: null, userProfile: cachedProfile };
          } else {
            // A missing profile may be a temporary network/cache failure.
            // Keep refresh credentials for retry; the API still enforces active sessions.
            authSliceLogger.info(
              'Profile unavailable; session credentials retained for retry'
            );
            return { session: null, user: null, userProfile: null };
          }
        }

        // Fallback to session marker if no JWT tokens
        if (tokenData.isValid && tokenData.type === 'session') {
          // Remove session marker in background - don't block
          AsyncStorage.removeItem('session_marker').catch(removeError => {
            authSliceLogger.warn(
              'Failed to remove session marker:',
              removeError
            );
          });
        }

        return { session: null, user: null, userProfile: null };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : t('errors.auth.initializeFailed');
        authSliceLogger.error('Initialize auth error:', error);
        return rejectWithValue(errorMessage);
      }
    })();
    return generation === getSessionGeneration()
      ? result
      : rejectWithValue(t('errors.auth.sessionChanged'));
  },
  // The generation this restore is for, recorded with its pending state.
  { getPendingMeta: () => ({ generation: getSessionGeneration() }) }
);

export const fetchUserProfile = createAsyncThunk(
  'auth/fetchUserProfile',
  async (userId: string) => {
    const generation = getSessionGeneration();
    const result = await getUserByIdDirect(userId);

    if (result.status === 'success' && result.data) {
      // Cache the profile for next time
      await cacheUserProfile(result.data, generation);
      if (generation !== getSessionGeneration())
        throw new AppError('SESSION_CHANGED', t('errors.auth.sessionChanged'));
      return result.data;
    } else {
      throw new Error(t('errors.user.fetchProfileFailed'));
    }
  }
);

export const logout = createAsyncThunk(
  'auth/logout',
  async (options: { localOnly?: boolean } | undefined, { dispatch }) => {
    // Invalidate old asynchronous work before the first await.
    const signingOut = signOut(options);
    signingOut.catch(() => {}); // awaited below; mark handled during local teardown
    const generation = getSessionGeneration();
    dispatch(clearFullConfig());
    await ConfigService.clearAuthenticatedCache();
    // Session-scoped caches, queries and drafts belong to the session that just
    // ended. Clear them before waiting for the server revocation (up to 15 s),
    // so a user who signs in meanwhile never has their fresh state wiped.
    await clearSessionScopedState(dispatch);
    const { success: localCleared } = await signingOut;
    // `localCleared` is false when this phone could not remove the session from its secure
    // storage; the sign-out still finishes (reducers listen for fulfilled) and the screen says so.
    if (generation !== getSessionGeneration()) return { localCleared };
    // D8 Fix: Make logout atomic - clear local state regardless of signOut result
    // Server session invalidation is best-effort; local cleanup must always succeed

    authSliceLogger.info(
      'Starting logout - clearing all user-specific data'
    );

    // Clear user context from crash reporting
    clearSentryUser();

    // Clear session markers (ignore errors)
    await AsyncStorage.removeItem('session_marker').catch(() => {
      /* No action needed. */
    });
    await AsyncStorage.removeItem('secure_session_marker').catch(() => {
      /* No action needed. */
    });
    await AsyncStorage.removeItem('cached_user_profile').catch(() => {
      /* No action needed. */
    });

    // =========================================================================
    // Privacy cleanup: Clear all user-specific cached data
    // This prevents data leakage when different users log in on the same device
    // =========================================================================

    // Clear recent customers (search history)
    await RecentCustomersService.clearRecentCustomers().catch(error => {
      authSliceLogger.warn('Error clearing recent customers:', error);
    });

    // Clear session recent items (per-customer item history)
    await SessionRecentItemsService.clearAllSessionRecentItems().catch(
      error => {
        authSliceLogger.warn('Error clearing session recent items:', error);
      }
    );

    // Clear recent items cache (frequently ordered items).  Keep this direct:
    // importing RecentItemsService here creates a startup cycle through OrderService.
    await AsyncStorage.removeItem(CACHE_PREFIXES.RECENT_ITEMS).catch(error => {
      authSliceLogger.warn('Error clearing recent items cache:', error);
    });
    await clearProtectedDetailCaches();

    // Clear OTP rate limit data (phone number history)
    await clearAllRateLimits().catch(error => {
      authSliceLogger.warn('Error clearing OTP rate limits:', error);
    });

    // Clear user-scoped search history from SearchableBottomSheet
    // These are stored with keys like "recent_customers_{userId}"
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const userScopedKeys = allKeys.filter(
        key =>
          key.startsWith('recent_customers_') ||
          key.startsWith('recent_senders_')
      );
      if (userScopedKeys.length > 0) {
        await AsyncStorage.multiRemove(userScopedKeys);
        authSliceLogger.info(
          'Cleared',
          userScopedKeys.length,
          'user-scoped search history keys'
        );
      }
    } catch (error) {
      authSliceLogger.warn(
        'Error clearing user-scoped search history:',
        error
      );
    }

    authSliceLogger.info('Logout complete - all user data cleared');

    // Always fulfilled - local state will be cleared by reducer
    return { localCleared };
  }
);

/**
 * Delete the user's account permanently.
 * Calls the backend RPC to delete/anonymize user data, then clears local state.
 *
 * Apple App Store Requirement: Apps that allow account creation must provide
 * a way for users to delete their account and associated data from within the app.
 */
/**
 * Why `deleteAccount` was rejected, and above all whether the server deleted
 * the account: `true` (it did; the session then changed or the sign-out
 * failed), `false` (it answered and kept the account), `null` (no answer; it
 * may have). `message` is what the screens showed before this payload existed.
 */
export interface DeleteAccountRejection {
  code: 'REFUSED' | 'SESSION_CHANGED' | 'UNKNOWN';
  serverDeleted: boolean | null;
  message: string;
}

export const isDeleteAccountRejection = (value: unknown): value is DeleteAccountRejection =>
  typeof value === 'object' && value !== null && typeof (value as DeleteAccountRejection).message === 'string' && 'serverDeleted' in value;

export const deleteAccount = createAsyncThunk<void, void, { rejectValue: DeleteAccountRejection }>(
  'auth/deleteAccount',
  async (_, { rejectWithValue, dispatch }) => {
    const generation = getSessionGeneration();
    const result = await UserService.deleteAccount();
    const sessionChanged = generation !== getSessionGeneration();
    if (!result.success) {
      // The server answered and kept the account, or no answer arrived. A
      // session that changed meanwhile (an auth refusal forced a sign-out) is
      // still a refusal: the account exists.
      const unknown = result.outcome === 'unknown';
      return rejectWithValue({
        code: unknown ? 'UNKNOWN' : 'REFUSED',
        serverDeleted: unknown ? null : false,
        message: sessionChanged ? t('errors.auth.sessionChanged') : serverText(result.error, t('errors.user.deleteAccountFailed'), { write: true, delete: true, form: true }),
      });
    }
    if (sessionChanged)
      return rejectWithValue({ code: 'SESSION_CHANGED', serverDeleted: true, message: t('errors.auth.sessionChanged') });
    try {
      await dispatch(logout()).unwrap();
    } catch {
      return rejectWithValue({ code: 'SESSION_CHANGED', serverDeleted: true, message: t('errors.auth.sessionChanged') });
    }
  }
);

/**
 * Force logout when JWT is invalid (e.g., JWSInvalidSignature error)
 * This clears all stored tokens and forces user to re-authenticate
 * Also refreshes the Supabase client with fresh keys in case of key rotation
 */
export const forceLogoutOnInvalidToken = createAsyncThunk(
  'auth/forceLogoutOnInvalidToken',
  async (reason: string, { dispatch }) => {
    authSliceLogger.warn('Force logout triggered:', reason);

    // Clear user context from crash reporting
    clearSentryUser();

    const signingOut = signOut();
    signingOut.catch(() => {}); // awaited below; mark handled during local teardown
    const generation = getSessionGeneration();
    // Local teardown first; the server revocation may take up to 15 s.
    await clearProtectedDetailCaches();
    await clearSessionScopedState(dispatch);
    await signingOut;
    if (generation !== getSessionGeneration()) return { reason };

    // Refresh public config and reinitialize Supabase client with fresh keys
    // This handles the case where backend keys were rotated
    try {
      authSliceLogger.info('Refreshing Supabase client with fresh keys...');
      const freshConfig = await ConfigService.refreshPublicConfig();
      if (generation === getSessionGeneration())
        initializeSupabase(freshConfig.supabaseUrl, freshConfig.anonKey);
      authSliceLogger.info('Supabase client reinitialized with fresh keys');
    } catch (configError) {
      authSliceLogger.error('Failed to refresh config:', configError);
      // Continue anyway - user will see login screen
    }

    return { reason };
  },
  {
    // Several detectors (rejected refresh, RPC auth errors, revoked session)
    // can report the same dead session; one teardown at a time is enough.
    condition: (_reason, { getState }) => {
      const { auth } = getState() as { auth: AuthState };
      return !(auth.forceLogoutRequest || auth.logoutRequest);
    },
  }
);

/**
 * Attempt to refresh the authentication token.
 * First tries custom JWT refresh (for phone OTP auth), then falls back to Supabase.
 */
export const refreshAuthToken = createAsyncThunk(
  'auth/refreshToken',
  async (_, { rejectWithValue, getState }) => {
    const generation = getSessionGeneration();
    try {
      const state = getState() as { auth: AuthState };

      authSliceLogger.info('Attempting token refresh...');

      // First try custom JWT refresh (for phone OTP auth)
      // This is needed because standard Supabase refresh won't work for custom JWTs
      const customRefreshResult = await refreshCustomJWT();

      if (generation !== getSessionGeneration())
        return rejectWithValue(t('errors.auth.sessionChanged'));
      if (customRefreshResult) {
        authSliceLogger.info(
          'Custom JWT refresh successful, expires:',
          new Date(customRefreshResult.expiresAt).toISOString()
        );

        // Return the current user profile since we don't have a new session
        return {
          session: state.auth.session,
          user: state.auth.user,
          customRefresh: true,
        };
      }

      return rejectWithValue(t('errors.auth.refreshUnavailable'));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('errors.auth.tokenRefreshFailed');
      authSliceLogger.error('Token refresh error:', message);
      return rejectWithValue(message);
    }
  }
);

const sameProfile = (a: UserProfile, b: UserProfile): boolean => {
  const assigned = (profile: UserProfile) => [...(profile.assignedCustomerIds ?? [])].sort().join(',');
  return (
    a.id === b.id &&
    a.role === b.role &&
    a.name === b.name &&
    assigned(a) === assigned(b)
  );
};

// After a start from the cached profile: replace it when the server's differs
// (a changed role or customer assignment). Nothing happens offline.
async function reconcileCachedProfile(
  dispatch: (action: ReturnType<typeof authSlice.actions.setUserProfile>) => unknown,
  cached: UserProfile
): Promise<void> {
  const generation = getSessionGeneration();
  const fresh = (await reloadUserProfile()) as UserProfile | null;
  if (!fresh || generation !== getSessionGeneration() || sameProfile(cached, fresh)) return;
  dispatch(authSlice.actions.setUserProfile(fresh));
  setSentryUser(fresh.role);
}

/**
 * Renews the access token ahead of its expiry (every minute while signed in
 * and on return to the foreground), so the first request after a pause does
 * not have to wait for a refresh. The custom session has no expiry the person
 * must act on: a session that has really ended is reported by the refresh
 * itself (forced logout), so the warning and expired flags stay off.
 */
export const checkTokenExpiry = createAsyncThunk(
  'auth/checkTokenExpiry',
  async () => {
    const none = { warning: false, expired: false, refreshAttempted: false };
    const stored = await getStoredToken();
    if (stored.type !== 'jwt' || !stored.expiresAt) return none;
    // ensureValidTokens renews inside the same margin; asking earlier would
    // only read the secure store.
    if (stored.expiresAt - Date.now() > renewAheadMs(stored.authToken)) return none;
    await ensureValidTokens();
    return { ...none, refreshAttempted: true };
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setPhoneNumber: (state, action: PayloadAction<string>) => {
      state.phoneNumber = action.payload;
    },
    setOtpSent: (state, action: PayloadAction<boolean>) => {
      state.otpSent = action.payload;
    },
    setAuthenticating: (state, action: PayloadAction<boolean>) => {
      state.isAuthenticating = action.payload;
    },
    setVerifyingOTP: (state, action: PayloadAction<boolean>) => {
      state.isVerifyingOTP = action.payload;
    },
    setSession: (state, action: PayloadAction<Session | null>) => {
      state.session = action.payload;
    },
    setUser: (state, action: PayloadAction<User | null>) => {
      state.user = action.payload;
    },
    setUserProfile: (state, action: PayloadAction<UserProfile | null>) => {
      state.logoutRequest = undefined;
      state.deleteRequest = undefined;
      state.forceLogoutRequest = undefined;
      state.isLoading = false;
      state.profileRequest = undefined;
      state.refreshRequest = undefined;
      // A restore that was still running is superseded: it did not settle.
      if (state.initializeRequest) state.initializeStatus = 'idle';
      state.initializeRequest = undefined;
      state.userProfile = action.payload;
      if (action.payload) state.signOutReason = null;
    },
    clearAuthError: state => {
      state.error = null;
    },
    clearSignOutReason: state => {
      state.signOutReason = null;
    },
  },
  extraReducers: builder => {
    builder
      // Initialize auth
      .addCase(initializeAuth.pending, (state, action) => {
        state.initializeRequest = action.meta.requestId;
        state.initializeStatus = 'pending';
        state.initializeGeneration = action.meta.generation;
        // Only set loading if we don't have cached auth data
        // This prevents the UI from unmounting when we have cached credentials
        if (!state.userProfile) {
          state.isLoading = true;
        }
      })
      .addCase(initializeAuth.fulfilled, (state, action) => {
        if (state.initializeRequest !== action.meta.requestId) return;
        state.initializeRequest = undefined;
        state.initializeStatus = 'settled';
        state.isLoading = false;
        state.session = action.payload.session;
        state.user = action.payload.user;
        state.userProfile = action.payload.userProfile;
        if (action.payload.userProfile) state.signOutReason = null;
      })
      .addCase(initializeAuth.rejected, (state, action) => {
        if (state.initializeRequest !== action.meta.requestId) return;
        state.initializeRequest = undefined;
        state.initializeStatus = 'settled';
        state.isLoading = false;
        state.session = null;
        state.user = null;
        state.userProfile = null;
        state.error = action.payload as string;
      })
      // Fetch user profile
      .addCase(fetchUserProfile.pending, (state, action) => {
        state.profileRequest = action.meta.requestId;
      })
      .addCase(fetchUserProfile.fulfilled, (state, action) => {
        if (state.profileRequest !== action.meta.requestId) return;
        state.profileRequest = undefined;
        // Cast role to valid type (backend may return string)
        const profile = action.payload;
        if (profile) {
          state.userProfile = {
            ...profile,
            role: profile.role as UserProfile['role'],
          };
        } else {
          state.userProfile = null;
        }
      })
      // Logout
      .addCase(logout.pending, (state, action) => {
        state.logoutRequest = action.meta.requestId;
        state.profileRequest = undefined;
        state.initializeRequest = undefined;
        state.initializeStatus = 'idle';
        state.refreshRequest = undefined;
        state.session = null;
        state.user = null;
        state.userProfile = null;
        state.isLoading = true;
      })
      .addCase(logout.fulfilled, (state, action) => {
        if (state.logoutRequest !== action.meta.requestId) return;
        state.logoutRequest = undefined;
        state.isLoading = false;
        state.session = null;
        state.user = null;
        state.userProfile = null;
        state.phoneNumber = '';
        state.otpSent = false;
      })
      .addCase(logout.rejected, (state, action) => {
        if (state.logoutRequest !== action.meta.requestId) return;
        state.logoutRequest = undefined;
        state.isLoading = false;
      })
      // Delete account
      .addCase(deleteAccount.pending, (state, action) => {
        state.deleteRequest = action.meta.requestId;
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteAccount.fulfilled, (state, action) => {
        if (state.deleteRequest !== action.meta.requestId) return;
        state.deleteRequest = undefined;
        state.isLoading = false;
        state.session = null;
        state.user = null;
        state.userProfile = null;
        state.phoneNumber = '';
        state.otpSent = false;
        state.error = null;
      })
      .addCase(deleteAccount.rejected, (state, action) => {
        if (state.deleteRequest !== action.meta.requestId) return;
        state.deleteRequest = undefined;
        state.isLoading = false;
        state.error = action.payload?.message ?? null;
      })
      // Force logout on invalid token (JWSInvalidSignature, etc.)
      .addCase(forceLogoutOnInvalidToken.pending, (state, action) => {
        state.forceLogoutRequest = action.meta.requestId;
        state.initializeRequest = undefined;
        state.initializeStatus = 'idle';
        state.refreshRequest = undefined;
        state.profileRequest = undefined;
        state.session = null;
        state.user = null;
        state.userProfile = null;
      })
      .addCase(forceLogoutOnInvalidToken.fulfilled, (state, action) => {
        if (state.forceLogoutRequest !== action.meta.requestId) return;
        state.forceLogoutRequest = undefined;
        state.isLoading = false;
        state.session = null;
        state.user = null;
        state.userProfile = null;
        state.phoneNumber = '';
        state.otpSent = false;
        state.error = action.payload.reason;
        state.signOutReason = action.payload.reason;
      })
      .addCase(forceLogoutOnInvalidToken.rejected, (state, action) => {
        // A failed teardown must not suppress every later forced logout.
        if (state.forceLogoutRequest !== action.meta.requestId) return;
        state.forceLogoutRequest = undefined;
        state.isLoading = false;
        state.session = null;
        state.user = null;
        state.userProfile = null;
        state.error = action.meta.arg;
        state.signOutReason = action.meta.arg;
      })
      // Token refresh
      .addCase(refreshAuthToken.pending, (state, action) => {
        state.refreshRequest = action.meta.requestId;
      })
      .addCase(refreshAuthToken.fulfilled, (state, action) => {
        if (state.refreshRequest !== action.meta.requestId) return;
        state.refreshRequest = undefined;
        state.session = action.payload.session;
        state.user = action.payload.user;
      })
      .addCase(refreshAuthToken.rejected, state => {
        // Don't clear auth on refresh failure - user may still be able to use app
        authSliceLogger.warn(
          'Token refresh rejected, keeping current auth state'
        );
      });
  },
});

export const {
  setPhoneNumber,
  setOtpSent,
  setAuthenticating,
  setVerifyingOTP,
  setSession,
  setUser,
  setUserProfile,
  clearAuthError,
  clearSignOutReason,
} = authSlice.actions;

// ============================================================================
// MEMOIZED SELECTORS
// ============================================================================

/** Base selector for auth state */
const selectAuthState = (state: { auth: AuthState }) => state.auth;

/** Memoized selector for user profile - prevents re-renders on unrelated auth changes */
export const selectUserProfile = createSelector(
  [selectAuthState],
  auth => auth.userProfile
);

/** Memoized selector for session */
export const selectSession = createSelector(
  [selectAuthState],
  auth => auth.session
);

/** Memoized selector for authentication loading state */
export const selectIsAuthLoading = createSelector(
  [selectAuthState],
  auth => auth.isLoading || auth.isAuthenticating || auth.isVerifyingOTP
);

/** Memoized selector for user role info */
export const selectUserRole = createSelector([selectUserProfile], profile => ({
  role: profile?.role,
  isSupervisor: profile?.supervisor ?? false,
  isAdmin: profile?.role === 'admin',
  // The `staff` role only. For "works for the facility" use isWarehouseUser (@/config/roles).
  isStaffRole: profile?.role === 'staff',
  isCustomer: profile?.role === 'customer',
}));

export default authSlice.reducer;
