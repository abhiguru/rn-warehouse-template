/**
 * Custom Hook: useConfig
 * Provides easy access to configuration from Redux state
 */

import { useAppSelector } from '@/store/hooks';
import { FullConfig, PublicConfig } from '@/services/configService';

/**
 * Hook to access all configuration data
 * Returns public config, full config, and loading states
 */
export const useConfig = () => {
  const config = useAppSelector((state) => state.config);

  return {
    publicConfig: config.publicConfig,
    fullConfig: config.fullConfig,
    isLoadingPublic: config.isLoadingPublic,
    isLoadingFull: config.isLoadingFull,
    publicError: config.publicError,
    fullError: config.fullError,
    lastFetchedPublic: config.lastFetchedPublic,
    lastFetchedFull: config.lastFetchedFull,
  };
};

/**
 * Hook to check if a feature is enabled
 * @param featureName - Name of the feature flag to check
 * @returns true if feature is enabled, false otherwise
 */
export const useFeatureFlag = (featureName: string): boolean => {
  const { fullConfig } = useConfig();

  if (!fullConfig) {
    return false;
  }

  return fullConfig.features.enabledFeatures.includes(featureName);
};

/**
 * Hook to get environment information
 * @returns Environment name, version, build date, and region
 */
export const useEnvironment = () => {
  const { publicConfig, fullConfig } = useConfig();

  return fullConfig?.environment || publicConfig
    ? {
        name: fullConfig?.environment.name || publicConfig?.environment || 'development',
        version: fullConfig?.environment.version || publicConfig?.version || '1.0.0',
        buildDate: fullConfig?.environment.buildDate,
        region: fullConfig?.environment.region,
      }
    : null;
};

/**
 * Hook to get rate limits and session timeouts
 * @returns Limits configuration or null if not available
 */
export const useLimits = () => {
  const { fullConfig } = useConfig();

  return fullConfig?.limits || null;
};

/**
 * Hook to get support contact information
 * @returns Support contact details or null if not available
 */
export const useSupport = () => {
  const { fullConfig } = useConfig();

  return fullConfig?.support || null;
};

/**
 * Hook to check if app is in maintenance mode
 * @returns true if in maintenance mode, false otherwise
 */
export const useMaintenanceMode = (): boolean => {
  const { publicConfig, fullConfig } = useConfig();

  return (
    fullConfig?.features.maintenanceMode ||
    publicConfig?.maintenanceMode ||
    false
  );
};

/**
 * Hook to check if app is in test mode (SMS bypass)
 * @returns true if in test mode, false otherwise
 */
export const useTestMode = (): boolean => {
  const { fullConfig } = useConfig();

  return fullConfig?.features.testMode || false;
};

/**
 * Hook to get file upload configuration
 * @returns Maximum file size and allowed MIME types
 */
export const useFileUploadConfig = () => {
  const { fullConfig } = useConfig();

  if (!fullConfig) {
    return null;
  }

  return {
    maxSize: fullConfig.features.maxFileUploadSize,
    allowedTypes: fullConfig.features.allowedFileTypes,
  };
};

/**
 * Hook to check if OTP authentication is enabled
 * @returns true if OTP is enabled, false otherwise
 */
export const useOTPEnabled = (): boolean => {
  const { fullConfig } = useConfig();

  return fullConfig?.features.otpEnabled ?? true;
};

/**
 * Hook to get SMS provider information
 * @returns SMS provider name (e.g., 'twilio')
 */
export const useSMSProvider = (): string | null => {
  const { fullConfig } = useConfig();

  return fullConfig?.features.smsProvider || null;
};

/**
 * Hook to check if config is ready for use
 * Public config should always be available, but full config requires auth
 * @returns true if minimum required config is loaded
 */
export const useIsConfigReady = (): boolean => {
  const { publicConfig, isLoadingPublic } = useConfig();

  return publicConfig !== null && !isLoadingPublic;
};

/**
 * Hook to check if full config is available (user is authenticated)
 * @returns true if full config is loaded
 */
export const useIsFullConfigAvailable = (): boolean => {
  const { fullConfig } = useConfig();

  return fullConfig !== null;
};

/**
 * Hook to get Supabase configuration
 * @returns Supabase URL and anon key
 */
export const useSupabaseConfig = () => {
  const { publicConfig, fullConfig } = useConfig();

  return {
    url: fullConfig?.apiKeys.supabase.url || publicConfig?.supabaseUrl,
    anonKey: fullConfig?.apiKeys.supabase.anonKey || publicConfig?.anonKey,
  };
};

/**
 * Hook to get external API keys (admin only)
 * @returns External API keys object or null
 */
export const useExternalApiKeys = () => {
  const { fullConfig } = useConfig();

  return fullConfig?.apiKeys.external || null;
};

/**
 * Hook to get URLs for various services
 * @returns URLs for API, storage, realtime, and auth services
 */
export const useServiceUrls = () => {
  const { fullConfig, publicConfig } = useConfig();

  return fullConfig?.urls
    ? {
        api: fullConfig.urls.api,
        storage: fullConfig.urls.storage,
        realtime: fullConfig.urls.realtime,
        auth: fullConfig.urls.auth,
      }
    : publicConfig?.urls || null;
};
