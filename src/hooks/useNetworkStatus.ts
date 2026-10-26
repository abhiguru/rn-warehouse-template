/**
 * Network Status Hook
 *
 * Monitors network connectivity and provides offline detection.
 * Uses @react-native-community/netinfo for reliable network state.
 *
 * Issue: I1 - No Network State Monitoring
 */

import { useState, useEffect, useSyncExternalStore } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { t } from '@/i18n';
import { AppError } from '@/utils/appError';
import { getConnectionPath } from '@/config/lanTransport';
import { getNetInfoGeneration, subscribeNetInfoGeneration } from '@/config/netInfoGeneration';
import { useLanStatus } from './useLanStatus';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string | null;
  isLoading: boolean;
  /**
   * NetInfo has not classified the connection (its `isConnected` is null). `isConnected` is
   * false then; a caller that must not act on "no network" without knowing checks this too.
   */
  isConnectionUnknown?: boolean;
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

  // NetInfo.configure (src/config/netReachability.ts) stops the listeners added before it: listen again after one.
  const netInfoGeneration = useSyncExternalStore(subscribeNetInfoGeneration, getNetInfoGeneration, getNetInfoGeneration);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;

    const handleNetworkChange = (state: NetInfoState) => {
      if (!active) return;
      setStatus({
        isConnected: state.isConnected ?? false,
        isConnectionUnknown: state.isConnected === null,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
        isLoading: false,
      });
    };

    // Subscribe first: native events may arrive synchronously or while the
    // initial fetch is pending. A startup snapshot must not replace newer data.
    const unsubscribe = NetInfo.addEventListener(state => {
      receivedEvent = true;
      handleNetworkChange(state);
    });
    void NetInfo.fetch().then(state => {
      if (!receivedEvent) handleNetworkChange(state);
    }).catch(() => {
      // Failure to observe connectivity does not prove the warehouse is down.
      // Keep the unknown/optimistic initial status and wait for a native event.
      if (active && !receivedEvent) setStatus(current => ({ ...current, isLoading: false }));
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [netInfoGeneration]);

  return status;
}

/**
 * Hook to check if device is offline
 * Simpler version that just returns boolean
 *
 * "Internet not reachable" is NetInfo's probe of the facility's own `hello`
 * (src/config/netReachability.ts). When that probe fails but the app is using the
 * warehouse network path to the same server (src/config/lanTransport.ts), the server is
 * reachable and the phone is not offline: the banner stays away and saves are not refused.
 */
export function useIsOffline(): boolean {
  const { isConnected, isInternetReachable, isLoading } = useNetworkStatus();
  const onWarehouseNetwork = useLanStatus().path === 'lan';

  // While loading, assume online
  if (isLoading) return false;

  // If explicitly not connected, offline
  if (isConnected === false) return true;

  // If connected but the facility's server is not reachable over the internet, offline unless
  // the warehouse network reaches it.
  if (isConnected && isInternetReachable === false) return !onWarehouseNetwork;

  return false;
}

/**
 * Utility to check network before making API calls
 * Returns a promise that rejects if offline
 */
export async function ensureNetworkConnection(): Promise<void> {
  const state = await NetInfo.fetch();

  if (!state.isConnected) {
    throw new AppError('NETWORK', t('errors.network.noInternet'));
  }

  if (state.isConnected && state.isInternetReachable === false && getConnectionPath() !== 'lan') {
    throw new AppError('NETWORK', t('errors.network.notReachable'));
  }
}

export default useNetworkStatus;
