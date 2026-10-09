/**
 * Order Queue Tab (admin, supervisor and staff)
 *
 * Displays all customer orders with items for supervisor/staff users.
 * Allows viewing, editing, and generating dispatches from orders.
 * Non-staff users are redirected to the home screen.
 */

import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { initializeAuth } from '@/store/slices/authSlice';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import { SupervisorOrderQueueList } from '@/components/lists';

export default function OrderQueueTab() {
  const dispatch = useAppDispatch();
  const { isLoading, userProfile } = useAppSelector((state) => state.auth);
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const { canManageOrders } = useRoleBasedAccess();
  const [hasInitialized, setHasInitialized] = React.useState(false);

  useEffect(() => {
    dispatch(initializeAuth())
      .unwrap()
      .catch((error: unknown) => {
        console.warn('[OrderQueueTab] Auth initialization failed:', error);
      })
      .finally(() => {
        setHasInitialized(true);
      });
  }, [dispatch]);

  // Redirect customer accounts to home
  useEffect(() => {
    if (hasInitialized && !isLoading && !canManageOrders) {
      if (__DEV__) console.log('[OrderQueueTab] Customer account, redirecting to home');
      router.replace('/');
    }
  }, [hasInitialized, isLoading, canManageOrders]);

  // Show full loading screen only on first load without cached data
  if (!hasInitialized && isLoading && !userProfile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={t.brand.tint} accessibilityLabel="Loading order queue" />
        <Text style={styles.loadingText}>Loading order queue…</Text>
      </View>
    );
  }

  // Don't render for customer accounts
  if (!canManageOrders) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={t.brand.tint} accessibilityLabel="Loading" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SupervisorOrderQueueList />
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  centered: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.lg,
  },
});
