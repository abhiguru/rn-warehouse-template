/**
 * Generic Step Indicator Header - SAP Fiori form chrome (docs/STYLE_GUIDE.md §13.8)
 * Configurable form header with step indicator for multi-step forms.
 *
 * On surface.header: a close button, the document name, step circles (28 px;
 * current brand.fill, completed brand.tint outline with a check, upcoming
 * border.field), the current step name and a progress bar.
 *
 * Replaces: GRNStepIndicator, DispatchStepIndicator, InvoiceStepIndicator
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  motion,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import type { StepConfig } from '@/components/StepIndicator';

import { showAlert } from '@/utils/alert';
type StepState = 'completed' | 'current' | 'upcoming';

const STATE_WORD: Record<StepState, string> = {
  completed: 'completed',
  current: 'current',
  upcoming: 'not started',
};

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
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Step circle diameter (style guide §13.8). */
const STEP_SIZE = 28;
const CONNECTOR_WIDTH = 8;
const PROGRESS_HEIGHT = 4;
const STEP_HIT_SLOP = {
  top: (touchTarget - STEP_SIZE) / 2,
  bottom: (touchTarget - STEP_SIZE) / 2,
  left: CONNECTOR_WIDTH / 2,
  right: CONNECTOR_WIDTH / 2,
};

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
  cancelMessage = 'The details you entered will be lost.',
  onStepPress,
}) => {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  // Debounce state to prevent multiple rapid taps
  const [navigatingToStep, setNavigatingToStep] = useState<number | null>(null);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    showAlert(
      cancelTitle || `Discard this ${entityName}?`,
      cancelMessage,
      [
        {
          text: 'Keep editing',
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

  useEffect(() => {
    // Single pulse on the current step
    const currentIndex = currentStep - 1;
    if (currentIndex >= 0 && currentIndex < scaleAnims.length) {
      Animated.sequence([
        Animated.timing(scaleAnims[currentIndex], {
          toValue: 1.1,
          duration: motion.standard / 2,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnims[currentIndex], {
          toValue: 1,
          duration: motion.standard / 2,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [currentStep, scaleAnims]);

  const getStepState = (stepIndex: number): StepState => {
    const stepNumber = stepIndex + 1;
    if (completedSteps.includes(stepNumber)) return 'completed';
    if (stepNumber === currentStep) return 'current';
    return 'upcoming';
  };

  const renderStepCircle = (step: StepConfig, stepIndex: number, state: StepState) => {
    const isCompleted = state === 'completed';
    const isCurrent = state === 'current';
    const stepNumber = stepIndex + 1;
    const isInteractive = !!onStepPress;
    const glyphColor = isCurrent ? t.brand.onFill : isCompleted ? t.brand.tint : t.text.secondary;
    const isNavigatingToThis = navigatingToStep === stepNumber;
    const isAnyNavigating = navigatingToStep !== null;

    const circle = (
      <Animated.View
        style={[
          styles.stepCircle,
          isCurrent && styles.stepCircleCurrent,
          isCompleted && styles.stepCircleCompleted,
          isNavigatingToThis && styles.stepCircleCurrent,
          { transform: [{ scale: isCurrent ? scaleAnims[stepIndex] : 1 }] },
        ]}
      >
        {isNavigatingToThis ? (
          <ActivityIndicator size="small" color={t.brand.onFill} />
        ) : isCompleted ? (
          <Icon name="check" size={iconSize.sm} color={glyphColor} />
        ) : (
          <Text style={[styles.stepNumber, { color: glyphColor }]} maxFontSizeMultiplier={1.6}>
            {step.number ?? stepNumber}
          </Text>
        )}
      </Animated.View>
    );

    const a11yLabel = `Step ${stepNumber} of ${steps.length}, ${step.label}, ${STATE_WORD[state]}`;

    if (!isInteractive) {
      return (
        <View accessible accessibilityLabel={a11yLabel}>
          {circle}
        </View>
      );
    }

    return (
      <Pressable
        onPress={() => handleStepPressDebounced(stepNumber)}
        hitSlop={STEP_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={isCurrent ? undefined : `Goes to ${step.label}`}
        accessibilityState={{ selected: isCurrent, disabled: isAnyNavigating, busy: isNavigatingToThis }}
        disabled={isAnyNavigating}
        style={({ pressed }) => [
          pressed && styles.stepPressed,
          isAnyNavigating && !isNavigatingToThis && styles.stepDimmed,
        ]}
      >
        {circle}
      </Pressable>
    );
  };

  // Round to avoid floating point precision errors (e.g., 33.333... causing crash)
  const progressPercentage = Math.round((completedSteps.length / steps.length) * 100);
  const current = steps[currentStep - 1];

  return (
    <>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <View style={[styles.container, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.headerRow}>
          {/* Cancel: icon button, then the document being created */}
          <Pressable
            style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
            onPress={handleCancelPress}
            accessibilityRole="button"
            accessibilityLabel={`Cancel ${entityName.toLowerCase() === 'edit' ? 'editing' : entityName}`}
            accessibilityHint="Asks before discarding your changes"
          >
            <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
          </Pressable>
          <View style={styles.entityTextContainer}>
            <Text style={styles.entityName} numberOfLines={1} accessibilityRole="header">
              {entityName}
            </Text>
            {entityId && (
              <Text style={styles.entityIdText} numberOfLines={1}>
                {entityId}
              </Text>
            )}
          </View>

          {/* Step circles with connectors */}
          <View style={styles.stepsRow}>
            {steps.map((step, index) => (
              <React.Fragment key={index}>
                {renderStepCircle(step, index, getStepState(index))}
                {index < steps.length - 1 && (
                  <View
                    style={[
                      styles.connector,
                      completedSteps.includes(index + 1) && styles.connectorCompleted,
                    ]}
                  />
                )}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Current step name (phones show only this one) */}
        {current && (
          <Text style={styles.currentStepText} numberOfLines={1}>
            {`Step ${currentStep} of ${steps.length} · ${current.label}`}
          </Text>
        )}

        {/* Progress */}
        <View
          style={styles.progressBarBackground}
          accessible={true}
          accessibilityRole="progressbar"
          accessibilityLabel={`Form progress, step ${currentStep} of ${steps.length}`}
          accessibilityValue={{
            min: 0,
            max: 100,
            now: progressPercentage,
            text: `${progressPercentage}% complete`,
          }}
        >
          <View style={[styles.progressBarFill, { width: `${progressPercentage}%` }]} />
        </View>
      </View>
    </>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.surface.header,
    paddingBottom: space.md,
    paddingHorizontal: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  cancelButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  cancelButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  entityTextContainer: {
    flex: 1,
    marginLeft: space.xs,
    marginRight: space.sm,
  },
  entityName: {
    ...typography.headline,
    color: t.text.primary,
  },
  entityIdText: {
    ...typography.footnote,
    color: t.text.secondary,
    fontVariant: ['tabular-nums' as const],
  },
  stepsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingRight: space.sm,
  },
  stepCircle: {
    width: STEP_SIZE,
    height: STEP_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: t.border.field,
    backgroundColor: t.surface.header,
  },
  stepCircleCurrent: {
    borderColor: t.brand.fill,
    backgroundColor: t.brand.fill,
  },
  stepCircleCompleted: {
    borderColor: t.brand.tint,
  },
  stepPressed: {
    opacity: 0.8,
  },
  stepDimmed: {
    opacity: t.interaction.disabledOpacity,
  },
  stepNumber: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums' as const],
  },
  connector: {
    width: CONNECTOR_WIDTH,
    height: 2,
    backgroundColor: t.border.divider,
  },
  connectorCompleted: {
    backgroundColor: t.brand.tint,
  },
  currentStepText: {
    ...typography.caption1,
    color: t.text.secondary,
    marginTop: space.xs,
    marginHorizontal: space.sm,
  },
  progressBarBackground: {
    height: PROGRESS_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtleStrong,
    overflow: 'hidden' as const,
    marginTop: space.sm,
    marginHorizontal: space.sm,
  },
  progressBarFill: {
    height: '100%' as const,
    borderRadius: radius.pill,
    backgroundColor: t.brand.fill,
  },
});

export default GenericStepIndicatorHeader;
