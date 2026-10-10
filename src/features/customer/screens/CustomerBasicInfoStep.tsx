/**
 * CustomerBasicInfoStep Screen
 *
 * Step 1 of customer form: Basic Information
 * Collects name, mobile, and email.
 */

import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router } from 'expo-router';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { useCustomerForm } from '@/hooks/useCustomerForm';
import { GenericStepIndicatorHeader } from '@/components/GenericStepIndicatorHeader';
import { CUSTOMER_STEP_NUMBERS, getCompletedSteps } from '@/constants/customerSteps';
import { customerSteps } from '@/features/customer/customerStepLabels';
import { normalizeDigits, t as tr } from '@/i18n';
import { CustomerFormMode } from '@/types/customer.types';

import { showAlert } from '@/utils/alert';
// =============================================================================
// COMPONENT
// =============================================================================

type CustomerBasicInfoStepProps = {
  mode: CustomerFormMode;
  customerId?: string;
};

export function CustomerBasicInfoStep({ mode, customerId }: CustomerBasicInfoStepProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();

  // Form hook
  const {
    formData,
    currentStep,
    validationErrors,
    isLoading,
    isCreateMode,
    updateName,
    updateMobile,
    updateEmail,
    goToNextStep,
    navigateToStep,
    resetFormState,
    isDirty,
  } = useCustomerForm({ mode, customerIdParam: customerId });

  // Local UI state
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Input refs
  const mobileInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);

  // ===========================================================================
  // HANDLERS
  // ===========================================================================

  const handleCancel = useCallback(() => {
    const confirmDiscard = () => {
      resetFormState();
      if (isCreateMode) {
        router.back();
      } else {
        router.replace('/customers');
      }
    };

    if (isDirty) {
      showAlert(
        isCreateMode ? tr('customers.form.discardNewTitle') : tr('customers.form.discardChangesTitle'),
        tr('customers.form.discardMessage'),
        [
          { text: tr('common.keepEditing'), style: 'cancel' },
          { text: tr('common.discard'), style: 'destructive', onPress: confirmDiscard },
        ]
      );
    } else {
      confirmDiscard();
    }
  }, [isDirty, isCreateMode, resetFormState]);

  const handleStepIndicatorPress = useCallback(
    async (step: number) => {
      if (step < currentStep) {
        // Going back - simple navigation
        router.back();
      } else if (step > currentStep) {
        // Going forward - validate and navigate to target step
        await navigateToStep(step as 1 | 2 | 3);
      }
    },
    [currentStep, navigateToStep]
  );

  const handleNext = useCallback(async () => {
    const success = await goToNextStep();
    if (!success) {
      // Validation failed - errors are already displayed
      console.log('[CustomerBasicInfoStep] Validation failed');
    }
  }, [goToNextStep]);

  // ===========================================================================
  // RENDER
  // ===========================================================================

  if (isLoading) {
    return (
      <View style={styles.loadingContainer} accessibilityRole="progressbar" accessibilityLabel={tr('customers.form.loadingLabel')}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>{tr('customers.form.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Step Indicator */}
      <GenericStepIndicatorHeader
        steps={customerSteps()}
        currentStep={CUSTOMER_STEP_NUMBERS.BASIC}
        completedSteps={getCompletedSteps(CUSTOMER_STEP_NUMBERS.BASIC)}
        onCancel={handleCancel}
        onStepPress={handleStepIndicatorPress}
        entity="customer"
        mode={isCreateMode ? 'create' : 'edit'}
        entityId={isCreateMode ? undefined : formData.name || tr('customers.form.editing')}
        cancelTitle={tr('customers.form.discardHeaderTitle')}
      />

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        enableAutomaticScroll
        extraScrollHeight={100}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">{tr('customers.steps.basic.label')}</Text>
          <Text style={styles.subtitle}>{tr('customers.form.basicSubtitle')}</Text>
        </View>

        {/* Form Fields */}
        <View style={styles.formContainer}>
          {/* Customer Name */}
          <View style={styles.formField}>
            <Text style={[styles.label, validationErrors.name && styles.labelError]}>
              {tr('customers.form.customerName')}<Text style={styles.required}> *</Text>
            </Text>
            <TextInput
              style={[
                styles.input,
                focusedField === 'name' && styles.inputFocused,
                validationErrors.name && styles.inputError,
              ]}
              value={formData.name}
              onChangeText={updateName}
              placeholder={tr('customers.form.customerNamePlaceholder')}
              placeholderTextColor={t.text.placeholder}
              maxLength={200}
              returnKeyType="next"
              onSubmitEditing={() => mobileInputRef.current?.focus()}
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              accessibilityLabel={tr('customers.form.customerNameLabel')}
            />
            {validationErrors.name && <FieldError message={validationErrors.name} />}
          </View>

          {/* Mobile Number */}
          <View style={styles.formField}>
            <Text style={[styles.label, validationErrors.mobile && styles.labelError]}>
              {tr('common.mobileNumber')}<Text style={styles.required}> *</Text>
            </Text>
            <View style={styles.phoneInputContainer}>
              <View
                style={styles.countryCode}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Text style={styles.countryCodeText}>+91</Text>
              </View>
              <TextInput
                ref={mobileInputRef}
                style={[
                  styles.input,
                  styles.phoneInput,
                  focusedField === 'mobile' && styles.inputFocused,
                  validationErrors.mobile && styles.inputError,
                ]}
                value={formData.mobile.replace(/^91/, '')}
                onChangeText={(text) => {
                  // Remove non-digits and limit to 10 chars
                  const cleaned = normalizeDigits(text).replace(/\D/g, '').slice(0, 10);
                  updateMobile(cleaned);
                }}
                placeholder={tr('customers.form.mobilePlaceholder')}
                placeholderTextColor={t.text.placeholder}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={10}
                returnKeyType="next"
                onSubmitEditing={() => emailInputRef.current?.focus()}
                onFocus={() => setFocusedField('mobile')}
                onBlur={() => setFocusedField(null)}
                accessibilityLabel={tr('customers.form.mobileLabel')}
              />
            </View>
            {validationErrors.mobile && <FieldError message={validationErrors.mobile} />}
          </View>

          {/* Email */}
          <View style={styles.formField}>
            <Text style={[styles.label, validationErrors.email && styles.labelError]}>{tr('customers.form.email')}</Text>
            <TextInput
              ref={emailInputRef}
              style={[
                styles.input,
                focusedField === 'email' && styles.inputFocused,
                validationErrors.email && styles.inputError,
              ]}
              value={formData.email}
              onChangeText={updateEmail}
              placeholder="customer@example.com"
              placeholderTextColor={t.text.placeholder}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              maxLength={100}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
              accessibilityLabel={tr('customers.form.emailLabel')}
              accessibilityHint={tr('customers.form.emailHint')}
            />
            {validationErrors.email && <FieldError message={validationErrors.email} />}
            <Text style={styles.helperText}>{tr('customers.form.emailHelper')}</Text>
          </View>
        </View>

        {/* Spacer for button */}
        <View style={styles.bottomSpacer} />
      </KeyboardAwareScrollView>

      {/* Next Button */}
      <View style={[styles.buttonContainer, { paddingBottom: space.lg + insets.bottom }]}>
        <Pressable
          style={({ pressed }) => [styles.nextButton, pressed && styles.nextButtonPressed]}
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel={tr('customers.form.nextDetails')}
        >
          <Text style={styles.nextButtonText}>{tr('customers.form.nextDetails')}</Text>
          <Icon name="chevron-right" size={iconSize.md} color={t.brand.onFill} />
        </Pressable>
      </View>
    </View>
  );
}

/** Field error: icon plus message in the negative status colour. */
function FieldError({ message }: { message: string }) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  return (
    <View style={styles.errorRow} accessibilityLiveRegion="polite">
      <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.background.base,
  },
  loadingText: {
    ...typography.subhead,
    marginTop: space.md,
    color: t.text.secondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.marginCompact,
    paddingBottom: 100,
  },

  // Header
  header: {
    paddingVertical: space.xl,
  },
  title: {
    ...typography.title2,
    color: t.text.primary,
    marginBottom: space.xs,
  },
  subtitle: {
    ...typography.subhead,
    color: t.text.secondary,
  },

  // Form
  formContainer: {
    gap: space.lg,
  },
  formField: {
    gap: space.xs,
  },
  label: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  labelError: {
    color: t.status.negative.text,
  },
  required: {
    color: t.text.required,
  },
  input: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: touchTarget,
    backgroundColor: t.surface.field,
    borderColor: t.border.field,
    color: t.text.primary,
  },
  inputFocused: {
    borderColor: t.border.fieldFocus,
    borderWidth: 2,
  },
  inputError: {
    borderColor: t.status.negative.border,
    borderWidth: 2,
  },
  errorRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.xs,
    marginTop: space.xs,
  },
  errorText: {
    ...typography.footnote,
    flex: 1,
    color: t.status.negative.text,
  },
  helperText: {
    ...typography.footnote,
    marginTop: space.xs,
    color: t.text.secondary,
  },

  // Phone input
  phoneInputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  countryCode: {
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    marginRight: space.sm,
    minHeight: touchTarget,
    justifyContent: 'center' as const,
    backgroundColor: t.surface.fieldReadOnly,
  },
  countryCodeText: {
    ...typography.body,
    color: t.text.primary,
  },
  phoneInput: {
    flex: 1,
  },

  // Bottom
  bottomSpacer: {
    height: space.huge,
  },
  buttonContainer: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    backgroundColor: t.surface.card,
    ...t.shadow[3],
  },
  nextButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.button,
    minHeight: 48,
    paddingHorizontal: space.xl,
    gap: space.sm,
    backgroundColor: t.brand.fill,
  },
  nextButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  nextButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
});

export default CustomerBasicInfoStep;
