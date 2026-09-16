/**
 * Tabs Layout - Main tab navigation using Expo Router
 *
 * Provides the bottom tab navigation for the app's main screens:
 * Orders, GRN, Dispatch, Invoices, and Reports.
 *
 * Uses a custom FioriTabBar component to maintain SAP Fiori design compliance.
 */

import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { ActivityIndicator, ImageBackground, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { loadAuthSlice } from '@/store/loadAuthSlice';
import FioriTabBar from '@/components/FioriTabBar';
import { useTheme } from '@/hooks/useTheme';

export default function TabsLayout() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { userProfile, session, user } = useAppSelector((state) => state.auth);
  const { colors: themeColors, isDarkMode } = useTheme();
  const [hasAuthCheckSettled, setHasAuthCheckSettled] = useState(false);

  // Restore credentials before mounting protected screens or deciding to redirect.
  useEffect(() => {
    let isMounted = true;
    // Load after the store mounts: auth services also depend on the store.
    void loadAuthSlice()
      .then(({ initializeAuth }) => {
        if (!isMounted) return undefined;
        return dispatch(initializeAuth()).unwrap();
      })
      .catch(() => undefined)
      .finally(() => {
        if (isMounted) setHasAuthCheckSettled(true);
      });
    return () => {
      isMounted = false;
    };
  }, [dispatch]);

  const isUnauthenticated = !userProfile && (!user || !session);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (hasAuthCheckSettled && isUnauthenticated) {
      router.replace('/login');
    }
  }, [hasAuthCheckSettled, isUnauthenticated, router]);

  // Background colors - using direct hex values for reliability
  const darkBg = '#11222c';  // gray[900]
  const lightBg = '#f7f9fa'; // gray[50]
  const screenBg = isDarkMode ? darkBg : lightBg;

  if (!hasAuthCheckSettled) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: screenBg }}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  if (isUnauthenticated) return null;

  return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      {/* StatusBar explicitly set for tab screens */}
      <StatusBar style={isDarkMode ? 'light' : 'dark'} translucent />
      <ImageBackground
        source={require('../../assets/logo.png')}
        style={{ flex: 1 }}
        resizeMode="repeat"
      >
        {/* SafeAreaView with theme background covers status bar area */}
        <SafeAreaView
          style={{ flex: 1, backgroundColor: screenBg }}
          edges={['top']}
        >
          <Tabs
            tabBar={(props) => <FioriTabBar {...props} />}
            screenOptions={{
              headerShown: false,
              sceneStyle: { backgroundColor: screenBg },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'Orders',
              }}
            />
            <Tabs.Screen
              name="order-queue"
              options={{
                title: 'Queue',
              }}
            />
            <Tabs.Screen
              name="grn"
              options={{
                title: 'GRN',
              }}
            />
            <Tabs.Screen
              name="dispatch"
              options={{
                title: 'Dispatch',
              }}
            />
            <Tabs.Screen
              name="invoices"
              options={{
                title: 'Invoices',
              }}
            />
            <Tabs.Screen
              name="reports"
              options={{
                title: 'Reports',
              }}
            />
          </Tabs>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

// Styles moved inline for simplicity
