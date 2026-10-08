/**
 * Feature Error Boundary Factory
 *
 * Creates feature-specific error boundaries with customized error messages
 * and recovery actions. Extends the base ErrorBoundary pattern.
 *
 * @module components/FeatureErrorBoundary
 */

import type { ErrorInfo, ReactNode } from 'react';
import React, { Component } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Href } from 'expo-router';
import { listColors } from '@/theme/listColors';
import { createLogger } from '@/utils/logger';

// ============================================================================
// SAP Fiori Design Constants
// ============================================================================
const FIORI = {
  container: { padding: 24 },
  illustration: { containerSize: 120, iconSize: 64 },
  typography: {
    title: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28 },
    description: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
    errorTitle: { fontSize: 13, fontWeight: '600' as const },
    errorText: { fontSize: 11, fontWeight: '400' as const },
  },
  button: {
    height: 44,
    borderRadius: 8,
    minWidth: 160,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  spacing: {
    illustrationToTitle: 24,
    titleToDescription: 8,
    descriptionToAction: 24,
    buttonGap: 12,
    errorDetailsGap: 24,
  },
} as const;

// ============================================================================
// TYPES
// ============================================================================

export type FeatureType = 'grn' | 'dispatch' | 'invoice' | 'order' | 'stock';

interface FeatureConfig {
  name: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  backgroundColor: string;
  homeRoute: string;
  retryLabel: string;
}

const FEATURE_CONFIGS: Record<FeatureType, FeatureConfig> = {
  grn: {
    name: 'GRN',
    title: 'GRN Error',
    description: 'Something went wrong while loading the Goods Receipt Note. Please try again or go back to the GRN list.',
    icon: 'cube-outline',
    iconColor: listColors.statusNegative,
    backgroundColor: listColors.statusNegativeLight,
    homeRoute: '/grn',
    retryLabel: 'Retry GRN',
  },
  dispatch: {
    name: 'Dispatch',
    title: 'Dispatch Error',
    description: 'Something went wrong while loading the dispatch information. Please try again or return to the dispatch list.',
    icon: 'send-outline',
    iconColor: listColors.statusNegative,
    backgroundColor: listColors.statusNegativeLight,
    homeRoute: '/dispatch',
    retryLabel: 'Retry Dispatch',
  },
  invoice: {
    name: 'Invoice',
    title: 'Invoice Error',
    description: 'Something went wrong while loading the invoice. Please try again or return to the invoices list.',
    icon: 'document-text-outline',
    iconColor: listColors.statusNegative,
    backgroundColor: listColors.statusNegativeLight,
    homeRoute: '/invoices',
    retryLabel: 'Retry Invoice',
  },
  order: {
    name: 'Order',
    title: 'Order Error',
    description: 'Something went wrong while loading the order. Please try again or return to the orders list.',
    icon: 'cart-outline',
    iconColor: listColors.statusNegative,
    backgroundColor: listColors.statusNegativeLight,
    homeRoute: '/',
    retryLabel: 'Retry Order',
  },
  stock: {
    name: 'Stock',
    title: 'Stock Error',
    description: 'Something went wrong while loading stock information. Please try again or return to stock overview.',
    icon: 'layers-outline',
    iconColor: listColors.statusNegative,
    backgroundColor: listColors.statusNegativeLight,
    homeRoute: '/stock',
    retryLabel: 'Retry Stock',
  },
};

// ============================================================================
// PROPS & STATE
// ============================================================================

interface FeatureErrorBoundaryProps {
  children: ReactNode;
  feature: FeatureType;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export class FeatureErrorBoundary extends Component<FeatureErrorBoundaryProps, State> {
  private logger = createLogger(`${this.props.feature.toUpperCase()}ErrorBoundary`);

  constructor(props: FeatureErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.logger.error('Caught error:', error);
    this.logger.error('Error info:', errorInfo);

    this.setState({ error, errorInfo });

    // Call optional error callback
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleGoBack = (): void => {
    const config = FEATURE_CONFIGS[this.props.feature];
    router.replace(config.homeRoute as Href);
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const config = FEATURE_CONFIGS[this.props.feature];

      return (
        <View style={styles.container}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            accessible={true}
            accessibilityLabel={`${config.name} error screen. ${config.description}`}
          >
            {/* Illustration */}
            <View
              style={[styles.illustrationContainer, { backgroundColor: config.backgroundColor }]}
              accessible={false}
            >
              <Ionicons name={config.icon} size={FIORI.illustration.iconSize} color={config.iconColor} />
            </View>

            {/* Title */}
            <Text style={styles.title} accessibilityRole="header">
              {config.title}
            </Text>

            {/* Description */}
            <Text style={styles.description}>{config.description}</Text>

            {/* Error Details (Dev Mode Only) */}
            {__DEV__ && this.state.error && (
              <View style={styles.errorDetails}>
                <Text style={styles.errorTitle}>Error Details (Dev Mode):</Text>
                <Text style={styles.errorMessage}>{this.state.error.toString()}</Text>
                {this.state.errorInfo && (
                  <Text style={styles.errorStack} numberOfLines={10}>
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.buttonRow}>
              <Pressable
                style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && styles.buttonPressed]}
                onPress={this.handleRetry}
                accessibilityRole="button"
                accessibilityLabel={config.retryLabel}
              >
                <Ionicons name="refresh-outline" size={20} color={listColors.white} style={styles.buttonIcon} />
                <Text style={styles.buttonTextPrimary}>Try Again</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.button, styles.buttonSecondary, pressed && styles.buttonPressed]}
                onPress={this.handleGoBack}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${config.name} list`}
              >
                <Ionicons name="arrow-back-outline" size={20} color={listColors.primary} style={styles.buttonIcon} />
                <Text style={styles.buttonTextSecondary}>Go Back</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// CONVENIENCE COMPONENTS
// ============================================================================

export const GRNErrorBoundary: React.FC<Omit<FeatureErrorBoundaryProps, 'feature'>> = (props) => (
  <FeatureErrorBoundary {...props} feature="grn" />
);

export const DispatchErrorBoundary: React.FC<Omit<FeatureErrorBoundaryProps, 'feature'>> = (props) => (
  <FeatureErrorBoundary {...props} feature="dispatch" />
);

export const InvoiceErrorBoundary: React.FC<Omit<FeatureErrorBoundaryProps, 'feature'>> = (props) => (
  <FeatureErrorBoundary {...props} feature="invoice" />
);

export const OrderErrorBoundary: React.FC<Omit<FeatureErrorBoundaryProps, 'feature'>> = (props) => (
  <FeatureErrorBoundary {...props} feature="order" />
);

export const StockErrorBoundary: React.FC<Omit<FeatureErrorBoundaryProps, 'feature'>> = (props) => (
  <FeatureErrorBoundary {...props} feature="stock" />
);

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: listColors.white,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: FIORI.container.padding,
  },
  illustrationContainer: {
    width: FIORI.illustration.containerSize,
    height: FIORI.illustration.containerSize,
    borderRadius: FIORI.illustration.containerSize / 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: FIORI.spacing.illustrationToTitle,
  },
  title: {
    fontSize: FIORI.typography.title.fontSize,
    fontWeight: FIORI.typography.title.fontWeight,
    lineHeight: FIORI.typography.title.lineHeight,
    color: listColors.textPrimary,
    marginBottom: FIORI.spacing.titleToDescription,
    textAlign: 'center',
  },
  description: {
    fontSize: FIORI.typography.description.fontSize,
    fontWeight: FIORI.typography.description.fontWeight,
    lineHeight: FIORI.typography.description.lineHeight,
    color: listColors.textSecondary,
    marginBottom: FIORI.spacing.descriptionToAction,
    textAlign: 'center',
    maxWidth: 320,
  },
  errorDetails: {
    width: '100%',
    backgroundColor: listColors.gray50,
    borderRadius: 8,
    padding: 16,
    marginBottom: FIORI.spacing.errorDetailsGap,
    borderWidth: 1,
    borderColor: listColors.statusNegativeBorder,
  },
  errorTitle: {
    fontSize: FIORI.typography.errorTitle.fontSize,
    fontWeight: FIORI.typography.errorTitle.fontWeight,
    color: listColors.textPrimary,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: FIORI.typography.errorText.fontSize,
    fontWeight: FIORI.typography.errorText.fontWeight,
    color: listColors.statusNegative,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    marginBottom: 12,
  },
  errorStack: {
    fontSize: FIORI.typography.errorText.fontSize,
    color: listColors.textSecondary,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  buttonRow: {
    flexDirection: 'row',
    gap: FIORI.spacing.buttonGap,
  },
  button: {
    height: FIORI.button.height,
    minWidth: FIORI.button.minWidth,
    borderRadius: FIORI.button.borderRadius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  buttonPrimary: {
    backgroundColor: listColors.primary,
    ...Platform.select({
      ios: {
        shadowColor: listColors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  buttonSecondary: {
    backgroundColor: listColors.white,
    borderWidth: 1,
    borderColor: listColors.primary,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonTextPrimary: {
    fontSize: FIORI.button.fontSize,
    fontWeight: FIORI.button.fontWeight,
    color: listColors.white,
  },
  buttonTextSecondary: {
    fontSize: FIORI.button.fontSize,
    fontWeight: FIORI.button.fontWeight,
    color: listColors.primary,
  },
});

export default FeatureErrorBoundary;
