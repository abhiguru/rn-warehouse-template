/**
 * Force Update Hook
 *
 * Checks if the app version meets the minimum required version from config.
 * If not, the app should force the user to update.
 *
 * Version comparison uses semantic versioning (major.minor.patch).
 *
 * @module hooks/useForceUpdate
 */

import { useMemo } from 'react';
import { Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import { useAppSelector } from '@/store/hooks';

/**
 * Default store URLs
 * Replace these with actual app store URLs when published
 */
const DEFAULT_STORE_URLS = {
  ios: 'https://apps.apple.com/app/id0000000000', // TODO: Update with actual App Store ID
  android: `https://play.google.com/store/apps/details?id=${process.env.EXPO_PUBLIC_ANDROID_PACKAGE || 'com.example.warehousemanager'}`,
};

export interface ForceUpdateStatus {
  /** Whether an update is required */
  updateRequired: boolean;
  /** Current app version */
  currentVersion: string;
  /** Minimum required version (from config) */
  minimumVersion: string | null;
  /** Whether the config has been loaded */
  isConfigLoaded: boolean;
  /** URL to the appropriate app store */
  storeUrl: string;
  /** Function to open the app store */
  openStore: () => Promise<void>;
}

/**
 * Compare two semantic version strings
 *
 * @param current - Current version (e.g., "1.0.0")
 * @param minimum - Minimum required version (e.g., "1.1.0")
 * @returns true if current is less than minimum (update required)
 */
export function isVersionLower(current: string, minimum: string): boolean {
  const parseVersion = (v: string): number[] => {
    return v
      .split('.')
      .map((part) => {
        const num = parseInt(part, 10);
        return isNaN(num) ? 0 : num;
      })
      .slice(0, 3); // Only consider major.minor.patch
  };

  const currentParts = parseVersion(current);
  const minimumParts = parseVersion(minimum);

  // Pad arrays to equal length
  while (currentParts.length < 3) currentParts.push(0);
  while (minimumParts.length < 3) minimumParts.push(0);

  // Compare each part
  for (let i = 0; i < 3; i++) {
    if (currentParts[i] < minimumParts[i]) {
      return true; // Current is lower, update required
    }
    if (currentParts[i] > minimumParts[i]) {
      return false; // Current is higher, no update needed
    }
  }

  return false; // Versions are equal, no update needed
}

/**
 * Hook to check if app needs a forced update
 *
 * @returns Force update status and helper functions
 *
 * @example
 * ```tsx
 * const { updateRequired, openStore, currentVersion, minimumVersion } = useForceUpdate();
 *
 * if (updateRequired) {
 *   return <ForceUpdateModal onUpdate={openStore} />;
 * }
 * ```
 */
export function useForceUpdate(): ForceUpdateStatus {
  const { publicConfig } = useAppSelector((state) => state.config);

  // Get current app version from Expo constants
  const currentVersion = Constants.expoConfig?.version ?? '1.0.0';

  // Get minimum version from config (if available)
  const minimumVersion = publicConfig?.minimumVersion ?? null;

  // Get store URLs from config or use defaults
  const storeUrls = publicConfig?.storeUrls ?? DEFAULT_STORE_URLS;

  // Determine the appropriate store URL based on platform
  const storeUrl = useMemo(() => {
    if (Platform.OS === 'ios') {
      return storeUrls.ios ?? DEFAULT_STORE_URLS.ios;
    }
    return storeUrls.android ?? DEFAULT_STORE_URLS.android;
  }, [storeUrls]);

  // Check if update is required
  const updateRequired = useMemo(() => {
    if (!minimumVersion) {
      return false; // No minimum version set, no update required
    }

    return isVersionLower(currentVersion, minimumVersion);
  }, [currentVersion, minimumVersion]);

  // Function to open the app store
  const openStore = async (): Promise<void> => {
    try {
      const canOpen = await Linking.canOpenURL(storeUrl);
      if (canOpen) {
        await Linking.openURL(storeUrl);
      } else {
        // Fallback to web store URL if deep link doesn't work
        const webUrl =
          Platform.OS === 'ios'
            ? storeUrl.replace('itms-apps://', 'https://apps.apple.com/')
            : storeUrl;
        await Linking.openURL(webUrl);
      }
    } catch (error) {
      if (__DEV__) {
        console.error('[useForceUpdate] Failed to open store:', error);
      }
    }
  };

  return {
    updateRequired,
    currentVersion,
    minimumVersion,
    isConfigLoaded: publicConfig !== null,
    storeUrl,
    openStore,
  };
}

export default useForceUpdate;
