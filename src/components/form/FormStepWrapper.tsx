/**
 * FormStepWrapper - Reusable wrapper for multi-step form screens
 *
 * Provides consistent form step UI including:
 * - Header with title and cancel button
 * - Step indicator
 * - Swipeable content area
 * - Navigation footer (Back/Next/Submit)
 * - Keyboard-aware scrolling
 * - Unsaved changes confirmation
 *
 * @example
 * ```tsx
 * <FormStepWrapper
 *   title="Create GRN"
 *   currentStep={1}
 *   totalSteps={3}
 *   stepLabels={['Header', 'Items', 'Review']}
 *   onCancel={handleCancel}
 *   onBack={handleBack}
 *   onNext={handleNext}
 *   canGoBack={false}
 *   canGoNext={isValid}
 *   hasUnsavedChanges={isDirty}
 * >
 *   <YourFormContent />
 * </FormStepWrapper>
 * ```
 */

import React, { memo, useCallback, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { Button } from '@/components/ui/Button';
import BaseStepIndicator from '../StepIndicator';
import SwipeableFormStep from '../SwipeableFormStep';

import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';
/**
 * Step indicator configuration
 */
export interface StepConfig {
  /** Step label */
  label: string;
  /** Icon name (MaterialCommunityIcons) */
  icon?: string;
}

/**
 * Props for FormStepWrapper
 */
export interface FormStepWrapperProps {
  /** Form title displayed in header */
  title: string;
  /** Current step number (1-indexed) */
  currentStep: number;
  /** Total number of steps */
  totalSteps: number;
  /** Labels for each step */
  stepLabels?: string[];
  /** Step configurations with icons */
  stepConfigs?: StepConfig[];
  /** Form content */
  children: ReactNode;
  /** Called when cancel is pressed */
  onCancel: () => void;
  /** Called when back is pressed */
  onBack?: () => void;
  /** Called when next is pressed */
  onNext?: () => void;
  /** Called when submit is pressed (final step) */
  onSubmit?: () => void;
  /** Whether back navigation is allowed */
  canGoBack?: boolean;
  /** Whether next navigation is allowed */
  canGoNext?: boolean;
  /** Whether form has unsaved changes */
  hasUnsavedChanges?: boolean;
  /** Custom unsaved changes message */
  unsavedChangesMessage?: string;
  /** Back button label (default: 'Back') */
  backLabel?: string;
  /** Next button label (default: 'Next') */
  nextLabel?: string;
  /** Submit button label (default: 'Submit') */
  submitLabel?: string;
  /** Whether form is submitting */
  isSubmitting?: boolean;
  /** Enable swipe navigation */
  enableSwipe?: boolean;
  /** Custom step indicator component */
  StepIndicator?: React.ComponentType<{
    currentStep: number;
    steps: StepConfig[];
    completedSteps: number[];
  }>;
  /** Which steps are completed (for step indicator) */
  completedSteps?: number[];
  /** Hide navigation footer */
  hideFooter?: boolean;
  /** Additional header content (right side) */
  headerRight?: ReactNode;
  /** Show loading overlay */
  loading?: boolean;
}

/**
 * Default step indicator: the shared StepIndicator (style guide §13.8)
 */
const DefaultStepIndicator = memo<{
  currentStep: number;
  steps: StepConfig[];
  completedSteps: number[];
}>(({ currentStep, steps, completedSteps }) => (
  <BaseStepIndicator steps={steps} currentStep={currentStep} completedSteps={completedSteps} />
));
DefaultStepIndicator.displayName = 'DefaultStepIndicator';

/**
 * Navigation footer: Back (secondary) and Next or Submit (primary)
 */
const NavigationFooter = memo<{
  currentStep: number;
  totalSteps: number;
  onBack?: () => void;
  onNext?: () => void;
  onSubmit?: () => void;
  canGoBack: boolean;
  canGoNext: boolean;
  backLabel: string;
  nextLabel: string;
  submitLabel: string;
  isSubmitting: boolean;
}>(({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onSubmit,
  canGoBack,
  canGoNext,
  backLabel,
  nextLabel,
  submitLabel,
  isSubmitting,
}) => {
  const styles = useThemedStyles(makeStyles);
  const isLastStep = currentStep === totalSteps;

  return (
    <View style={styles.footer}>
      <Button
        type="secondary"
        variant="normal"
        size="standalone"
        onPress={onBack}
        disabled={!canGoBack || currentStep === 1}
        style={styles.footerButton}
      >
        {backLabel}
      </Button>

      {isLastStep ? (
        <Button
          type="primary"
          size="standalone"
          onPress={onSubmit}
          disabled={!canGoNext}
          loading={isSubmitting}
          style={styles.footerButton}
        >
          {submitLabel}
        </Button>
      ) : (
        <Button
          type="primary"
          size="standalone"
          onPress={onNext}
          disabled={!canGoNext}
          style={styles.footerButton}
        >
          {nextLabel}
        </Button>
      )}
    </View>
  );
});
NavigationFooter.displayName = 'NavigationFooter';

/**
 * Form step wrapper component
 */
export const FormStepWrapper = memo<FormStepWrapperProps>(({
  title,
  currentStep,
  totalSteps,
  stepLabels = [],
  stepConfigs,
  children,
  onCancel,
  onBack,
  onNext,
  onSubmit,
  canGoBack = true,
  canGoNext = true,
  hasUnsavedChanges = false,
  unsavedChangesMessage: unsavedChangesMessageProp,
  backLabel: backLabelProp,
  nextLabel: nextLabelProp,
  submitLabel: submitLabelProp,
  isSubmitting = false,
  enableSwipe = true,
  StepIndicator,
  completedSteps = [],
  hideFooter = false,
  headerRight,
  loading = false,
}) => {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const unsavedChangesMessage = unsavedChangesMessageProp ?? tr('components.form.changesWillBeLost');
  const backLabel = backLabelProp ?? tr('common.back');
  const nextLabel = nextLabelProp ?? tr('common.next');
  const submitLabel = submitLabelProp ?? tr('common.submit');

  // Build step configs from labels if not provided
  const steps: StepConfig[] = stepConfigs || stepLabels.map((label) => ({ label }));

  // Handle cancel with confirmation
  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      showAlert(
        tr('common.discardChangesTitle'),
        unsavedChangesMessage,
        [
          { text: tr('common.keepEditing'), style: 'cancel' },
          {
            text: tr('common.discard'),
            style: 'destructive',
            onPress: onCancel,
          },
        ]
      );
    } else {
      onCancel();
    }
  }, [hasUnsavedChanges, unsavedChangesMessage, onCancel]);

  // Handle swipe navigation
  const handleSwipeLeft = useCallback(() => {
    if (canGoNext && onNext) {
      onNext();
    }
  }, [canGoNext, onNext]);

  const handleSwipeRight = useCallback(() => {
    if (canGoBack && onBack && currentStep > 1) {
      onBack();
    }
  }, [canGoBack, onBack, currentStep]);

  const StepIndicatorComponent = StepIndicator || DefaultStepIndicator;

  const content = (
    <View style={styles.content}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        enableOnAndroid
        enableAutomaticScroll
        extraScrollHeight={Platform.OS === 'ios' ? 120 : 80}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </KeyboardAwareScrollView>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={handleCancel}
          style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={tr('common.cancel')}
        >
          <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.headerRight}>
          {headerRight}
        </View>
      </View>

      {/* Step Indicator */}
      {steps.length > 0 && (
        <StepIndicatorComponent
          currentStep={currentStep}
          steps={steps}
          completedSteps={completedSteps}
        />
      )}

      {/* Content with optional swipe */}
      {enableSwipe ? (
        <SwipeableFormStep
          onSwipeLeft={handleSwipeLeft}
          onSwipeRight={handleSwipeRight}
          canSwipeLeft={canGoNext && currentStep < totalSteps}
          canSwipeRight={canGoBack && currentStep > 1}
        >
          {content}
        </SwipeableFormStep>
      ) : (
        content
      )}

      {/* Navigation Footer */}
      {!hideFooter && (
        <View style={[styles.footerContainer, { paddingBottom: insets.bottom }]}>
          <NavigationFooter
            currentStep={currentStep}
            totalSteps={totalSteps}
            onBack={onBack}
            onNext={onNext}
            onSubmit={onSubmit}
            canGoBack={canGoBack}
            canGoNext={canGoNext}
            backLabel={backLabel}
            nextLabel={nextLabel}
            submitLabel={submitLabel}
            isSubmitting={isSubmitting}
          />
        </View>
      )}
    </View>
  );
});

FormStepWrapper.displayName = 'FormStepWrapper';

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
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
  headerTitle: {
    ...typography.headline,
    flex: 1,
    color: t.text.primary,
    marginLeft: space.xs,
  },
  headerRight: {
    minWidth: touchTarget,
    alignItems: 'flex-end' as const,
    paddingRight: space.sm,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: layout.marginCompact,
  },
  // Bottom bar on surface.card with shadow[3]; the bottom inset is added inline
  footerContainer: {
    backgroundColor: t.surface.card,
    ...t.shadow[3],
  },
  footer: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    backgroundColor: t.surface.card,
  },
  footerButton: {
    flex: 1,
    minWidth: 0,
  },
});

export default FormStepWrapper;
