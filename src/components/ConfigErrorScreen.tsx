/**
 * Configuration Error Screen
 *
 * SAP Fiori Design System - Error/Empty State Component
 * Spec: design/sap-fiori-specs/12-empty-state.md
 *
 * Displayed when configuration cannot be fetched from API.
 * Shows fallback configuration is being used.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppDispatch } from '@/store/hooks';
import { refreshPublicConfig } from '@/store/slices/configSlice';
import { colors, darkColors } from '@/theme';

// ============================================================================
// SAP Fiori Design Constants
// Spec: design/sap-fiori-specs/12-empty-state.md
// ============================================================================
const FIORI = {
  // Container
  container: {
    padding: 24,
  },
  // Illustration
  illustration: {
    containerSize: 120,
    iconSize: 64,
  },
  // Typography
  typography: {
    title: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28 },
    description: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
    infoTitle: { fontSize: 13, fontWeight: '600' as const },
    infoText: { fontSize: 12, fontWeight: '400' as const, lineHeight: 18 },
    footer: { fontSize: 12, fontWeight: '400' as const },
  },
  // Button
  button: {
    height: 44,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  // Spacing
  spacing: {
    illustrationToTitle: 24,
    titleToDescription: 8,
    descriptionToContent: 24,
    contentGap: 16,
    buttonGap: 8,
  },
} as const;

interface ConfigErrorScreenProps {
  error?: string;
  onRetry?: () => void;
}

const ConfigErrorScreen: React.FC<ConfigErrorScreenProps> = ({
  error,
  onRetry,
}) => {
  const dispatch = useAppDispatch();
  const [isRetrying, setIsRetrying] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      if (onRetry) {
        await onRetry();
      }
    } catch (err) {
      console.error('[ConfigErrorScreen] Retry failed:', err);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <View
      style={[styles.container, { backgroundColor: themeColors.white }]}
      accessible={true}
      accessibilityLabel="Configuration error screen. Using fallback configuration."
    >
      <View style={styles.content}>
        {/* Illustration - Fiori Warning State */}
        <View
          style={[
            styles.illustrationContainer,
            { backgroundColor: themeColors.fiori.semantic.criticalLight },
          ]}
          accessible={false}
        >
          <Ionicons
            name="warning-outline"
            size={FIORI.illustration.iconSize}
            color={themeColors.fiori.semantic.critical}
          />
        </View>

        {/* Title */}
        <Text
          style={[styles.title, { color: themeColors.fiori.text.primary }]}
          accessibilityRole="header"
        >
          Configuration Error
        </Text>

        {/* Description */}
        <Text
          style={[styles.description, { color: themeColors.fiori.text.secondary }]}
        >
          We couldn't load the latest app configuration. Using fallback
          configuration instead.
        </Text>

        {/* Error Details */}
        {error && (
          <View
            style={[
              styles.errorBox,
              {
                backgroundColor: themeColors.fiori.semantic.negativeLight,
                borderLeftColor: themeColors.fiori.semantic.negative,
              },
            ]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={themeColors.fiori.semantic.negative}
              style={styles.errorIcon}
            />
            <View style={styles.errorContent}>
              <Text
                style={[
                  styles.errorLabel,
                  { color: themeColors.fiori.semantic.negative },
                ]}
              >
                Error Details:
              </Text>
              <Text
                style={[
                  styles.errorMessage,
                  { color: themeColors.fiori.text.primary },
                ]}
              >
                {error}
              </Text>
            </View>
          </View>
        )}

        {/* Info Box - Fiori Card style */}
        <View style={[styles.infoBox, { backgroundColor: themeColors.gray[50] }]}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={themeColors.fiori.text.secondary}
            style={styles.infoIcon}
          />
          <View style={styles.infoContent}>
            <Text
              style={[styles.infoTitle, { color: themeColors.fiori.text.primary }]}
            >
              What This Means
            </Text>
            <Text
              style={[styles.infoText, { color: themeColors.fiori.text.secondary }]}
            >
              • The app is using cached or hardcoded configuration{'\n'}
              • Some features might not be up to date{'\n'}
              • API keys might be outdated{'\n'}
              • Try connecting to the internet and retrying
            </Text>
          </View>
        </View>

        {/* Retry Button - Fiori Primary */}
        <Pressable
          style={({ pressed }) => [
            styles.retryButton,
            { backgroundColor: themeColors.primary },
            pressed && styles.buttonPressed,
            isRetrying && styles.buttonDisabled,
          ]}
          onPress={handleRetry}
          disabled={isRetrying}
          accessibilityRole="button"
          accessibilityLabel={isRetrying ? 'Retrying' : 'Retry loading configuration'}
        >
          {isRetrying ? (
            <ActivityIndicator size="small" color={themeColors.fiori.text.inverse} />
          ) : (
            <>
              <Ionicons
                name="refresh-outline"
                size={20}
                color={themeColors.fiori.text.inverse}
                style={styles.buttonIcon}
              />
              <Text
                style={[
                  styles.retryButtonText,
                  { color: themeColors.fiori.text.inverse },
                ]}
              >
                Retry
              </Text>
            </>
          )}
        </Pressable>

        {/* Continue Button - Fiori Tertiary */}
        <Pressable
          style={({ pressed }) => [
            styles.continueButton,
            pressed && { backgroundColor: themeColors.gray[100] },
          ]}
          onPress={() => {
            // User will proceed with app using fallback config
          }}
          accessibilityRole="button"
          accessibilityLabel="Continue with fallback configuration"
        >
          <Text style={[styles.continueButtonText, { color: themeColors.primary }]}>
            Continue Anyway
          </Text>
        </Pressable>
      </View>

      {/* Footer */}
      <View
        style={[styles.footer, { borderTopColor: themeColors.gray[200] }]}
      >
        <Text
          style={[styles.footerText, { color: themeColors.fiori.text.tertiary }]}
        >
          If this problem persists, please contact support.
        </Text>
      </View>
    </View>
  );
};

// ============================================================================
// Styles - SAP Fiori Design System
// Colors are applied dynamically in JSX for dark mode support
// ============================================================================
const styles = StyleSheet.create({
  // Container
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: FIORI.container.padding,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Illustration Container - 120x120pt per Fiori spec
  illustrationContainer: {
    width: FIORI.illustration.containerSize,
    height: FIORI.illustration.containerSize,
    borderRadius: FIORI.illustration.containerSize / 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: FIORI.spacing.illustrationToTitle,
  },

  // Title - 20pt Semibold
  title: {
    fontSize: FIORI.typography.title.fontSize,
    fontWeight: FIORI.typography.title.fontWeight,
    lineHeight: FIORI.typography.title.lineHeight,
    marginBottom: FIORI.spacing.titleToDescription,
    textAlign: 'center',
  },

  // Description - 14pt Regular
  description: {
    fontSize: FIORI.typography.description.fontSize,
    fontWeight: FIORI.typography.description.fontWeight,
    lineHeight: FIORI.typography.description.lineHeight,
    textAlign: 'center',
    marginBottom: FIORI.spacing.descriptionToContent,
    maxWidth: 320,
  },

  // Error Box - Fiori Negative semantic
  errorBox: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 12,
    marginBottom: FIORI.spacing.contentGap,
    width: '100%',
    borderLeftWidth: 4,
  },
  errorIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  errorContent: {
    flex: 1,
  },
  errorLabel: {
    fontSize: FIORI.typography.infoText.fontSize,
    fontWeight: '600',
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: FIORI.typography.infoText.fontSize,
    lineHeight: FIORI.typography.infoText.lineHeight,
  },

  // Info Box - Fiori Card style
  infoBox: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 12,
    marginBottom: FIORI.spacing.descriptionToContent,
    width: '100%',
  },
  infoIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: FIORI.typography.infoTitle.fontSize,
    fontWeight: FIORI.typography.infoTitle.fontWeight,
    marginBottom: 8,
  },
  infoText: {
    fontSize: FIORI.typography.infoText.fontSize,
    fontWeight: FIORI.typography.infoText.fontWeight,
    lineHeight: FIORI.typography.infoText.lineHeight,
  },

  // Retry Button - Fiori Primary Tint
  retryButton: {
    height: FIORI.button.height,
    width: '100%',
    borderRadius: FIORI.button.borderRadius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: FIORI.spacing.buttonGap,
    // Platform-specific shadows
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: 8,
  },
  retryButtonText: {
    fontSize: FIORI.button.fontSize,
    fontWeight: FIORI.button.fontWeight,
  },

  // Continue Button - Fiori Tertiary
  continueButton: {
    height: FIORI.button.height,
    width: '100%',
    borderRadius: FIORI.button.borderRadius,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    fontSize: FIORI.button.fontSize,
    fontWeight: FIORI.button.fontWeight,
  },

  // Footer
  footer: {
    paddingVertical: 20,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  footerText: {
    fontSize: FIORI.typography.footer.fontSize,
    fontWeight: FIORI.typography.footer.fontWeight,
  },
});

export default ConfigErrorScreen;
