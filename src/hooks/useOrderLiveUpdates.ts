import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAppSelector } from '@/store/hooks';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { subscribeToOrderChanges } from '@/services/order-live-updates';

export function useOrderLiveUpdates(refresh: () => void | Promise<void>, enabled = true) {
  const profile = useAppSelector(state => state.auth.userProfile);
  const { isConnected } = useNetworkStatus();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => listener.remove();
  }, []);

  useEffect(() => {
    if (!enabled || !profile || !active || !isConnected) return;
    return subscribeToOrderChanges(() => refreshRef.current());
  }, [enabled, profile, active, isConnected]);
}
