/**
 * Order Queue Tab (Supervisor Only)
 *
 * Displays all customer orders with items for supervisor/staff users.
 * Allows viewing, editing, and generating dispatches from orders.
 * Non-staff users are redirected to the home screen.
 */

import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { initializeAuth } from '@/store/slices/authSlice';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import theme from '@/theme';
import { useTheme } from '@/hooks/useTheme';
import { SupervisorOrderQueueList } from '@/components/lists';

export default function OrderQueueTab() {
  const dispatch = useAppDispatch();
  const { isLoading, userProfile } = useAppSelector((state) => state.auth);
  const { colors: themeColors, isDarkMode } = useTheme();
  const { isStaff } = useRoleBasedAccess();
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

  // Redirect non-staff users to home
  useEffect(() => {
    if (hasInitialized && !isLoading && !isStaff) {
      if (__DEV__) console.log('[OrderQueueTab] Non-staff user, redirecting to home');
      router.replace('/');
    }
  }, [hasInitialized, isLoading, isStaff]);

  // Show full loading screen only on first load without cached data
  if (!hasInitialized && isLoading && !userProfile) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          {
            backgroundColor: isDarkMode ? themeColors.gray[900] : 'transparent',
          },
        ]}
      >
        <ActivityIndicator size="large" color={themeColors.primary} />
        <Text style={[styles.loadingText, { color: themeColors.gray[isDarkMode ? 400 : 600] }]}>
          Loading...
        </Text>
      </View>
    );
  }

  // Don't render for non-staff users
  if (!isStaff) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          {
            backgroundColor: isDarkMode ? themeColors.gray[900] : 'transparent',
          },
        ]}
      >
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDarkMode ? themeColors.gray[900] : themeColors.gray[50] },
      ]}
    >
      <SupervisorOrderQueueList />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.base,
  },
});
