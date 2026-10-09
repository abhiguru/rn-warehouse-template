/**
 * SkeletonBox - Base animated skeleton component
 *
 * A pulsing placeholder block in surface.cardActive (docs/STYLE_GUIDE.md
 * §13.6). Text lines use radius.field. The pulse stops when the device's
 * Reduce Motion setting is on (§9).
 *
 * @module components/skeletons/SkeletonBox
 */

import React, { memo, useEffect } from 'react';
import { ViewStyle, DimensionValue } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useThemedStyles } from '@/hooks/useTheme';
import { radius } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

export interface SkeletonBoxProps {
  /** Width of the skeleton (number or percentage string) */
  width?: DimensionValue;
  /** Height of the skeleton */
  height?: number;
  /** Border radius */
  borderRadius?: number;
  /** Whether the skeleton is circular (uses height for width) */
  circular?: boolean;
  /** Custom style overrides */
  style?: ViewStyle;
}

const ANIMATION_DURATION = 1200;
const RESTING_OPACITY = 0.7;

const makeStyles = (t: ThemeTokens) => ({
  base: {
    overflow: 'hidden' as const,
    backgroundColor: t.surface.cardActive,
  },
});

export const SkeletonBox = memo<SkeletonBoxProps>(({
  width = '100%',
  height = 16,
  borderRadius = radius.field,
  circular = false,
  style,
}) => {
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReducedMotion();

  const opacity = useSharedValue(reduceMotion ? RESTING_OPACITY : 0.4);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(opacity);
      opacity.value = RESTING_OPACITY;
      return;
    }
    opacity.value = withRepeat(
      withTiming(1, {
        duration: ANIMATION_DURATION / 2,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const boxStyle: ViewStyle = {
    width: circular ? height : width,
    height,
    borderRadius: circular ? height / 2 : borderRadius,
  };

  return (
    <Animated.View
      style={[styles.base, boxStyle, animatedStyle, style]}
      accessible={false}
      importantForAccessibility="no"
    />
  );
});

SkeletonBox.displayName = 'SkeletonBox';

export default SkeletonBox;
