/**
 * Feature Flag Hook
 *
 * I14 Fix: Provides access to remote feature flags from config.
 * Enables toggling features without app updates.
 *
 * @module hooks/useFeatureFlag
 */

import { useAppSelector } from '@/store/hooks';

/**
 * Known feature flag names for type safety.
 * Add new flags here as they're added to the backend.
 */
export type FeatureFlagName =
  | 'otp_authentication'
  | 'file_uploads'
  | 'realtime_updates'
  | 'advanced_search'
  | 'export_reports'
  | 'sensor_monitoring'
  | 'customer_portal'
  | 'inventory_management'
  | 'dispatch_management'
  | 'print_feature'
  | 'analytics_dashboard'
  | 'new_invoice_flow'
  | 'experimental_reports'
  | string; // Allow unknown flags for flexibility

/**
 * Hook to check if a feature flag is enabled
 *
 * @param flagName - The name of the feature flag to check
 * @param defaultValue - Value to return if flag is not found (default: false)
 * @returns Whether the feature is enabled
 *
 * @example
 * ```tsx
 * function InvoiceScreen() {
 *   const useNewFlow = useFeatureFlag('new_invoice_flow', false);
 *
 *   if (useNewFlow) {
 *     return <NewInvoiceFlow />;
 *   }
 *   return <LegacyInvoiceFlow />;
 * }
 * ```
 */
export function useFeatureFlag(
  flagName: FeatureFlagName,
  defaultValue: boolean = false
): boolean {
  const publicConfig = useAppSelector((state) => state.config.publicConfig);

  // Return default if config not loaded or featureFlags not present
  if (!publicConfig?.featureFlags) {
    return defaultValue;
  }

  // Return flag value or default if flag doesn't exist
  return publicConfig.featureFlags[flagName] ?? defaultValue;
}

/**
 * Hook to get all feature flags
 *
 * @returns Object containing all feature flags, or empty object if not loaded
 *
 * @example
 * ```tsx
 * function DebugScreen() {
 *   const flags = useFeatureFlags();
 *   return (
 *     <View>
 *       {Object.entries(flags).map(([name, enabled]) => (
 *         <Text key={name}>{name}: {enabled ? 'ON' : 'OFF'}</Text>
 *       ))}
 *     </View>
 *   );
 * }
 * ```
 */
export function useFeatureFlags(): Record<string, boolean> {
  const publicConfig = useAppSelector((state) => state.config.publicConfig);
  return publicConfig?.featureFlags ?? {};
}

/**
 * Utility function to check a flag outside of React components
 * Requires passing the config state directly
 *
 * @param featureFlags - The featureFlags object from config
 * @param flagName - The name of the feature flag to check
 * @param defaultValue - Value to return if flag is not found
 * @returns Whether the feature is enabled
 */
export function isFeatureEnabled(
  featureFlags: Record<string, boolean> | undefined,
  flagName: FeatureFlagName,
  defaultValue: boolean = false
): boolean {
  if (!featureFlags) {
    return defaultValue;
  }
  return featureFlags[flagName] ?? defaultValue;
}

export default useFeatureFlag;
