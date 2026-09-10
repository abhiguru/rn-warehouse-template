/**
 * Tabs Layout - Main tab navigation using Expo Router
 *
 * Provides the bottom tab navigation for the app's main screens:
 * Orders, GRN, Dispatch, Invoices, and Reports.
 *
 * Uses a custom FioriTabBar component to maintain SAP Fiori design compliance.
 */

import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { ImageBackground, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useAppSelector } from '@/store/hooks';
import FioriTabBar from '@/components/FioriTabBar';
import { useTheme } from '@/hooks/useTheme';

export default function TabsLayout() {
  const router = useRouter();
  const { userProfile, session, user } = useAppSelector((state) => state.auth);
  const { colors: themeColors, isDarkMode } = useTheme();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!userProfile && (!user || !session)) {
      router.replace('/login');
    }
  }, [user, session, userProfile, router]);

  // Don't render tabs if not authenticated
  if (!userProfile && (!user || !session)) {
    return null;
  }

  // Background colors - using direct hex values for reliability
  const darkBg = '#11222c';  // gray[900]
  const lightBg = '#f7f9fa'; // gray[50]
  const screenBg = isDarkMode ? darkBg : lightBg;

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
