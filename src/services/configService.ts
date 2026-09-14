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
import {
  httpOrigin,
  validatePublicConfig,
  validateFullConfig,
} from '@/config/bootstrapValidation';
import {
  getSessionGeneration,
  onSessionChange,
} from '@/config/sessionLifecycle';

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
  scope: string;
}

class ConfigService {
  private static readonly PUBLIC_TTL = 3600000;
  private static readonly FULL_TTL = 60000;
  private static publicCache: CachedConfig<PublicConfig> | null = null;
  private static fullCache: CachedConfig<FullConfig> | null = null;
  private static fullKey: string | null = null;
  private static cacheGeneration = 0;
  private static writes: Promise<unknown> = Promise.resolve();

  private static write(operation: () => Promise<unknown>): Promise<unknown> {
    const result = this.writes.then(operation, operation);
    this.writes = result.catch(() => {});
    return result.catch(() => {}); // Cache persistence is optional.
  }

  private static fresh<T>(
    entry: CachedConfig<T> | null,
    scope: string,
    ttl: number
  ): entry is CachedConfig<T> {
    const age = entry ? Date.now() - entry.timestamp : NaN;
    return (
      !!entry &&
      entry.scope === scope &&
      Number.isFinite(age) &&
      age >= 0 &&
      age < ttl
    );
  }

  private static async read<T>(key: string): Promise<CachedConfig<T> | null> {
    try {
      return JSON.parse((await AsyncStorage.getItem(key)) || 'null');
    } catch {
      return null;
    }
  }

  private static async fetchConfig(
    path: string,
    token?: string
  ): Promise<unknown> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Race the entire fetch + body parse, including clients that ignore abort.
      return await Promise.race([
        (async () => {
          const response = await fetch(
            `${httpOrigin(CONFIG_API_BASE_URL)}/functions/v1/${path}`,
            {
              method: 'GET',
              signal: controller.signal,
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            }
          );
          if (!response.ok)
            throw new Error(
              `Configuration request failed (HTTP ${response.status}).`
            );
          return response.json();
        })(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error('Configuration request timed out.'));
          }, 15000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  static async getPublicConfig(): Promise<PublicConfig> {
    const origin = httpOrigin(CONFIG_API_BASE_URL);
    const key = `public_config_v2:${origin}`;
    const cached = this.publicCache || (await this.read<PublicConfig>(key));
    if (this.fresh(cached, origin, this.PUBLIC_TTL)) {
      try {
        const data = validatePublicConfig(
          { success: true, data: cached.data },
          origin
        );
        this.publicCache = cached;
        return data;
      } catch {
        /* Reject corrupt or expired public-key caches. */
      }
    }
    const data = validatePublicConfig(
      await this.fetchConfig('get-public-config'),
      origin
    );
    const entry = { data, timestamp: Date.now(), scope: origin };
    this.publicCache = entry;
    await this.write(() => AsyncStorage.setItem(key, JSON.stringify(entry)));
    return data;
  }

  static async getFullConfig(
    _supabase: SupabaseClient
  ): Promise<FullConfig | null> {
    const generation = getSessionGeneration();
    const cacheGeneration = this.cacheGeneration;
    const current = () =>
      generation === getSessionGeneration() &&
      cacheGeneration === this.cacheGeneration;
    let requestKey: string | null = null;
    try {
      const origin = httpOrigin(CONFIG_API_BASE_URL);
      const { token, expiresAt } = await getAuthToken();
      if (!current()) return null;
      if (!token || !expiresAt || expiresAt <= Date.now()) {
        await this.clearAuthenticatedCache();
        return null;
      }
      const claims = JSON.parse(
        atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
      );
      if (
        typeof claims.sub !== 'string' ||
        typeof claims.session_id !== 'string'
      ) {
        await this.clearAuthenticatedCache();
        return null;
      }
      // Never persist the bearer token as a cache key or value.
      const scope = JSON.stringify([origin, claims.sub, claims.session_id]);
      const key = `full_config_v2:${scope}`;
      requestKey = key;
      if (this.fullKey && this.fullKey !== key) {
        const previous = this.fullKey;
        this.fullCache = null;
        await this.write(() => AsyncStorage.removeItem(previous));
      }
      if (!current()) return null;
      this.fullKey = key;
      const cached = this.fullCache || (await this.read<FullConfig>(key));
      if (!current()) return null;
      if (this.fresh(cached, scope, this.FULL_TTL)) {
        try {
          const data = validateFullConfig(
            { success: true, data: cached.data },
            origin
          );
          this.fullCache = cached;
          return data;
        } catch {
          /* Revalidate corrupt cache through the server. */
        }
      }
      const data = validateFullConfig(
        await this.fetchConfig('get-config', token),
        origin
      );
      if (!current() || this.fullKey !== key) return null;
      const entry = { data, timestamp: Date.now(), scope };
      this.fullCache = entry;
      await this.write(async () => {
        if (current() && this.fullKey === key)
          await AsyncStorage.setItem(key, JSON.stringify(entry));
      });
      return current() && this.fullKey === key ? data : null;
    } catch {
      // No stale fallback after auth rejection, timeout, or invalid configuration.
      if (current() && (requestKey === null || this.fullKey === requestKey))
        await this.clearAuthenticatedCache();
      return null;
    }
  }

  static async clearAuthenticatedCache(): Promise<void> {
    this.cacheGeneration += 1;
    this.fullCache = null;
    this.fullKey = null;
    await this.write(async () => {
      const keys = await AsyncStorage.getAllKeys();
      await AsyncStorage.multiRemove(
        keys.filter(
          key =>
            key === 'full_config_cache' || key.startsWith('full_config_v2:')
        )
      );
    });
  }

  static async clearCache(): Promise<void> {
    this.publicCache = null;
    await this.clearAuthenticatedCache();
    await this.write(async () => {
      const keys = await AsyncStorage.getAllKeys();
      await AsyncStorage.multiRemove(
        keys.filter(
          key =>
            key === 'public_config_cache' || key.startsWith('public_config_v2:')
        )
      );
    });
  }

  static async refreshPublicConfig(): Promise<PublicConfig> {
    this.publicCache = null;
    await this.write(() =>
      AsyncStorage.removeItem(
        `public_config_v2:${httpOrigin(CONFIG_API_BASE_URL)}`
      )
    );
    return this.getPublicConfig();
  }

  static async refreshFullConfig(
    supabase: SupabaseClient
  ): Promise<FullConfig | null> {
    await this.clearAuthenticatedCache();
    return this.getFullConfig(supabase);
  }
}

onSessionChange(() => {
  void ConfigService.clearAuthenticatedCache();
});
export default ConfigService;
