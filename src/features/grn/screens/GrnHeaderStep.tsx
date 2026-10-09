import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Switch,
  LayoutAnimation,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { DatePickerModal } from 'react-native-paper-dates';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { useAppSelector } from '@/store/hooks';
import { selectGRNFormItems } from '@/store/slices/grnFormSlice';
import { useGRNForm } from '@/hooks';
import { CustomerSearchBottomSheet, CustomerSearchBottomSheetRef } from '@/components/CustomerSearchBottomSheet';
import { SupervisorBottomSheet } from '@/features/grn/components/SupervisorBottomSheet';
import { GRNStepIndicator } from '@/components/GRNStepIndicator';
import GRNFormBottomNav from '@/components/GRNFormBottomNav';
import { formatDate } from '@/utils/formatters';
import { GRN_STEPS, STEP_NUMBERS, getCompletedSteps } from '@/constants/grnSteps';
import { GhostTextInput, GhostTextInputRef } from '@/components/GhostTextInput';
import { getTopVehicleSuggestion } from '@/services/vehicle-suggestion-service';

import { showAlert } from '@/utils/alert';
import { StatusTag } from '@/components/ui';
type GrnHeaderStepProps = {
  mode: 'create' | 'edit';
};

export function GrnHeaderStep({ mode }: GrnHeaderStepProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Extract ID from URL params for edit mode
  const { id } = useLocalSearchParams<{ id: string }>();

  // Use consolidated form hook - all auto-navigation logic is now in the hook
  const {
    header,
    isLoading,
    isGeneratingNumber,
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
      showAlert(
        isCreateMode ? 'Discard this GRN?' : 'Discard changes to this GRN?',
        isCreateMode
          ? 'The details you entered will be lost.'
          : 'Your unsaved changes will be lost.',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: isCreateMode ? 'Discard GRN' : 'Discard changes',
            style: 'destructive',
            onPress: confirmDiscard,
          },
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
    Keyboard.dismiss();
    // navigateToStep validates step 1 (same check as the swipe), shows the
    // error alert, and routes on success.
    await navigateToStep(STEP_NUMBERS.ITEMS);
  };

  const handleStepIndicatorPress = useCallback(async (stepNumber: number) => {
    if (stepNumber === STEP_NUMBERS.HEADER) return;
    await navigateToStep(stepNumber);
  }, [navigateToStep]);

  // Loading state for edit mode - show while fetching existing GRN data
  if (!isCreateMode && isLoading) {
    return (
      <View style={styles.loadingContainer} accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>Loading GRN details…</Text>
      </View>
    );
  }

  const renderLabel = (text: string, required = false) => (
    <Text style={styles.label}>
      {text}
      {required ? <Text style={styles.required}> *</Text> : null}
    </Text>
  );

  const renderError = (message?: string) =>
    message ? (
      <View style={styles.errorRow} accessibilityLiveRegion="polite">
        <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
        <Text style={styles.errorText}>{message}</Text>
      </View>
    ) : null;

  const renderPickerField = (
    label: string,
    value: string | undefined,
    placeholder: string,
    error: string | undefined,
    onPress: () => void
  ) => (
    <View style={styles.formField}>
      {renderLabel(label, true)}
      <Pressable
        style={({ pressed }) => [
          styles.input,
          styles.pickerInput,
          pressed && styles.inputPressed,
          error ? styles.inputError : null,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value || 'not selected'}`}
        accessibilityHint={`Opens a list to choose the ${label.toLowerCase()}`}
      >
        <Text style={value ? styles.valueText : styles.placeholderText} numberOfLines={2}>
          {value || placeholder}
        </Text>
        <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} />
      </Pressable>
      {renderError(error)}
    </View>
  );

  const pricingOptions = [
    { value: 'ONE_TIME' as const, label: 'One time' },
    { value: 'MONTHLY' as const, label: 'Monthly' },
  ];

  return (
    <View style={styles.container}>
      <GRNStepIndicator
        steps={GRN_STEPS}
        currentStep={STEP_NUMBERS.HEADER}
        completedSteps={getCompletedSteps(STEP_NUMBERS.HEADER)}
        onCancel={handleCancel}
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
          <View style={styles.warningBanner} accessible accessibilityRole="alert">
            <Icon name="alert" size={iconSize.md} color={t.status.critical.text} />
            <View style={styles.warningTextContainer}>
              <Text style={styles.warningTitle}>Some items are already dispatched</Text>
              <Text style={styles.warningText}>
                You can't change the quantity or stock of items that were dispatched from this GRN.
              </Text>
            </View>
          </View>
        )}

        <Text style={styles.sectionHeaderText} accessibilityRole="header">
          BASIC INFORMATION
        </Text>

        <View style={styles.formSection}>
          <View style={styles.compactRow}>
            <View style={[styles.formField, styles.grNumberField]}>
              {renderLabel('GRN number', true)}
              {isCreateMode && isGeneratingNumber ? (
                <View
                  style={[styles.input, styles.loadingInputContainer]}
                  accessibilityLabel="Getting the next GRN number"
                  accessibilityState={{ busy: true }}
                >
                  <ActivityIndicator size="small" color={t.brand.tint} />
                </View>
              ) : (
                <View
                  style={[
                    styles.input,
                    styles.rowInput,
                    focusedField === 'gr_no' && styles.inputFocused,
                    validationErrors.gr_no ? styles.inputError : null,
                  ]}
                >
                  <Icon name="package-down" size={iconSize.md} color={t.icon.secondary} />
                  <TextInput
                    style={styles.grNoTextInput}
                    accessibilityLabel="Receipt number"
                    value={header.gr_no}
                    onChangeText={(text) => handleGrNoChange(text.toUpperCase())}
                    placeholder="GRN####"
                    placeholderTextColor={t.text.placeholder}
                    autoCapitalize="characters"
                    returnKeyType="next"
                    onFocus={() => setFocusedField('gr_no')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              )}
              {renderError(validationErrors.gr_no)}
            </View>

            <View style={[styles.formField, styles.dateField]}>
              {renderLabel('Date', true)}
              <Pressable
                style={({ pressed }) => [
                  styles.input,
                  styles.rowInput,
                  pressed && styles.inputPressed,
                  validationErrors.date ? styles.inputError : null,
                ]}
                onPress={openDatePicker}
                accessibilityRole="button"
                accessibilityLabel={`Date, ${formatHeaderDate(header.date)}`}
                accessibilityHint="Opens the date picker"
              >
                <Icon name="calendar-outline" size={iconSize.md} color={t.icon.secondary} />
                <Text style={styles.valueText}>{formatHeaderDate(header.date)}</Text>
              </Pressable>
              {renderError(validationErrors.date)}
            </View>
          </View>

          {renderPickerField(
            'Sender',
            header.sender_name,
            'Select sender',
            validationErrors.sender_name,
            () => senderBottomSheetRef.current?.open()
          )}

          {renderPickerField(
            'Customer',
            header.customer_name,
            'Select customer',
            validationErrors.customer_id,
            () => customerBottomSheetRef.current?.open()
          )}

          {renderPickerField(
            'Supervisor',
            header.supervisor_name,
            'Select supervisor',
            validationErrors.supervisor_id,
            () => setShowSupervisorBottomSheet(true)
          )}

          <View style={[styles.formField, styles.lastField]}>
            {renderLabel('Vehicle registration')}
            <GhostTextInput
              ref={registrationInputRef}
              value={header.registration}
              onChangeText={(text) => updateHeaderField('registration', text)}
              getSuggestion={getTopVehicleSuggestion}
              suggestionContext={header.customer_id}
              placeholder="For example GJ01AB1234"
              maxLength={12}
              autoCapitalize="characters"
              icon="car"
              isFocused={focusedField === 'registration'}
              onFocus={() => setFocusedField('registration')}
              onBlur={() => setFocusedField(null)}
            />
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.optionalToggle, pressed && styles.optionalTogglePressed]}
          onPress={toggleOptionalFields}
          accessibilityRole="button"
          accessibilityState={{ expanded: showOptionalFields }}
          accessibilityLabel={showOptionalFields ? 'Hide optional fields' : 'Show optional fields'}
        >
          <View style={styles.optionalToggleLeft}>
            <Icon
              name={showOptionalFields ? 'chevron-up' : 'chevron-down'}
              size={iconSize.md}
              color={t.brand.tint}
            />
            <Text style={styles.optionalToggleText}>
              {showOptionalFields ? 'Hide optional fields' : 'Show optional fields'}
            </Text>
          </View>
          {(header.note || header.leon) && !showOptionalFields ? (
            <StatusTag status="neutral" label="Has data" icon={null} />
          ) : null}
        </Pressable>

        {showOptionalFields && (
          <View style={styles.formSection}>
            <View style={styles.formField}>
              {renderLabel('Pricing mode')}
              <View style={styles.radioGroup} accessibilityRole="radiogroup">
                {pricingOptions.map((option) => {
                  const selected = header.pricing_mode === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      style={({ pressed }) => [
                        styles.radioChip,
                        selected && styles.radioChipSelected,
                        pressed && !selected && styles.radioChipPressed,
                      ]}
                      onPress={() => updateHeaderField('pricing_mode', option.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, checked: selected }}
                      accessibilityLabel={option.label}
                      hitSlop={{ top: space.sm, bottom: space.sm }}
                    >
                      {selected ? <Icon name="check" size={iconSize.sm} color={t.brand.tint} /> : null}
                      <Text
                        style={[styles.radioChipText, selected && styles.radioChipTextSelected]}
                        maxFontSizeMultiplier={1.6}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.formField}>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Leon</Text>
                <Switch
                  value={header.leon}
                  onValueChange={(value) => updateHeaderField('leon', value)}
                  trackColor={{ false: t.control.trackOff, true: t.brand.fill }}
                  thumbColor={t.control.thumb}
                  ios_backgroundColor={t.control.trackOff}
                  accessibilityLabel="Leon"
                />
              </View>
            </View>

            <View style={[styles.formField, styles.lastField]}>
              {renderLabel('Notes')}
              <TextInput
                style={[styles.input, styles.textArea, focusedField === 'notes' && styles.inputFocused]}
                accessibilityLabel="Notes"
                value={header.note}
                onChangeText={(text) => updateHeaderField('note', text)}
                placeholder="Add a note for this GRN"
                placeholderTextColor={t.text.placeholder}
                multiline
                numberOfLines={2}
                maxLength={280}
                onFocus={() => setFocusedField('notes')}
                onBlur={() => setFocusedField(null)}
              />
              {header.note.length > 0 && <Text style={styles.charCount}>{header.note.length}/280</Text>}
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>

      <GRNFormBottomNav
        currentStep={STEP_NUMBERS.HEADER}
        totalSteps={GRN_STEPS.length}
        onNext={handleNext}
      />

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
        title="Select sender"
      />

      <CustomerSearchBottomSheet
        ref={customerBottomSheetRef}
        onSelect={handleCustomerSelect}
        title="Select customer"
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

/** "9 Oct 2026" (§12.3); today when no date is set yet. */
function formatHeaderDate(value: string | undefined): string {
  return formatDate(value || new Date());
}

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.background.base,
  },
  loadingText: { ...typography.subhead, color: t.text.secondary, marginTop: space.md },
  scrollView: { flex: 1 },
  contentContainer: { padding: space.lg, paddingBottom: space.huge },
  sectionHeaderText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    color: t.text.secondary,
    paddingHorizontal: space.xs,
    marginBottom: space.sm,
  },
  formSection: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.lg,
    marginBottom: space.xxl,
    ...t.shadow[2],
  },
  formField: { marginBottom: space.lg },
  lastField: { marginBottom: 0 },
  label: { ...typography.footnote, color: t.text.secondary, marginBottom: space.xs },
  required: { color: t.text.required },
  input: {
    ...typography.body,
    color: t.text.primary,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: touchTarget,
  },
  inputPressed: { backgroundColor: t.surface.cardPressed },
  inputFocused: { borderColor: t.border.fieldFocus, borderWidth: 2 },
  inputError: { borderColor: t.status.negative.border, borderWidth: 2 },
  textArea: { minHeight: 88, maxHeight: 176, textAlignVertical: 'top' as const },
  rowInput: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  pickerInput: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
  },
  grNoTextInput: { ...typography.body, color: t.text.primary, flex: 1, padding: 0 },
  loadingInputContainer: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.surface.fieldReadOnly,
    borderWidth: 0,
  },
  valueText: { ...typography.body, color: t.text.primary, flex: 1 },
  placeholderText: { ...typography.body, color: t.text.placeholder, flex: 1 },
  errorRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.xs,
    marginTop: space.xs,
  },
  errorText: { ...typography.footnote, color: t.status.negative.text, flex: 1 },
  charCount: {
    ...typography.caption1,
    color: t.text.secondary,
    textAlign: 'right' as const,
    marginTop: space.xs,
    fontVariant: ['tabular-nums' as const],
  },
  switchRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
  },
  switchLabel: { ...typography.body, color: t.text.primary },
  radioGroup: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.sm },
  radioChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.xs,
    minHeight: 32,
    paddingVertical: space.s6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: t.border.button,
    backgroundColor: t.surface.card,
  },
  radioChipPressed: { backgroundColor: t.surface.cardPressed },
  radioChipSelected: { backgroundColor: t.brand.subtle, borderColor: t.brand.tint },
  radioChipText: { ...typography.footnote, fontWeight: fontWeight.medium, color: t.text.primary },
  radioChipTextSelected: { color: t.brand.tint, fontWeight: fontWeight.semibold },
  compactRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, columnGap: space.md },
  grNumberField: { flexGrow: 4, flexBasis: 120 },
  dateField: { flexGrow: 6, flexBasis: 140 },
  optionalToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.button,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: t.border.button,
    backgroundColor: t.surface.card,
  },
  optionalTogglePressed: { backgroundColor: t.brand.subtle },
  optionalToggleLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  optionalToggleText: { ...typography.callout, color: t.brand.tint },
  warningBanner: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    backgroundColor: t.status.critical.background,
    borderWidth: 1,
    borderColor: t.status.critical.border,
    borderRadius: radius.button,
    padding: space.md,
    marginBottom: space.lg,
  },
  warningTextContainer: { flex: 1 },
  warningTitle: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.status.critical.text,
    marginBottom: space.xxs,
  },
  warningText: { ...typography.footnote, color: t.status.critical.text },
});

export default GrnHeaderStep;
