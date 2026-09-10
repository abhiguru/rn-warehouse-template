/**
 * Network Status Hook
 *
 * Monitors network connectivity and provides offline detection.
 * Uses @react-native-community/netinfo for reliable network state.
 *
 * Issue: I1 - No Network State Monitoring
 */

import { useState, useEffect, useCallback } from 'react';
import NetInfo, { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string | null;
  isLoading: boolean;
}

/**
 * Hook to monitor network connectivity status
 *
 * @returns NetworkStatus object with connection state
 *
 * @example
 * const { isConnected, isInternetReachable } = useNetworkStatus();
 * if (!isConnected) {
 *   return <OfflineBanner />;
 * }
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true, // Assume connected initially
    isInternetReachable: null,
    type: null,
    isLoading: true,
  });

  useEffect(() => {
    let unsubscribe: NetInfoSubscription | null = null;

    const handleNetworkChange = (state: NetInfoState) => {
      setStatus({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
        isLoading: false,
      });
    };

    // Get initial state
    NetInfo.fetch().then(handleNetworkChange);

    // Subscribe to changes
    unsubscribe = NetInfo.addEventListener(handleNetworkChange);

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  return status;
}

/**
 * Hook to check if device is offline
 * Simpler version that just returns boolean
 */
export function useIsOffline(): boolean {
  const { isConnected, isInternetReachable, isLoading } = useNetworkStatus();

  // While loading, assume online
  if (isLoading) return false;

  // If explicitly not connected, offline
  if (isConnected === false) return true;

  // If connected but internet not reachable, offline
  if (isConnected && isInternetReachable === false) return true;

  return false;
}

/**
 * Utility to check network before making API calls
 * Returns a promise that rejects if offline
 */
export async function ensureNetworkConnection(): Promise<void> {
  const state = await NetInfo.fetch();

  if (!state.isConnected) {
    throw new Error('No internet connection. Please check your network and try again.');
  }

  if (state.isConnected && state.isInternetReachable === false) {
    throw new Error('Internet is not reachable. Please check your network and try again.');
  }
}

export default useNetworkStatus;
