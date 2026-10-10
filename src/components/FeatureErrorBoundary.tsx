/**
 * Feature Error Boundary Factory
 *
 * Creates feature-specific error boundaries with customized error messages
 * and recovery actions. Uses the shared error state from ErrorBoundary
 * (docs/STYLE_GUIDE.md §13.6).
 *
 * @module components/FeatureErrorBoundary
 */

import type { ErrorInfo, ReactNode } from 'react';
import React, { Component } from 'react';
import { router, Href } from 'expo-router';
import { ErrorStateView } from '@/components/ErrorBoundary';
import { createLogger } from '@/utils/logger';
import { t, type TranslationKey } from '@/i18n';

// ============================================================================
// TYPES
// ============================================================================

export type FeatureType = 'grn' | 'dispatch' | 'invoice' | 'order' | 'stock';

interface FeatureConfig {
  /** Key of the plain-language cause and what to do next. */
  description: TranslationKey;
  homeRoute: string;
  /** Key of the label of the action that returns to the feature's list. */
  homeLabel: TranslationKey;
  /** Key of the spoken label of the retry button. */
  retryLabel: TranslationKey;
}

const FEATURE_CONFIGS: Record<FeatureType, FeatureConfig> = {
  grn: {
    description: 'components.featureError.grn.description',
    homeRoute: '/grn',
    homeLabel: 'components.featureError.grn.homeLabel',
    retryLabel: 'components.featureError.grn.retryLabel',
  },
  dispatch: {
    description: 'components.featureError.dispatch.description',
    homeRoute: '/dispatch',
    homeLabel: 'components.featureError.dispatch.homeLabel',
    retryLabel: 'components.featureError.dispatch.retryLabel',
  },
  invoice: {
    description: 'components.featureError.invoice.description',
    homeRoute: '/invoices',
    homeLabel: 'components.featureError.invoice.homeLabel',
    retryLabel: 'components.featureError.invoice.retryLabel',
  },
  order: {
    description: 'components.featureError.order.description',
    homeRoute: '/',
    homeLabel: 'components.featureError.order.homeLabel',
    retryLabel: 'components.featureError.order.retryLabel',
  },
  stock: {
    description: 'components.featureError.stock.description',
    homeRoute: '/stock',
    homeLabel: 'components.featureError.stock.homeLabel',
    retryLabel: 'components.featureError.stock.retryLabel',
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
        <ErrorStateView
          message={t(config.description)}
          error={this.state.error}
          componentStack={this.state.errorInfo?.componentStack}
          onRetry={this.handleRetry}
          retryAccessibilityLabel={t(config.retryLabel)}
          secondaryActionLabel={t(config.homeLabel)}
          onSecondaryAction={this.handleGoBack}
        />
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

export default FeatureErrorBoundary;
