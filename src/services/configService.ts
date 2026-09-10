/**
 * Configuration Service
 * Handles fetching and caching of application configuration from Supabase Edge Functions
 *
 * Two-tier system:
 * 1. Public Config (no auth required) - for app bootstrap
 * 2. Full Config (auth required) - for authenticated features
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CONFIG_API_BASE_URL } from '@/config/envConfig';
import { getAuthToken } from '@/utils/authTokenUtils';

export interface PublicConfig {
  supabaseUrl: string;
  anonKey: string;
  environment: string;
  version: string;
  maintenanceMode: boolean;
  urls: {
    publicConfig: string;
    fullConfig: string;
  };
  /**
   * Minimum required app version (semantic versioning).
   * If current app version is lower, user will be forced to update.
   * Backend team must add this field to the config API response.
   * Format: "1.0.0" (major.minor.patch)
   */
  minimumVersion?: string;
  /**
   * Optional store URLs for update redirect.
   * If not provided, defaults to standard store URLs.
   */
  storeUrls?: {
    ios?: string;
    android?: string;
  };
  /**
   * Feature flags for remote feature toggles.
   * Backend team must add this field to get-public-config response.
   * Keys should be snake_case feature names, values are boolean.
   * Example: { "new_invoice_flow": true, "experimental_reports": false }
   */
  featureFlags?: Record<string, boolean>;
}

export interface FullConfig {
  apiKeys: {
    supabase: {
      url: string;
      anonKey: string;
    };
    external?: Record<string, string>;
  };
  features: {
    testMode: boolean;
    maintenanceMode: boolean;
    otpEnabled: boolean;
    smsProvider: string;
    maxFileUploadSize: number;
    allowedFileTypes: string[];
    enabledFeatures: string[];
  };
  environment: {
    name: string;
    version: string;
    buildDate: string;
    region: string;
  };
  urls: {
    api: string;
    storage: string;
    realtime: string;
    auth: string;
  };
  limits: {
    otpHourlyLimit: number;
    otpDailyLimit: number;
    sessionTimeout: number;
    refreshTokenExpiry: number;
    apiRateLimitPerMinute: number;
    apiRateLimitPerHour: number;
  };
  support: {
    email: string;
    phone: string;
    appName: string;
  };
}

interface CachedConfig<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

class ConfigService {
  private static readonly PUBLIC_CONFIG_CACHE_KEY = 'public_config_cache';
  private static readonly FULL_CONFIG_CACHE_KEY = 'full_config_cache';
  private static readonly PUBLIC_CONFIG_TTL = 3600000; // 1 hour
  private static readonly FULL_CONFIG_TTL = 60000; // 1 minute

  private static publicConfigCache: PublicConfig | null = null;
  private static fullConfigCache: FullConfig | null = null;

  /**
   * Get public configuration (no authentication required)
   * Used during app bootstrap to get fresh API keys
   */
  static async getPublicConfig(): Promise<PublicConfig> {
    // Return in-memory cache if available
    if (this.publicConfigCache) {
      return this.publicConfigCache;
    }

    // Try to get from AsyncStorage cache
    try {
      const cached = await this.getFromAsyncStorage<PublicConfig>(
        this.PUBLIC_CONFIG_CACHE_KEY,
        this.PUBLIC_CONFIG_TTL
      );
      if (cached) {
        this.publicConfigCache = cached;
        return cached;
      }
    } catch (error) {
      console.error('Failed to read public config from cache:', error);
    }

    // Fetch fresh config from API
    try {
      const config = await this.fetchPublicConfigFromAPI();
      this.publicConfigCache = config;

      // Cache it for future use
      await this.saveToAsyncStorage(
        this.PUBLIC_CONFIG_CACHE_KEY,
        config,
        this.PUBLIC_CONFIG_TTL
      );

      return config;
    } catch (error) {
      console.error('Failed to fetch public config from API:', error);

      // If API fails, try to use stale cache
      try {
        const staleCache = await this.getFromAsyncStorage<PublicConfig>(
          this.PUBLIC_CONFIG_CACHE_KEY,
          Infinity // Accept stale cache
        );
        if (staleCache) {
          console.warn('Using stale public config due to API failure');
          this.publicConfigCache = staleCache;
          return staleCache;
        }
      } catch (cacheError) {
        console.error('Failed to read stale cache:', cacheError);
      }

      // No fallback - throw error to surface to user
      throw new Error('Configuration API is unreachable and no cached config available');
    }
  }

  /**
   * Get full configuration (requires authentication)
   * Contains features, limits, and role-based configuration
   */
  static async getFullConfig(_supabase: SupabaseClient): Promise<FullConfig | null> {
    // Return in-memory cache if available
    if (this.fullConfigCache) {
      return this.fullConfigCache;
    }

    // Try to get from AsyncStorage cache
    try {
      const cached = await this.getFromAsyncStorage<FullConfig>(
        this.FULL_CONFIG_CACHE_KEY,
        this.FULL_CONFIG_TTL
      );
      if (cached) {
        this.fullConfigCache = cached;
        return cached;
      }
    } catch (error) {
      console.error('Failed to read full config from cache:', error);
    }

    // Fetch fresh config from API
    try {
      const config = await this.fetchFullConfigFromAPI();
      if (config) {
        this.fullConfigCache = config;

        // Cache it for future use
        await this.saveToAsyncStorage(
          this.FULL_CONFIG_CACHE_KEY,
          config,
          this.FULL_CONFIG_TTL
        );

        return config;
      }
    } catch (error) {
      console.error('Failed to fetch full config from API:', error);

      // Return cached config even if stale
      try {
        const staleCache = await this.getFromAsyncStorage<FullConfig>(
          this.FULL_CONFIG_CACHE_KEY,
          Infinity
        );
        if (staleCache) {
          console.warn('Using stale full config due to API failure');
          this.fullConfigCache = staleCache;
          return staleCache;
        }
      } catch (cacheError) {
        console.error('Failed to read stale cache:', cacheError);
      }
    }

    return null;
  }

  /**
   * Clear all cached configurations
   */
  static async clearCache(): Promise<void> {
    this.publicConfigCache = null;
    this.fullConfigCache = null;

    try {
      await Promise.all([
        AsyncStorage.removeItem(this.PUBLIC_CONFIG_CACHE_KEY),
        AsyncStorage.removeItem(this.FULL_CONFIG_CACHE_KEY),
      ]);
    } catch (error) {
      console.error('Failed to clear config cache:', error);
    }
  }

  /**
   * Refresh public config (force fetch from API)
   */
  static async refreshPublicConfig(): Promise<PublicConfig> {
    console.log('[ConfigService] refreshPublicConfig - clearing all caches');
    this.publicConfigCache = null;
    try {
      await AsyncStorage.removeItem(this.PUBLIC_CONFIG_CACHE_KEY);
      console.log('[ConfigService] AsyncStorage cache cleared');
    } catch (error) {
      console.error('[ConfigService] Failed to clear public config cache:', error);
    }

    // Force fetch from API (bypass getPublicConfig's cache checks)
    console.log('[ConfigService] Forcing fresh fetch from API...');
    const config = await this.fetchPublicConfigFromAPI();
    this.publicConfigCache = config;

    // Cache it for future use
    await this.saveToAsyncStorage(
      this.PUBLIC_CONFIG_CACHE_KEY,
      config,
      this.PUBLIC_CONFIG_TTL
    );

    console.log('[ConfigService] Fresh config loaded and cached');
    return config;
  }

  /**
   * Refresh full config (force fetch from API)
   */
  static async refreshFullConfig(supabase: SupabaseClient): Promise<FullConfig | null> {
    this.fullConfigCache = null;
    try {
      await AsyncStorage.removeItem(this.FULL_CONFIG_CACHE_KEY);
    } catch (error) {
      console.error('Failed to clear full config cache:', error);
    }
    return this.getFullConfig(supabase);
  }

  // ==================== Private Methods ====================

  /**
   * Fetch public config from API endpoint
   */
  private static async fetchPublicConfigFromAPI(): Promise<PublicConfig> {
    const url = `${CONFIG_API_BASE_URL}/functions/v1/get-public-config`;

    console.log('[ConfigService] Fetching public config from:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });

    console.log('[ConfigService] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ConfigService] Fetch failed:', errorText);
      throw new Error(
        `Failed to fetch public config: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    console.log('[ConfigService] Response received:', {
      success: data.success,
      hasData: !!data.data,
      anonKeyPrefix: data.data?.anonKey?.substring(0, 30) + '...',
      supabaseUrl: data.data?.supabaseUrl,
    });

    if (!data.success || !data.data) {
      throw new Error(
        data.error || 'Invalid response from public config endpoint'
      );
    }

    return data.data as PublicConfig;
  }

  /**
   * Fetch full config from API endpoint
   * Tries multiple methods: direct fetch with token, then uses endpoint directly
   */
  private static async fetchFullConfigFromAPI(): Promise<FullConfig | null> {
    try {
      // Method 1: Try direct fetch with stored JWT token
      const authToken = await this.getStoredJWT();

      if (authToken) {
        console.log('[ConfigService] Attempting fetch with stored JWT token');
        console.log('[ConfigService] Fetching from:', `${CONFIG_API_BASE_URL}/functions/v1/get-config`);
        console.log('[ConfigService] Token length:', authToken.length, 'chars');

        try {
          const response = await fetch(`${CONFIG_API_BASE_URL}/functions/v1/get-config`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            }
          });

          console.log('[ConfigService] Response status:', response.status);

          if (response.ok) {
            const json = await response.json();
            if (json.success && json.data) {
              console.log('[ConfigService] Full config fetched successfully');
              return json.data as FullConfig;
            }
          } else {
            const responseText = await response.text();
            console.warn(`[ConfigService] Fetch failed with status ${response.status}:`, responseText);
            // Continue to try alternative method
          }
        } catch (fetchError) {
          console.warn('[ConfigService] Direct fetch failed, trying alternative method:', fetchError);
        }
      } else {
        console.warn('[ConfigService] No JWT token available for full config fetch');
      }

      // Method 2: Try using Supabase client if available
      console.log('[ConfigService] Full config fetch failed - app will continue without it');
      return null;
    } catch (error) {
      console.error('[ConfigService] Edge function invocation failed:', error);
      return null;
    }
  }

  /**
   * Get stored JWT token from AsyncStorage
   * Uses the same token storage pattern as supabaseConfig.ts
   */
  private static async getStoredJWT(): Promise<string | null> {
    const { token, expiresAt } = await getAuthToken();
    return token && (!expiresAt || expiresAt > Date.now()) ? token : null;
  }

  /**
   * Get config from AsyncStorage with TTL validation
   */
  private static async getFromAsyncStorage<T>(
    key: string,
    ttlMs: number
  ): Promise<T | null> {
    try {
      const cached = await AsyncStorage.getItem(key);

      if (!cached) {
        return null;
      }

      const parsed: CachedConfig<T> = JSON.parse(cached);
      const age = Date.now() - parsed.timestamp;

      if (age > ttlMs) {
        // Cache is expired
        return null;
      }

      return parsed.data;
    } catch (error) {
      console.error(`Failed to parse ${key} from AsyncStorage:`, error);
      return null;
    }
  }

  /**
   * Save config to AsyncStorage with timestamp
   */
  private static async saveToAsyncStorage<T>(
    key: string,
    data: T,
    ttlMs: number
  ): Promise<void> {
    try {
      const cacheData: CachedConfig<T> = {
        data,
        timestamp: Date.now(),
        ttlMs,
      };
      await AsyncStorage.setItem(key, JSON.stringify(cacheData));
    } catch (error) {
      console.error(`Failed to save ${key} to AsyncStorage:`, error);
    }
  }

}

export default ConfigService;
