import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Dimensions, LayoutChangeEvent } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import theme from '@/theme';

interface SwipeableFormStepProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void; // Next step
  onSwipeRight?: () => void; // Previous step
  canSwipeLeft?: boolean;
  canSwipeRight?: boolean;
  edgeActivationWidth?: number; // Optional width in px for edge-only activation
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BASE_SWIPE_THRESHOLD = 50; // Reduced from 80 for faster trigger
const SWIPE_VELOCITY_THRESHOLD = 300; // Velocity in px/s for quick flicks
const INDICATOR_WIDTH = 60; // Slightly smaller for snappier feel

// Optimized spring config for snappy feel
const SPRING_CONFIG = {
  damping: 20,
  stiffness: 300,
  mass: 0.5,
};

// Fast timing config for resets
const FAST_TIMING = {
  duration: 120,
  easing: Easing.out(Easing.cubic),
};

export default function SwipeableFormStep({
  children,
  onSwipeLeft,
  onSwipeRight,
  canSwipeLeft = false,
  canSwipeRight = false,
  edgeActivationWidth,
}: SwipeableFormStepProps) {
  const translateX = useSharedValue(0);
  const leftIndicatorOpacity = useSharedValue(0);
  const rightIndicatorOpacity = useSharedValue(0);
  const isGestureActive = useSharedValue(edgeActivationWidth ? false : true);
  const allowedDirection = useSharedValue<'both' | 'left' | 'right'>('both');
  const edgeWidth = edgeActivationWidth && edgeActivationWidth > 0 ? edgeActivationWidth : 0;
  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH);
  const swipeThreshold = edgeWidth ? BASE_SWIPE_THRESHOLD * 0.6 : BASE_SWIPE_THRESHOLD;
  // More responsive activation - reduced from [-30, 30] to [-15, 15]
  const activeOffsetX: [number, number] = edgeWidth ? [-8, 8] : [-15, 15];

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width && width !== containerWidth) {
      setContainerWidth(width);
    }
  }, [containerWidth]);

  const handleSwipeLeft = () => {
    if (onSwipeLeft && canSwipeLeft) {
      onSwipeLeft();
    }
  };

  const handleSwipeRight = () => {
    if (onSwipeRight && canSwipeRight) {
      onSwipeRight();
    }
  };

  const panGesture = Gesture.Pan()
    // Make gesture directional - only activate for horizontal swipes
    .activeOffsetX(activeOffsetX)
    .failOffsetY([-15, 15]) // Fail if vertical movement exceeds ±15px first
    .enableTrackpadTwoFingerGesture(false) // Disable trackpad gestures
    .onTouchesDown((event) => {
      if (!edgeWidth) {
        isGestureActive.value = true;
        allowedDirection.value = 'both';
        return;
      }

      const firstTouch = event.allTouches?.[0];
      if (!firstTouch) return;

      const nearLeftEdge = canSwipeRight && firstTouch.x <= edgeWidth;
      const nearRightEdge = canSwipeLeft && firstTouch.x >= containerWidth - edgeWidth;

      if (nearLeftEdge) {
        isGestureActive.value = true;
        allowedDirection.value = 'right';
      } else if (nearRightEdge) {
        isGestureActive.value = true;
        allowedDirection.value = 'left';
      } else {
        isGestureActive.value = false;
      }
    })
    .onUpdate((event) => {
      if (!isGestureActive.value) {
        return;
      }
      const dx = event.translationX;

      if (
        (allowedDirection.value === 'right' && dx < 0) ||
        (allowedDirection.value === 'left' && dx > 0)
      ) {
        // User started on an edge but moved in the wrong direction
        translateX.value = 0;
        leftIndicatorOpacity.value = 0;
        rightIndicatorOpacity.value = 0;
        return;
      }

      // Update translation
      translateX.value = dx;

      // Update indicator opacity based on swipe distance - more responsive
      if (dx > 0 && canSwipeRight) {
        // Swiping right (go to previous step)
        const progress = Math.min(dx / swipeThreshold, 1);
        leftIndicatorOpacity.value = progress * 0.5; // Increased from 0.3 for better visibility
        rightIndicatorOpacity.value = 0;
      } else if (dx < 0 && canSwipeLeft) {
        // Swiping left (go to next step)
        const progress = Math.min(Math.abs(dx) / swipeThreshold, 1);
        rightIndicatorOpacity.value = progress * 0.5; // Increased from 0.3 for better visibility
        leftIndicatorOpacity.value = 0;
      } else {
        // Not allowed to swipe in this direction
        leftIndicatorOpacity.value = 0;
        rightIndicatorOpacity.value = 0;
      }
    })
    .onEnd((event) => {
      if (!isGestureActive.value) {
        translateX.value = withSpring(0, SPRING_CONFIG);
        leftIndicatorOpacity.value = withTiming(0, FAST_TIMING);
        rightIndicatorOpacity.value = withTiming(0, FAST_TIMING);
        return;
      }
      const dx = event.translationX;
      const velocityX = event.velocityX;

      // Check if threshold met - either distance OR velocity (for quick flicks)
      const thresholdMet = Math.abs(dx) > swipeThreshold;
      const velocityMet = Math.abs(velocityX) > SWIPE_VELOCITY_THRESHOLD;

      if (thresholdMet || velocityMet) {
        if (dx > 0 && canSwipeRight) {
          // Swipe right - go to previous step
          runOnJS(handleSwipeRight)();
        } else if (dx < 0 && canSwipeLeft) {
          // Swipe left - go to next step
          runOnJS(handleSwipeLeft)();
        }
      }

      // Reset animations with spring for snappy feel
      translateX.value = withSpring(0, SPRING_CONFIG);
      leftIndicatorOpacity.value = withTiming(0, FAST_TIMING);
      rightIndicatorOpacity.value = withTiming(0, FAST_TIMING);
    })
    .onFinalize(() => {
      if (edgeWidth) {
        isGestureActive.value = false;
        allowedDirection.value = 'both';
      }
    });

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value * 0.15 }], // Increased parallax for more feedback
  }));

  const leftIndicatorAnimatedStyle = useAnimatedStyle(() => ({
    opacity: leftIndicatorOpacity.value,
  }));

  const rightIndicatorAnimatedStyle = useAnimatedStyle(() => ({
    opacity: rightIndicatorOpacity.value,
  }));

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {/* Left Edge Indicator (Previous Step) */}
      {canSwipeRight && (
        <Animated.View
          style={[styles.leftIndicator, leftIndicatorAnimatedStyle]}
          pointerEvents="none"
        >
          <Ionicons name="chevron-back" size={32} color={theme.colors.white} />
        </Animated.View>
      )}

      {/* Right Edge Indicator (Next Step) */}
      {canSwipeLeft && (
        <Animated.View
          style={[styles.rightIndicator, rightIndicatorAnimatedStyle]}
          pointerEvents="none"
        >
          <Ionicons name="chevron-forward" size={32} color={theme.colors.white} />
        </Animated.View>
      )}

      {/* Swipeable Content */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.content, containerAnimatedStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  content: {
    flex: 1,
  },
  leftIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: INDICATOR_WIDTH,
    backgroundColor: theme.colors.blue[600], // Slightly darker for better visibility
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    pointerEvents: 'none',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  rightIndicator: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: INDICATOR_WIDTH,
    backgroundColor: theme.colors.green[600], // Slightly darker for better visibility
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    pointerEvents: 'none',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
});
