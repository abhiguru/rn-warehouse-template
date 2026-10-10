import 'react-native-gesture-handler';
import { LogBox, Platform } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import * as NavigationBar from 'expo-navigation-bar';
import Constants from 'expo-constants';

// Suppress LogBox error overlay for network/RPC errors in development
// These are handled gracefully by the app's error handling
LogBox.ignoreLogs([
  'ERROR [ServiceErrorHandler]',
  'RPC error:',
  'Could not find the function',
  'Network request failed',
]);
import { en, registerTranslation } from 'react-native-paper-dates';
import { gujaratiCalendar } from '@/i18n/calendar';

// Register both languages for react-native-paper-dates (pure JS date picker).
// Each DatePickerModal is given locale={getLanguage()}.
registerTranslation('en', en);
registerTranslation('gu', gujaratiCalendar);

// The splash background is fixed per build in app.json (style guide §15), so
// the JS splash and the native root background before React renders read it
// from the build config instead of repeating the value here.
const buildSplashBackground: string | undefined = Constants.expoConfig?.backgroundColor;

// Set the native root background before React renders on supported platforms.
// Android edge-to-edge mode rejects this call.
if (Platform.OS !== 'android' && buildSplashBackground) {
  SystemUI.setBackgroundColorAsync(buildSplashBackground);
}

import React, { useEffect, useState, useMemo, useRef } from 'react';

// Type declaration for React Native's global ErrorUtils
interface ErrorUtilsType {
  setGlobalHandler: (
    handler: (error: Error, isFatal?: boolean) => void
  ) => void;
  getGlobalHandler: () =>
    ((error: Error, isFatal?: boolean) => void) | undefined;
}

declare const ErrorUtils: ErrorUtilsType | undefined;
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider, useSafeAreaInsets, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import {
  View,
  ActivityIndicator,
  AppState,
  Image,
} from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from 'expo-router';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { PaperProvider, MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { QueryClientProvider } from '@tanstack/react-query';
import { store, persistor } from '@/store';
import { queryClient } from '@/lib/queryClient';
import { getTokens, radius, typography, type ThemeTokens } from '@/theme/tokens';
import { useTheme, useTokens } from '@/hooks/useTheme';
import ConfigService from '@/services/configService';
import { initializeSupabase } from '@/config/supabaseConfig';
import { clearPendingEnrollment } from '@/config/supabaseConfig';
import ConfigErrorScreen from '@/components/ConfigErrorScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';
import { AlertHost } from '@/components/AlertHost';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { createLogger } from '@/utils/logger';
import { useAppDispatch } from '@/store/hooks';
import { useAppLanguage } from '@/i18n/useAppLanguage';
import { t as translate } from '@/i18n';
import { initializeAuth } from '@/store/slices/authSlice';
import { logout } from '@/store/slices/authSlice';
import { clearSessionScopedState } from '@/store/sessionScopedState';
import { sweepSharedDocuments } from '@/utils/shareDocument';
import { OperatorServerSelection } from '@/components/OperatorServerSelection';
import { onOperatorServerChange } from '@/config/operatorServer';
import { verifySelectedOperator, verifyForegroundOperator } from '@/config/operatorBootstrap';
import { operatorResumeGate } from '@/config/operatorResume';
import { createResumeLifecycle } from '@/config/resumeLifecycle';
import { isNativeHandoffActive } from '@/config/nativeHandoff';
import { hasActiveOperatorMutation } from '@/config/supabaseConfig';
import {
  initializeSentry,
  captureException,
  captureMessage,
  Sentry,
} from '@/config/sentryConfig';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { AppStateManager } from '@/components/AppStateManager';
import { ForceUpdateModal } from '@/components/ForceUpdateModal';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useColdStartDeepLink } from '@/hooks/useColdStartDeepLink';

// Initialize Sentry/GlitchTip crash reporting immediately (before any React code)
// Only initialize when DSN is configured via EXPO_PUBLIC_SENTRY_DSN env var
if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  initializeSentry();
}

// Global error logger
const errorLogger = createLogger('GlobalError');

// Global error handler for uncaught exceptions
// This catches errors that occur outside of React's error boundary
if (typeof ErrorUtils !== 'undefined' && ErrorUtils) {
  const originalHandler = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    // Log the error with our secure logger
    errorLogger.error(`Uncaught ${isFatal ? 'FATAL' : ''} error:`, {
      name: error?.name,
      message: error?.message,
      stack: error?.stack?.substring(0, 500), // Limit stack trace length
    });

    // Send to GlitchTip crash reporting
    captureException(error, { isFatal, source: 'GlobalErrorHandler' });

    // Call the original handler (shows red screen in dev)
    if (originalHandler) {
      originalHandler(error, isFatal);
    }
  });
}

// Handle unhandled promise rejections
if (typeof globalThis !== 'undefined') {
  // React Native uses a polyfill that exposes tracking-rejection event
  const originalRejectionHandler = (globalThis as any).onunhandledrejection;

  (globalThis as any).onunhandledrejection = (event: {
    reason: any;
    promise: Promise<any>;
  }) => {
    const reason = event?.reason;
    errorLogger.error('Unhandled promise rejection:', {
      message: reason?.message || String(reason),
      stack: reason?.stack?.substring(0, 500),
    });

    // Send to GlitchTip crash reporting
    if (reason instanceof Error) {
      captureException(reason, {
        type: 'unhandledRejection',
        source: 'PromiseRejectionHandler',
      });
    } else {
      captureMessage(`Unhandled rejection: ${String(reason)}`, 'error');
    }

    // Call original handler if it exists
    if (originalRejectionHandler) {
      originalRejectionHandler(event);
    }
  };
}

/**
 * React Native Paper MD3 theme built from the semantic tokens for one brand and
 * mode (style guide §15), so Paper components follow the brand and dark mode.
 */
export const createPaperTheme = (t: ThemeTokens) => {
  const baseTheme = t.mode === 'dark' ? MD3DarkTheme : MD3LightTheme;
  const raised = t.surface.card;

  return {
    ...baseTheme,
    dark: t.mode === 'dark',
    colors: {
      ...baseTheme.colors,
      // Filled buttons, FAB, checked controls
      primary: t.brand.fill,
      onPrimary: t.brand.onFill,
      primaryContainer: t.brand.subtle,
      onPrimaryContainer: t.brand.tint,
      // Selected chips and tonal buttons
      secondary: t.brand.tint,
      onSecondary: t.surface.card,
      secondaryContainer: t.brand.subtle,
      onSecondaryContainer: t.brand.tint,
      tertiary: t.status.informative.element,
      onTertiary: t.surface.card,
      tertiaryContainer: t.status.informative.background,
      onTertiaryContainer: t.status.informative.text,
      surface: t.surface.card,
      onSurface: t.text.primary,
      surfaceVariant: t.surface.fieldReadOnly,
      onSurfaceVariant: t.text.secondary,
      surfaceDisabled: t.surface.cardActive,
      onSurfaceDisabled: t.text.disabled,
      background: t.background.base,
      onBackground: t.text.primary,
      error: t.status.negative.text,
      onError: t.destructive.onFill,
      errorContainer: t.status.negative.background,
      onErrorContainer: t.status.negative.text,
      outline: t.border.field,
      outlineVariant: t.border.divider,
      // Snackbars: inverse surface, action in text.inverse (§13.9)
      inverseSurface: t.surface.inverse,
      inverseOnSurface: t.text.inverse,
      inversePrimary: t.text.inverse,
      shadow: t.shadow[2].shadowColor,
      scrim: t.overlay.scrim,
      backdrop: t.overlay.scrim,
      // Fiori shows depth with shadows, not MD3's tinted surfaces.
      elevation: {
        level0: 'transparent',
        level1: raised,
        level2: raised,
        level3: t.surface.sheet,
        level4: t.surface.sheet,
        level5: t.surface.sheet,
      },
    },
    roundness: radius.card,
  };
};

/** React Navigation theme built from the same tokens. */
export const createNavigationTheme = (t: ThemeTokens) => {
  const baseTheme = t.mode === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...baseTheme,
    dark: t.mode === 'dark',
    colors: {
      ...baseTheme.colors,
      background: t.background.base,
      card: t.surface.header,
      primary: t.brand.tint,
      text: t.text.primary,
      border: t.border.divider,
      notification: t.status.negative.element,
    },
  };
};

// Generic loading artwork; replace this asset when branding the template.
const splashImage = require('../assets/splash-icon-1024.png');

// Splash/loading screen. Shown before the store is rehydrated, so it matches
// the build-time native splash rather than a user-chosen brand.
const SplashScreen = () => (
  <View
    style={{
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: buildSplashBackground,
    }}
    accessible
    accessibilityLabel={translate('nav.loading')}
  >
    <Image
      source={splashImage}
      style={{ width: '100%', height: '80%' }}
      resizeMode="contain"
      accessible={false}
      importantForAccessibility="no"
    />
  </View>
);

// Inner component that applies safe area to the navigation stack
// Must be inside SafeAreaProvider to use useSafeAreaInsets
/**
 * While offline, the banner at the top already pads for the status bar, so the
 * screens below it get a zero top inset; otherwise their headers would add a
 * second status-bar gap under the banner.
 */
function BelowOfflineBanner({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const isOffline = useIsOffline();
  const value = React.useMemo(() => (isOffline ? { ...insets, top: 0 } : insets), [insets, isOffline]);
  return <SafeAreaInsetsContext.Provider value={value}>{children}</SafeAreaInsetsContext.Provider>;
}

function NavigationStack({ screenBackground }: { screenBackground: string }) {
  const insets = useSafeAreaInsets();
  const t = useTokens();

  // Only apply bottom safe area padding on Android (iOS handles it natively)
  const androidBottomPadding = Platform.OS === 'android' ? insets.bottom : 0;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Stack header per style guide §13.8, for any screen that shows one.
        headerStyle: { backgroundColor: t.surface.header },
        headerTintColor: t.brand.tint,
        headerTitleStyle: { ...typography.headline, color: t.text.primary },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: screenBackground,
          // Apply bottom safe area padding for Android system nav bar only
          paddingBottom: androidBottomPadding,
        },
        // Expo Go limitation: can't fix native background color
        // 'none' minimizes flash visibility (instant swap vs animated)
        animation: 'none',
      }}
    >
      {/* Tab group - main app screens (tabs handle their own safe area) */}
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
          // Tabs have their own safe area handling via FioriTabBar
          contentStyle: { backgroundColor: screenBackground, paddingBottom: 0 },
        }}
      />

      {/* Auth screens */}
      <Stack.Screen name="login" options={{ title: translate('nav.screens.signIn') }} />
      <Stack.Screen name="otp" options={{ title: translate('nav.screens.enterCode') }} />
      <Stack.Screen name="pending-enrollment" options={{ title: translate('nav.screens.waitingForApproval') }} />
      <Stack.Screen name="operator-server" options={{ title: translate('nav.screens.facility') }} />
      <Stack.Screen name="enrollment-review" options={{ title: translate('nav.screens.enrollmentReview') }} />

      {/* Detail screens */}
      {/* Sort and filter page of a list: slides up like a sheet, closes with its own button */}
      <Stack.Screen
        name="list-filters"
        options={{ headerShown: false, animation: 'slide_from_bottom', gestureEnabled: false }}
      />
      <Stack.Screen name="grn-details/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="dispatch-details/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="invoice-details/[id]" options={{ headerShown: false }} />

      {/* Form screens */}
      <Stack.Screen name="grn-form" options={{ headerShown: false }} />
      <Stack.Screen
        name="grn-edit"
        options={{ title: translate('nav.screens.editGrn'), headerShown: false }}
      />
      <Stack.Screen name="dispatch-form" options={{ headerShown: false }} />
      <Stack.Screen name="dispatch-edit" options={{ headerShown: false }} />
      <Stack.Screen name="invoice-form" options={{ headerShown: false }} />
      <Stack.Screen name="invoice-edit" options={{ headerShown: false }} />

      {/* Other screens */}
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
      <Stack.Screen name="customers" options={{ headerShown: false }} />
      <Stack.Screen name="sensors" options={{ headerShown: false }} />

      {/* Legal screens */}
      <Stack.Screen name="terms-of-service" options={{ headerShown: false }} />
      <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />

      {/* Report screens */}
      <Stack.Screen
        name="reports/stock-summary"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="reports/dispatch-activity"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="reports/operations-dashboard"
        options={{ headerShown: false }}
      />
    </Stack>
  );
}

// Themed content component that uses Redux state for theme
function ThemedContent() {
  const dispatch = useAppDispatch();
  const [authCheckSettled, setAuthCheckSettled] = useState(false);
  // Brand and mode from the Settings choice (falls back to the system mode).
  const { brand, resolvedMode, tokens } = useTheme();
  const isDarkMode = resolvedMode === 'dark';
  // English or Gujarati. The key below rebuilds every screen when it changes, so
  // text and number formats switch at once, with no restart.
  const { language } = useAppLanguage();

  // Restore credentials before any route screen can redirect an initially
  // empty Redux auth state. Deep links can bypass the tab layout, so auth
  // restoration belongs at the root navigation boundary.
  useEffect(() => {
    let mounted = true;
    void dispatch(initializeAuth())
      .unwrap()
      // initializeAuth records its failure in Redux; the root only needs to
      // release the navigation gate after the attempt settles.
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setAuthCheckSettled(true);
      });
    return () => {
      mounted = false;
    };
  }, [dispatch]);

  // I10: Handle cold start deep links only after the root auth check settles.
  useColdStartDeepLink(authCheckSettled);

  // Rebuild the Paper and navigation themes only when the brand or mode changes.
  const currentPaperTheme = useMemo(
    () => createPaperTheme(getTokens(brand, resolvedMode)),
    [brand, resolvedMode]
  );
  const navigationTheme = useMemo(
    () => createNavigationTheme(getTokens(brand, resolvedMode)),
    [brand, resolvedMode]
  );

  const screenBackground = tokens.background.base;

  // Keep the platform-specific system background in sync with theme changes.
  useEffect(() => {
    if (Platform.OS === 'android') {
      // The style names the button colour: light buttons on a dark background, dark buttons on light.
      NavigationBar.setStyle(isDarkMode ? 'light' : 'dark');
    } else {
      SystemUI.setBackgroundColorAsync(screenBackground);
    }
  }, [screenBackground, isDarkMode]);

  if (!authCheckSettled) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: screenBackground,
        }}
      >
        <EdgeToEdgeStatusBar barStyle={tokens.statusBarStyle} />
        <ActivityIndicator
          size="large"
          color={tokens.brand.tint}
          accessibilityLabel={translate('nav.loading')}
        />
      </View>
    );
  }

  return (
    // ThemeProvider ensures React Navigation uses our colors (prevents white flash)
    <ThemeProvider value={navigationTheme}>
      {/* Root View fills entire screen INCLUDING status bar area */}
      <View style={{ flex: 1, backgroundColor: screenBackground }}>
        <EdgeToEdgeStatusBar barStyle={tokens.statusBarStyle} />
        <PaperProvider theme={currentPaperTheme}>
          <SafeAreaProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <ForceUpdateModal />
              <OfflineBanner />
              <UpdatePrompt />
              <BottomSheetModalProvider>
                <BelowOfflineBanner>
                  <NavigationStack key={language} screenBackground={screenBackground} />
                </BelowOfflineBanner>
              </BottomSheetModalProvider>
              <AlertHost />
            </GestureHandlerRootView>
          </SafeAreaProvider>
        </PaperProvider>
      </View>
    </ThemeProvider>
  );
}

async function clearReplacedOperatorInstance() {
  // The URL now serves another instance; revoke nothing through it.
  await store.dispatch(logout({ localOnly: true })).unwrap();
  await clearPendingEnrollment();
  await clearSessionScopedState(store.dispatch);
  await ConfigService.clearCache();
}

// Bootstrap component (inside providers)
function BootstrapApp() {
  const [isReady, setIsReady] = useState(false);
  const [needsSelection, setNeedsSelection] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  // The configuration error screen can open server selection. Credentials
  // stay untouched until the operator confirms a change there; a committed
  // change re-runs the bootstrap, which clears this flag.
  const [changingServer, setChangingServer] = useState(false);
  const bootstrapRun = useRef(0);

  useEffect(() => {
    // Documents handed to the share sheet in an earlier run are not session
    // data for this one; remove them before anything else starts.
    void sweepSharedDocuments();
    void bootstrapApp();
    const unsubscribe = onOperatorServerChange(() => { void bootstrapApp(); });
    const removeVerifier = operatorResumeGate.installVerifier(async current => {
      const run = bootstrapRun.current;
      return verifyForegroundOperator(
        () => current() && run === bootstrapRun.current,
        clearReplacedOperatorInstance,
        config => initializeSupabase(config.supabaseUrl, config.anonKey)
      );
    });
    // Suspend credentialed work for a real background stay only: not for the
    // 'inactive' blip of a system dialog, and not for a camera, picker, share
    // or multi-request upload round trip that returns within the grace window.
    const lifecycle = AppState.addEventListener(
      'change',
      createResumeLifecycle({
        gate: operatorResumeGate,
        isHandoffActive: () => isNativeHandoffActive() || hasActiveOperatorMutation(),
        initialState: AppState.currentState,
      })
    );
    return () => {
      bootstrapRun.current += 1;
      lifecycle.remove(); removeVerifier(); unsubscribe(); operatorResumeGate.suspend();
    };
  }, []);

  const bootstrapApp = async () => {
    const run = ++bootstrapRun.current;
    // A retry must leave the prior error state before starting. Otherwise a
    // successful refresh completes behind the still-mounted error screen.
    setConfigError(null);
    setIsReady(false);
    setNeedsSelection(false);
    setChangingServer(false);

    try {
      const result = await verifySelectedOperator(() => run === bootstrapRun.current, async () => {
        await clearReplacedOperatorInstance();
      });
      if (result.kind === 'superseded') return;
      if (result.kind === 'selection') {
        if (run === bootstrapRun.current) { setNeedsSelection(true); setIsReady(true); }
        return;
      }
      const discovered = result.discovery;
      console.log('[Bootstrap] Starting app bootstrap');

      // STEP 1: Fetch public config (always refresh to get latest keys)
      console.log('[Bootstrap] Fetching public config from API...');
      let publicConfig;
      try {
        // Always refresh on app start to ensure we have the latest anon key
        publicConfig = discovered.config;
        console.log('[Bootstrap] Config received:', {
          supabaseUrl: publicConfig.supabaseUrl,
          environment: publicConfig.environment,
          version: publicConfig.version,
        });
      } catch (error: any) {
        console.error('[Bootstrap] Config fetch failed:', error);
        setConfigError(
          translate('nav.bootstrap.unreachable')
        );
        setIsReady(true);
        return;
      }

      // STEP 2: Initialize Supabase with fresh keys
      console.log(
        '[Bootstrap] Initializing Supabase client with fresh keys...'
      );
      try {
        initializeSupabase(publicConfig.supabaseUrl, publicConfig.anonKey);
        console.log('[Bootstrap] Supabase client initialized successfully');
      } catch (error: any) {
        console.error('[Bootstrap] Supabase initialization failed:', error);
        setConfigError(translate('nav.bootstrap.connectFailed'));
        setIsReady(true);
        return;
      }

      console.log('[Bootstrap] Bootstrap complete - app ready');

      // DEBUG: Add minimum splash display time to see the animation
      // Remove this in production
      if (__DEV__) {
        console.log('[Bootstrap] Waiting for splash animation...');
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second minimum
      }

      if (run === bootstrapRun.current) { setConfigError(null); setIsReady(true); }
    } catch (error: any) {
      console.error('[Bootstrap] Unexpected bootstrap error:', error);
      if (run === bootstrapRun.current) {
        setConfigError(error instanceof Error ? error.message : translate('nav.bootstrap.verifyFailed'));
        setIsReady(true);
      }
    }
  };

  if (!isReady) {
    return <SplashScreen />;
  }

  if (needsSelection) return <OperatorServerSelection initial />;

  if (configError) {
    if (changingServer) {
      return <OperatorServerSelection initial onCancel={() => setChangingServer(false)} />;
    }
    return (
      <ConfigErrorScreen
        error={configError}
        onRetry={bootstrapApp}
        onChangeServer={() => setChangingServer(true)}
      />
    );
  }

  // Return actual app content wrapped in ErrorBoundary for crash protection
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppStateManager>
          <ThemedContent />
        </AppStateManager>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

function RootLayout() {
  if (__DEV__) console.log('[RootLayout] Configuring Material Design 3 theme');

  // StatusBar translucency is set via the StatusBar component's translucent prop in ThemedContent
  // expo-status-bar's StatusBar is translucent by default on Android

  return (
    <Provider store={store}>
      <PersistGate loading={<SplashScreen />} persistor={persistor}>
        <BootstrapApp />
      </PersistGate>
    </Provider>
  );
}

// Wrap with Sentry for automatic error boundary and crash reporting (only when DSN configured)
export default process.env.EXPO_PUBLIC_SENTRY_DSN
  ? Sentry.wrap(RootLayout)
  : RootLayout;
