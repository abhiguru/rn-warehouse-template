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
import { useFirstStepBack } from '@/hooks/useFirstStepBack';
import { localizeDigits, t as tr, type TranslationKey } from '@/i18n';
import type { AppEntity, EntityMode } from '@/i18n/entities';

/** What a wizard can be about. */
export type StepEntity = Exclude<AppEntity, 'item' | 'customer'>;

/** The header label when the caller gives none. */
const ENTITY_TITLE_KEY: Record<StepEntity, TranslationKey> = {
  grn: 'common.grn',
  dispatch: 'common.dispatch',
  invoice: 'common.invoice',
};
type StepState = 'completed' | 'current' | 'upcoming';

/** Key of the spoken label of a step circle, by its state. */
const STEP_LABEL_KEY: Record<StepState, TranslationKey> = {
  completed: 'components.steps.stepCompleted',
  current: 'components.steps.stepCurrent',
  upcoming: 'components.steps.stepUpcoming',
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
  /**
   * What the wizard is about. Selects the whole-sentence texts (the spoken name of
   * the close button, the default discard question), so pass it from every screen.
   */
  entity?: StepEntity;
  /** Whether the wizard creates a record or edits one (default: create). */
  mode?: EntityMode;
  /**
   * The label shown next to the close button ("GRN", "Edit invoice"), already in the
   * app's language. Defaults to the name of `entity`. Without `entity` it is also
   * placed into the English sentences, as before: new code passes `entity`.
   */
  entityName?: string;
  /** Optional entity ID displayed below entity name (e.g., "Z0813") */
  entityId?: string;
  /** Title for cancel confirmation alert */
  cancelTitle?: string;
  /** Message for cancel confirmation alert */
  cancelMessage?: string;
  /** Optional callback when step pill is tapped (for navigation) */
  onStepPress?: (stepNumber: number) => void;
  /**
   * The Android Back key on the first step of a create form. With `hasData` it
   * asks the question of the close button, and "Discard" calls `onCancel` as
   * the close button's does; without, it leaves for `exitRoute` at once.
   * Omit on later steps and in edit forms: Back is then left to the screen.
   */
  backOnFirstStep?: FirstStepBack;
  /**
   * A save is running: the close button and the step circles do nothing until it ends (leaving then would
   * reset the form under the save). Dimmed and reported as disabled to screen readers.
   */
  disabled?: boolean;
  /**
   * With `disabled`: the close button stays usable and asks with this text instead of `cancelMessage` (the save's
   * answer is not known yet, and the person may still leave, knowing it may have been saved). The step circles stay
   * disabled. The question's buttons then read "Keep waiting" and "Leave anyway" (not "Keep editing" and "Discard":
   * nothing is being edited, the app is waiting for the server), as in the Add items picker.
   */
  leaveWarning?: string;
}

export interface FirstStepBack {
  /** Whether the user has entered anything that would be lost. */
  hasData: boolean;
  /** False leaves the Back key alone (an edit form with nothing changed: Back goes back as it always did). */
  enabled?: boolean;
  /** Where Back goes when nothing was entered: the list the form was opened from. */
  exitRoute: string;
  /** See useFirstStepBack: `dismissTo` leaves one entry of the list's tab. */
  exitWith?: 'replace' | 'dismissTo';
}

/** Listens for the Back key while the header is given `backOnFirstStep`; draws nothing. */
function FirstStepBackKey({ hasData, enabled, exitRoute, exitWith, askToDiscard }: FirstStepBack & { askToDiscard: () => void }) {
  useFirstStepBack({ hasData, enabled, exitRoute, exitWith, askToDiscard });
  return null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Step circle diameter (style guide §13.8). */
const STEP_SIZE = 28;
/** Each step circle's touch target is touchTarget wide: the circle plus half of the connector on each side. */
const CONNECTOR_WIDTH = touchTarget - STEP_SIZE;
/** The title wraps to this many lines before it is cut. */
const TITLE_LINES = 2;
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
  entity,
  mode = 'create',
  entityName: entityNameProp,
  entityId,
  cancelTitle,
  cancelMessage: cancelMessageProp,
  onStepPress,
  backOnFirstStep,
  disabled = false,
  leaveWarning,
}) => {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const cancelMessage = cancelMessageProp ?? tr('components.steps.cancelMessage');
  const entityName = entityNameProp ?? (entity ? tr(ENTITY_TITLE_KEY[entity]) : '');
  const closeLabel = entity
    ? tr(`components.steps.cancelFor.${entity}.${mode}`)
    : mode === 'edit'
      ? tr('components.steps.cancelEditing')
      : tr('components.steps.cancelEntity', { entity: entityName });
  const defaultDiscardTitle = entity
    ? tr(`components.steps.discardFor.${entity}`)
    : tr('components.steps.discardTitle', { entity: entityName });

  // Debounce state to prevent multiple rapid taps
  const [navigatingToStep, setNavigatingToStep] = useState<number | null>(null);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced step press handler
  const handleStepPressDebounced = useCallback((stepNumber: number) => {
    // Ignore if already navigating, or while the form is being saved
    if (disabled || navigatingToStep !== null) {
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
  }, [disabled, navigatingToStep, onStepPress]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  // While a save runs the close button does nothing, unless it is given a warning to ask with.
  const cancelDisabled = disabled && !leaveWarning;
  const handleCancelPress = () => {
    if (cancelDisabled) return;
    // The server is being asked what became of a request (leaveWarning): the person waits, or leaves anyway.
    const waiting = disabled && !!leaveWarning;
    showAlert(
      cancelTitle || defaultDiscardTitle,
      waiting ? leaveWarning : cancelMessage,
      [
        {
          text: waiting ? tr('orders.catalog.keepWaiting') : tr('common.keepEditing'),
          style: 'cancel',
        },
        {
          text: waiting ? tr('orders.catalog.leaveAnyway') : tr('common.discard'),
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
    const isAnyNavigating = navigatingToStep !== null || disabled;

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
            {localizeDigits(String(step.number ?? stepNumber))}
          </Text>
        )}
      </Animated.View>
    );

    const a11yLabel = tr(STEP_LABEL_KEY[state], { step: stepNumber, total: steps.length, name: step.label });

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
        accessibilityHint={isCurrent ? undefined : tr('components.steps.goesTo', { name: step.label })}
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
      {backOnFirstStep && <FirstStepBackKey {...backOnFirstStep} askToDiscard={handleCancelPress} />}
      <View style={[styles.container, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.headerRow}>
          {/* Cancel: icon button, then the document being created */}
          <Pressable
            style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed, cancelDisabled && styles.cancelButtonDisabled]}
            onPress={handleCancelPress}
            disabled={cancelDisabled}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            accessibilityHint={tr('components.steps.cancelHint')}
            accessibilityState={cancelDisabled ? { disabled: true } : undefined}
          >
            <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
          </Pressable>
          <View style={styles.entityTextContainer}>
            {/* Two lines: the wider step targets leave the title less room, and "Edit invoice" or a Gujarati title would be cut at 320 dp */}
            <Text style={styles.entityName} numberOfLines={TITLE_LINES} accessibilityRole="header">
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
          <Text style={styles.currentStepText} numberOfLines={2}>
            {tr('components.steps.currentStep', { step: currentStep, total: steps.length, name: current.label })}
          </Text>
        )}

        {/* Progress */}
        <View
          style={styles.progressBarBackground}
          accessible={true}
          accessibilityRole="progressbar"
          accessibilityLabel={tr('components.steps.progressLabel', { step: currentStep, total: steps.length })}
          accessibilityValue={{
            min: 0,
            max: 100,
            now: progressPercentage,
            text: tr('components.steps.percentComplete', { percent: progressPercentage }),
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
  cancelButtonDisabled: {
    opacity: t.interaction.disabledOpacity,
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
