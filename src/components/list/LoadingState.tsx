/**
 * LoadingState - Reusable loading state component
 *
 * A centred spinner in brand.tint with an optional message in
 * text.secondary (docs/STYLE_GUIDE.md §13.6). Use it only for short waits of
 * unknown length; lists and object pages use skeletons instead.
 * M14 Fix: DRY violation - loading pattern repeated 10+ times
 */

import React, { memo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

export interface LoadingStateProps {
  /** Loading message to display */
  message?: string;
  /** Size of the activity indicator */
  size?: 'small' | 'large';
  /** Color of the activity indicator (defaults to brand.tint) */
  color?: string;
  /** Whether to show in full screen mode (flex: 1) */
  fullScreen?: boolean;
  /** Test ID for testing */
  testID?: string;
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: space.xxl,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  message: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginTop: space.lg,
  },
});

export const LoadingState = memo<LoadingStateProps>(({
  message = 'Loading…',
  size = 'large',
  color,
  fullScreen = true,
  testID,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const indicatorColor = color || t.brand.tint;

  return (
    <View
      style={[styles.container, fullScreen && styles.fullScreen]}
      accessible={true}
      accessibilityLabel={message || 'Loading'}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      testID={testID}
    >
      <ActivityIndicator
        size={size}
        color={indicatorColor}
        accessibilityElementsHidden={true}
      />
      {!!message && (
        <Text style={styles.message}>
          {message}
        </Text>
      )}
    </View>
  );
});

LoadingState.displayName = 'LoadingState';

export default LoadingState;
