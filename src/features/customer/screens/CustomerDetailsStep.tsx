/**
 * CustomerDetailsStep Screen
 *
 * Step 2 of customer form: Address & Tax Details
 * Collects address, city, state, pincode, GST, PAN, and contact person details.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  LayoutAnimation,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
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

type CustomerDetailsStepProps = {
  mode: CustomerFormMode;
  customerId?: string;
};

export function CustomerDetailsStep({ mode, customerId }: CustomerDetailsStepProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();

  // Form hook
  const {
    formData,
    currentStep,
    validationErrors,
    isCreateMode,
    updateCity,
    updateState,
    updatePincode,
    updateAddress,
    updateGST,
    updatePAN,
    updateContactName,
    updateContactMobile,
    updateContactEmail,
    goToNextStep,
    goToPreviousStep,
    resetFormState,
    navigateToStep,
    isDirty,
    validateCurrentStep,
  } = useCustomerForm({ mode, customerIdParam: customerId });

  // Local UI state
  const [showTaxSection, setShowTaxSection] = useState(
    !!(formData.gst || formData.pan)
  );
  const [showContactSection, setShowContactSection] = useState(
    !!(formData.contact_name || formData.contact_mobile || formData.contact_email)
  );

  // Input refs
  const stateInputRef = useRef<TextInput>(null);
  const pincodeInputRef = useRef<TextInput>(null);
  const addressInputRef = useRef<TextInput>(null);
  const gstInputRef = useRef<TextInput>(null);
  const panInputRef = useRef<TextInput>(null);
  const contactNameInputRef = useRef<TextInput>(null);
  const contactMobileInputRef = useRef<TextInput>(null);
  const contactEmailInputRef = useRef<TextInput>(null);

  // ===========================================================================
  // HANDLERS
  // ===========================================================================

  const toggleSection = useCallback((section: 'tax' | 'contact') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (section === 'tax') {
      setShowTaxSection((prev) => !prev);
    } else {
      setShowContactSection((prev) => !prev);
    }
  }, []);

  const handleCancel = useCallback(() => {
    const confirmDiscard = () => {
      resetFormState();
      router.replace('/customers');
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
        goToPreviousStep();
      } else if (step > currentStep) {
        await navigateToStep(step as 1 | 2 | 3);
      }
    },
    [currentStep, goToPreviousStep, navigateToStep]
  );

  const handleNext = useCallback(async () => {
    console.log('[CustomerDetailsStep] handleNext called, currentStep:', currentStep, 'formData:', {
      name: formData.name,
      mobile: formData.mobile,
    });

    // Validate first to get errors directly
    const validationResult = await validateCurrentStep();

    if (!validationResult.isValid) {
      const errors = validationResult.errors;
      console.log('[CustomerDetailsStep] Validation failed, currentStep:', currentStep, 'errors:', errors);

      // Auto-expand sections that have errors
      if (errors.gst || errors.pan) {
        setShowTaxSection(true);
      }
      if (errors.contact_name || errors.contact_mobile || errors.contact_email) {
        setShowContactSection(true);
      }

      // Show alert with validation errors (include Step 1 errors in case form was reset)
      const errorMessages: string[] = [];
      // Step 1 errors (in case form data was reset)
      if (errors.name) errorMessages.push(tr('customers.form.fieldError', { field: tr('customers.fields.name'), message: errors.name }));
      if (errors.mobile) errorMessages.push(tr('customers.form.fieldError', { field: tr('customers.fields.mobile'), message: errors.mobile }));
      if (errors.email) errorMessages.push(tr('customers.form.fieldError', { field: tr('customers.fields.email'), message: errors.email }));
      // Step 2 errors
      if (errors.city) errorMessages.push(tr('customers.form.fieldError', { field: tr('customers.fields.city'), message: errors.city }));
      if (errors.state) errorMessages.push(tr('customers.form.fieldError', { field: tr('customers.fields.state'), message: errors.state }));
      if (errors.pincode) errorMessages.push(tr('customers.form.fieldError', { field: tr('customers.fields.pincode'), message: errors.pincode }));
      if (errors.address) errorMessages.push(tr('customers.form.fieldError', { field: tr('customers.fields.address'), message: errors.address }));
      if (errors.gst) errorMessages.push(tr('customers.form.fieldError', { field: tr('customers.fields.gst'), message: errors.gst }));
      if (errors.pan) errorMessages.push(tr('customers.form.fieldError', { field: tr('customers.fields.pan'), message: errors.pan }));
      if (errors.contact_name) errorMessages.push(tr('customers.form.fieldError', { field: tr('customers.fields.contactName'), message: errors.contact_name }));
      if (errors.contact_mobile) errorMessages.push(tr('customers.form.fieldError', { field: tr('customers.fields.contactMobile'), message: errors.contact_mobile }));
      if (errors.contact_email) errorMessages.push(tr('customers.form.fieldError', { field: tr('customers.fields.contactEmail'), message: errors.contact_email }));

      if (errorMessages.length > 0) {
        showAlert(tr('customers.form.checkFieldsTitle'), errorMessages.join('\n'));
      } else {
        // No specific field errors but validation still failed
        showAlert(tr('customers.form.couldNotContinueTitle'), tr('customers.form.couldNotContinueMessage'));
      }
      return;
    }

    // Validation passed, proceed to next step
    await goToNextStep();
  }, [validateCurrentStep, goToNextStep, currentStep, formData]);

  const handleBack = useCallback(() => {
    goToPreviousStep();
  }, [goToPreviousStep]);

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <View style={styles.container}>
      {/* Step Indicator */}
      <GenericStepIndicatorHeader
        steps={customerSteps()}
        currentStep={CUSTOMER_STEP_NUMBERS.DETAILS}
        completedSteps={getCompletedSteps(CUSTOMER_STEP_NUMBERS.DETAILS)}
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
          <Text style={styles.title} accessibilityRole="header">{tr('customers.steps.details.label')}</Text>
          <Text style={styles.subtitle}>
            {tr('customers.form.detailsSubtitle')}
          </Text>
        </View>

        {/* ADDRESS SECTION */}
        <View style={styles.section}>
          <View style={[styles.sectionHeader, styles.sectionHeaderStatic]}>
            <Icon name="map-marker-outline" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.sectionTitle} accessibilityRole="header">{tr('customers.form.address')}</Text>
          </View>

          <View style={styles.sectionContent}>
            {/* City & State Row */}
            <View style={styles.row}>
              <FormField
                containerStyle={styles.halfField}
                label={tr('customers.form.city')}
                error={validationErrors.city}
                value={formData.city}
                onChangeText={updateCity}
                placeholder={tr('customers.form.city')}
                maxLength={50}
                returnKeyType="next"
                onSubmitEditing={() => stateInputRef.current?.focus()}
                autoCapitalize="words"
                autoComplete="postal-address-locality"
                textContentType="addressCity"
              />
              <FormField
                ref={stateInputRef}
                containerStyle={styles.halfField}
                label={tr('customers.form.state')}
                error={validationErrors.state}
                value={formData.state}
                onChangeText={updateState}
                placeholder={tr('customers.form.state')}
                maxLength={50}
                returnKeyType="next"
                onSubmitEditing={() => pincodeInputRef.current?.focus()}
                autoCapitalize="words"
                autoComplete="postal-address-region"
                textContentType="addressState"
              />
            </View>

            {/* Pincode */}
            <FormField
              ref={pincodeInputRef}
              label={tr('customers.form.pincode')}
              inputStyle={styles.pincodeInput}
              error={validationErrors.pincode}
              value={formData.pincode}
              onChangeText={(text) => {
                const cleaned = normalizeDigits(text).replace(/\D/g, '').slice(0, 6);
                updatePincode(cleaned);
              }}
              placeholder={tr('customers.form.pincodePlaceholder')}
              keyboardType="number-pad"
              autoComplete="postal-code"
              textContentType="postalCode"
              maxLength={6}
              returnKeyType="next"
              onSubmitEditing={() => addressInputRef.current?.focus()}
            />

            {/* Full Address */}
            <FormField
              ref={addressInputRef}
              label={tr('customers.form.fullAddress')}
              inputStyle={styles.textArea}
              error={validationErrors.address}
              value={formData.address}
              onChangeText={updateAddress}
              placeholder={tr('customers.form.fullAddressPlaceholder')}
              autoComplete="street-address"
              textContentType="fullStreetAddress"
              maxLength={500}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              returnKeyType="done"
            />
          </View>
        </View>

        {/* TAX DETAILS SECTION (Collapsible) */}
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [styles.collapsibleHeader, pressed && styles.collapsibleHeaderPressed]}
            onPress={() => toggleSection('tax')}
            accessibilityRole="button"
            accessibilityLabel={tr('customers.form.taxDetails')}
            accessibilityState={{ expanded: showTaxSection }}
          >
            <View style={styles.sectionHeader}>
              <Icon name="receipt" size={iconSize.md} color={t.brand.tint} />
              <Text style={styles.sectionTitle}>{tr('customers.form.taxDetails')}</Text>
            </View>
            <Icon
              name={showTaxSection ? 'chevron-up' : 'chevron-down'}
              size={iconSize.lg}
              color={t.icon.secondary}
            />
          </Pressable>

          {showTaxSection && (
            <View style={styles.collapsibleContent}>
              {/* GST */}
              <FormField
                ref={gstInputRef}
                label={tr('customers.form.gstNumber')}
                helper={tr('customers.form.formatHelper', { example: '22AAAAA0000A1Z5' })}
                error={validationErrors.gst}
                value={formData.gst}
                onChangeText={updateGST}
                placeholder={tr('customers.form.gstPlaceholder')}
                maxLength={15}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => panInputRef.current?.focus()}
              />

              {/* PAN */}
              <FormField
                ref={panInputRef}
                label={tr('customers.form.pan')}
                helper={tr('customers.form.formatHelper', { example: 'AAAAA0000A' })}
                inputStyle={styles.panInput}
                error={validationErrors.pan}
                value={formData.pan}
                onChangeText={updatePAN}
                placeholder={tr('customers.form.panPlaceholder')}
                maxLength={10}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
              />
            </View>
          )}
        </View>

        {/* CONTACT PERSON SECTION (Collapsible) */}
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [styles.collapsibleHeader, pressed && styles.collapsibleHeaderPressed]}
            onPress={() => toggleSection('contact')}
            accessibilityRole="button"
            accessibilityLabel={tr('customers.form.contactPerson')}
            accessibilityState={{ expanded: showContactSection }}
          >
            <View style={styles.sectionHeader}>
              <Icon name="account-box-outline" size={iconSize.md} color={t.brand.tint} />
              <Text style={styles.sectionTitle}>{tr('customers.form.contactPerson')}</Text>
            </View>
            <Icon
              name={showContactSection ? 'chevron-up' : 'chevron-down'}
              size={iconSize.lg}
              color={t.icon.secondary}
            />
          </Pressable>

          {showContactSection && (
            <View style={styles.collapsibleContent}>
              {/* Contact Name */}
              <FormField
                ref={contactNameInputRef}
                label={tr('customers.form.contactName')}
                error={validationErrors.contact_name}
                value={formData.contact_name}
                onChangeText={updateContactName}
                placeholder={tr('customers.form.contactNamePlaceholder')}
                maxLength={100}
                returnKeyType="next"
                onSubmitEditing={() => contactMobileInputRef.current?.focus()}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
              />

              {/* Contact Mobile */}
              <FormField
                ref={contactMobileInputRef}
                label={tr('customers.form.contactMobile')}
                prefix="+91"
                error={validationErrors.contact_mobile}
                value={formData.contact_mobile.replace(/^91/, '')}
                onChangeText={(text) => {
                  const cleaned = normalizeDigits(text).replace(/\D/g, '').slice(0, 10);
                  updateContactMobile(cleaned);
                }}
                placeholder={tr('customers.form.mobilePlaceholder')}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={10}
                returnKeyType="next"
                onSubmitEditing={() => contactEmailInputRef.current?.focus()}
              />

              {/* Contact Email */}
              <FormField
                ref={contactEmailInputRef}
                label={tr('customers.form.contactEmail')}
                error={validationErrors.contact_email}
                value={formData.contact_email}
                onChangeText={updateContactEmail}
                placeholder="contact@example.com"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                maxLength={100}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
            </View>
          )}
        </View>

        {/* Spacer for button */}
        <View style={styles.bottomSpacer} />
      </KeyboardAwareScrollView>

      {/* Bottom Buttons */}
      <View style={[styles.buttonContainer, { paddingBottom: space.lg + insets.bottom }]}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={tr('customers.form.backToBasic')}
        >
          <Icon name="chevron-left" size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.backButtonText}>{tr('common.back')}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.nextButton, pressed && styles.nextButtonPressed]}
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel={tr('customers.form.nextReview')}
        >
          <Text style={styles.nextButtonText}>{tr('customers.form.nextReview')}</Text>
          <Icon name="chevron-right" size={iconSize.md} color={t.brand.onFill} />
        </Pressable>
      </View>
    </View>
  );
}

// =============================================================================
// FORM FIELD
// =============================================================================

type FormFieldProps = TextInputProps & {
  label: string;
  error?: string;
  helper?: string;
  /** Fixed text shown before the field, e.g. the +91 country code. */
  prefix?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

/** Labelled text field with focus, error and helper states (style guide §13.2). */
const FormField = React.forwardRef<TextInput, FormFieldProps>(function FormField(
  { label, error, helper, prefix, containerStyle, inputStyle, onFocus, onBlur, ...inputProps },
  ref
) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [focused, setFocused] = useState(false);
  const input = (
    <TextInput
      ref={ref}
      {...inputProps}
      style={[
        styles.input,
        prefix ? styles.phoneInput : null,
        inputStyle,
        focused && styles.inputFocused,
        !!error && styles.inputError,
      ]}
      placeholderTextColor={t.text.placeholder}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      accessibilityLabel={prefix ? tr('customers.form.labelAfterPrefix', { label, prefix }) : label}
      accessibilityHint={helper}
    />
  );
  return (
    <View style={[styles.formField, containerStyle]}>
      <Text style={[styles.label, !!error && styles.labelError]}>{label}</Text>
      {prefix ? (
        <View style={styles.phoneInputContainer}>
          <View
            style={styles.countryCode}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={styles.countryCodeText}>{prefix}</Text>
          </View>
          {input}
        </View>
      ) : (
        input
      )}
      {!!error && (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {!!helper && <Text style={styles.helperText}>{helper}</Text>}
    </View>
  );
});

// =============================================================================
// STYLES
// =============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
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

  // Sections
  section: {
    borderRadius: radius.card,
    marginBottom: space.lg,
    overflow: 'hidden' as const,
    backgroundColor: t.surface.card,
    ...t.shadow[2],
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  sectionHeaderStatic: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  sectionTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  sectionContent: {
    padding: space.lg,
    gap: space.lg,
  },
  collapsibleHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: touchTarget,
    padding: space.lg,
  },
  collapsibleHeaderPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  collapsibleContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.lg,
  },

  // Form
  row: {
    flexDirection: 'row' as const,
    gap: space.md,
  },
  formField: {
    gap: space.xs,
  },
  halfField: {
    flex: 1,
  },
  label: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  labelError: {
    color: t.status.negative.text,
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
  pincodeInput: {
    maxWidth: 150,
  },
  panInput: {
    maxWidth: 200,
  },
  textArea: {
    minHeight: 80,
    paddingTop: space.md,
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
    flexDirection: 'row' as const,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    gap: space.sm,
    backgroundColor: t.surface.card,
    ...t.shadow[3],
  },
  backButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderRadius: radius.button,
    borderColor: t.border.button,
    minHeight: 48,
    paddingHorizontal: space.lg,
    gap: space.xs,
  },
  backButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  backButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  nextButton: {
    flex: 1,
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

export default CustomerDetailsStep;
