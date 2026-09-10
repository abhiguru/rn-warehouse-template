/**
 * Token Expiry Banner Component
 *
 * SAP Fiori Design System - Banner/Snackbar Component
 * Spec: design/sap-fiori-specs/11-snackbar.md
 *
 * Displays a warning banner when the authentication token is about to expire.
 * Shows a prominent notification with options to continue session or logout.
 *
 * Note: This is a persistent banner (not auto-dismissing) as it requires user action.
 * Uses Fiori semantic colors for warning/error states.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { clearTokenExpiryStates, clearAuthError, clearAllAuthAlerts, logout, setConfigFetchFailed } from '@/store/slices/authSlice';
import { colors, darkColors } from '@/theme';
import { listColors } from '@/theme/listColors';

// ============================================================================
// SAP Fiori Design Constants
// Spec: design/sap-fiori-specs/11-snackbar.md (adapted for persistent banner)
// ============================================================================
const FIORI = {
  // Banner dimensions
  banner: {
    minHeight: 56,
    horizontalPadding: 16,
    verticalPadding: 12,
    borderRadius: 0, // Full-width banner, no radius
    borderBottomWidth: 3,
  },
  // Icon
  icon: {
    size: 24,
    marginRight: 12,
  },
  // Typography
  typography: {
    message: { fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
    button: { fontSize: 14, fontWeight: '600' as const },
  },
  // Button
  button: {
    height: 36,
    minWidth: 64,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 8,
  },
} as const;

export const TokenExpiryBanner: React.FC = () => {
  // Dark mode support
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

  const router = useRouter();
  const dispatch = useAppDispatch();
  const { tokenExpiryWarning, tokenExpired, error: authError, configFetchFailed } = useAppSelector(
    (state) => state.auth
  );

  const handleDismissTokenExpiry = () => {
    dispatch(clearTokenExpiryStates());
  };

  const handleDismissAuthError = () => {
    dispatch(clearAuthError());
  };

  const handleDismissConfigError = () => {
    dispatch(setConfigFetchFailed(false));
  };

  const handleLogout = async () => {
    await dispatch(logout()).unwrap();
    router.replace('/login');
  };

  const handleRefresh = () => {
    // Navigate to login to re-authenticate
    router.push('/login');
  };

  // Auth Error state - show user-facing auth errors
  if (authError) {
    return (
      <View
        style={[styles.bannerError, { backgroundColor: themeColors.semantic.errorLight, borderBottomColor: themeColors.semantic.error }]}
        accessible={true}
        accessibilityRole="alert"
        accessibilityLabel={`Authentication error: ${authError}`}
      >
        <View style={styles.contentRow}>
          <Ionicons
            name="warning"
            size={FIORI.icon.size}
            color={themeColors.semantic.error}
            style={styles.icon}
          />
          <Text style={[styles.messageError, { color: themeColors.fiori.text.primary }]}>
            {authError}
          </Text>
        </View>
        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
            onPress={handleDismissAuthError}
            accessibilityRole="button"
            accessibilityLabel="Dismiss error"
          >
            <Text style={[styles.secondaryButtonText, { color: themeColors.fiori.text.secondary }]}>Dismiss</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              styles.errorButton,
              { backgroundColor: themeColors.semantic.error },
              pressed && styles.buttonPressed,
            ]}
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="Sign in again"
          >
            <Ionicons
              name="log-in-outline"
              size={18}
              color={themeColors.white}
              style={styles.buttonIcon}
            />
            <Text style={[styles.primaryButtonText, { color: themeColors.white }]}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Config fetch failed warning - show if app config couldn't be loaded
  if (configFetchFailed) {
    return (
      <View
        style={[styles.bannerWarning, { backgroundColor: themeColors.semantic.warningLight, borderBottomColor: themeColors.semantic.warning }]}
        accessible={true}
        accessibilityRole="alert"
        accessibilityLabel="Configuration warning. Some features may not work as expected."
      >
        <View style={styles.contentRow}>
          <Ionicons
            name="cloud-offline-outline"
            size={FIORI.icon.size}
            color={themeColors.semantic.warning}
            style={styles.icon}
          />
          <Text style={[styles.messageWarning, { color: themeColors.fiori.text.primary }]}>
            Unable to load app configuration. Some features may not work correctly.
          </Text>
        </View>
        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
            onPress={handleDismissConfigError}
            accessibilityRole="button"
            accessibilityLabel="Dismiss warning"
          >
            <Text style={[styles.secondaryButtonText, { color: themeColors.fiori.text.secondary }]}>Dismiss</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Session Expired - Error state
  if (tokenExpired) {
    return (
      <View
        style={[styles.bannerError, { backgroundColor: themeColors.semantic.errorLight, borderBottomColor: themeColors.semantic.error }]}
        accessible={true}
        accessibilityRole="alert"
        accessibilityLabel="Session expired. Your session has expired. Please sign in again to continue."
      >
        <View style={styles.contentRow}>
          <Ionicons
            name="alert-circle"
            size={FIORI.icon.size}
            color={themeColors.semantic.error}
            style={styles.icon}
          />
          <Text style={[styles.messageError, { color: themeColors.fiori.text.primary }]}>
            Your session has expired. Please sign in again to continue.
          </Text>
        </View>
        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              styles.errorButton,
              { backgroundColor: themeColors.semantic.error },
              pressed && styles.buttonPressed,
            ]}
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="Sign in again"
          >
            <Ionicons
              name="log-in-outline"
              size={18}
              color={themeColors.white}
              style={styles.buttonIcon}
            />
            <Text style={[styles.primaryButtonText, { color: themeColors.white }]}>Sign In Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Session Expiring Warning
  if (tokenExpiryWarning) {
    return (
      <View
        style={[styles.bannerWarning, { backgroundColor: themeColors.semantic.warningLight, borderBottomColor: themeColors.semantic.warning }]}
        accessible={true}
        accessibilityRole="alert"
        accessibilityLabel="Session warning. Your session will expire soon. Please refresh your session to avoid being logged out."
      >
        <View style={styles.contentRow}>
          <Ionicons
            name="time-outline"
            size={FIORI.icon.size}
            color={themeColors.semantic.warning}
            style={styles.icon}
          />
          <Text style={[styles.messageWarning, { color: themeColors.fiori.text.primary }]}>
            Your session will expire soon. Refresh to stay logged in.
          </Text>
        </View>
        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
            onPress={handleDismissTokenExpiry}
            accessibilityRole="button"
            accessibilityLabel="Dismiss warning"
          >
            <Text style={[styles.secondaryButtonText, { color: themeColors.fiori.text.secondary }]}>Dismiss</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              styles.warningButton,
              { backgroundColor: themeColors.semantic.warning },
              pressed && styles.buttonPressed,
            ]}
            onPress={handleRefresh}
            accessibilityRole="button"
            accessibilityLabel="Refresh session"
          >
            <Ionicons
              name="refresh-outline"
              size={18}
              color={themeColors.white}
              style={styles.buttonIcon}
            />
            <Text style={[styles.primaryButtonText, { color: themeColors.white }]}>Refresh</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return null;
};

// ============================================================================
// Styles - SAP Fiori Design System
// ============================================================================
const styles = StyleSheet.create({
  // Banner base styles
  bannerBase: {
    minHeight: FIORI.banner.minHeight,
    paddingHorizontal: FIORI.banner.horizontalPadding,
    paddingVertical: FIORI.banner.verticalPadding,
    borderBottomWidth: FIORI.banner.borderBottomWidth,
  },

  // Warning banner - Fiori Critical semantic
  bannerWarning: {
    minHeight: FIORI.banner.minHeight,
    paddingHorizontal: FIORI.banner.horizontalPadding,
    paddingVertical: FIORI.banner.verticalPadding,
    borderBottomWidth: FIORI.banner.borderBottomWidth,
  },

  // Error banner - Fiori Negative semantic
  bannerError: {
    minHeight: FIORI.banner.minHeight,
    paddingHorizontal: FIORI.banner.horizontalPadding,
    paddingVertical: FIORI.banner.verticalPadding,
    borderBottomWidth: FIORI.banner.borderBottomWidth,
  },

  // Content row with icon and message
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  icon: {
    marginRight: FIORI.icon.marginRight,
    marginTop: 2,
  },
  messageWarning: {
    flex: 1,
    fontSize: FIORI.typography.message.fontSize,
    fontWeight: FIORI.typography.message.fontWeight,
    lineHeight: FIORI.typography.message.lineHeight,
  },
  messageError: {
    flex: 1,
    fontSize: FIORI.typography.message.fontSize,
    fontWeight: FIORI.typography.message.fontWeight,
    lineHeight: FIORI.typography.message.lineHeight,
  },

  // Actions row
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: FIORI.button.gap,
    marginLeft: FIORI.icon.size + FIORI.icon.marginRight, // Align with text
  },

  // Primary action button
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: FIORI.button.height,
    minWidth: FIORI.button.minWidth,
    paddingHorizontal: FIORI.button.paddingHorizontal,
    borderRadius: FIORI.button.borderRadius,
    // Platform-specific shadows
    ...Platform.select({
      ios: {
        shadowColor: listColors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  warningButton: {},
  errorButton: {},
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonIcon: {
    marginRight: 6,
  },
  primaryButtonText: {
    fontSize: FIORI.typography.button.fontSize,
    fontWeight: FIORI.typography.button.fontWeight,
  },

  // Secondary action button (text only)
  secondaryButton: {
    height: FIORI.button.height,
    minWidth: FIORI.button.minWidth,
    paddingHorizontal: FIORI.button.paddingHorizontal,
    borderRadius: FIORI.button.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  secondaryButtonText: {
    fontSize: FIORI.typography.button.fontSize,
    fontWeight: FIORI.typography.button.fontWeight,
  },
});
