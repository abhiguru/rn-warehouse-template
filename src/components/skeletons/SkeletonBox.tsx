/**
 * SkeletonBox - Base animated skeleton component
 *
 * Provides a pulsing animated placeholder box that can be used
 * to build custom skeleton layouts.
 *
 * @module components/skeletons/SkeletonBox
 */

import React, { memo, useEffect } from 'react';
import { StyleSheet, ViewStyle, DimensionValue } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useListColors } from '@/hooks/useListColors';

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

export const SkeletonBox = memo<SkeletonBoxProps>(({
  width = '100%',
  height = 16,
  borderRadius = 4,
  circular = false,
  style,
}) => {
  const colors = useListColors();

  // Use consistent colors from useListColors hook
  const skeletonColor = colors.gray200;

  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, {
        duration: ANIMATION_DURATION / 2,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const boxStyle: ViewStyle = {
    width: circular ? height : width,
    height,
    borderRadius: circular ? height / 2 : borderRadius,
    backgroundColor: skeletonColor,
  };

  return (
    <Animated.View
      style={[styles.base, boxStyle, animatedStyle, style]}
      accessible={false}
    />
  );
});

SkeletonBox.displayName = 'SkeletonBox';

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});

export default SkeletonBox;
