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
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router } from 'expo-router';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { useCustomerForm } from '@/hooks/useCustomerForm';
import { GenericStepIndicatorHeader } from '@/components/GenericStepIndicatorHeader';
import { CUSTOMER_STEPS, CUSTOMER_STEP_NUMBERS, getCompletedSteps } from '@/constants/customerSteps';
import { CustomerFormMode } from '@/types/customer.types';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// =============================================================================
// COMPONENT
// =============================================================================

type CustomerDetailsStepProps = {
  mode: CustomerFormMode;
  customerId?: string;
};

export function CustomerDetailsStep({ mode, customerId }: CustomerDetailsStepProps) {
  // Theme colors
  const colors = useListColors();

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
  const [focusedField, setFocusedField] = useState<string | null>(null);
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
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to leave?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: confirmDiscard },
        ]
      );
    } else {
      confirmDiscard();
    }
  }, [isDirty, resetFormState]);

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
      if (errors.name) errorMessages.push(`Name: ${errors.name}`);
      if (errors.mobile) errorMessages.push(`Mobile: ${errors.mobile}`);
      if (errors.email) errorMessages.push(`Email: ${errors.email}`);
      // Step 2 errors
      if (errors.city) errorMessages.push(`City: ${errors.city}`);
      if (errors.state) errorMessages.push(`State: ${errors.state}`);
      if (errors.pincode) errorMessages.push(`Pincode: ${errors.pincode}`);
      if (errors.address) errorMessages.push(`Address: ${errors.address}`);
      if (errors.gst) errorMessages.push(`GST: ${errors.gst}`);
      if (errors.pan) errorMessages.push(`PAN: ${errors.pan}`);
      if (errors.contact_name) errorMessages.push(`Contact Name: ${errors.contact_name}`);
      if (errors.contact_mobile) errorMessages.push(`Contact Mobile: ${errors.contact_mobile}`);
      if (errors.contact_email) errorMessages.push(`Contact Email: ${errors.contact_email}`);

      if (errorMessages.length > 0) {
        Alert.alert('Please Fix Errors', errorMessages.join('\n'));
      } else {
        // No specific field errors but validation still failed
        Alert.alert('Validation Failed', 'Please check all required fields are filled correctly.');
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
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
      {/* Step Indicator */}
      <GenericStepIndicatorHeader
        steps={CUSTOMER_STEPS}
        currentStep={CUSTOMER_STEP_NUMBERS.DETAILS}
        completedSteps={getCompletedSteps(CUSTOMER_STEP_NUMBERS.DETAILS)}
        onCancel={handleCancel}
        onStepPress={handleStepIndicatorPress}
        colorScheme="teal"
        entityName={isCreateMode ? 'Customer' : 'Customer'}
        entityId={isCreateMode ? undefined : formData.name || 'Editing'}
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
          <Text style={[styles.title, { color: colors.gray900 }]}>Address & Tax Details</Text>
          <Text style={[styles.subtitle, { color: colors.gray600 }]}>
            Add location, tax IDs, and contact person (all optional)
          </Text>
        </View>

        {/* ADDRESS SECTION */}
        <View style={[styles.section, { backgroundColor: colors.cellBackground, borderColor: colors.gray200 }]}>
          <View style={[styles.sectionHeader, { paddingHorizontal: 16, paddingTop: 12 }]}>
            <Icon name="map-marker" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.gray900 }]}>Address</Text>
          </View>

          {/* City & State Row */}
          <View style={styles.row}>
            <View style={[styles.formField, styles.halfField]}>
              <Text style={[styles.label, { color: colors.gray600 }]}>CITY</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.gray900 },
                  focusedField === 'city' && { borderColor: colors.primary, borderWidth: 2 },
                  validationErrors.city && { borderColor: colors.statusNegative, borderWidth: 2 },
                ]}
                value={formData.city}
                onChangeText={updateCity}
                placeholder="City"
                placeholderTextColor={colors.gray400}
                maxLength={50}
                returnKeyType="next"
                onSubmitEditing={() => stateInputRef.current?.focus()}
                onFocus={() => setFocusedField('city')}
                onBlur={() => setFocusedField(null)}
                autoCapitalize="words"
              />
              {validationErrors.city && (
                <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.city}</Text>
              )}
            </View>

            <View style={[styles.formField, styles.halfField]}>
              <Text style={[styles.label, { color: colors.gray600 }]}>STATE</Text>
              <TextInput
                ref={stateInputRef}
                style={[
                  styles.input,
                  { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.gray900 },
                  focusedField === 'state' && { borderColor: colors.primary, borderWidth: 2 },
                  validationErrors.state && { borderColor: colors.statusNegative, borderWidth: 2 },
                ]}
                value={formData.state}
                onChangeText={updateState}
                placeholder="State"
                placeholderTextColor={colors.gray400}
                maxLength={50}
                returnKeyType="next"
                onSubmitEditing={() => pincodeInputRef.current?.focus()}
                onFocus={() => setFocusedField('state')}
                onBlur={() => setFocusedField(null)}
                autoCapitalize="words"
              />
              {validationErrors.state && (
                <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.state}</Text>
              )}
            </View>
          </View>

          {/* Pincode */}
          <View style={styles.formField}>
            <Text style={[styles.label, { color: colors.gray600 }]}>PINCODE</Text>
            <TextInput
              ref={pincodeInputRef}
              style={[
                styles.input,
                { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.gray900, maxWidth: 150 },
                focusedField === 'pincode' && { borderColor: colors.primary, borderWidth: 2 },
                validationErrors.pincode && { borderColor: colors.statusNegative, borderWidth: 2 },
              ]}
              value={formData.pincode}
              onChangeText={(text) => {
                const cleaned = text.replace(/\D/g, '').slice(0, 6);
                updatePincode(cleaned);
              }}
              placeholder="6-digit pincode"
              placeholderTextColor={colors.gray400}
              keyboardType="number-pad"
              maxLength={6}
              returnKeyType="next"
              onSubmitEditing={() => addressInputRef.current?.focus()}
              onFocus={() => setFocusedField('pincode')}
              onBlur={() => setFocusedField(null)}
            />
            {validationErrors.pincode && (
              <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.pincode}</Text>
            )}
          </View>

          {/* Full Address */}
          <View style={[styles.formField, { paddingBottom: 16 }]}>
            <Text style={[styles.label, { color: colors.gray600 }]}>FULL ADDRESS</Text>
            <TextInput
              ref={addressInputRef}
              style={[
                styles.input,
                styles.textArea,
                { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.gray900 },
                focusedField === 'address' && { borderColor: colors.primary, borderWidth: 2 },
                validationErrors.address && { borderColor: colors.statusNegative, borderWidth: 2 },
              ]}
              value={formData.address}
              onChangeText={updateAddress}
              placeholder="Street address, building name, etc."
              placeholderTextColor={colors.gray400}
              maxLength={500}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              returnKeyType="done"
              onFocus={() => setFocusedField('address')}
              onBlur={() => setFocusedField(null)}
            />
            {validationErrors.address && (
              <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.address}</Text>
            )}
          </View>
        </View>

        {/* TAX DETAILS SECTION (Collapsible) */}
        <View style={[styles.section, { backgroundColor: colors.cellBackground, borderColor: colors.gray200 }]}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => toggleSection('tax')}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeader}>
              <Icon name="receipt" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.gray900 }]}>Tax Details</Text>
            </View>
            <Icon
              name={showTaxSection ? 'chevron-up' : 'chevron-down'}
              size={24}
              color={colors.gray500}
            />
          </TouchableOpacity>

          {showTaxSection && (
            <View style={styles.collapsibleContent}>
              {/* GST */}
              <View style={[styles.formField, { paddingHorizontal: 0 }]}>
                <Text style={[styles.label, { color: colors.gray600 }]}>GST NUMBER</Text>
                <TextInput
                  ref={gstInputRef}
                  style={[
                    styles.input,
                    { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.gray900 },
                    focusedField === 'gst' && { borderColor: colors.primary, borderWidth: 2 },
                    validationErrors.gst && { borderColor: colors.statusNegative, borderWidth: 2 },
                  ]}
                  value={formData.gst}
                  onChangeText={updateGST}
                  placeholder="15-character GST number"
                  placeholderTextColor={colors.gray400}
                  maxLength={15}
                  autoCapitalize="characters"
                  returnKeyType="next"
                  onSubmitEditing={() => panInputRef.current?.focus()}
                  onFocus={() => setFocusedField('gst')}
                  onBlur={() => setFocusedField(null)}
                />
                {validationErrors.gst && (
                  <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.gst}</Text>
                )}
                <Text style={[styles.helperText, { color: colors.gray500 }]}>
                  Format: 22AAAAA0000A1Z5
                </Text>
              </View>

              {/* PAN */}
              <View style={[styles.formField, { paddingHorizontal: 0 }]}>
                <Text style={[styles.label, { color: colors.gray600 }]}>PAN NUMBER</Text>
                <TextInput
                  ref={panInputRef}
                  style={[
                    styles.input,
                    { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.gray900, maxWidth: 200 },
                    focusedField === 'pan' && { borderColor: colors.primary, borderWidth: 2 },
                    validationErrors.pan && { borderColor: colors.statusNegative, borderWidth: 2 },
                  ]}
                  value={formData.pan}
                  onChangeText={updatePAN}
                  placeholder="10-character PAN"
                  placeholderTextColor={colors.gray400}
                  maxLength={10}
                  autoCapitalize="characters"
                  returnKeyType="done"
                  onFocus={() => setFocusedField('pan')}
                  onBlur={() => setFocusedField(null)}
                />
                {validationErrors.pan && (
                  <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.pan}</Text>
                )}
                <Text style={[styles.helperText, { color: colors.gray500 }]}>
                  Format: AAAAA0000A
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* CONTACT PERSON SECTION (Collapsible) */}
        <View style={[styles.section, { backgroundColor: colors.cellBackground, borderColor: colors.gray200 }]}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => toggleSection('contact')}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeader}>
              <Icon name="account-box" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.gray900 }]}>Contact Person</Text>
            </View>
            <Icon
              name={showContactSection ? 'chevron-up' : 'chevron-down'}
              size={24}
              color={colors.gray500}
            />
          </TouchableOpacity>

          {showContactSection && (
            <View style={styles.collapsibleContent}>
              {/* Contact Name */}
              <View style={[styles.formField, { paddingHorizontal: 0 }]}>
                <Text style={[styles.label, { color: colors.gray600 }]}>CONTACT NAME</Text>
                <TextInput
                  ref={contactNameInputRef}
                  style={[
                    styles.input,
                    { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.gray900 },
                    focusedField === 'contact_name' && { borderColor: colors.primary, borderWidth: 2 },
                    validationErrors.contact_name && { borderColor: colors.statusNegative, borderWidth: 2 },
                  ]}
                  value={formData.contact_name}
                  onChangeText={updateContactName}
                  placeholder="Contact person's name"
                  placeholderTextColor={colors.gray400}
                  maxLength={100}
                  returnKeyType="next"
                  onSubmitEditing={() => contactMobileInputRef.current?.focus()}
                  onFocus={() => setFocusedField('contact_name')}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="words"
                />
                {validationErrors.contact_name && (
                  <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.contact_name}</Text>
                )}
              </View>

              {/* Contact Mobile */}
              <View style={[styles.formField, { paddingHorizontal: 0 }]}>
                <Text style={[styles.label, { color: colors.gray600 }]}>CONTACT MOBILE</Text>
                <View style={styles.phoneInputContainer}>
                  <View style={[styles.countryCode, { backgroundColor: colors.gray100, borderColor: colors.gray300 }]}>
                    <Text style={[styles.countryCodeText, { color: colors.gray700 }]}>+91</Text>
                  </View>
                  <TextInput
                    ref={contactMobileInputRef}
                    style={[
                      styles.input,
                      styles.phoneInput,
                      { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.gray900 },
                      focusedField === 'contact_mobile' && { borderColor: colors.primary, borderWidth: 2 },
                      validationErrors.contact_mobile && { borderColor: colors.statusNegative, borderWidth: 2 },
                    ]}
                    value={formData.contact_mobile.replace(/^91/, '')}
                    onChangeText={(text) => {
                      const cleaned = text.replace(/\D/g, '').slice(0, 10);
                      updateContactMobile(cleaned);
                    }}
                    placeholder="10 digit mobile"
                    placeholderTextColor={colors.gray400}
                    keyboardType="phone-pad"
                    maxLength={10}
                    returnKeyType="next"
                    onSubmitEditing={() => contactEmailInputRef.current?.focus()}
                    onFocus={() => setFocusedField('contact_mobile')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                {validationErrors.contact_mobile && (
                  <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.contact_mobile}</Text>
                )}
              </View>

              {/* Contact Email */}
              <View style={[styles.formField, { paddingHorizontal: 0 }]}>
                <Text style={[styles.label, { color: colors.gray600 }]}>CONTACT EMAIL</Text>
                <TextInput
                  ref={contactEmailInputRef}
                  style={[
                    styles.input,
                    { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.gray900 },
                    focusedField === 'contact_email' && { borderColor: colors.primary, borderWidth: 2 },
                    validationErrors.contact_email && { borderColor: colors.statusNegative, borderWidth: 2 },
                  ]}
                  value={formData.contact_email}
                  onChangeText={updateContactEmail}
                  placeholder="contact@example.com"
                  placeholderTextColor={colors.gray400}
                  keyboardType="email-address"
                  maxLength={100}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onFocus={() => setFocusedField('contact_email')}
                  onBlur={() => setFocusedField(null)}
                />
                {validationErrors.contact_email && (
                  <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.contact_email}</Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Spacer for button */}
        <View style={styles.bottomSpacer} />
      </KeyboardAwareScrollView>

      {/* Bottom Buttons */}
      <View style={[styles.buttonContainer, { backgroundColor: colors.gray50, borderTopColor: colors.gray200 }]}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.cellBackground, borderColor: colors.primary }]}
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <Icon name="chevron-left" size={20} color={colors.primary} />
          <Text style={[styles.backButtonText, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: colors.primary }]}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={[styles.nextButtonText, { color: colors.white }]}>Next: Review</Text>
          <Icon name="chevron-right" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },

  // Header
  header: {
    paddingVertical: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
  },

  // Sections
  section: {
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  collapsibleContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16,
  },

  // Form
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  formField: {
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  halfField: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  errorText: {
    fontSize: 13,
    marginTop: 4,
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
  },

  // Phone input
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryCode: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginRight: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  countryCodeText: {
    fontSize: 16,
    fontWeight: '500',
  },
  phoneInput: {
    flex: 1,
  },

  // Bottom
  bottomSpacer: {
    height: 40,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 4,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CustomerDetailsStep;
