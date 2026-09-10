/**
 * Orders Tab (Home Screen)
 *
 * Displays the list of customer orders using OrderFlashList.
 * Auth is handled by the parent (tabs)/_layout.tsx.
 */

import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { initializeAuth } from '@/store/slices/authSlice';
import theme from '@/theme';
import { useTheme } from '@/hooks/useTheme';
import { OrderFlashList } from '@/components/lists';

export default function OrdersTab() {
  const dispatch = useAppDispatch();
  const { isLoading, userProfile } = useAppSelector((state) => state.auth);
  const { colors: themeColors, isDarkMode } = useTheme();
  const [hasInitialized, setHasInitialized] = React.useState(false);

  useEffect(() => {
    dispatch(initializeAuth())
      .unwrap()
      .catch((error: unknown) => {
        console.warn('[OrdersTab] Auth initialization failed:', error);
      })
      .finally(() => {
        setHasInitialized(true);
      });
  }, [dispatch]);

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

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDarkMode ? themeColors.gray[900] : themeColors.gray[50] },
      ]}
    >
      <OrderFlashList />
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
