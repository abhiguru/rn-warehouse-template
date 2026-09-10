/**
 * Base Step Indicator Component (SAP Fiori Style)
 *
 * A horizontal step indicator for multi-step forms.
 * Features:
 * - Pill-shaped step indicators with labels
 * - Animated connecting lines
 * - Pulse animation on current step
 * - Three states: completed, current, upcoming
 * - Platform-specific shadows
 * - Uses Fiori semantic colors from listColors
 *
 * Note: For entity-specific step indicators with cancel button
 * and progress bar, see GRNStepIndicator, DispatchStepIndicator,
 * and InvoiceStepIndicator.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { listColors } from '@/theme/listColors';

// ============================================================================
// FIORI CONSTANTS
// ============================================================================

const FIORI = {
  // Step pill dimensions
  pill: {
    width: 72,
    height: 32,
    borderRadius: 16, // pill shape
    borderWidth: 2,
  },
  // Connecting line
  line: {
    height: 2,
  },
  // Container
  container: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  // Animation
  animation: {
    duration: 300,
  },
  // Colors
  colors: {
    // Completed state (blue/teal)
    completedBg: listColors.statusPositive,
    completedBorder: listColors.statusPositive,
    completedText: '#FFFFFF',
    // Current state (outlined)
    currentBg: '#FFFFFF',
    currentBorder: theme.colors.primary,
    currentText: theme.colors.primary,
    // Upcoming state (gray)
    upcomingBg: listColors.gray200,
    upcomingBorder: listColors.gray300,
    upcomingText: listColors.gray500,
    // Connecting lines
    lineInactive: listColors.gray200,
    lineActive: listColors.statusPositive,
  },
  // Typography
  typography: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  // Shadow
  shadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
    },
    android: {
      elevation: 2,
    },
  }),
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface StepConfig {
  /** Step number (optional, auto-generated if not provided) */
  number?: number;
  /** Full step label */
  label: string;
  /** Short label for display in pill */
  shortLabel?: string;
  /** Optional icon name (MaterialCommunityIcons) */
  icon?: string;
}

export interface StepIndicatorProps {
  /** Array of step configurations */
  steps: StepConfig[];
  /** Current step (1-based index) */
  currentStep: number;
  /** Array of completed step numbers */
  completedSteps: number[];
  /** Callback when a step is pressed (optional) */
  onStepPress?: (stepNumber: number) => void;
  /** Color scheme variant */
  variant?: 'primary' | 'secondary';
  /** Show checkmark icon for completed steps */
  showCompletedIcon?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function StepIndicator({
  steps,
  currentStep,
  completedSteps,
  onStepPress,
  variant = 'primary',
  showCompletedIcon = false,
}: StepIndicatorProps) {
  // Animation values for each step
  const scaleAnims = useRef(
    steps.map(() => new Animated.Value(1))
  ).current;

  const lineWidthAnims = useRef(
    steps.map(() => new Animated.Value(0))
  ).current;

  useEffect(() => {
    // Animate current step (pulse effect)
    const currentIndex = currentStep - 1;
    if (currentIndex >= 0 && currentIndex < scaleAnims.length) {
      Animated.sequence([
        Animated.timing(scaleAnims[currentIndex], {
          toValue: 1.08,
          duration: FIORI.animation.duration / 2,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnims[currentIndex], {
          toValue: 1,
          duration: FIORI.animation.duration / 2,
          useNativeDriver: true,
        }),
      ]).start();
    }

    // Animate connecting lines for completed steps
    completedSteps.forEach((stepNum) => {
      if (stepNum - 1 >= 0 && stepNum - 1 < lineWidthAnims.length) {
        Animated.timing(lineWidthAnims[stepNum - 1], {
          toValue: 1,
          duration: FIORI.animation.duration,
          useNativeDriver: false,
        }).start();
      }
    });
  }, [currentStep, completedSteps, steps.length, scaleAnims, lineWidthAnims]);

  const getStepState = (
    stepIndex: number
  ): 'completed' | 'current' | 'upcoming' => {
    const stepNumber = stepIndex + 1;
    if (completedSteps.includes(stepNumber)) return 'completed';
    if (stepNumber === currentStep) return 'current';
    return 'upcoming';
  };

  // Get colors based on variant
  const getColors = () => {
    if (variant === 'secondary') {
      return {
        completedBg: theme.colors.blue[500],
        completedBorder: theme.colors.blue[500],
        completedText: '#FFFFFF',
        currentBg: '#FFFFFF',
        currentBorder: theme.colors.blue[500],
        currentText: theme.colors.blue[500],
        upcomingBg: theme.colors.blue[100],
        upcomingBorder: theme.colors.blue[300],
        upcomingText: theme.colors.blue[700],
        lineInactive: theme.colors.blue[200],
        lineActive: theme.colors.blue[500],
      };
    }
    return FIORI.colors;
  };

  const colors = getColors();

  const renderStepCircle = (step: StepConfig, stepIndex: number, state: string) => {
    const isCompleted = state === 'completed';
    const isCurrent = state === 'current';
    const isUpcoming = state === 'upcoming';
    const stepNumber = stepIndex + 1;
    const isInteractive = !!onStepPress;

    const circleStyle = [
      styles.stepCircle,
      {
        backgroundColor: isCompleted
          ? colors.completedBg
          : isCurrent
          ? colors.currentBg
          : colors.upcomingBg,
        borderColor: isCompleted
          ? colors.completedBorder
          : isCurrent
          ? colors.currentBorder
          : colors.upcomingBorder,
      },
    ];

    const textStyle = [
      styles.stepNumber,
      {
        color: isCompleted
          ? colors.completedText
          : isCurrent
          ? colors.currentText
          : colors.upcomingText,
      },
    ];

    const animatedStyle = {
      transform: [{ scale: isCurrent ? scaleAnims[stepIndex] : 1 }],
    };

    const label = step.shortLabel || step.label;

    const pillContent = (
      <Animated.View style={[circleStyle, animatedStyle]}>
        {isCompleted && showCompletedIcon ? (
          <Icon name="check" size={16} color={colors.completedText} />
        ) : step.icon ? (
          <Icon
            name={step.icon}
            size={14}
            color={
              isCompleted
                ? colors.completedText
                : isCurrent
                ? colors.currentText
                : colors.upcomingText
            }
          />
        ) : (
          <Text style={textStyle}>{label}</Text>
        )}
      </Animated.View>
    );

    if (!isInteractive) {
      return pillContent;
    }

    return (
      <Pressable
        onPress={() => onStepPress?.(stepNumber)}
        style={({ pressed }) => [pressed && { opacity: 0.8 }]}
        accessibilityRole="button"
        accessibilityLabel={`Go to ${step.label} step`}
        accessibilityState={{ selected: isCurrent }}
      >
        {pillContent}
      </Pressable>
    );
  };

  const renderConnectingLine = (stepIndex: number) => {
    // Don't render line after the last step
    if (stepIndex >= steps.length - 1) return null;

    const isCompleted = completedSteps.includes(stepIndex + 1);

    const animatedWidth = lineWidthAnims[stepIndex].interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    });

    return (
      <View style={styles.lineContainer}>
        {/* Background line (inactive) */}
        <View style={[styles.connectingLine, { backgroundColor: colors.lineInactive }]} />
        {/* Animated active line */}
        {isCompleted && (
          <Animated.View
            style={[
              styles.connectingLine,
              styles.lineActive,
              { backgroundColor: colors.lineActive, width: animatedWidth },
            ]}
          />
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.stepsRow}>
        {steps.map((step, index) => {
          const state = getStepState(index);

          return (
            <React.Fragment key={index}>
              <View style={styles.stepContainer}>
                {renderStepCircle(step, index, state)}
              </View>
              {renderConnectingLine(index)}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  // Container
  container: {
    backgroundColor: listColors.white,
    paddingVertical: FIORI.container.paddingVertical,
    paddingHorizontal: FIORI.container.paddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: listColors.gray200,
    ...FIORI.shadow,
  },

  // Steps row
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // Step container
  stepContainer: {
    alignItems: 'center',
  },

  // Step circle (pill)
  stepCircle: {
    width: FIORI.pill.width,
    height: FIORI.pill.height,
    borderRadius: FIORI.pill.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: FIORI.pill.borderWidth,
    paddingHorizontal: 8,
  },

  // Step number text
  stepNumber: {
    fontSize: FIORI.typography.fontSize,
    fontWeight: FIORI.typography.fontWeight,
  },

  // Line container
  lineContainer: {
    flex: 1,
    height: FIORI.pill.height,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginHorizontal: -4,
  },

  // Connecting line (base)
  connectingLine: {
    height: FIORI.line.height,
    width: '100%',
    position: 'absolute',
  },

  // Active line (animated overlay)
  lineActive: {
    position: 'absolute',
    left: 0,
  },
});
