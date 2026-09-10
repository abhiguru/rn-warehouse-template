/**
 * OTA Updates Hook
 *
 * Wraps expo-updates useUpdates hook with additional convenience methods.
 * Handles checking for and applying over-the-air updates.
 *
 * Usage:
 * - Automatically checks for updates on app launch
 * - Shows prompt when update is available
 * - Downloads and applies update with user confirmation
 */

import { useCallback, useState } from 'react';
import * as Updates from 'expo-updates';

export interface UseOTAUpdatesReturn {
  /** Whether an update is available */
  isUpdateAvailable: boolean;
  /** Whether an update has been downloaded and is ready to apply */
  isUpdatePending: boolean;
  /** Whether we're currently checking for updates */
  isChecking: boolean;
  /** Whether an update is currently downloading */
  isDownloading: boolean;
  /** Error from check or download */
  error: Error | undefined;
  /** Download progress (0-1) */
  downloadProgress: number;
  /** Whether updates are enabled (false in dev/Expo Go) */
  isEnabled: boolean;
  /** Manually check for updates */
  checkForUpdate: () => Promise<void>;
  /** Download the available update */
  downloadUpdate: () => Promise<void>;
  /** Apply the downloaded update (restarts app) */
  applyUpdate: () => Promise<void>;
  /** Dismiss the update prompt */
  dismissUpdate: () => void;
  /** Whether the prompt has been dismissed */
  isDismissed: boolean;
}

/**
 * Hook for managing OTA updates
 *
 * Uses expo-updates useUpdates hook internally with additional convenience methods.
 */
export function useOTAUpdates(): UseOTAUpdatesReturn {
  const [isDismissed, setIsDismissed] = useState(false);

  // Use expo-updates built-in hook
  const {
    isUpdateAvailable,
    isUpdatePending,
    isChecking,
    isDownloading,
    checkError,
    downloadError,
    downloadProgress,
  } = Updates.useUpdates();

  const checkForUpdate = useCallback(async () => {
    // Skip in development or if updates not enabled
    if (__DEV__ || !Updates.isEnabled) {
      if (__DEV__) {
        console.log('[OTAUpdates] Skipping update check in development mode');
      }
      return;
    }

    try {
      await Updates.checkForUpdateAsync();
      // Reset dismissed state when checking for new updates
      setIsDismissed(false);
    } catch (error) {
      if (__DEV__) {
        console.error('[OTAUpdates] Check failed:', error);
      }
    }
  }, []);

  const downloadUpdate = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled) {
      return;
    }

    try {
      await Updates.fetchUpdateAsync();
    } catch (error) {
      if (__DEV__) {
        console.error('[OTAUpdates] Download failed:', error);
      }
    }
  }, []);

  const applyUpdate = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled) {
      return;
    }

    try {
      // This will restart the app with the new update
      await Updates.reloadAsync();
    } catch (error) {
      if (__DEV__) {
        console.error('[OTAUpdates] Apply failed:', error);
      }
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setIsDismissed(true);
  }, []);

  return {
    isUpdateAvailable: isUpdateAvailable && !isDismissed,
    isUpdatePending: isUpdatePending && !isDismissed,
    isChecking,
    isDownloading,
    error: checkError || downloadError,
    downloadProgress: downloadProgress || 0,
    isEnabled: Updates.isEnabled,
    checkForUpdate,
    downloadUpdate,
    applyUpdate,
    dismissUpdate,
    isDismissed,
  };
}

export default useOTAUpdates;
