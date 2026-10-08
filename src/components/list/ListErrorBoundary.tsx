/**
 * List Error Boundary Component
 *
 * Specialized error boundary for list components with retry functionality.
 * Wraps list components to catch rendering errors and provide recovery options.
 */

import type { ErrorInfo, ReactNode } from 'react';
import React, { Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
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
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Icon name="alert-circle-outline" size={48} color={theme.colors.semantic.error} />
      </View>
      <Text style={styles.title}>Unable to load {listName}</Text>
      <Text style={styles.message}>
        Something went wrong while displaying the list. Please try again.
      </Text>
      {__DEV__ && error && (
        <Text style={styles.errorDetail} numberOfLines={3}>
          {error.message}
        </Text>
      )}
      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.7}>
          <Icon name="refresh" size={18} color={theme.colors.white} />
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    backgroundColor: theme.colors.background,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.semantic.errorLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.gray[900],
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: theme.colors.gray[600],
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  errorDetail: {
    fontSize: 12,
    color: theme.colors.semantic.error,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    elevation: 2,
    shadowColor: theme.colors.gray[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.white,
  },
});

export default ListErrorBoundary;
