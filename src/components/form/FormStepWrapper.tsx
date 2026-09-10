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
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Button } from 'react-native-paper';
import theme from '@/theme';
import SwipeableFormStep from '../SwipeableFormStep';

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
 * Default step indicator component
 */
const DefaultStepIndicator = memo<{
  currentStep: number;
  steps: StepConfig[];
  completedSteps: number[];
}>(({ currentStep, steps, completedSteps }) => (
  <View style={styles.stepIndicatorContainer}>
    {steps.map((step, index) => {
      const stepNumber = index + 1;
      const isActive = stepNumber === currentStep;
      const isCompleted = completedSteps.includes(stepNumber);

      return (
        <View key={index} style={styles.stepItem}>
          <View
            style={[
              styles.stepCircle,
              isActive && styles.stepCircleActive,
              isCompleted && styles.stepCircleCompleted,
            ]}
          >
            {isCompleted ? (
              <Icon name="check" size={14} color={theme.colors.white} />
            ) : (
              <Text
                style={[
                  styles.stepNumber,
                  (isActive || isCompleted) && styles.stepNumberActive,
                ]}
              >
                {stepNumber}
              </Text>
            )}
          </View>
          <Text
            style={[
              styles.stepLabel,
              isActive && styles.stepLabelActive,
            ]}
            numberOfLines={1}
          >
            {step.label}
          </Text>
          {index < steps.length - 1 && (
            <View
              style={[
                styles.stepConnector,
                isCompleted && styles.stepConnectorCompleted,
              ]}
            />
          )}
        </View>
      );
    })}
  </View>
));
DefaultStepIndicator.displayName = 'DefaultStepIndicator';

/**
 * Navigation footer component
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
  const isLastStep = currentStep === totalSteps;

  return (
    <View style={styles.footer}>
      <Button
        mode="outlined"
        onPress={onBack}
        disabled={!canGoBack || currentStep === 1}
        style={styles.footerButton}
        textColor={theme.colors.gray[700]}
      >
        {backLabel}
      </Button>

      {isLastStep ? (
        <Button
          mode="contained"
          onPress={onSubmit}
          disabled={!canGoNext || isSubmitting}
          loading={isSubmitting}
          style={styles.footerButton}
          buttonColor={theme.colors.primary}
        >
          {submitLabel}
        </Button>
      ) : (
        <Button
          mode="contained"
          onPress={onNext}
          disabled={!canGoNext}
          style={styles.footerButton}
          buttonColor={theme.colors.primary}
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
  unsavedChangesMessage = 'You have unsaved changes. Are you sure you want to leave?',
  backLabel = 'Back',
  nextLabel = 'Next',
  submitLabel = 'Submit',
  isSubmitting = false,
  enableSwipe = true,
  StepIndicator,
  completedSteps = [],
  hideFooter = false,
  headerRight,
  loading = false,
}) => {
  const insets = useSafeAreaInsets();

  // Build step configs from labels if not provided
  const steps: StepConfig[] = stepConfigs || stepLabels.map((label) => ({ label }));

  // Handle cancel with confirmation
  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      Alert.alert(
        'Discard Changes?',
        unsavedChangesMessage,
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Discard',
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
        <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
          <Icon name="close" size={24} color={theme.colors.gray[600]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
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
        <View style={{ paddingBottom: insets.bottom }}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[200],
  },
  cancelButton: {
    padding: theme.spacing.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.gray[800],
    marginLeft: theme.spacing.sm,
  },
  headerRight: {
    minWidth: 40,
    alignItems: 'flex-end',
  },
  stepIndicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.gray[50],
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    backgroundColor: theme.colors.primary,
  },
  stepCircleCompleted: {
    backgroundColor: theme.colors.semantic.success,
  },
  stepNumber: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.gray[600],
  },
  stepNumberActive: {
    color: theme.colors.white,
  },
  stepLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.gray[500],
    marginLeft: theme.spacing.xs,
    maxWidth: 60,
  },
  stepLabelActive: {
    color: theme.colors.gray[800],
    fontWeight: theme.fontWeight.medium,
  },
  stepConnector: {
    width: 24,
    height: 2,
    backgroundColor: theme.colors.gray[200],
    marginHorizontal: theme.spacing.xs,
  },
  stepConnectorCompleted: {
    backgroundColor: theme.colors.semantic.success,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: theme.spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.gray[200],
    backgroundColor: theme.colors.white,
  },
  footerButton: {
    flex: 1,
    marginHorizontal: theme.spacing.xs,
  },
});

export default FormStepWrapper;
