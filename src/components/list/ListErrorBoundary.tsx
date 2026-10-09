/**
 * List Error Boundary Component
 *
 * Specialized error boundary for list components with retry functionality.
 * Wraps list components to catch rendering errors and provide recovery options.
 * Uses the shared error state (docs/STYLE_GUIDE.md §13.6).
 */

import type { ErrorInfo, ReactNode } from 'react';
import React, { Component } from 'react';
import { ErrorStateView } from '@/components/ErrorBoundary';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ListErrorBoundary');

interface ListErrorFallbackProps {
  error?: Error | null;
  onRetry?: () => void;
  listName?: string;
}

/**
 * Fallback UI displayed when a list component encounters an error
 */
export const ListErrorFallback: React.FC<ListErrorFallbackProps> = ({
  error,
  onRetry,
  listName = 'items',
}) => (
  <ErrorStateView
    presentation="inline"
    message={`Couldn't show the ${listName}. Try again.`}
    error={error}
    onRetry={onRetry}
    retryAccessibilityLabel={`Try loading the ${listName} again`}
  />
);

interface Props {
  children: ReactNode;
  onRetry?: () => void;
  listName?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary specifically designed for list components
 */
export class ListErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
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
    logger.error('List rendering error:', error);
    logger.error('Component stack:', errorInfo);

    this.setState({
      error,
      errorInfo,
    });
  }

  handleRetry = (): void => {
    // Reset error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    // Call external retry handler if provided
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback provided by parent
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default list error fallback
      return (
        <ListErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
          listName={this.props.listName}
        />
      );
    }

    return this.props.children;
  }
}

export default ListErrorBoundary;
