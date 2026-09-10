/**
 * Generic Step Indicator Header - SAP Fiori Compliant
 * Configurable form header with step indicator for multi-step forms
 *
 * Replaces: GRNStepIndicator, DispatchStepIndicator, InvoiceStepIndicator
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  TouchableOpacity,
  Alert,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import theme from '@/theme';
import type { StepConfig } from '@/components/StepIndicator';

// ============================================================================
// COLOR SCHEMES
// ============================================================================

/**
 * Color scheme configuration for step indicator
 * - 'teal': Uses green[500] (#53b1b1) - for GRN and Dispatch forms
 * - 'blue': Uses blue[500] (#1c5858) - for Invoice forms
 */
export type StepColorScheme = 'teal' | 'blue';

interface ColorConfig {
  progressIndicator: string;
  progressTrack: string;
  stepCompleted: string;
  stepCurrent: string;
  stepUpcoming: string;
  stepBorder: string;
  stepUpcomingBorder: string;
  textCompleted: string;
  textCurrent: string;
  textUpcoming: string;
}

const getColorConfig = (scheme: StepColorScheme): ColorConfig => {
  if (scheme === 'teal') {
    return {
      progressIndicator: theme.colors.green[500], // #53b1b1
      progressTrack: theme.colors.green[50], // #e8f4f4
      stepCompleted: theme.colors.green[500],
      stepCurrent: theme.colors.white,
      stepUpcoming: theme.colors.green[50],
      stepBorder: theme.colors.green[500],
      stepUpcomingBorder: theme.colors.green[300],
      textCompleted: theme.colors.white,
      textCurrent: theme.colors.green[500],
      textUpcoming: theme.colors.blue[500], // #1c5858 dark teal
    };
  }
  // 'blue' scheme
  return {
    progressIndicator: theme.colors.blue[500],
    progressTrack: theme.colors.blue[50],
    stepCompleted: theme.colors.blue[500],
    stepCurrent: theme.colors.white,
    stepUpcoming: theme.colors.blue[50],
    stepBorder: theme.colors.blue[500],
    stepUpcomingBorder: theme.colors.blue[300],
    textCompleted: theme.colors.white,
    textCurrent: theme.colors.blue[500],
    textUpcoming: theme.colors.blue[700],
  };
};

// ============================================================================
// ARROW ICON
// ============================================================================

interface ArrowIconProps {
  color: string;
}

const ArrowIcon: React.FC<ArrowIconProps> = ({ color }) => (
  <Svg width={10} height={10} viewBox="0 0 12 12" fill="none">
    <Path
      d="M7.5 1L11 6M11 6L7.5 11M11 6H1"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface GenericStepIndicatorHeaderProps {
  /** Array of step configurations */
  steps: StepConfig[];
  /** Current step number (1-based index) */
  currentStep: number;
  /** Array of completed step numbers */
  completedSteps: number[];
  /** Callback when cancel is confirmed */
  onCancel: () => void;
  /** Entity name displayed in cancel pill (e.g., "GRN", "Dispatch", "Invoice") */
  entityName: string;
  /** Optional entity ID displayed below entity name (e.g., "Z0813") */
  entityId?: string;
  /** Title for cancel confirmation alert */
  cancelTitle?: string;
  /** Message for cancel confirmation alert */
  cancelMessage?: string;
  /** Optional callback when step pill is tapped (for navigation) */
  onStepPress?: (stepNumber: number) => void;
  /** Color scheme for steps and progress bar */
  colorScheme?: StepColorScheme;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PILL_WIDTH = 70;
const PILL_HEIGHT = 28;
const CANCEL_PILL_WIDTH = 115;
const LINE_HEIGHT = 2;
const ANIMATION_DURATION = 300;
const PROGRESS_HEIGHT = 8;
const PROGRESS_RADIUS = 4;
const ARROW_SIZE = 14;

// ============================================================================
// COMPONENT
// ============================================================================

export const GenericStepIndicatorHeader: React.FC<GenericStepIndicatorHeaderProps> = ({
  steps,
  currentStep,
  completedSteps,
  onCancel,
  entityName,
  entityId,
  cancelTitle,
  cancelMessage = 'Are you sure you want to cancel? All entered data will be lost.',
  onStepPress,
  colorScheme = 'teal',
}) => {
  const insets = useSafeAreaInsets();
  const colors = getColorConfig(colorScheme);

  // Debounce state to prevent multiple rapid taps
  const [navigatingToStep, setNavigatingToStep] = useState<number | null>(null);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced step press handler
  const handleStepPressDebounced = useCallback((stepNumber: number) => {
    // Ignore if already navigating
    if (navigatingToStep !== null) {
      return;
    }

    // Set navigating state immediately for instant feedback
    setNavigatingToStep(stepNumber);

    // Use requestAnimationFrame to ensure UI renders the loading state before navigation
    requestAnimationFrame(() => {
      // Small additional delay to ensure the spinner is visible
      setTimeout(() => {
        onStepPress?.(stepNumber);
      }, 50);
    });

    // Clear the navigating state after a delay (allows navigation to complete)
    navigationTimeoutRef.current = setTimeout(() => {
      setNavigatingToStep(null);
    }, 1500); // 1.5 second cooldown
  }, [navigatingToStep, onStepPress]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  const handleCancelPress = () => {
    Alert.alert(
      cancelTitle || `Cancel ${entityName} Creation`,
      cancelMessage,
      [
        {
          text: 'Continue Editing',
          style: 'cancel',
        },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: onCancel,
        },
      ],
      { cancelable: true }
    );
  };

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
          toValue: 1.1,
          duration: ANIMATION_DURATION / 2,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnims[currentIndex], {
          toValue: 1,
          duration: ANIMATION_DURATION / 2,
          useNativeDriver: true,
        }),
      ]).start();
    }

    // Animate connecting lines for completed steps
    completedSteps.forEach((stepNum) => {
      if (stepNum < steps.length && stepNum > 0) {
        Animated.timing(lineWidthAnims[stepNum - 1], {
          toValue: 1,
          duration: ANIMATION_DURATION,
          useNativeDriver: false,
        }).start();
      }
    });
  }, [currentStep, completedSteps, steps.length, scaleAnims, lineWidthAnims]);

  const getStepState = (stepIndex: number): 'completed' | 'current' | 'upcoming' => {
    const stepNumber = stepIndex + 1;
    if (completedSteps.includes(stepNumber)) return 'completed';
    if (stepNumber === currentStep) return 'current';
    return 'upcoming';
  };

  const renderStepCircle = (step: StepConfig, stepIndex: number, state: string) => {
    const isCompleted = state === 'completed';
    const isCurrent = state === 'current';
    const isUpcoming = state === 'upcoming';
    const stepNumber = stepIndex + 1;
    const isInteractive = !!onStepPress;

    const backgroundColor = isCompleted
      ? colors.stepCompleted
      : isCurrent
      ? colors.stepCurrent
      : colors.stepUpcoming;

    const borderColor = isCompleted
      ? colors.stepCompleted
      : isCurrent
      ? colors.stepBorder
      : colors.stepUpcomingBorder;

    const textColor = isCompleted
      ? colors.textCompleted
      : isCurrent
      ? colors.textCurrent
      : colors.textUpcoming;

    const animatedStyle = {
      transform: [{ scale: isCurrent ? scaleAnims[stepIndex] : 1 }],
    };

    const label = step.shortLabel || step.label;

    const pillContent = (
      <Animated.View
        style={[
          styles.stepCircle,
          { backgroundColor, borderColor },
          animatedStyle,
        ]}
      >
        <Text style={[styles.stepNumber, { color: textColor }]}>
          {label}
        </Text>
      </Animated.View>
    );

    if (!isInteractive) {
      return pillContent;
    }

    const isNavigatingToThis = navigatingToStep === stepNumber;
    const isAnyNavigating = navigatingToStep !== null;

    // Determine spinner color that contrasts with background
    // For light backgrounds (upcoming, current), use teal; for dark backgrounds (completed), use white
    const spinnerColor = isCompleted ? theme.colors.white : colors.progressIndicator;

    // Show loading spinner on the pill being navigated to
    const pillWithLoading = isNavigatingToThis ? (
      <Animated.View
        style={[
          styles.stepCircle,
          { backgroundColor: colors.progressIndicator, borderColor: colors.progressIndicator },
          animatedStyle,
        ]}
      >
        <ActivityIndicator size={18} color={theme.colors.white} />
      </Animated.View>
    ) : pillContent;

    return (
      <TouchableOpacity
        onPress={() => handleStepPressDebounced(stepNumber)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Go to ${label} step`}
        disabled={isAnyNavigating}
        style={isAnyNavigating && !isNavigatingToThis ? { opacity: 0.6 } : undefined}
      >
        {pillWithLoading}
      </TouchableOpacity>
    );
  };

  // Round to avoid floating point precision errors (e.g., 33.333... causing crash)
  const progressPercentage = Math.round((completedSteps.length / steps.length) * 100);

  return (
    <>
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.colors.primary}
        translucent={false}
      />
      <View style={styles.safeAreaBackground}>
        <View
          style={[
            styles.container,
            {
              paddingTop: (insets.top || theme.spacing.md) + theme.spacing.lg,
            },
          ]}
        >
          {/* Steps Row with Progress Pills */}
          <View style={styles.headerRow}>
            {/* Cancel Pill - Left aligned */}
            <View style={styles.cancelPillWrapper}>
              <TouchableOpacity
                style={styles.cancelPill}
                onPress={handleCancelPress}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={`Cancel ${entityName} creation`}
                accessibilityHint="Double tap to cancel and discard changes"
              >
                <View style={styles.closeIconBackground}>
                  <Ionicons name="close" size={12} color={theme.colors.primary} />
                </View>
                <View style={styles.entityTextContainer}>
                  <Text style={styles.cancelPillText} numberOfLines={1}>
                    {entityName}
                  </Text>
                  {entityId && (
                    <Text style={styles.entityIdText} numberOfLines={1}>
                      {entityId}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {/* Progress Pills & Bar Container - Right aligned */}
            <View style={styles.pillsAndProgressContainer}>
              {/* Progress Pills */}
              <View style={styles.progressPillsContainer}>
                {steps.map((step, index) => {
                  const state = getStepState(index);
                  return (
                    <View key={index} style={styles.pillWrapper}>
                      {renderStepCircle(step, index, state)}
                    </View>
                  );
                })}
              </View>

              {/* Progress Bar with Arrow Indicator */}
              <View
                style={styles.progressBarContainer}
                accessible={true}
                accessibilityRole="progressbar"
                accessibilityLabel={`Form progress: Step ${currentStep} of ${steps.length}`}
                accessibilityValue={{
                  min: 0,
                  max: 100,
                  now: progressPercentage,
                  text: `${progressPercentage}% complete`,
                }}
              >
                <View
                  style={[
                    styles.progressBarBackground,
                    { backgroundColor: colors.progressTrack },
                  ]}
                >
                  {/* Completed/Active Segment */}
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        backgroundColor: colors.progressIndicator,
                        width: `${progressPercentage}%`,
                      },
                    ]}
                  />

                  {/* Arrow Indicator */}
                  <View
                    style={[
                      styles.arrowIndicator,
                      { left: `${progressPercentage}%` },
                    ]}
                  >
                    <ArrowIcon color={colors.progressIndicator} />
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    </>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  safeAreaBackground: {
    backgroundColor: theme.colors.primary,
  },
  container: {
    backgroundColor: theme.colors.primary,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[200],
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  progressPillsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 1,
  },
  cancelPillWrapper: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'flex-start',
    marginTop: 5,
    marginLeft: -2,
  },
  pillWrapper: {
    alignItems: 'center',
  },
  stepCircle: {
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    paddingHorizontal: 4,
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: '700',
  },
  cancelPill: {
    flexDirection: 'row',
    width: CANCEL_PILL_WIDTH,
    height: PILL_HEIGHT + 10,
    borderRadius: (PILL_HEIGHT + 10) / 2,
    backgroundColor: theme.colors.primary,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingLeft: 6,
    paddingRight: 6,
  },
  cancelPillText: {
    fontSize: 21,
    fontWeight: '700',
    color: theme.colors.white,
  },
  closeIconBackground: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entityTextContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  entityIdText: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
    marginTop: -2,
  },
  pillsAndProgressContainer: {
    flexDirection: 'column',
    alignSelf: 'flex-end',
  },
  progressBarContainer: {
    marginTop: theme.spacing.sm,
    marginLeft: 0,
    marginRight: 0,
  },
  progressBarBackground: {
    height: PROGRESS_HEIGHT,
    borderRadius: PROGRESS_RADIUS,
    overflow: 'visible',
    position: 'relative',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: PROGRESS_RADIUS - 1,
  },
  arrowIndicator: {
    position: 'absolute',
    top: -3,
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    borderRadius: ARROW_SIZE / 2,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -ARROW_SIZE / 2,
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
    }),
  },
});

export default GenericStepIndicatorHeader;
