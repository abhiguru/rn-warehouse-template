import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
  LayoutAnimation,
  UIManager,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { DatePickerModal } from 'react-native-paper-dates';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router, useLocalSearchParams } from 'expo-router';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { useAppSelector } from '@/store/hooks';
import { selectGRNFormItems } from '@/store/slices/grnFormSlice';
import { useGRNForm } from '@/hooks';
import { CustomerSearchBottomSheet, CustomerSearchBottomSheetRef } from '@/components/CustomerSearchBottomSheet';
import { SupervisorBottomSheet } from '@/features/grn/components/SupervisorBottomSheet';
import { GRNStepIndicator } from '@/components/GRNStepIndicator';
import { GRN_STEPS, STEP_NUMBERS, getCompletedSteps } from '@/constants/grnSteps';
import { GhostTextInput, GhostTextInputRef } from '@/components/GhostTextInput';
import { getTopVehicleSuggestion } from '@/services/vehicle-suggestion-service';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type GrnHeaderStepProps = {
  mode: 'create' | 'edit';
};

export function GrnHeaderStep({ mode }: GrnHeaderStepProps) {
  // Theme colors
  const colors = useListColors();

  // Extract ID from URL params for edit mode
  const { id } = useLocalSearchParams<{ id: string }>();

  // Use consolidated form hook - all auto-navigation logic is now in the hook
  const {
    header,
    isLoading,
    validationErrors,
    isCreateMode,
    updateHeaderField,
    updateHeaderFields,
    handleGrNoChange,
    navigateToStep,
    resetFormState,
  } = useGRNForm({ mode, grnIdParam: id });

  // Items still needed for dispatched check
  const items = useAppSelector(selectGRNFormItems);

  // Local UI state (not form data)
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSupervisorBottomSheet, setShowSupervisorBottomSheet] = useState(false);
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Bottom sheet refs
  const senderBottomSheetRef = useRef<CustomerSearchBottomSheetRef>(null);
  const customerBottomSheetRef = useRef<CustomerSearchBottomSheetRef>(null);

  // Input refs
  const registrationInputRef = useRef<GhostTextInputRef>(null);

  const hasDispatchedItems = !isCreateMode && items.some((item) => item.qty !== item.stock);

  const toggleOptionalFields = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowOptionalFields((prev) => !prev);
  };

  const hasUnsavedData = () => {
    return !!(
      header.sender_id ||
      header.customer_id ||
      header.note ||
      header.registration ||
      (header.gr_images?.length ?? 0) > 0
    );
  };

  const handleCancel = () => {
    const confirmDiscard = () => {
      resetFormState();
      // Always navigate to GRN list directly, not back one step
      router.replace('/grn');
    };

    if (hasUnsavedData()) {
      Alert.alert(
        isCreateMode ? 'Discard Changes?' : 'Cancel GRN Edit',
        'You have unsaved changes. Are you sure you want to leave?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: confirmDiscard },
        ]
      );
    } else {
      confirmDiscard();
    }
  };

  // Date picker handlers
  const handleDateConfirm = (params: { date: Date | undefined }) => {
    setShowDatePicker(false);
    if (params.date) {
      updateHeaderField('date', params.date.toISOString());
    }
  };

  const handleDateDismiss = () => {
    setShowDatePicker(false);
  };

  const openDatePicker = () => {
    setShowDatePicker(true);
  };

  // Selection handlers
  const handleCustomerSelect = (customer: { id: string; name: string }) => {
    updateHeaderFields({
      sender_id: customer.id,
      sender_name: customer.name,
      customer_id: customer.id,
      customer_name: customer.name,
    });
  };

  const handleSupervisorSelect = (supervisor: { id: string; name: string }) => {
    updateHeaderFields({
      supervisor_id: supervisor.id,
      supervisor_name: supervisor.name,
    });
    setShowSupervisorBottomSheet(false);
  };

  const handleSenderSelect = (customer: { id: string; name: string }) => {
    // Auto-populate customer with same value as sender
    updateHeaderFields({
      sender_id: customer.id,
      sender_name: customer.name,
      customer_id: customer.id,
      customer_name: customer.name,
    });
    // Dismiss keyboard and focus registration input
    Keyboard.dismiss();
    setTimeout(() => {
      registrationInputRef.current?.focus();
    }, 100);
  };

  // Navigation - simplified with hook
  const handleNext = async () => {
    const success = await navigateToStep(2);
    // navigateToStep handles validation, error alerts, and routing internally
  };

  const handleStepIndicatorPress = useCallback(async (stepNumber: number) => {
    if (stepNumber === STEP_NUMBERS.HEADER) return;
    await navigateToStep(stepNumber);
  }, [navigateToStep]);

  // Loading state for edit mode - show while fetching existing GRN data
  if (!isCreateMode && isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.gray50 }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading GRN details...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
      <GRNStepIndicator
        steps={GRN_STEPS}
        currentStep={STEP_NUMBERS.HEADER}
        completedSteps={getCompletedSteps(STEP_NUMBERS.HEADER)}
        onCancel={handleCancel}
        cancelMessage={isCreateMode ? undefined : 'Are you sure you want to cancel editing? All unsaved changes will be lost.'}
        onStepPress={handleStepIndicatorPress}
        grnNo={header.gr_no || undefined}
        isEditMode={!isCreateMode}
      />

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        enableOnAndroid
        enableAutomaticScroll
        extraScrollHeight={120}
        keyboardShouldPersistTaps="handled"
      >
        {hasDispatchedItems && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <View style={styles.warningTextContainer}>
              <Text style={styles.warningTitle}>Stock Protection Active</Text>
              <Text style={styles.warningText}>
                Some items in this GRN were already dispatched. Quantity/stock edits will be locked for those items.
              </Text>
            </View>
          </View>
        )}

        {/* Section Header - Basic Information */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>BASIC INFORMATION</Text>
        </View>

        <View style={[styles.formSection, { backgroundColor: colors.cellBackground }]}>
          <View style={styles.compactRow}>
            <View style={[styles.formField, styles.grNumberField]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                GR NUMBER<Text style={[styles.required, { color: colors.statusNegative }]}> *</Text>
              </Text>
              {isCreateMode && !header.gr_no ? (
                <View style={[styles.loadingInputContainer, { backgroundColor: colors.gray100 }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : (
                <View style={[styles.input, styles.grNoInput, { backgroundColor: colors.cellBackground, borderColor: colors.gray300 }, validationErrors.gr_no && { borderColor: colors.statusNegative, borderWidth: 2 }]}>
                  <Icon name="clipboard-text" size={18} color={colors.gray400} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.grNoTextInput, { color: colors.textPrimary }]}
                    value={header.gr_no}
                    onChangeText={(text) => handleGrNoChange(text.toUpperCase())}
                    placeholder="GRN####"
                    placeholderTextColor={colors.gray400}
                    autoCapitalize="characters"
                  />
                </View>
              )}
              {validationErrors.gr_no && (
                <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.gr_no}</Text>
              )}
            </View>

            <View style={[styles.formField, styles.dateField]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                DATE<Text style={[styles.required, { color: colors.statusNegative }]}> *</Text>
              </Text>
              <TouchableOpacity
                style={[styles.input, styles.dateInput, { backgroundColor: colors.cellBackground, borderColor: colors.gray300 }, validationErrors.date && { borderColor: colors.statusNegative, borderWidth: 2 }]}
                onPress={openDatePicker}
                activeOpacity={0.7}
              >
                <Icon name="calendar" size={18} color={colors.gray500} />
                <Text style={[styles.dateText, { color: colors.textPrimary }]}>
                  {new Date(header.date).toLocaleDateString()}
                </Text>
              </TouchableOpacity>
              {validationErrors.date && (
                <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.date}</Text>
              )}
            </View>
          </View>

          <View style={styles.formField}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              SENDER<Text style={[styles.required, { color: colors.statusNegative }]}> *</Text>
            </Text>
            <TouchableOpacity
              style={[styles.input, styles.senderInput, { backgroundColor: colors.cellBackground, borderColor: colors.gray300 }, validationErrors.sender_name && { borderColor: colors.statusNegative, borderWidth: 2 }]}
              onPress={() => senderBottomSheetRef.current?.open()}
              activeOpacity={0.7}
            >
              <Text style={[styles.senderText, { color: colors.textPrimary }, !header.sender_name && { color: colors.textSecondary }]}>
                {header.sender_name || 'Select sender...'}
              </Text>
              <Icon name="magnify" size={20} color={colors.gray400} />
            </TouchableOpacity>
            {validationErrors.sender_name && (
              <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.sender_name}</Text>
            )}
          </View>

          <View style={styles.formField}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              CUSTOMER<Text style={[styles.required, { color: colors.statusNegative }]}> *</Text>
            </Text>
            <TouchableOpacity
              style={[styles.input, styles.customerInput, { backgroundColor: colors.cellBackground, borderColor: colors.gray300 }, validationErrors.customer_id && { borderColor: colors.statusNegative, borderWidth: 2 }]}
              onPress={() => customerBottomSheetRef.current?.open()}
              activeOpacity={0.7}
            >
              <Text style={[styles.customerText, { color: colors.textPrimary }, !header.customer_name && { color: colors.textSecondary }]}>
                {header.customer_name || 'Select customer...'}
              </Text>
              <Icon name="magnify" size={20} color={colors.gray400} />
            </TouchableOpacity>
            {validationErrors.customer_id && (
              <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.customer_id}</Text>
            )}
          </View>

          <View style={styles.formField}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              SUPERVISOR<Text style={[styles.required, { color: colors.statusNegative }]}> *</Text>
            </Text>
            <TouchableOpacity
              style={[styles.input, styles.supervisorInput, { backgroundColor: colors.cellBackground, borderColor: colors.gray300 }, validationErrors.supervisor_id && { borderColor: colors.statusNegative, borderWidth: 2 }]}
              onPress={() => setShowSupervisorBottomSheet(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.supervisorText, { color: colors.textPrimary }, !header.supervisor_name && { color: colors.textSecondary }]}>
                {header.supervisor_name || 'Select supervisor...'}
              </Text>
              <Icon name="magnify" size={20} color={colors.gray400} />
            </TouchableOpacity>
            {validationErrors.supervisor_id && (
              <Text style={[styles.errorText, { color: colors.statusNegative }]}>{validationErrors.supervisor_id}</Text>
            )}
          </View>

          <View style={styles.formField}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>REGISTRATION</Text>
            <GhostTextInput
              ref={registrationInputRef}
              value={header.registration}
              onChangeText={(text) => updateHeaderField('registration', text)}
              getSuggestion={getTopVehicleSuggestion}
              suggestionContext={header.customer_id}
              placeholder="Vehicle registration"
              maxLength={12}
              autoCapitalize="characters"
              icon="car"
              isFocused={focusedField === 'registration'}
              onFocus={() => setFocusedField('registration')}
              onBlur={() => setFocusedField(null)}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.optionalToggle, { backgroundColor: colors.cellBackground, borderColor: colors.gray200 }]}
          onPress={toggleOptionalFields}
          activeOpacity={0.7}
        >
          <View style={styles.optionalToggleLeft}>
            <Icon
              name={showOptionalFields ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.gray600}
            />
            <Text style={[styles.optionalToggleText, { color: colors.gray600 }]}>
              {showOptionalFields ? 'Hide' : 'Show'} Optional Fields
            </Text>
          </View>
          {(header.note || header.leon) && !showOptionalFields && (
            <View style={[styles.optionalBadge, { backgroundColor: colors.statusNeutralLight }]}>
              <Text style={[styles.optionalBadgeText, { color: colors.statusNeutral }]}>Has data</Text>
            </View>
          )}
        </TouchableOpacity>

        {showOptionalFields && (
          <View style={[styles.formSection, { backgroundColor: colors.cellBackground }]}>
            <View style={styles.formField}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>PRICING MODE</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={[styles.radioChip, { backgroundColor: colors.gray100, borderColor: colors.gray300 }, header.pricing_mode === 'ONE_TIME' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => updateHeaderField('pricing_mode', 'ONE_TIME')}
                  activeOpacity={0.7}
                >
                  {header.pricing_mode === 'ONE_TIME' && (
                    <Icon name="check" size={14} color={colors.white} style={styles.radioChipCheckmark} />
                  )}
                  <Text style={[styles.radioChipText, { color: colors.gray700 }, header.pricing_mode === 'ONE_TIME' && { color: colors.white }]}>
                    One Time
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.radioChip, { backgroundColor: colors.gray100, borderColor: colors.gray300 }, header.pricing_mode === 'MONTHLY' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => updateHeaderField('pricing_mode', 'MONTHLY')}
                  activeOpacity={0.7}
                >
                  {header.pricing_mode === 'MONTHLY' && (
                    <Icon name="check" size={14} color={colors.white} style={styles.radioChipCheckmark} />
                  )}
                  <Text style={[styles.radioChipText, { color: colors.gray700 }, header.pricing_mode === 'MONTHLY' && { color: colors.white }]}>
                    Monthly
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formField}>
              <View style={styles.switchRow}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>LEON</Text>
                <Switch
                  value={header.leon}
                  onValueChange={(value) => updateHeaderField('leon', value)}
                  trackColor={{ false: colors.gray300, true: colors.primary }}
                  thumbColor={colors.white}
                  ios_backgroundColor={colors.gray300}
                />
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>NOTES</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.textPrimary },
                  focusedField === 'notes' && { borderColor: colors.primary, borderWidth: 2 },
                ]}
                value={header.note}
                onChangeText={(text) => updateHeaderField('note', text)}
                placeholder="Additional notes..."
                placeholderTextColor={colors.gray400}
                multiline
                numberOfLines={2}
                maxLength={280}
                onFocus={() => setFocusedField('notes')}
                onBlur={() => setFocusedField(null)}
              />
              {header.note.length > 0 && (
                <Text style={[styles.charCount, { color: colors.textSecondary }]}>{header.note.length}/280</Text>
              )}
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>

      {/* Date Picker Modal - Pure JS with dark mode support */}
      <DatePickerModal
        locale="en"
        mode="single"
        visible={showDatePicker}
        onDismiss={handleDateDismiss}
        date={header.date ? new Date(header.date) : new Date()}
        onConfirm={handleDateConfirm}
        onChange={handleDateConfirm}
        validRange={{ endDate: new Date() }}
        label="Select date"
      />

      <CustomerSearchBottomSheet
        ref={senderBottomSheetRef}
        onSelect={handleSenderSelect}
        title="Select Sender"
      />

      <CustomerSearchBottomSheet
        ref={customerBottomSheetRef}
        onSelect={handleCustomerSelect}
        title="Select Customer"
      />

      <SupervisorBottomSheet
        isVisible={showSupervisorBottomSheet}
        onClose={() => setShowSupervisorBottomSheet(false)}
        onSelect={handleSupervisorSelect}
        currentValue={
          header.supervisor_id && header.supervisor_name
            ? { id: header.supervisor_id, name: header.supervisor_name }
            : undefined
        }
      />
    </View>
  );
}

// SAP Fiori Form Cell Styles (colors applied inline for dark mode)
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
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.base,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.md,
    paddingBottom: 40,
  },
  // Fiori: Section header - 13pt, secondary color, capital case
  sectionHeader: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    lineHeight: 18,
  },
  formSection: {
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  formField: {
    marginBottom: theme.spacing.md,
  },
  // Fiori: Label - 13pt, secondary color
  label: {
    fontSize: 13,
    fontWeight: '400',
    marginBottom: 6,
    letterSpacing: 0.5,
    lineHeight: 18,
  },
  // Fiori: Required indicator - negative color
  required: {},
  // Fiori: Input field - 44pt min height
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: theme.fontSize.base,
    minHeight: 44,
  },
  // Fiori: Text area - 88pt min (3 lines), 176pt max
  textArea: {
    minHeight: 88,
    maxHeight: 176,
    textAlignVertical: 'top',
  },
  // Fiori: Read-only field
  readOnlyField: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  readOnlyText: {
    fontSize: theme.fontSize.base,
    lineHeight: 22,
  },
  // GRN number input styles
  grNoInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  grNoTextInput: {
    flex: 1,
    fontSize: theme.fontSize.base,
    padding: 0,
  },
  inputIcon: {
    marginRight: 4,
  },
  loadingInputContainer: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    fontSize: theme.fontSize.base,
    flex: 1,
    lineHeight: 22,
  },
  senderInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  senderText: {
    fontSize: theme.fontSize.base,
    flex: 1,
    lineHeight: 22,
  },
  customerInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customerText: {
    fontSize: theme.fontSize.base,
    flex: 1,
    lineHeight: 22,
  },
  supervisorInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  supervisorText: {
    fontSize: theme.fontSize.base,
    flex: 1,
    lineHeight: 22,
  },
  // Fiori: Error text - 13pt
  errorText: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  // Fiori: Helper text - 13pt
  charCount: {
    fontSize: 13,
    textAlign: 'right',
    marginTop: 4,
    lineHeight: 18,
  },
  // Fiori: Switch row - 44pt min height
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
  },
  radioGroup: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  radioChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 44,
  },
  radioChipCheckmark: {
    marginRight: 4,
  },
  radioChipText: {
    fontSize: 13,
    fontWeight: theme.fontWeight.medium,
  },
  compactRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  halfField: {
    flex: 1,
  },
  grNumberField: {
    flex: 0.4,
  },
  dateField: {
    flex: 0.6,
  },
  optionalToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  optionalToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  optionalToggleText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  optionalBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  optionalBadgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  warningBanner: {
    backgroundColor: '#fef3c7',
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningTextContainer: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 14,
    color: '#78350f',
    lineHeight: 20,
  },
  iosDatePickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  iosDatePickerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  iosDatePickerContainer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 20,
  },
  iosDatePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  iosDatePickerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  iosDatePickerCancel: {
    fontSize: 17,
  },
  iosDatePickerDone: {
    fontSize: 17,
    fontWeight: '600',
  },
  iosDatePicker: {
    height: 216,
  },
});

export default GrnHeaderStep;
