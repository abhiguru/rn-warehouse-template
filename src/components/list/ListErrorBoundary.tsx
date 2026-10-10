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
import { t } from '@/i18n';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ListErrorBoundary');

/** The lists that have texts of their own, by the English name the callers pass. A key, not a text. */
const LIST_NAMES = { items: 'items', invoices: 'invoices', dispatches: 'dispatches', 'GRN items': 'grnItems' } as const;
const isListName = (name: string): name is keyof typeof LIST_NAMES => Object.prototype.hasOwnProperty.call(LIST_NAMES, name);

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
    // A name without texts of its own (none in the app today) is worded in English, as before.
    message={isListName(listName) ? t(`lists.errorBoundary.${LIST_NAMES[listName]}.message`) : `Couldn't show the ${listName}. Try again.`}
    error={error}
    onRetry={onRetry}
    retryAccessibilityLabel={isListName(listName) ? t(`lists.errorBoundary.${LIST_NAMES[listName]}.retry`) : `Try loading the ${listName} again`}
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
