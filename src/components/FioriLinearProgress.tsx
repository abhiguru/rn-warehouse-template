/**
 * FioriLinearProgress Component - 100% SAP Fiori Compliant
 *
 * Based on SAP Fiori for iOS Design Guidelines
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
  Animated,
  Easing,
  ViewStyle,
  AccessibilityInfo,
} from 'react-native';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, motion, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { localizeDigits, t as tr } from '@/i18n';

// ============================================================================
// SIZES (style guide §13.5: 4 default, 8 prominent, pill radius)
// ============================================================================
const TRACK_HEIGHT = { default: 4, prominent: 8 } as const;
/** Indeterminate sweep; a loading indicator is the one thing allowed to loop. */
const INDETERMINATE_DURATION = 1500;
const LEGEND_DOT = 8;

type StatusVariant = 'success' | 'warning' | 'error' | 'info';
const VARIANT_STATUS: Record<StatusVariant, 'positive' | 'critical' | 'negative' | 'informative'> = {
  success: 'positive',
  warning: 'critical',
  error: 'negative',
  info: 'informative',
};

/** Fill and track colours for a variant. */
function progressColors(t: ThemeTokens, variant: ProgressVariant, coloredTrack: boolean) {
  if (variant === 'default') {
    return { fill: t.brand.fill, track: t.brand.subtleStrong };
  }
  const status = t.status[VARIANT_STATUS[variant]];
  return { fill: status.element, track: coloredTrack ? status.background : t.brand.subtleStrong };
}

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
  /** Segments with value and colour. Omit `color` to use the chart palette in order. */
  segments: Array<{
    value: number;
    color?: string;
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
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const [reduceMotion, setReduceMotion] = React.useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduceMotion(value);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  // Clamp progress between 0 and 1
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const percentage = Math.round(clampedProgress * 100);

  const trackHeight = TRACK_HEIGHT[size];
  const borderRadius = radius.pill;
  const { fill: indicatorColor, track: trackBgColor } = progressColors(t, variant, coloredTrack);

  // Animate determinate progress
  useEffect(() => {
    if (!indeterminate) {
      if (reduceMotion) {
        animatedValue.setValue(clampedProgress);
        return;
      }
      Animated.timing(animatedValue, {
        toValue: clampedProgress,
        duration: motion.slow,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    }
  }, [clampedProgress, indeterminate, animatedValue, reduceMotion]);

  // Animate indeterminate progress
  useEffect(() => {
    if (indeterminate) {
      const animation = Animated.loop(
        Animated.timing(indeterminateAnim, {
          toValue: 1,
          duration: INDETERMINATE_DURATION,
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
  const a11yLabel = accessibilityLabel || label || (indeterminate ? tr('components.loading') : tr('components.progress.label', { percent: percentage }));

  return (
    <View
      style={[styles.container, style]}
      accessible={true}
      accessibilityRole="progressbar"
      accessibilityLabel={a11yLabel}
      accessibilityValue={indeterminate ? undefined : { min: 0, max: 100, now: percentage }}
      accessibilityState={indeterminate ? { busy: true } : undefined}
    >
      {/* Label Row */}
      {(label || showPercentage) && (
        <View style={styles.labelRow}>
          {label && <Text style={styles.label}>{label}</Text>}
          {showPercentage && !indeterminate && (
            <Text style={styles.percentage}>{localizeDigits(`${percentage}%`)}</Text>
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
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const trackHeight = TRACK_HEIGHT[size];
  const borderRadius = radius.pill;

  // Calculate percentages for accessibility; colours default to the chart palette in order
  const segmentPercentages = segments.map((seg, index) => ({
    ...seg,
    color: seg.color ?? t.chart[index % t.chart.length],
    percentage: total > 0 ? Math.round((seg.value / total) * 100) : 0,
  }));

  const a11yLabel = segmentPercentages
    .filter(seg => seg.label)
    .map(seg => `${seg.label}: ${localizeDigits(`${seg.percentage}%`)}`)
    .join(', ');

  // Render labels
  const renderLabels = () => (
    <View style={styles.segmentLabelsRow}>
      {segmentPercentages.map((segment, index) => (
        segment.label && (
          <View key={index} style={styles.segmentLabelItem}>
            <View style={[styles.segmentLabelDot, { backgroundColor: segment.color }]} />
            <Text style={styles.label}>
              {segment.label}: <Text style={styles.percentage}>{localizeDigits(`${segment.percentage}%`)}</Text>
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
      accessibilityLabel={a11yLabel || tr('components.progress.segmented')}
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
            backgroundColor: t.brand.subtleStrong,
          },
        ]}
      >
        {segmentPercentages.map((segment, index) => {
          // Keep the ordinary segment value out of an inline style member
          // expression. Reanimated's development transform treats every
          // `.value` there as a SharedValue and otherwise emits a false warning.
          const segmentValue = segment.value;
          if (segmentValue <= 0 || total <= 0) return null;

          return (
            <View
              key={index}
              style={[
                styles.segment,
                {
                  flex: segmentValue,
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
const makeStyles = (t: ThemeTokens) => ({
  container: {
    width: '100%' as const,
  },

  // Label row
  labelRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: space.sm,
  },
  label: {
    ...typography.caption1,
    color: t.text.secondary,
  },
  percentage: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },

  // Track
  track: {
    width: '100%' as const,
    overflow: 'hidden' as const,
    position: 'relative' as const,
  },
  segmentedTrack: {
    flexDirection: 'row' as const,
  },

  // Indicator (determinate/indeterminate)
  indicator: {
    height: '100%' as const,
    position: 'absolute' as const,
    top: 0,
  },

  // Segment (segmented progress)
  segment: {
    height: '100%' as const,
  },

  // Segment labels
  segmentLabelsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.md,
    marginVertical: space.s6,
  },
  segmentLabelItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.s6,
  },
  segmentLabelDot: {
    width: LEGEND_DOT,
    height: LEGEND_DOT,
    borderRadius: radius.pill,
  },
});

// ============================================================================
// DEFAULT EXPORT
// ============================================================================
export default FioriLinearProgress;
