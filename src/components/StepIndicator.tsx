/**
 * Base Step Indicator Component (SAP Fiori style, docs/STYLE_GUIDE.md §13.8)
 *
 * A horizontal step indicator for multi-step forms.
 * - Circles 28 px. Current: brand.fill with the number in brand.onFill.
 *   Completed: brand.tint outline with a check. Upcoming: border.field outline
 *   with the number in text.secondary.
 * - Connectors 2 px: brand.tint when completed, else border.divider.
 * - Step names under the circles in caption1; phones show only the current name.
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
  Pressable,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  motion,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { localizeDigits, t as tr, type TranslationKey } from '@/i18n';

/** Circle diameter (style guide §13.8). */
const STEP_SIZE = 28;
const CONNECTOR_HEIGHT = 2;
/** Below this window width only the current step's name is shown. */
const TABLET_MIN_WIDTH = 600;
const STEP_HIT_SLOP = (touchTarget - STEP_SIZE) / 2;

// ============================================================================
// TYPES
// ============================================================================

export interface StepConfig {
  /** Step number (optional, auto-generated if not provided) */
  number?: number;
  /** Full step label */
  label: string;
  /** Short label for display under the circle */
  shortLabel?: string;
  /** Optional icon name (MaterialCommunityIcons) shown instead of the number */
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
}

type StepState = 'completed' | 'current' | 'upcoming';

// ============================================================================
// COMPONENT
// ============================================================================

export default function StepIndicator({
  steps,
  currentStep,
  completedSteps,
  onStepPress,
}: StepIndicatorProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const { width } = useWindowDimensions();
  const showAllNames = width >= TABLET_MIN_WIDTH;

  // Animation values for each step
  const scaleAnims = useRef(
    steps.map(() => new Animated.Value(1))
  ).current;

  const lineWidthAnims = useRef(
    steps.map(() => new Animated.Value(0))
  ).current;

  useEffect(() => {
    // Animate current step (single pulse)
    const currentIndex = currentStep - 1;
    if (currentIndex >= 0 && currentIndex < scaleAnims.length) {
      Animated.sequence([
        Animated.timing(scaleAnims[currentIndex], {
          toValue: 1.08,
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

    // Animate connecting lines for completed steps
    completedSteps.forEach((stepNum) => {
      if (stepNum - 1 >= 0 && stepNum - 1 < lineWidthAnims.length) {
        Animated.timing(lineWidthAnims[stepNum - 1], {
          toValue: 1,
          duration: motion.slow,
          useNativeDriver: false,
        }).start();
      }
    });
  }, [currentStep, completedSteps, steps.length, scaleAnims, lineWidthAnims]);

  const getStepState = (stepIndex: number): StepState => {
    const stepNumber = stepIndex + 1;
    if (completedSteps.includes(stepNumber)) return 'completed';
    if (stepNumber === currentStep) return 'current';
    return 'upcoming';
  };

  const stepLabelKey: Record<StepState, TranslationKey> = {
    completed: 'components.steps.stepCompleted',
    current: 'components.steps.stepCurrent',
    upcoming: 'components.steps.stepUpcoming',
  };

  const renderStep = (step: StepConfig, stepIndex: number, state: StepState) => {
    const isCompleted = state === 'completed';
    const isCurrent = state === 'current';
    const stepNumber = stepIndex + 1;
    const glyphColor = isCurrent ? t.brand.onFill : isCompleted ? t.brand.tint : t.text.secondary;
    const name = step.shortLabel || step.label;
    const showName = showAllNames || isCurrent;

    const circle = (
      <Animated.View
        style={[
          styles.stepCircle,
          isCurrent && styles.stepCircleCurrent,
          isCompleted && styles.stepCircleCompleted,
          { transform: [{ scale: isCurrent ? scaleAnims[stepIndex] : 1 }] },
        ]}
      >
        {isCompleted ? (
          <Icon name="check" size={iconSize.sm} color={glyphColor} />
        ) : step.icon ? (
          <Icon name={step.icon} size={iconSize.sm} color={glyphColor} />
        ) : (
          <Text style={[styles.stepNumber, { color: glyphColor }]} maxFontSizeMultiplier={1.6}>
            {localizeDigits(String(step.number ?? stepNumber))}
          </Text>
        )}
      </Animated.View>
    );

    const a11yLabel = tr(stepLabelKey[state], { step: stepNumber, total: steps.length, name: step.label });

    const content = (
      <View style={styles.stepContainer}>
        {circle}
        {showName ? (
          <Text
            style={[styles.stepName, isCurrent && styles.stepNameCurrent]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.6}
          >
            {name}
          </Text>
        ) : (
          <View style={styles.stepNamePlaceholder} />
        )}
      </View>
    );

    if (!onStepPress) {
      return (
        <View accessible accessibilityLabel={a11yLabel}>
          {content}
        </View>
      );
    }

    return (
      <Pressable
        onPress={() => onStepPress(stepNumber)}
        hitSlop={STEP_HIT_SLOP}
        style={({ pressed }) => [pressed && styles.stepPressed]}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={isCurrent ? undefined : tr('components.steps.goesTo', { name: step.label })}
        accessibilityState={{ selected: isCurrent }}
      >
        {content}
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
        <View style={styles.connectingLine} />
        {isCompleted && (
          <Animated.View
            style={[styles.connectingLine, styles.lineActive, { width: animatedWidth }]}
          />
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.stepsRow}>
        {steps.map((step, index) => (
          <React.Fragment key={index}>
            {renderStep(step, index, getStepState(index))}
            {renderConnectingLine(index)}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.surface.header,
    paddingVertical: space.md,
    paddingHorizontal: layout.marginCompact,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  stepsRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
  },
  stepContainer: {
    alignItems: 'center' as const,
    minWidth: STEP_SIZE,
  },
  stepPressed: {
    opacity: t.interaction.disabledOpacity + 0.4,
  },
  stepCircle: {
    width: STEP_SIZE,
    height: STEP_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: t.border.field,
    backgroundColor: t.surface.card,
  },
  stepCircleCurrent: {
    borderColor: t.brand.fill,
    backgroundColor: t.brand.fill,
  },
  stepCircleCompleted: {
    borderColor: t.brand.tint,
  },
  stepNumber: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums' as const],
  },
  stepName: {
    ...typography.caption1,
    color: t.text.secondary,
    marginTop: space.xs,
    maxWidth: 96,
    textAlign: 'center' as const,
  },
  stepNameCurrent: {
    color: t.text.primary,
    fontWeight: fontWeight.semibold,
  },
  stepNamePlaceholder: {
    height: typography.caption1.lineHeight + space.xs,
  },
  lineContainer: {
    flex: 1,
    height: STEP_SIZE,
    justifyContent: 'center' as const,
    position: 'relative' as const,
    marginHorizontal: space.xs,
  },
  connectingLine: {
    height: CONNECTOR_HEIGHT,
    width: '100%' as const,
    position: 'absolute' as const,
    backgroundColor: t.border.divider,
  },
  lineActive: {
    left: 0,
    backgroundColor: t.brand.tint,
  },
});
