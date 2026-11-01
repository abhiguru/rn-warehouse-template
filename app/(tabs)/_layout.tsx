/**
 * Tabs Layout - Main tab navigation using Expo Router
 *
 * Provides the bottom tab navigation for the app's main screens:
 * Orders, GRN, Dispatch, Invoices, and Reports.
 *
 * Uses a custom FioriTabBar component to maintain SAP Fiori design compliance.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { loadAuthSlice } from '@/store/loadAuthSlice';
import FioriTabBar from '@/components/FioriTabBar';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useTheme } from '@/hooks/useTheme';
import { useSessionGenerationGuard } from '@/hooks/useSessionGenerationGuard';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { t as translate } from '@/i18n';

export default function TabsLayout() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { userProfile, session, user } = useAppSelector((state) => state.auth);
  const { tokens: t } = useTheme();
  // The root restores the session before any route mounts (app/_layout.tsx), so
  // a start of the app reaches the tabs with the restore settled. It runs here
  // only when nothing has restored the current session: after a sign-in or a
  // facility switch began a new one. A restore still running is waited for.
  const initializeStatus = useAppSelector((state) => state.auth.initializeStatus);
  const initializeGeneration = useAppSelector((state) => state.auth.initializeGeneration);
  const restoreStatus =
    initializeGeneration === getSessionGeneration() ? initializeStatus ?? 'idle' : 'idle';
  const [statusAtMount] = useState(restoreStatus);
  const [hasAuthCheckSettled, setHasAuthCheckSettled] = useState(statusAtMount === 'settled');

  // Restore credentials before mounting protected screens or deciding to redirect.
  useEffect(() => {
    if (statusAtMount !== 'idle') return undefined;
    let isMounted = true;
    // Load after the store mounts: auth services also depend on the store.
    void loadAuthSlice()
      .then(({ initializeAuth }) => {
        if (!isMounted) return undefined;
        return dispatch(initializeAuth()).unwrap();
      })
      .catch(() => {
        // Do not include the thrown value: it can contain session or network details.
        console.warn('[TabsLayout] Auth initialization failed');
      })
      .finally(() => {
        if (isMounted) setHasAuthCheckSettled(true);
      });
    return () => {
      isMounted = false;
    };
  }, [dispatch, statusAtMount]);

  // A restore already running when this layout mounted: settled once it ends
  // (or is superseded by a sign-in, a sign-out or a new session).
  useEffect(() => {
    if (statusAtMount === 'pending' && restoreStatus !== 'pending') setHasAuthCheckSettled(true);
  }, [statusAtMount, restoreStatus]);

  const isUnauthenticated = !userProfile && (!user || !session);

  // A rejected refresh or a replaced instance removes the stored credentials
  // underneath a mounted profile. End the Redux session locally so the
  // redirect below runs instead of leaving the tabs stuck with dead data.
  const onCredentialsGone = useCallback(() => {
    void loadAuthSlice()
      .then(({ logout }) => dispatch(logout({ localOnly: true })).unwrap())
      .catch(() => {
        console.warn('[TabsLayout] Local session teardown failed');
      });
  }, [dispatch]);
  useSessionGenerationGuard(Boolean(userProfile), onCredentialsGone);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (hasAuthCheckSettled && isUnauthenticated) {
      router.replace('/login');
    }
  }, [hasAuthCheckSettled, isUnauthenticated, router]);

  // Screen background behind cards and lists
  const screenBg = t.background.base;

  // Keep a deliberate loading surface while navigation replaces an unauthenticated route.
  if (!hasAuthCheckSettled || isUnauthenticated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: screenBg }}>
        <ActivityIndicator
          size="large"
          color={t.brand.tint}
          accessibilityLabel={translate('nav.loading')}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      {/* StatusBar explicitly set for tab screens */}
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <View style={{ flex: 1 }}>
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
                title: translate('nav.tabs.orders'),
              }}
            />
            <Tabs.Screen
              name="grn"
              options={{
                title: translate('nav.tabs.grn'),
              }}
            />
            <Tabs.Screen
              name="dispatch"
              options={{
                title: translate('nav.tabs.dispatch'),
              }}
            />
            <Tabs.Screen
              name="invoices"
              options={{
                title: translate('nav.tabs.invoices'),
              }}
            />
            <Tabs.Screen
              name="reports"
              options={{
                title: translate('nav.tabs.reports'),
              }}
            />
          </Tabs>
        </SafeAreaView>
      </View>
    </View>
  );
}

// Styles moved inline for simplicity
