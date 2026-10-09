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

// ============================================================================
// TYPES
// ============================================================================

export type FeatureType = 'grn' | 'dispatch' | 'invoice' | 'order' | 'stock';

interface FeatureConfig {
  /** Name used inside sentences. */
  name: string;
  /** Plain-language cause and what to do next. */
  description: string;
  homeRoute: string;
  /** Label of the action that returns to the feature's list. */
  homeLabel: string;
}

const FEATURE_CONFIGS: Record<FeatureType, FeatureConfig> = {
  grn: {
    name: 'GRN',
    description: "Couldn't show this GRN. Try again, or go back to the GRN list.",
    homeRoute: '/grn',
    homeLabel: 'Go to GRNs',
  },
  dispatch: {
    name: 'dispatch',
    description: "Couldn't show this dispatch. Try again, or go back to the dispatch list.",
    homeRoute: '/dispatch',
    homeLabel: 'Go to dispatches',
  },
  invoice: {
    name: 'invoice',
    description: "Couldn't show this invoice. Try again, or go back to the invoice list.",
    homeRoute: '/invoices',
    homeLabel: 'Go to invoices',
  },
  order: {
    name: 'order',
    description: "Couldn't show this order. Try again, or go back to the order list.",
    homeRoute: '/',
    homeLabel: 'Go to orders',
  },
  stock: {
    name: 'stock',
    description: "Couldn't show stock. Try again, or go back to the stock overview.",
    homeRoute: '/stock',
    homeLabel: 'Go to stock',
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
          message={config.description}
          error={this.state.error}
          componentStack={this.state.errorInfo?.componentStack}
          onRetry={this.handleRetry}
          retryAccessibilityLabel={`Try loading the ${config.name} again`}
          secondaryActionLabel={config.homeLabel}
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
