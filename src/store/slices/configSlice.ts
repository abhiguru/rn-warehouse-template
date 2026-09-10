/**
 * Redux Slice for Application Configuration
 * Handles state management of public and full configurations
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { SupabaseClient } from '@supabase/supabase-js';
import ConfigService, { PublicConfig, FullConfig } from '@/services/configService';

export interface ConfigState {
  publicConfig: PublicConfig | null;
  fullConfig: FullConfig | null;
  isLoadingPublic: boolean;
  isLoadingFull: boolean;
  lastFetchedPublic: number | null;
  lastFetchedFull: number | null;
  publicError: string | null;
  fullError: string | null;
}

const initialState: ConfigState = {
  publicConfig: null,
  fullConfig: null,
  isLoadingPublic: false,
  isLoadingFull: false,
  lastFetchedPublic: null,
  lastFetchedFull: null,
  publicError: null,
  fullError: null,
};

/**
 * Async thunk to fetch public configuration
 * No authentication required - used during app bootstrap
 */
export const fetchPublicConfig = createAsyncThunk(
  'config/fetchPublicConfig',
  async (_, { rejectWithValue }) => {
    try {
      const config = await ConfigService.getPublicConfig();
      return config;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch public config';
      return rejectWithValue(message);
    }
  }
);

/**
 * Async thunk to fetch full configuration
 * Requires authentication - contains features, limits, external keys
 */
export const fetchFullConfig = createAsyncThunk(
  'config/fetchFullConfig',
  async (supabase: SupabaseClient, { rejectWithValue }) => {
    try {
      // Try to get full config from service
      const config = await ConfigService.getFullConfig(supabase);
      if (config) {
        return config;
      }
      // If config service returns null, it's not a fatal error
      // The app can continue without full config
      console.warn('[ConfigSlice] Full config not available, using defaults');
      return rejectWithValue('Full config not available (optional)');
    } catch (error: unknown) {
      console.error('[ConfigSlice] Full config fetch error:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch full config';
      return rejectWithValue(message);
    }
  }
);

/**
 * Async thunk to refresh public configuration
 * Forces a fresh fetch from the API
 */
export const refreshPublicConfig = createAsyncThunk(
  'config/refreshPublicConfig',
  async (_, { rejectWithValue }) => {
    try {
      const config = await ConfigService.refreshPublicConfig();
      return config;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to refresh public config';
      return rejectWithValue(message);
    }
  }
);

/**
 * Async thunk to refresh full configuration
 * Forces a fresh fetch from the API
 */
export const refreshFullConfig = createAsyncThunk(
  'config/refreshFullConfig',
  async (supabase: SupabaseClient, { rejectWithValue }) => {
    try {
      const config = await ConfigService.refreshFullConfig(supabase);
      if (!config) {
        return rejectWithValue('Full config not available');
      }
      return config;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to refresh full config';
      return rejectWithValue(message);
    }
  }
);

const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {
    /**
     * Clear all cached configurations
     */
    clearConfig: (state) => {
      state.publicConfig = null;
      state.fullConfig = null;
      state.publicError = null;
      state.fullError = null;
    },

    /**
     * Clear only full configuration (e.g., after logout)
     */
    clearFullConfig: (state) => {
      state.fullConfig = null;
      state.fullError = null;
      state.lastFetchedFull = null;
    },

    /**
     * Mark configs as stale to trigger refresh
     */
    markConfigsStale: (state) => {
      state.lastFetchedPublic = null;
      state.lastFetchedFull = null;
    },
  },
  extraReducers: (builder) => {
    // ==================== Fetch Public Config ====================

    builder.addCase(fetchPublicConfig.pending, (state) => {
      state.isLoadingPublic = true;
      state.publicError = null;
    });

    builder.addCase(fetchPublicConfig.fulfilled, (state, action) => {
      state.isLoadingPublic = false;
      state.publicConfig = action.payload;
      state.lastFetchedPublic = Date.now();
      state.publicError = null;
    });

    builder.addCase(fetchPublicConfig.rejected, (state, action) => {
      state.isLoadingPublic = false;
      state.publicError = action.payload as string;
      // Keep existing config on error (stale-while-revalidate pattern)
    });

    // ==================== Fetch Full Config ====================

    builder.addCase(fetchFullConfig.pending, (state) => {
      state.isLoadingFull = true;
      state.fullError = null;
    });

    builder.addCase(fetchFullConfig.fulfilled, (state, action) => {
      state.isLoadingFull = false;
      state.fullConfig = action.payload;
      state.lastFetchedFull = Date.now();
      state.fullError = null;
    });

    builder.addCase(fetchFullConfig.rejected, (state, action) => {
      state.isLoadingFull = false;
      state.fullError = action.payload as string;
      // Keep existing config on error (stale-while-revalidate pattern)
    });

    // ==================== Refresh Public Config ====================

    builder.addCase(refreshPublicConfig.pending, (state) => {
      state.isLoadingPublic = true;
      // Keep previous error until refresh completes
    });

    builder.addCase(refreshPublicConfig.fulfilled, (state, action) => {
      state.isLoadingPublic = false;
      state.publicConfig = action.payload;
      state.lastFetchedPublic = Date.now();
      state.publicError = null;
    });

    builder.addCase(refreshPublicConfig.rejected, (state, action) => {
      state.isLoadingPublic = false;
      state.publicError = action.payload as string;
    });

    // ==================== Refresh Full Config ====================

    builder.addCase(refreshFullConfig.pending, (state) => {
      state.isLoadingFull = true;
    });

    builder.addCase(refreshFullConfig.fulfilled, (state, action) => {
      state.isLoadingFull = false;
      state.fullConfig = action.payload;
      state.lastFetchedFull = Date.now();
      state.fullError = null;
    });

    builder.addCase(refreshFullConfig.rejected, (state, action) => {
      state.isLoadingFull = false;
      state.fullError = action.payload as string;
    });
  },
});

export const { clearConfig, clearFullConfig, markConfigsStale } = configSlice.actions;
export default configSlice.reducer;
