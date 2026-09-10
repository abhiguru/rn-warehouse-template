import { createSlice, PayloadAction, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import type { User, Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  signOut,
  getStoredToken,
  getCachedUserProfile,
  cacheUserProfile,
  clearStoredTokens,
  getSupabaseClient,
  refreshCustomJWT,
  storeTokens,
  initializeSupabase,
} from '@/config/supabaseConfig';
import { extendSessionMarker } from '@/utils/secureSessionMarker';
import ConfigService from '@/services/configService';
import { getUserByIdDirect } from '@/services/user-core-service';
import { fetchFullConfig } from './configSlice';
import { setSentryUser, clearSentryUser } from '@/config/sentryConfig';
// Privacy cleanup services - clear user-specific data on logout
import { RecentCustomersService } from '@/services/recent-customers-service';
import { SessionRecentItemsService } from '@/services/session-recent-items-service';
import { RecentItemsService } from '@/services/recent-items-service';
import { clearAllRateLimits } from '@/utils/otpRateLimiter';
import { UserService } from '@/services/user-service';
import { UserProfile } from '@/types/user.types';

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

  // Token expiry warnings
  tokenExpiryWarning: boolean;
  tokenExpired: boolean;

  // E2 Fix: Track background operation failures
  configFetchFailed: boolean;
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
  tokenExpiryWarning: false,
  tokenExpired: false,
  configFetchFailed: false,
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
    console.warn(`[AuthSlice] ${errorContext}:`, error);
    return fallback;
  }
};

// Guard to prevent multiple concurrent fetchFullConfig calls
// This prevents race conditions when initializeAuth hits multiple code paths
let configFetchPromise: Promise<void> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchConfigOnce = (
  dispatch: any, // Redux dispatch from thunk API
  supabaseClient: ReturnType<typeof getSupabaseClient>
): void => {
  // If already fetching, skip
  if (configFetchPromise) {
    console.log('[AuthSlice] Config fetch already in progress, skipping duplicate call');
    return;
  }

  console.log('[AuthSlice] Starting config fetch (guarded)');
  configFetchPromise = dispatch(fetchFullConfig(supabaseClient))
    .unwrap()
    .then(() => {
      console.log('[AuthSlice] Config fetch completed successfully');
    })
    .catch((configError: unknown) => {
      console.warn('[AuthSlice] Full config fetch failed:', configError);
      dispatch(setConfigFetchFailed(true));
    })
    .finally(() => {
      // Reset the guard after completion (success or failure)
      configFetchPromise = null;
    });
};

// Async thunks
export const initializeAuth = createAsyncThunk(
  'auth/initialize',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      // STEP 1: Ensure we have Supabase client (fallback to initialized one)
      const supabaseClient = getSupabaseClient();

      // Check current Supabase session first
      const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

      if (sessionError) {
        console.error('[AuthSlice] Session error:', sessionError);
        // Don't throw - try to recover from stored tokens instead
      }

      if (session && session.user) {
        // Get cached user profile for instant UI
        const cachedProfile = await safeAsyncOp(
          () => getCachedUserProfile(),
          null,
          'Failed to get cached profile'
        );

        if (cachedProfile) {
          // STEP 2: If authenticated, fetch full config (guarded to prevent race conditions)
          console.log('[AuthSlice] User authenticated, fetching full config');
          fetchConfigOnce(dispatch, supabaseClient);

          // Auto-extend session to persist until logout
          extendSessionMarker().catch((err) => {
            console.warn('[AuthSlice] Failed to extend session marker:', err);
          });

          // Set user context for crash reporting
          setSentryUser(cachedProfile.id, cachedProfile.role);

          return { session, user: session.user, userProfile: cachedProfile };
        } else {
          // Try to fetch user profile
          const profileResult = await safeAsyncOp(
            () => getUserByIdDirect(session.user.id),
            { status: 'error' as const, data: null },
            'Profile fetch error'
          );

          if (profileResult.status === 'success' && profileResult.data) {
            // Cache profile in background - don't block
            cacheUserProfile(profileResult.data).catch((cacheError) => {
              console.warn('[AuthSlice] Failed to cache profile:', cacheError);
            });

            // Auto-extend session to persist until logout
            extendSessionMarker().catch((err) => {
              console.warn('[AuthSlice] Failed to extend session marker:', err);
            });

            // Fetch config (guarded to prevent race conditions)
            fetchConfigOnce(dispatch, supabaseClient);

            // Set user context for crash reporting
            setSentryUser(profileResult.data.id, profileResult.data.role);

            return { session, user: session.user, userProfile: profileResult.data };
          }

          return { session, user: session.user, userProfile: null };
        }
      } else {
        // No Supabase session, check for stored JWT tokens first
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
            console.log('[AuthSlice] JWT token expired, attempting refresh...');

            // Try to refresh the token
            const refreshResult = await safeAsyncOp(
              () => refreshCustomJWT(),
              null,
              'Failed to refresh JWT token'
            );

            if (refreshResult) {
              console.log('[AuthSlice] Token refresh successful!');
              // Re-fetch token data after refresh
              tokenData = await safeAsyncOp(
                () => getStoredToken(),
                { isValid: false as const },
                'Failed to get refreshed token'
              );
            } else {
              console.log('[AuthSlice] Token refresh failed, will require re-authentication');
              // Token refresh failed - clear tokens and require re-login
              clearStoredTokens().catch((clearError) => {
                console.warn('[AuthSlice] Failed to clear expired tokens:', clearError);
              });
              return { session: null, user: null, userProfile: null };
            }
          }
        }

        // Check if we have valid JWT tokens
        if (tokenData.isValid && tokenData.type === 'jwt') {
          console.log('[AuthSlice] Found valid JWT tokens, checking cached profile');
          const cachedProfile = await safeAsyncOp(
            () => getCachedUserProfile(),
            null,
            'Failed to get cached profile for JWT auth'
          );

          if (cachedProfile) {
            console.log('[AuthSlice] Restoring auth with cached profile (custom JWT auth)');

            // Auto-extend session to persist until logout
            extendSessionMarker().catch((err) => {
              console.warn('[AuthSlice] Failed to extend session marker:', err);
            });

            // Fetch config (guarded to prevent race conditions)
            fetchConfigOnce(dispatch, supabaseClient);

            // Set user context for crash reporting
            setSentryUser(cachedProfile.id, cachedProfile.role);

            return { session: null, user: null, userProfile: cachedProfile };
          } else {
            console.log('[AuthSlice] No cached profile found, clearing tokens');
            // Clear tokens in background - don't block
            clearStoredTokens().catch((clearError) => {
              console.warn('[AuthSlice] Failed to clear tokens:', clearError);
            });
            return { session: null, user: null, userProfile: null };
          }
        }

        // Fallback to session marker if no JWT tokens
        if (tokenData.isValid && tokenData.type === 'session') {
          // Remove session marker in background - don't block
          AsyncStorage.removeItem('session_marker').catch((removeError) => {
            console.warn('[AuthSlice] Failed to remove session marker:', removeError);
          });
        }

        return { session: null, user: null, userProfile: null };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize auth';
      console.error('[AuthSlice] Initialize auth error:', error);
      return rejectWithValue(errorMessage);
    }
  }
);

export const fetchUserProfile = createAsyncThunk(
  'auth/fetchUserProfile',
  async (userId: string) => {
    const result = await getUserByIdDirect(userId);
    
    if (result.status === 'success' && result.data) {
      // Cache the profile for next time
      await cacheUserProfile(result.data);
      return result.data;
    } else {
      throw new Error('Failed to fetch user profile');
    }
  }
);

export const logout = createAsyncThunk(
  'auth/logout',
  async () => {
    // D8 Fix: Make logout atomic - clear local state regardless of signOut result
    // Server session invalidation is best-effort; local cleanup must always succeed

    console.log('[AuthSlice] Starting logout - clearing all user-specific data');

    // Clear user context from crash reporting
    clearSentryUser();

    // Clear all stored tokens (ignore errors)
    await clearStoredTokens().catch((error) => {
      console.warn('[AuthSlice] Error clearing tokens during logout:', error);
    });

    // Clear session markers (ignore errors)
    await AsyncStorage.removeItem('session_marker').catch(() => {});
    await AsyncStorage.removeItem('secure_session_marker').catch(() => {});
    await AsyncStorage.removeItem('cached_user_profile').catch(() => {});

    // =========================================================================
    // Privacy cleanup: Clear all user-specific cached data
    // This prevents data leakage when different users log in on the same device
    // =========================================================================

    // Clear recent customers (search history)
    await RecentCustomersService.clearRecentCustomers().catch((error) => {
      console.warn('[AuthSlice] Error clearing recent customers:', error);
    });

    // Clear session recent items (per-customer item history)
    await SessionRecentItemsService.clearAllSessionRecentItems().catch((error) => {
      console.warn('[AuthSlice] Error clearing session recent items:', error);
    });

    // Clear recent items cache (frequently ordered items)
    await RecentItemsService.clearCache().catch((error) => {
      console.warn('[AuthSlice] Error clearing recent items cache:', error);
    });

    // Clear OTP rate limit data (phone number history)
    await clearAllRateLimits().catch((error) => {
      console.warn('[AuthSlice] Error clearing OTP rate limits:', error);
    });

    // Clear user-scoped search history from SearchableBottomSheet
    // These are stored with keys like "recent_customers_{userId}"
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const userScopedKeys = allKeys.filter(key =>
        key.startsWith('recent_customers_') ||
        key.startsWith('recent_senders_')
      );
      if (userScopedKeys.length > 0) {
        await AsyncStorage.multiRemove(userScopedKeys);
        console.log('[AuthSlice] Cleared', userScopedKeys.length, 'user-scoped search history keys');
      }
    } catch (error) {
      console.warn('[AuthSlice] Error clearing user-scoped search history:', error);
    }

    // Sign out from Supabase (best-effort, don't throw on failure)
    await signOut().catch((error) => {
      console.warn('[AuthSlice] Error signing out from Supabase:', error);
    });

    console.log('[AuthSlice] Logout complete - all user data cleared');

    // Always return success - local state will be cleared by reducer
    return;
  }
);

/**
 * Delete the user's account permanently.
 * Calls the backend RPC to delete/anonymize user data, then clears local state.
 *
 * Apple App Store Requirement: Apps that allow account creation must provide
 * a way for users to delete their account and associated data from within the app.
 */
export const deleteAccount = createAsyncThunk(
  'auth/deleteAccount',
  async (_, { rejectWithValue }) => {
    console.log('[AuthSlice] Starting account deletion...');

    // Step 1: Call backend RPC to delete account data
    const result = await UserService.deleteAccount();

    if (!result.success) {
      console.error('[AuthSlice] Account deletion failed:', result.error);
      return rejectWithValue(result.error || 'Failed to delete account');
    }

    console.log('[AuthSlice] Backend account deletion successful, clearing local data...');

    // Step 2: Clear all local data (same as logout)
    // Clear user context from crash reporting
    clearSentryUser();

    // Clear all stored tokens
    await clearStoredTokens().catch((error) => {
      console.warn('[AuthSlice] Error clearing tokens during account deletion:', error);
    });

    // Clear session markers
    await AsyncStorage.removeItem('session_marker').catch(() => {});
    await AsyncStorage.removeItem('secure_session_marker').catch(() => {});
    await AsyncStorage.removeItem('cached_user_profile').catch(() => {});

    // Clear all user-specific cached data
    await RecentCustomersService.clearRecentCustomers().catch((error) => {
      console.warn('[AuthSlice] Error clearing recent customers:', error);
    });

    await SessionRecentItemsService.clearAllSessionRecentItems().catch((error) => {
      console.warn('[AuthSlice] Error clearing session recent items:', error);
    });

    await RecentItemsService.clearCache().catch((error) => {
      console.warn('[AuthSlice] Error clearing recent items cache:', error);
    });

    await clearAllRateLimits().catch((error) => {
      console.warn('[AuthSlice] Error clearing OTP rate limits:', error);
    });

    // Clear user-scoped search history
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const userScopedKeys = allKeys.filter(key =>
        key.startsWith('recent_customers_') ||
        key.startsWith('recent_senders_')
      );
      if (userScopedKeys.length > 0) {
        await AsyncStorage.multiRemove(userScopedKeys);
        console.log('[AuthSlice] Cleared', userScopedKeys.length, 'user-scoped keys');
      }
    } catch (error) {
      console.warn('[AuthSlice] Error clearing user-scoped search history:', error);
    }

    // Sign out from Supabase
    await signOut().catch((error) => {
      console.warn('[AuthSlice] Error signing out from Supabase:', error);
    });

    console.log('[AuthSlice] Account deletion complete - all data cleared');

    return;
  }
);

/**
 * Force logout when JWT is invalid (e.g., JWSInvalidSignature error)
 * This clears all stored tokens and forces user to re-authenticate
 * Also refreshes the Supabase client with fresh keys in case of key rotation
 */
export const forceLogoutOnInvalidToken = createAsyncThunk(
  'auth/forceLogoutOnInvalidToken',
  async (reason: string) => {
    console.warn('[AuthSlice] Force logout triggered:', reason);

    // Clear user context from crash reporting
    clearSentryUser();

    // Clear all stored tokens
    await clearStoredTokens().catch((error) => {
      console.error('[AuthSlice] Error clearing tokens:', error);
    });

    // Also clear session marker
    await AsyncStorage.removeItem('session_marker').catch(() => {});
    await AsyncStorage.removeItem('secure_session_marker').catch(() => {});

    // Sign out from Supabase
    await signOut().catch((error) => {
      console.error('[AuthSlice] Error signing out:', error);
    });

    // Refresh public config and reinitialize Supabase client with fresh keys
    // This handles the case where backend keys were rotated
    try {
      console.log('[AuthSlice] Refreshing Supabase client with fresh keys...');
      const freshConfig = await ConfigService.refreshPublicConfig();
      initializeSupabase(freshConfig.supabaseUrl, freshConfig.anonKey);
      console.log('[AuthSlice] Supabase client reinitialized with fresh keys');
    } catch (configError) {
      console.error('[AuthSlice] Failed to refresh config:', configError);
      // Continue anyway - user will see login screen
    }

    return { reason };
  }
);

/**
 * Attempt to refresh the authentication token.
 * First tries custom JWT refresh (for phone OTP auth), then falls back to Supabase.
 */
export const refreshAuthToken = createAsyncThunk(
  'auth/refreshToken',
  async (_, { rejectWithValue, getState }) => {
    try {
      const supabaseClient = getSupabaseClient();
      const state = getState() as { auth: AuthState };

      console.log('[AuthSlice] Attempting token refresh...');

      // First try custom JWT refresh (for phone OTP auth)
      // This is needed because standard Supabase refresh won't work for custom JWTs
      const customRefreshResult = await refreshCustomJWT();

      if (customRefreshResult) {
        console.log('[AuthSlice] Custom JWT refresh successful, expires:', new Date(customRefreshResult.expiresAt).toISOString());

        // Return the current user profile since we don't have a new session
        return {
          session: state.auth.session,
          user: state.auth.user,
          customRefresh: true,
        };
      }

      // Fall back to Supabase's built-in session refresh
      console.log('[AuthSlice] Custom JWT refresh failed, trying Supabase refresh...');
      const { data, error } = await supabaseClient.auth.refreshSession();

      if (error) {
        console.error('[AuthSlice] Token refresh failed:', error.message);
        return rejectWithValue(error.message);
      }

      if (!data.session) {
        console.warn('[AuthSlice] Token refresh returned no session');
        return rejectWithValue('No session returned from refresh');
      }

      console.log('[AuthSlice] Token refresh successful, new expiry:', data.session.expires_at);

      return {
        session: data.session,
        user: data.session.user,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token refresh failed';
      console.error('[AuthSlice] Token refresh error:', message);
      return rejectWithValue(message);
    }
  }
);

// Track if refresh is in progress to prevent multiple simultaneous refreshes
let isRefreshInProgress = false;

/**
 * Check token expiry and attempt refresh if needed.
 * Updates state with warning/expired flags.
 */
export const checkTokenExpiry = createAsyncThunk(
  'auth/checkTokenExpiry',
  async (_, { getState, dispatch }) => {
    const state = getState() as { auth: AuthState };
    const { session } = state.auth;

    if (!session?.expires_at) {
      return { warning: false, expired: false, refreshAttempted: false };
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at;
    const timeUntilExpiry = expiresAt - now;

    // Warning if less than 5 minutes until expiry
    const warningThreshold = 5 * 60;
    // Refresh threshold - attempt refresh when less than 3 minutes until expiry
    const refreshThreshold = 3 * 60;
    // Expired if already past expiry time
    const isExpired = timeUntilExpiry <= 0;
    const isWarning = !isExpired && timeUntilExpiry <= warningThreshold;
    const shouldRefresh = !isExpired && timeUntilExpiry <= refreshThreshold;

    // Attempt proactive token refresh if within refresh threshold
    if (shouldRefresh && !isRefreshInProgress) {
      isRefreshInProgress = true;
      console.log('[AuthSlice] Token expires in', timeUntilExpiry, 'seconds, attempting refresh...');

      try {
        await dispatch(refreshAuthToken()).unwrap();
        console.log('[AuthSlice] Proactive token refresh successful');
      } catch (refreshError) {
        console.warn('[AuthSlice] Proactive token refresh failed:', refreshError);
        // Don't clear auth - let user continue until actual expiry
      } finally {
        isRefreshInProgress = false;
      }

      return { warning: isWarning, expired: false, refreshAttempted: true };
    }

    return {
      warning: isWarning,
      expired: isExpired,
      refreshAttempted: false,
    };
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
      state.userProfile = action.payload;
    },
    setTokenExpiryWarning: (state, action: PayloadAction<boolean>) => {
      state.tokenExpiryWarning = action.payload;
    },
    setTokenExpired: (state, action: PayloadAction<boolean>) => {
      state.tokenExpired = action.payload;
    },
    clearTokenExpiryStates: (state) => {
      state.tokenExpiryWarning = false;
      state.tokenExpired = false;
    },
    clearAuthError: (state) => {
      state.error = null;
    },
    clearAllAuthAlerts: (state) => {
      state.tokenExpiryWarning = false;
      state.tokenExpired = false;
      state.error = null;
      state.configFetchFailed = false;
    },
    // E2 Fix: Track config fetch failures for UI awareness
    setConfigFetchFailed: (state, action: PayloadAction<boolean>) => {
      state.configFetchFailed = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Initialize auth
      .addCase(initializeAuth.pending, (state) => {
        // Only set loading if we don't have cached auth data
        // This prevents the UI from unmounting when we have cached credentials
        if (!state.userProfile) {
          state.isLoading = true;
        }
      })
      .addCase(initializeAuth.fulfilled, (state, action) => {
        state.isLoading = false;
        state.session = action.payload.session;
        state.user = action.payload.user;
        state.userProfile = action.payload.userProfile;
      })
      .addCase(initializeAuth.rejected, (state, action) => {
        state.isLoading = false;
        state.session = null;
        state.user = null;
        state.userProfile = null;
        state.error = action.payload as string;
      })
      // Fetch user profile
      .addCase(fetchUserProfile.fulfilled, (state, action) => {
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
      .addCase(logout.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(logout.fulfilled, (state) => {
        state.isLoading = false;
        state.session = null;
        state.user = null;
        state.userProfile = null;
        state.phoneNumber = '';
        state.otpSent = false;
      })
      .addCase(logout.rejected, (state) => {
        state.isLoading = false;
      })
      // Delete account
      .addCase(deleteAccount.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteAccount.fulfilled, (state) => {
        state.isLoading = false;
        state.session = null;
        state.user = null;
        state.userProfile = null;
        state.phoneNumber = '';
        state.otpSent = false;
        state.error = null;
      })
      .addCase(deleteAccount.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Force logout on invalid token (JWSInvalidSignature, etc.)
      .addCase(forceLogoutOnInvalidToken.fulfilled, (state, action) => {
        state.isLoading = false;
        state.session = null;
        state.user = null;
        state.userProfile = null;
        state.phoneNumber = '';
        state.otpSent = false;
        state.error = action.payload.reason;
      })
      // Token refresh
      .addCase(refreshAuthToken.fulfilled, (state, action) => {
        state.session = action.payload.session;
        state.user = action.payload.user;
        state.tokenExpiryWarning = false;
        state.tokenExpired = false;
      })
      .addCase(refreshAuthToken.rejected, (state) => {
        // Don't clear auth on refresh failure - user may still be able to use app
        // The token expiry warning will remain visible
        console.warn('[AuthSlice] Token refresh rejected, keeping current auth state');
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
  setTokenExpiryWarning,
  setTokenExpired,
  clearTokenExpiryStates,
  clearAuthError,
  clearAllAuthAlerts,
  setConfigFetchFailed,
} = authSlice.actions;

// ============================================================================
// MEMOIZED SELECTORS
// ============================================================================

/** Base selector for auth state */
const selectAuthState = (state: { auth: AuthState }) => state.auth;

/** Memoized selector for user profile - prevents re-renders on unrelated auth changes */
export const selectUserProfile = createSelector(
  [selectAuthState],
  (auth) => auth.userProfile
);

/** Memoized selector for session */
export const selectSession = createSelector(
  [selectAuthState],
  (auth) => auth.session
);

/** Memoized selector for authentication loading state */
export const selectIsAuthLoading = createSelector(
  [selectAuthState],
  (auth) => auth.isLoading || auth.isAuthenticating || auth.isVerifyingOTP
);


/** Memoized selector for user role info */
export const selectUserRole = createSelector(
  [selectUserProfile],
  (profile) => ({
    role: profile?.role,
    isSupervisor: profile?.supervisor ?? false,
    isAdmin: profile?.role === 'admin',
    isStaff: profile?.role === 'staff',
    isCustomer: profile?.role === 'customer',
  })
);

export default authSlice.reducer;