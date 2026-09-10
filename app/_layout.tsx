import 'react-native-gesture-handler';
import { LogBox } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import * as NavigationBar from 'expo-navigation-bar';

// Suppress LogBox error overlay for network/RPC errors in development
// These are handled gracefully by the app's error handling
LogBox.ignoreLogs([
  'ERROR [ServiceErrorHandler]',
  'RPC error:',
  'Could not find the function',
  'Network request failed',
]);
import { en, registerTranslation } from 'react-native-paper-dates';

// Register English locale for react-native-paper-dates (pure JS date picker)
registerTranslation('en', en);

// Set native root view background color BEFORE any React code runs
// This prevents white flash during navigation transitions (Bug #33647)
SystemUI.setBackgroundColorAsync('#11222c');

import React, { useEffect, useState, useMemo } from 'react';

// Type declaration for React Native's global ErrorUtils
interface ErrorUtilsType {
  setGlobalHandler: (handler: (error: Error, isFatal?: boolean) => void) => void;
  getGlobalHandler: () => ((error: Error, isFatal?: boolean) => void) | undefined;
}

declare const ErrorUtils: ErrorUtilsType | undefined;
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, View, ActivityIndicator, Text, useColorScheme, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { PaperProvider, MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { QueryClientProvider } from '@tanstack/react-query';
import { store, persistor } from '@/store';
import { queryClient } from '@/lib/queryClient';
import theme, { getThemeColors, colors, darkColors } from '@/theme';
import ConfigService from '@/services/configService';
import { initializeSupabase } from '@/config/supabaseConfig';
import ConfigErrorScreen from '@/components/ConfigErrorScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';
import { createLogger } from '@/utils/logger';
import { useAppSelector } from '@/store/hooks';
import { selectThemePreference, selectResolvedThemeMode } from '@/store/slices/themeSlice';
import { initializeSentry, captureException, captureMessage, Sentry } from '@/config/sentryConfig';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { AppStateManager } from '@/components/AppStateManager';
import { ForceUpdateModal } from '@/components/ForceUpdateModal';
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
if (typeof global !== 'undefined') {
  // React Native uses a polyfill that exposes tracking-rejection event
  const originalRejectionHandler = (global as any).onunhandledrejection;

  (global as any).onunhandledrejection = (event: { reason: any; promise: Promise<any> }) => {
    const reason = event?.reason;
    errorLogger.error('Unhandled promise rejection:', {
      message: reason?.message || String(reason),
      stack: reason?.stack?.substring(0, 500),
    });

    // Send to GlitchTip crash reporting
    if (reason instanceof Error) {
      captureException(reason, { type: 'unhandledRejection', source: 'PromiseRejectionHandler' });
    } else {
      captureMessage(`Unhandled rejection: ${String(reason)}`, 'error');
    }

    // Call original handler if it exists
    if (originalRejectionHandler) {
      originalRejectionHandler(event);
    }
  };
}

// Create Material Design 3 theme based on color mode
const createPaperTheme = (isDark: boolean) => {
  const baseTheme = isDark ? MD3DarkTheme : MD3LightTheme;
  const themeColors = isDark ? darkColors : colors;

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: themeColors.primary, // Brand primary color
      primaryContainer: themeColors.orange[100],
      secondary: themeColors.orange[700],
      secondaryContainer: themeColors.orange[50],
      tertiary: themeColors.blue[500],
      tertiaryContainer: themeColors.blue[50],
      surface: isDark ? themeColors.gray[100] : themeColors.white,
      surfaceVariant: themeColors.gray[isDark ? 200 : 50],
      background: themeColors.gray[isDark ? 50 : 50],
      error: themeColors.semantic.error,
      errorContainer: themeColors.red[50],
      onPrimary: isDark ? themeColors.gray[900] : '#ffffff',
      onSecondary: isDark ? themeColors.gray[900] : '#ffffff',
      onTertiary: isDark ? themeColors.gray[900] : '#ffffff',
      onSurface: themeColors.gray[900],
      onSurfaceVariant: themeColors.gray[600],
      onError: '#ffffff',
      outline: themeColors.gray[300],
      outlineVariant: themeColors.gray[200],
      inverseSurface: themeColors.gray[isDark ? 50 : 900],
      inverseOnSurface: themeColors.gray[isDark ? 900 : 50],
      inversePrimary: themeColors.orange[300],
      shadow: isDark ? '#000000' : themeColors.black,
      scrim: isDark ? '#000000' : themeColors.black,
      backdrop: isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.4)',
    },
    roundness: 12, // Border radius for Material Design components
  };
};

// Light theme (default, used before Redux is ready)
const paperTheme = createPaperTheme(false);

// Generic loading artwork; replace this asset when branding the template.
const splashImage = require('../assets/splash-icon-1024.png');

// Splash/loading screen
const SplashScreen = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' }}>
    <Image
      source={splashImage}
      style={{ width: '100%', height: '80%' }}
      resizeMode="contain"
    />
  </View>
);

// Inner component that applies safe area to the navigation stack
// Must be inside SafeAreaProvider to use useSafeAreaInsets
function NavigationStack({ screenBackground }: { screenBackground: string }) {
  const insets = useSafeAreaInsets();

  // Only apply bottom safe area padding on Android (iOS handles it natively)
  const androidBottomPadding = Platform.OS === 'android' ? insets.bottom : 0;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
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
      <Stack.Screen name="login" options={{ title: 'Sign In' }} />
      <Stack.Screen name="otp" options={{ title: 'Verify OTP' }} />

      {/* Detail screens */}
      <Stack.Screen name="grn-details" options={{ headerShown: false }} />
      <Stack.Screen name="dispatch-details" options={{ headerShown: false }} />
      <Stack.Screen name="invoice-details" options={{ headerShown: false }} />

      {/* Form screens */}
      <Stack.Screen name="grn-form" options={{ headerShown: false }} />
      <Stack.Screen name="grn-edit" options={{ title: 'Edit GRN', headerShown: false }} />
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
      <Stack.Screen name="reports/stock-summary" options={{ headerShown: false }} />
      <Stack.Screen name="reports/dispatch-activity" options={{ headerShown: false }} />
      <Stack.Screen name="reports/operations-dashboard" options={{ headerShown: false }} />
    </Stack>
  );
}

// Themed content component that uses Redux state for theme
function ThemedContent() {
  const themePreference = useAppSelector(selectThemePreference);
  const systemColorScheme = useColorScheme();
  const resolvedMode = selectResolvedThemeMode(themePreference, systemColorScheme);
  const isDarkMode = resolvedMode === 'dark';

  // I10: Handle cold start deep links
  useColdStartDeepLink();

  // Memoize the paper theme to avoid recreating on every render
  const currentPaperTheme = useMemo(() => createPaperTheme(isDarkMode), [isDarkMode]);
  const themeColors = isDarkMode ? darkColors : colors;

  // Background color that matches the theme
  // Note: In darkColors, gray scale is inverted (gray[50] is dark, gray[900] is light)
  // So we use gray[50] for both modes as it represents the "background" color
  const screenBackground = themeColors.gray[50];

  // Update system UI and navigation bar colors when theme changes (Android only)
  useEffect(() => {
    if (Platform.OS === 'android') {
      // Set the root background color
      SystemUI.setBackgroundColorAsync(screenBackground);
      // Set the navigation bar background color
      NavigationBar.setBackgroundColorAsync(screenBackground);
      // Set navigation bar button style (light icons for dark bg, dark icons for light bg)
      NavigationBar.setButtonStyleAsync(isDarkMode ? 'light' : 'dark');
    }
  }, [screenBackground, isDarkMode]);

  // Create custom navigation theme to match our app colors
  const navigationTheme = useMemo(() => {
    const baseTheme = isDarkMode ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: screenBackground,
        card: screenBackground,
        primary: themeColors.primary,
        text: themeColors.gray[900],
        border: themeColors.gray[200],
      },
    };
  }, [isDarkMode, screenBackground, themeColors]);

  return (
    // ThemeProvider ensures React Navigation uses our colors (prevents white flash)
    <ThemeProvider value={navigationTheme}>
      {/* Root View fills entire screen INCLUDING status bar area */}
      <View style={{ flex: 1, backgroundColor: screenBackground }}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} translucent />
        <PaperProvider theme={currentPaperTheme}>
          <SafeAreaProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <ForceUpdateModal />
              <OfflineBanner />
              <UpdatePrompt />
              <BottomSheetModalProvider>
                <NavigationStack screenBackground={screenBackground} />
              </BottomSheetModalProvider>
            </GestureHandlerRootView>
          </SafeAreaProvider>
        </PaperProvider>
      </View>
    </ThemeProvider>
  );
}

// Bootstrap component (inside providers)
function BootstrapApp() {
  const [isReady, setIsReady] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    bootstrapApp();
  }, []);

  const bootstrapApp = async () => {
    try {
      console.log('[Bootstrap] Starting app bootstrap');

      // STEP 1: Fetch public config (always refresh to get latest keys)
      console.log('[Bootstrap] Fetching public config from API...');
      let publicConfig;
      try {
        // Always refresh on app start to ensure we have the latest anon key
        publicConfig = await ConfigService.refreshPublicConfig();
        console.log('[Bootstrap] Config received:', {
          supabaseUrl: publicConfig.supabaseUrl,
          anonKeyPrefix: publicConfig.anonKey?.substring(0, 30) + '...',
          environment: publicConfig.environment,
          version: publicConfig.version,
        });
      } catch (error: any) {
        console.error('[Bootstrap] Config fetch failed:', error);
        setConfigError('Configuration API is unreachable. Please check your internet connection.');
        setIsReady(true);
        return;
      }

      // STEP 2: Initialize Supabase with fresh keys
      console.log('[Bootstrap] Initializing Supabase client with fresh keys...');
      try {
        initializeSupabase(publicConfig.supabaseUrl, publicConfig.anonKey);
        console.log('[Bootstrap] Supabase client initialized successfully');
      } catch (error: any) {
        console.error('[Bootstrap] Supabase initialization failed:', error);
        setConfigError('Failed to initialize Supabase client');
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

      setIsReady(true);
    } catch (error: any) {
      console.error('[Bootstrap] Unexpected bootstrap error:', error);
      setConfigError('An unexpected error occurred during app initialization');
      setIsReady(true);
    }
  };

  if (!isReady) {
    return <SplashScreen />;
  }

  if (configError) {
    return <ConfigErrorScreen error={configError} onRetry={bootstrapApp} />;
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
