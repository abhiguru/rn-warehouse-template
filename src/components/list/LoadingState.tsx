/**
 * LoadingState - Reusable loading state component
 *
 * SAP Fiori Design System - Loading State Component
 * M14 Fix: DRY violation - loading pattern repeated 10+ times
 *
 * Provides consistent loading UI across the app.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { listColors } from '@/theme/listColors';

// ============================================================================
// SAP Fiori Design Constants
// ============================================================================
const FIORI = {
  container: {
    padding: 24,
  },
  indicator: {
    size: 'large' as const,
  },
  typography: {
    message: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  },
  spacing: {
    indicatorToMessage: 16,
  },
} as const;

export interface LoadingStateProps {
  /** Loading message to display */
  message?: string;
  /** Size of the activity indicator */
  size?: 'small' | 'large';
  /** Color of the activity indicator (defaults to theme primary) */
  color?: string;
  /** Whether to show in full screen mode (flex: 1) */
  fullScreen?: boolean;
  /** Test ID for testing */
  testID?: string;
}

export const LoadingState = memo<LoadingStateProps>(({
  message = 'Loading...',
  size = 'large',
  color,
  fullScreen = true,
  testID,
}) => {
  const indicatorColor = color || listColors.primary;

  return (
    <View
      style={[styles.container, fullScreen && styles.fullScreen]}
      accessible={true}
      accessibilityLabel={message}
      accessibilityRole="progressbar"
      testID={testID}
    >
      <ActivityIndicator
        size={size}
        color={indicatorColor}
        accessibilityElementsHidden={true}
      />
      {message && (
        <Text style={styles.message}>
          {message}
        </Text>
      )}
    </View>
  );
});

LoadingState.displayName = 'LoadingState';

// ============================================================================
// Styles - SAP Fiori Design System
// ============================================================================
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: FIORI.container.padding,
  },
  fullScreen: {
    flex: 1,
  },
  message: {
    fontSize: FIORI.typography.message.fontSize,
    fontWeight: FIORI.typography.message.fontWeight,
    lineHeight: FIORI.typography.message.lineHeight,
    color: listColors.textSecondary,
    textAlign: 'center',
    marginTop: FIORI.spacing.indicatorToMessage,
  },
});

export default LoadingState;
