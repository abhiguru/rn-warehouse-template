/**
 * FioriLinearProgress Component - 100% SAP Fiori Compliant
 *
 * Based on SAP Fiori for iOS Design Guidelines
 * @see design/sap-fiori-specs/19-linear-progress-indicator.md
 *
 * Features:
 * - Determinate progress with percentage
 * - Indeterminate animated progress
 * - Segmented progress for multi-category display
 * - Semantic color variants (success, warning, error, info)
 * - Accessible with proper ARIA attributes
 * - Platform-specific optimizations
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  ViewStyle,
  AccessibilityInfo,
} from 'react-native';

// ============================================================================
// FIORI DESIGN TOKENS
// Based on design/sap-fiori-specs/19-linear-progress-indicator.md
// ============================================================================
const FIORI = {
  track: {
    height: 4,
    heightProminent: 8,
    backgroundColor: '#E5E5E5',
  },
  indicator: {
    default: '#f69000',
    success: '#53b1b1',
    warning: '#f6c624',
    error: '#D32030',
    info: '#0057D2',
  },
  trackBackground: {
    default: '#E5E5E5',
    success: '#e8f4f4',
    warning: '#fef3c7',
    error: '#FFF4F2',
    info: '#EBF8FF',
  },
  typography: {
    label: {
      fontSize: 13,
      fontWeight: '400' as const,
      color: '#556B82',
    },
    percentage: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: '#1D2D3E',
    },
  },
  animation: {
    duration: 300,
    indeterminateDuration: 1500,
  },
} as const;

// ============================================================================
// TYPES
// ============================================================================
export type ProgressVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
export type ProgressSize = 'default' | 'prominent';

export interface LinearProgressProps {
  /** Progress value from 0 to 1 (for determinate) */
  progress?: number;
  /** Color variant */
  variant?: ProgressVariant;
  /** Size variant */
  size?: ProgressSize;
  /** Optional label text */
  label?: string;
  /** Show percentage text */
  showPercentage?: boolean;
  /** Indeterminate mode (animating) */
  indeterminate?: boolean;
  /** Use colored track background */
  coloredTrack?: boolean;
  /** Additional container style */
  style?: ViewStyle;
  /** Accessibility label */
  accessibilityLabel?: string;
}

export interface SegmentedProgressProps {
  /** Segments with value and color */
  segments: Array<{
    value: number;
    color: string;
    label?: string;
  }>;
  /** Total value (denominator) */
  total: number;
  /** Size variant */
  size?: ProgressSize;
  /** Show segment labels */
  showLabels?: boolean;
  /** Labels position */
  labelsPosition?: 'top' | 'bottom';
  /** Additional container style */
  style?: ViewStyle;
}

// ============================================================================
// LINEAR PROGRESS COMPONENT (Determinate/Indeterminate)
// ============================================================================
export const FioriLinearProgress: React.FC<LinearProgressProps> = ({
  progress = 0,
  variant = 'default',
  size = 'default',
  label,
  showPercentage = false,
  indeterminate = false,
  coloredTrack = false,
  style,
  accessibilityLabel,
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const indeterminateAnim = useRef(new Animated.Value(0)).current;

  // Clamp progress between 0 and 1
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const percentage = Math.round(clampedProgress * 100);

  const trackHeight = size === 'prominent' ? FIORI.track.heightProminent : FIORI.track.height;
  const borderRadius = trackHeight / 2;
  const indicatorColor = FIORI.indicator[variant];
  const trackBgColor = coloredTrack ? FIORI.trackBackground[variant] : FIORI.track.backgroundColor;

  // Animate determinate progress
  useEffect(() => {
    if (!indeterminate) {
      Animated.timing(animatedValue, {
        toValue: clampedProgress,
        duration: FIORI.animation.duration,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    }
  }, [clampedProgress, indeterminate, animatedValue]);

  // Animate indeterminate progress
  useEffect(() => {
    if (indeterminate) {
      const animation = Animated.loop(
        Animated.timing(indeterminateAnim, {
          toValue: 1,
          duration: FIORI.animation.indeterminateDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        })
      );
      animation.start();

      return () => animation.stop();
    }
  }, [indeterminate, indeterminateAnim]);

  // Calculate animated width
  const animatedWidth = indeterminate
    ? indeterminateAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['0%', '50%', '0%'],
      })
    : animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
      });

  // Calculate animated position for indeterminate
  const animatedLeft = indeterminate
    ? indeterminateAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['0%', '25%', '100%'],
      })
    : '0%';

  // Accessibility
  const a11yLabel = accessibilityLabel || label || (indeterminate ? 'Loading in progress' : `Progress: ${percentage}%`);

  return (
    <View
      style={[styles.container, style]}
      accessible={true}
      accessibilityRole="progressbar"
      accessibilityLabel={a11yLabel}
      accessibilityValue={indeterminate ? undefined : { min: 0, max: 100, now: percentage }}
    >
      {/* Label Row */}
      {(label || showPercentage) && (
        <View style={styles.labelRow}>
          {label && <Text style={styles.label}>{label}</Text>}
          {showPercentage && !indeterminate && (
            <Text style={styles.percentage}>{percentage}%</Text>
          )}
        </View>
      )}

      {/* Track */}
      <View
        style={[
          styles.track,
          {
            height: trackHeight,
            borderRadius,
            backgroundColor: trackBgColor,
          },
        ]}
      >
        {/* Indicator */}
        <Animated.View
          style={[
            styles.indicator,
            {
              width: animatedWidth,
              left: animatedLeft,
              backgroundColor: indicatorColor,
              borderRadius,
            },
          ]}
        />
      </View>
    </View>
  );
};

// ============================================================================
// SEGMENTED PROGRESS COMPONENT
// ============================================================================
export const FioriSegmentedProgress: React.FC<SegmentedProgressProps> = ({
  segments,
  total,
  size = 'default',
  showLabels = false,
  labelsPosition = 'top',
  style,
}) => {
  const trackHeight = size === 'prominent' ? FIORI.track.heightProminent : FIORI.track.height;
  const borderRadius = trackHeight / 2;

  // Calculate percentages for accessibility
  const segmentPercentages = segments.map(seg => ({
    ...seg,
    percentage: total > 0 ? Math.round((seg.value / total) * 100) : 0,
  }));

  const a11yLabel = segmentPercentages
    .filter(seg => seg.label)
    .map(seg => `${seg.label}: ${seg.percentage}%`)
    .join(', ');

  // Render labels
  const renderLabels = () => (
    <View style={styles.segmentLabelsRow}>
      {segmentPercentages.map((segment, index) => (
        segment.label && (
          <View key={index} style={styles.segmentLabelItem}>
            <View style={[styles.segmentLabelDot, { backgroundColor: segment.color }]} />
            <Text style={styles.label}>
              {segment.label}: <Text style={styles.percentage}>{segment.percentage}%</Text>
            </Text>
          </View>
        )
      ))}
    </View>
  );

  return (
    <View
      style={[styles.container, style]}
      accessible={true}
      accessibilityRole="progressbar"
      accessibilityLabel={a11yLabel || 'Segmented progress'}
    >
      {/* Labels (top) */}
      {showLabels && labelsPosition === 'top' && renderLabels()}

      {/* Track */}
      <View
        style={[
          styles.track,
          styles.segmentedTrack,
          {
            height: trackHeight,
            borderRadius,
            backgroundColor: FIORI.track.backgroundColor,
          },
        ]}
      >
        {segments.map((segment, index) => {
          if (segment.value <= 0 || total <= 0) return null;

          return (
            <View
              key={index}
              style={[
                styles.segment,
                {
                  flex: segment.value,
                  backgroundColor: segment.color,
                },
                // First segment gets left border radius
                index === 0 && { borderTopLeftRadius: borderRadius, borderBottomLeftRadius: borderRadius },
                // Last segment (if it fills remaining) gets right border radius
                index === segments.length - 1 && { borderTopRightRadius: borderRadius, borderBottomRightRadius: borderRadius },
              ]}
            />
          );
        })}
      </View>

      {/* Labels (bottom) */}
      {showLabels && labelsPosition === 'bottom' && renderLabels()}
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: {
    width: '100%',
  },

  // Label Row
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    ...FIORI.typography.label,
  },
  percentage: {
    ...FIORI.typography.percentage,
  },

  // Track
  track: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  segmentedTrack: {
    flexDirection: 'row',
  },

  // Indicator (for determinate/indeterminate)
  indicator: {
    height: '100%',
    position: 'absolute',
    top: 0,
  },

  // Segment (for segmented progress)
  segment: {
    height: '100%',
  },

  // Segment Labels
  segmentLabelsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginVertical: 6,
  },
  segmentLabelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmentLabelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

// ============================================================================
// DEFAULT EXPORT
// ============================================================================
export default FioriLinearProgress;
