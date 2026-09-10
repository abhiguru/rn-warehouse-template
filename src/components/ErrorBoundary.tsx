/**
 * Error Boundary Component
 *
 * SAP Fiori Design System - Error/Empty State Component
 * Spec: design/sap-fiori-specs/12-empty-state.md
 *
 * Catches JavaScript errors anywhere in the component tree and displays a fallback UI.
 * Prevents the entire app from crashing due to component errors.
 */

import type { ErrorInfo, ReactNode } from 'react';
import React, { Component } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  Appearance,
  type ColorSchemeName,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, darkColors, type Colors } from '@/theme';
import { createLogger } from '@/utils/logger';
import { captureException } from '@/config/sentryConfig';

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
    errorTitle: { fontSize: 13, fontWeight: '600' as const },
    errorText: { fontSize: 11, fontWeight: '400' as const },
  },
  // Button
  button: {
    height: 44,
    borderRadius: 8,
    minWidth: 160,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  // Spacing
  spacing: {
    illustrationToTitle: 24,
    titleToDescription: 8,
    descriptionToAction: 24,
    errorDetailsGap: 24,
  },
} as const;

const errorBoundaryLogger = createLogger('ErrorBoundary');

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isDark: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  private appearanceSubscription: ReturnType<typeof Appearance.addChangeListener> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isDark: Appearance.getColorScheme() === 'dark',
    };
  }

  componentDidMount(): void {
    // Subscribe to appearance changes
    this.appearanceSubscription = Appearance.addChangeListener(({ colorScheme }) => {
      this.setState({ isDark: colorScheme === 'dark' });
    });
  }

  componentWillUnmount(): void {
    // Clean up subscription
    if (this.appearanceSubscription) {
      this.appearanceSubscription.remove();
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error details for debugging
    errorBoundaryLogger.error('Caught error:', error);
    errorBoundaryLogger.error('Error info:', errorInfo);

    // Send to GlitchTip crash reporting
    captureException(error, {
      componentStack: errorInfo.componentStack,
      source: 'ErrorBoundary',
    });

    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI provided by parent
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Get theme colors based on current color scheme
      const themeColors = this.state.isDark ? darkColors : colors;

      // Default fallback UI - Fiori Empty State pattern
      return (
        <View style={[styles.container, { backgroundColor: themeColors.white }]}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            accessible={true}
            accessibilityLabel="Error screen. Something went wrong. Please try again."
          >
            {/* Illustration - Fiori Error State */}
            <View
              style={[
                styles.illustrationContainer,
                { backgroundColor: themeColors.fiori.semantic.negativeLight },
              ]}
              accessible={false}
            >
              <Ionicons
                name="alert-circle-outline"
                size={FIORI.illustration.iconSize}
                color={themeColors.fiori.semantic.negative}
              />
            </View>

            {/* Title */}
            <Text
              style={[styles.title, { color: themeColors.fiori.text.primary }]}
              accessibilityRole="header"
            >
              Something went wrong
            </Text>

            {/* Description */}
            <Text
              style={[styles.description, { color: themeColors.fiori.text.secondary }]}
            >
              The app encountered an unexpected error. Please try again.
            </Text>

            {/* Error Details (Dev Mode Only) */}
            {__DEV__ && this.state.error && (
              <View
                style={[
                  styles.errorDetails,
                  {
                    backgroundColor: themeColors.gray[50],
                    borderColor: themeColors.fiori.semantic.negativeBorder,
                  },
                ]}
              >
                <Text
                  style={[styles.errorTitle, { color: themeColors.fiori.text.primary }]}
                >
                  Error Details (Dev Mode Only):
                </Text>
                <Text
                  style={[
                    styles.errorMessage,
                    { color: themeColors.fiori.semantic.negative },
                  ]}
                >
                  {this.state.error.toString()}
                </Text>
                {this.state.errorInfo && (
                  <Text
                    style={[
                      styles.errorStack,
                      { color: themeColors.fiori.text.secondary },
                    ]}
                  >
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </View>
            )}

            {/* Action Button - Fiori Primary */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: themeColors.primary },
                pressed && styles.buttonPressed,
              ]}
              onPress={this.handleReset}
              accessibilityRole="button"
              accessibilityLabel="Try Again"
              accessibilityHint="Tap to reload the screen"
            >
              <Ionicons
                name="refresh-outline"
                size={20}
                color={themeColors.fiori.text.inverse}
                style={styles.buttonIcon}
              />
              <Text
                style={[styles.buttonText, { color: themeColors.fiori.text.inverse }]}
              >
                Try Again
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// Styles - SAP Fiori Design System
// Colors are applied dynamically in render() for dark mode support
// ============================================================================
const styles = StyleSheet.create({
  // Container
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: FIORI.container.padding,
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
    marginBottom: FIORI.spacing.descriptionToAction,
    textAlign: 'center',
    maxWidth: 320,
  },

  // Error Details Container (Dev Mode)
  errorDetails: {
    width: '100%',
    borderRadius: 8,
    padding: 16,
    marginBottom: FIORI.spacing.errorDetailsGap,
    borderWidth: 1,
  },
  errorTitle: {
    fontSize: FIORI.typography.errorTitle.fontSize,
    fontWeight: FIORI.typography.errorTitle.fontWeight,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: FIORI.typography.errorText.fontSize,
    fontWeight: FIORI.typography.errorText.fontWeight,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    marginBottom: 12,
  },
  errorStack: {
    fontSize: FIORI.typography.errorText.fontSize,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },

  // Button - Fiori Primary Tint
  button: {
    height: FIORI.button.height,
    minWidth: FIORI.button.minWidth,
    borderRadius: FIORI.button.borderRadius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
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
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    fontSize: FIORI.button.fontSize,
    fontWeight: FIORI.button.fontWeight,
  },
});
