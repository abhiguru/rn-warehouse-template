/**
 * CustomerBasicInfoStep Screen
 *
 * Step 1 of customer form: Basic Information
 * Collects name, mobile, and email.
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
  ActivityIndicator,
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

// =============================================================================
// COMPONENT
// =============================================================================

type CustomerBasicInfoStepProps = {
  mode: CustomerFormMode;
  customerId?: string;
};

export function CustomerBasicInfoStep({ mode, customerId }: CustomerBasicInfoStepProps) {
  // Theme colors
  const colors = useListColors();

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
      Alert.alert(
        isCreateMode ? 'Discard Changes?' : 'Cancel Edit',
        'You have unsaved changes. Are you sure you want to leave?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: confirmDiscard },
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
      <View style={[styles.loadingContainer, { backgroundColor: colors.gray50 }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.gray600 }]}>Loading customer data...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
      {/* Step Indicator */}
      <GenericStepIndicatorHeader
        steps={CUSTOMER_STEPS}
        currentStep={CUSTOMER_STEP_NUMBERS.BASIC}
        completedSteps={getCompletedSteps(CUSTOMER_STEP_NUMBERS.BASIC)}
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
          <Text style={[styles.title, { color: colors.gray900 }]}>Basic Information</Text>
          <Text style={[styles.subtitle, { color: colors.gray600 }]}>
            Enter the customer's primary details
          </Text>
        </View>

        {/* Form Fields */}
        <View style={styles.formContainer}>
          {/* Customer Name */}
          <View style={styles.formField}>
            <Text style={[styles.label, { color: colors.gray600 }]}>
              CUSTOMER NAME<Text style={[styles.required, { color: colors.statusNegative }]}> *</Text>
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.gray900 },
                focusedField === 'name' && { borderColor: colors.primary, borderWidth: 2 },
                validationErrors.name && { borderColor: colors.statusNegative, borderWidth: 2 },
              ]}
              value={formData.name}
              onChangeText={updateName}
              placeholder="Enter customer name"
              placeholderTextColor={colors.gray400}
              maxLength={200}
              returnKeyType="next"
              onSubmitEditing={() => mobileInputRef.current?.focus()}
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
              autoCapitalize="words"
            />
            {validationErrors.name && (
              <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.name}</Text>
            )}
          </View>

          {/* Mobile Number */}
          <View style={styles.formField}>
            <Text style={[styles.label, { color: colors.gray600 }]}>
              MOBILE NUMBER<Text style={[styles.required, { color: colors.statusNegative }]}> *</Text>
            </Text>
            <View style={styles.phoneInputContainer}>
              <View style={[styles.countryCode, { backgroundColor: colors.gray100, borderColor: colors.gray300 }]}>
                <Text style={[styles.countryCodeText, { color: colors.gray700 }]}>+91</Text>
              </View>
              <TextInput
                ref={mobileInputRef}
                style={[
                  styles.input,
                  styles.phoneInput,
                  { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.gray900 },
                  focusedField === 'mobile' && { borderColor: colors.primary, borderWidth: 2 },
                  validationErrors.mobile && { borderColor: colors.statusNegative, borderWidth: 2 },
                ]}
                value={formData.mobile.replace(/^91/, '')}
                onChangeText={(text) => {
                  // Remove non-digits and limit to 10 chars
                  const cleaned = text.replace(/\D/g, '').slice(0, 10);
                  updateMobile(cleaned);
                }}
                placeholder="10 digit mobile number"
                placeholderTextColor={colors.gray400}
                keyboardType="phone-pad"
                maxLength={10}
                returnKeyType="next"
                onSubmitEditing={() => emailInputRef.current?.focus()}
                onFocus={() => setFocusedField('mobile')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
            {validationErrors.mobile && (
              <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.mobile}</Text>
            )}
          </View>

          {/* Email */}
          <View style={styles.formField}>
            <Text style={[styles.label, { color: colors.gray600 }]}>EMAIL</Text>
            <TextInput
              ref={emailInputRef}
              style={[
                styles.input,
                { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.gray900 },
                focusedField === 'email' && { borderColor: colors.primary, borderWidth: 2 },
                validationErrors.email && { borderColor: colors.statusNegative, borderWidth: 2 },
              ]}
              value={formData.email}
              onChangeText={updateEmail}
              placeholder="customer@example.com"
              placeholderTextColor={colors.gray400}
              keyboardType="email-address"
              maxLength={100}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
            />
            {validationErrors.email && (
              <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.email}</Text>
            )}
            <Text style={[styles.helperText, { color: colors.gray500 }]}>Optional - for sending invoices</Text>
          </View>
        </View>

        {/* Spacer for button */}
        <View style={styles.bottomSpacer} />
      </KeyboardAwareScrollView>

      {/* Next Button */}
      <View style={[styles.buttonContainer, { backgroundColor: colors.gray50, borderTopColor: colors.gray200 }]}>
        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: colors.primary }]}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={[styles.nextButtonText, { color: colors.white }]}>Next: Details</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
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

  // Form
  formContainer: {
    gap: 20,
  },
  formField: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  required: {},
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
  },
  errorText: {
    fontSize: 13,
    marginTop: 4,
  },
  helperText: {
    fontSize: 13,
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
    padding: 16,
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
  nextButton: {
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

export default CustomerBasicInfoStep;
