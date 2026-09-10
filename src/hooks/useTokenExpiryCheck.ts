/**
 * Token Expiry Check Hook
 *
 * Periodically checks if the authentication token is about to expire or has expired.
 * Dispatches actions to update the auth state with expiry warnings.
 */

import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { checkTokenExpiry } from '@/store/slices/authSlice';

/**
 * Hook to periodically check token expiry status
 * @param checkInterval - Interval in milliseconds (default: 60 seconds)
 */
export const useTokenExpiryCheck = (checkInterval: number = 60000) => {
  const dispatch = useAppDispatch();
  const { userProfile } = useAppSelector((state) => state.auth);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only run token expiry checks if user is authenticated
    if (!userProfile) {
      return;
    }

    // Initial check
    dispatch(checkTokenExpiry());

    // Set up periodic check
    intervalRef.current = setInterval(() => {
      dispatch(checkTokenExpiry());
    }, checkInterval);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [dispatch, userProfile, checkInterval]);
};
