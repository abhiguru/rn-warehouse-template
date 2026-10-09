/**
 * Dispatch Header Step - Unified Create/Edit Component
 * Collects dispatch number, date, registration, customer, supervisor, and notes
 * Uses mode prop to differentiate between create and edit flows
 *
 * Refactored to use useDispatchForm hook for consolidated form logic.
 */

import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    Pressable,
    ActivityIndicator,
    LayoutAnimation,
} from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { router, useLocalSearchParams } from 'expo-router';
import { DatePickerModal } from 'react-native-paper-dates';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
    fontWeight,
    iconSize,
    layout,
    radius,
    space,
    touchTarget,
    typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { useDispatchForm } from '@/hooks/useDispatchForm';
import { CustomerSearchBottomSheet, CustomerSearchBottomSheetRef } from '@/components/CustomerSearchBottomSheet';
import { SupervisorBottomSheet } from '@/features/grn/components/SupervisorBottomSheet';
import { DispatchStepIndicator } from '@/components/DispatchStepIndicator';
import SwipeableFormStep from '@/components/SwipeableFormStep';
import { DISPATCH_STEPS, DISPATCH_STEP_NUMBERS, getDispatchCompletedSteps } from '@/constants/dispatchSteps';
import { parseLocalISODate, toLocalISODate } from '@/utils/formatters';
import { GhostTextInput } from '@/components/GhostTextInput';
import { getTopVehicleSuggestion } from '@/services/vehicle-suggestion-service';

type DispatchHeaderStepProps = {
    mode: 'create' | 'edit';
};

// SAP Fiori form cell styles (guide 13.2)
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
        ...typography.body,
        marginTop: space.md,
        color: t.text.secondary,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: space.lg,
        paddingBottom: space.huge,
    },
    formSection: {
        backgroundColor: t.surface.card,
        borderRadius: radius.card,
        padding: space.lg,
        marginBottom: space.lg,
        ...t.shadow[2],
    },
    formGroup: {
        marginBottom: space.lg,
    },
    formGroupLast: {
        marginBottom: 0,
    },
    label: {
        ...typography.footnote,
        color: t.text.secondary,
        marginBottom: space.xs,
    },
    required: {
        color: t.text.required,
    },
    inputContainer: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        borderWidth: 1,
        borderColor: t.border.field,
        backgroundColor: t.surface.field,
        borderRadius: radius.field,
        minHeight: touchTarget,
        paddingHorizontal: space.md,
    },
    inputContainerPressed: {
        backgroundColor: t.surface.cardPressed,
    },
    inputContainerError: {
        borderColor: t.status.negative.border,
        borderWidth: 2,
    },
    loadingInputContainer: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        padding: space.md,
        borderRadius: radius.field,
        minHeight: touchTarget,
        backgroundColor: t.surface.fieldReadOnly,
    },
    inputIcon: {
        marginRight: space.sm,
    },
    input: {
        ...typography.body,
        flex: 1,
        color: t.text.primary,
        padding: 0,
    },
    textArea: {
        minHeight: 88,
        textAlignVertical: 'top' as const,
        paddingVertical: space.sm,
    },
    valueText: {
        ...typography.body,
        flex: 1,
        color: t.text.primary,
    },
    placeholderText: {
        color: t.text.placeholder,
    },
    errorRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.xs,
        marginTop: space.xs,
    },
    errorText: {
        ...typography.footnote,
        flex: 1,
        color: t.status.negative.text,
    },
    charCount: {
        ...typography.caption1,
        marginTop: space.xs,
        textAlign: 'right' as const,
        color: t.text.secondary,
    },
    compactRow: {
        flexDirection: 'row' as const,
        gap: space.md,
    },
    halfField: {
        flex: 1,
    },
    optionalToggle: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        minHeight: layout.rowMinHeight,
        borderRadius: radius.card,
        marginBottom: space.lg,
        backgroundColor: t.surface.card,
        ...t.shadow[2],
    },
    optionalTogglePressed: {
        backgroundColor: t.surface.cardPressed,
    },
    optionalToggleLeft: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: space.sm,
    },
    optionalToggleText: {
        ...typography.callout,
        color: t.brand.tint,
    },
    optionalBadge: {
        paddingHorizontal: space.sm,
        paddingVertical: space.xxs,
        borderRadius: radius.field,
        backgroundColor: t.status.neutral.background,
    },
    optionalBadgeText: {
        ...typography.caption1,
        fontWeight: fontWeight.semibold,
        color: t.status.neutral.text,
    },
});

type Styles = ReturnType<typeof makeStyles>;

/** Field error per guide 13.2: footnote, status.negative.text, alert-circle icon. */
function FieldError({ message, styles, color }: { message?: string; styles: Styles; color: string }) {
    if (!message) return null;
    return (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
            <Icon name="alert-circle" size={iconSize.sm} color={color} />
            <Text style={styles.errorText}>{message}</Text>
        </View>
    );
}

export function DispatchHeaderStep({ mode }: DispatchHeaderStepProps) {
    const styles = useThemedStyles(makeStyles);
    const t = useTokens();

    const { id } = useLocalSearchParams<{ id: string }>();

    // Use the consolidated dispatch form hook - all auto-navigation logic is now in the hook
    const {
        header,
        validationErrors,
        isLoading,
        isGeneratingNumber,
        isCreateMode,
        updateHeaderField,
        updateHeaderFields,
        handleDispNoChange,
        clearFieldValidationError,
        navigateToStep,
        resetFormState,
    } = useDispatchForm({
        mode,
        dispatchIdParam: id,
    });

    // Local UI state
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showSupervisorBottomSheet, setShowSupervisorBottomSheet] = useState(false);
    const [showOptionalFields, setShowOptionalFields] = useState(!isCreateMode);
    const [showDiscardDialog, setShowDiscardDialog] = useState(false);

    const customerBottomSheetRef = useRef<CustomerSearchBottomSheetRef>(null);

    // Toggle optional fields with animation (create mode only)
    const toggleOptionalFields = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setShowOptionalFields(!showOptionalFields);
    };

    // Check if user has entered any data
    const hasUnsavedData = () => {
        return !!(header.customer_id || header.note);
    };

    // Handle cancel with confirmation if data exists
    const handleCancel = () => {
        if (isCreateMode && hasUnsavedData()) {
            setShowDiscardDialog(true);
        } else {
            resetFormState();
            if (isCreateMode) {
                router.replace('/dispatch');
            } else {
                router.back();
            }
        }
    };

    const handleDiscardConfirm = () => {
        setShowDiscardDialog(false);
        resetFormState();
        router.replace('/dispatch');
    };

    // Note: useEffect hooks for initialization, data loading, and dispatch number generation
    // are now handled internally by useDispatchForm hook

    const handleDateConfirm = (params: { date: Date | undefined }) => {
        setShowDatePicker(false);
        if (params.date) {
            updateHeaderField('disp_date', toLocalISODate(params.date));
        }
    };

    const handleDateDismiss = () => {
        setShowDatePicker(false);
    };

    const openDatePicker = () => {
        setShowDatePicker(true);
    };

    const handleRegistrationChange = (text: string) => {
        const upperText = text.toUpperCase();
        updateHeaderField('registration', upperText);
    };

    const handleCustomerSelect = (customer: { id: string; name: string; address?: string; city?: string; mobile?: string }) => {
        updateHeaderFields({
            customer_id: customer.id,
            customer_name: customer.name,
            customer_address: customer.address || '',
            customer_city: customer.city || '',
            customer_mobile: customer.mobile || '',
        });
        clearFieldValidationError('customer_id');
    };

    const handleSupervisorSelect = (supervisor: { id: string; name: string }) => {
        updateHeaderFields({
            supervisor_id: supervisor.id,
            supervisor_name: supervisor.name,
        });
        clearFieldValidationError('supervisor_id');
        setShowSupervisorBottomSheet(false);
    };

    const handleNoteChange = (text: string) => {
        updateHeaderField('note', text);
    };

    // Guide 12.3: "9 Oct 2026"
    const formatDisplayDate = (isoDate: string) => {
        if (!isoDate) return '';
        const date = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? parseLocalISODate(isoDate) : new Date(isoDate);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    // Loading state (edit mode)
    if (isLoading) {
        return (
            <View style={styles.loadingContainer} accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
                <ActivityIndicator size="large" color={t.brand.tint} />
                <Text style={styles.loadingText}>Loading dispatch…</Text>
            </View>
        );
    }

    // Handle step indicator press for navigation
    const handleStepIndicatorPress = async (stepNumber: number) => {
        if (stepNumber === DISPATCH_STEP_NUMBERS.INFO) return; // Already on this step
        if (stepNumber === DISPATCH_STEP_NUMBERS.ITEMS || stepNumber === DISPATCH_STEP_NUMBERS.REVIEW) {
            await navigateToStep(stepNumber);
        }
    };

    const displayDate = header.disp_date ? formatDisplayDate(header.disp_date) : '';

    return (
        <View style={styles.container}>
            {/* Step Indicator with Cancel Pill */}
            <DispatchStepIndicator
                steps={DISPATCH_STEPS}
                currentStep={DISPATCH_STEP_NUMBERS.INFO}
                completedSteps={getDispatchCompletedSteps(DISPATCH_STEP_NUMBERS.INFO)}
                onCancel={handleCancel}
                cancelMessage={
                    isCreateMode
                        ? 'Discard this dispatch? The details you entered will be lost.'
                        : 'Discard your changes to this dispatch? Unsaved changes will be lost.'
                }
                dispNo={header.disp_no}
                onStepPress={handleStepIndicatorPress}
                isEditMode={!isCreateMode}
            />

            {/* Form Content */}
            <SwipeableFormStep
                onSwipeLeft={async () => {
                    await navigateToStep(2);
                }}
                canSwipeLeft={true}
                canSwipeRight={false}
            >
                <KeyboardAwareScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    enableOnAndroid={true}
                    enableAutomaticScroll={true}
                    extraScrollHeight={200}
                >
                    {/* Form Section Card */}
                    <View style={styles.formSection}>
                        {/* Compact Row: Dispatch Number & Date */}
                        <View style={styles.compactRow}>
                            {/* Dispatch Number */}
                            <View style={[styles.formGroup, styles.halfField]}>
                                <Text style={styles.label}>
                                    Dispatch number<Text style={styles.required}> *</Text>
                                </Text>
                                {isCreateMode && isGeneratingNumber ? (
                                    <View
                                        style={styles.loadingInputContainer}
                                        accessibilityLabel="Generating dispatch number"
                                        accessibilityState={{ busy: true }}
                                    >
                                        <ActivityIndicator size="small" color={t.brand.tint} />
                                    </View>
                                ) : (
                                    <View style={[styles.inputContainer, validationErrors.disp_no && styles.inputContainerError]}>
                                        <Icon name="truck-delivery-outline" size={iconSize.md} color={t.icon.secondary} style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            accessibilityLabel="Dispatch number"
                                            value={header.disp_no}
                                            onChangeText={(text) => handleDispNoChange(text.toUpperCase())}
                                            placeholder="I####"
                                            placeholderTextColor={t.text.placeholder}
                                            autoCapitalize="characters"
                                            maxLength={8}
                                        />
                                    </View>
                                )}
                                <FieldError message={validationErrors.disp_no} styles={styles} color={t.status.negative.text} />
                            </View>

                            {/* Date */}
                            <View style={[styles.formGroup, styles.halfField]}>
                                <Text style={styles.label}>
                                    Date<Text style={styles.required}> *</Text>
                                </Text>
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.inputContainer,
                                        pressed && styles.inputContainerPressed,
                                        validationErrors.disp_date && styles.inputContainerError,
                                    ]}
                                    onPress={openDatePicker}
                                    accessibilityRole="button"
                                    accessibilityLabel={displayDate ? `Dispatch date, ${displayDate}` : 'Choose dispatch date'}
                                >
                                    <Icon name="calendar-outline" size={iconSize.md} color={t.icon.secondary} style={styles.inputIcon} />
                                    <Text style={[styles.valueText, !header.disp_date && styles.placeholderText]} numberOfLines={1}>
                                        {displayDate || 'Choose date'}
                                    </Text>
                                </Pressable>
                                <FieldError message={validationErrors.disp_date} styles={styles} color={t.status.negative.text} />
                            </View>
                        </View>

                        {/* Customer - before Registration so we can use customer-specific suggestions */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>
                                Customer<Text style={styles.required}> *</Text>
                            </Text>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.inputContainer,
                                    pressed && styles.inputContainerPressed,
                                    validationErrors.customer_id && styles.inputContainerError,
                                ]}
                                onPress={() => customerBottomSheetRef.current?.open()}
                                accessibilityRole="button"
                                accessibilityLabel={header.customer_name ? `Customer, ${header.customer_name}` : 'Choose customer'}
                            >
                                <Text
                                    style={[styles.valueText, !header.customer_name && styles.placeholderText]}
                                    numberOfLines={1}
                                >
                                    {header.customer_name || 'Choose customer'}
                                </Text>
                                <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} />
                            </Pressable>
                            <FieldError message={validationErrors.customer_id} styles={styles} color={t.status.negative.text} />
                        </View>

                        {/* Vehicle Registration - uses customer-specific suggestions */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>
                                Vehicle registration<Text style={styles.required}> *</Text>
                            </Text>
                            <GhostTextInput
                                accessibilityLabel="Vehicle registration"
                                value={header.registration}
                                onChangeText={handleRegistrationChange}
                                getSuggestion={getTopVehicleSuggestion}
                                suggestionContext={header.customer_id}
                                placeholder="Vehicle registration"
                                autoCapitalize="characters"
                                maxLength={30}
                                icon="car"
                                hasError={!!validationErrors.registration}
                            />
                            <FieldError message={validationErrors.registration} styles={styles} color={t.status.negative.text} />
                        </View>

                        {/* Supervisor */}
                        <View style={[styles.formGroup, styles.formGroupLast]}>
                            <Text style={styles.label}>
                                Supervisor<Text style={styles.required}> *</Text>
                            </Text>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.inputContainer,
                                    pressed && styles.inputContainerPressed,
                                    validationErrors.supervisor_id && styles.inputContainerError,
                                ]}
                                onPress={() => setShowSupervisorBottomSheet(true)}
                                accessibilityRole="button"
                                accessibilityLabel={header.supervisor_name ? `Supervisor, ${header.supervisor_name}` : 'Choose supervisor'}
                            >
                                <Text
                                    style={[styles.valueText, !header.supervisor_name && styles.placeholderText]}
                                    numberOfLines={1}
                                >
                                    {header.supervisor_name || 'Choose supervisor'}
                                </Text>
                                <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} />
                            </Pressable>
                            <FieldError message={validationErrors.supervisor_id} styles={styles} color={t.status.negative.text} />
                        </View>
                    </View>
                    {isCreateMode && (
                        <Pressable
                            style={({ pressed }) => [styles.optionalToggle, pressed && styles.optionalTogglePressed]}
                            onPress={toggleOptionalFields}
                            accessibilityRole="button"
                            accessibilityLabel={showOptionalFields ? 'Hide optional fields' : 'Show optional fields'}
                            accessibilityState={{ expanded: showOptionalFields }}
                        >
                            <View style={styles.optionalToggleLeft}>
                                <Icon
                                    name={showOptionalFields ? 'chevron-up' : 'chevron-down'}
                                    size={iconSize.md}
                                    color={t.brand.tint}
                                />
                                <Text style={styles.optionalToggleText}>
                                    {showOptionalFields ? 'Hide' : 'Show'} optional fields
                                </Text>
                            </View>
                            {header.note && !showOptionalFields && (
                                <View style={styles.optionalBadge}>
                                    <Text style={styles.optionalBadgeText} maxFontSizeMultiplier={1.6}>Has notes</Text>
                                </View>
                            )}
                        </Pressable>
                    )}

                    {/* Notes (Optional) */}
                    {showOptionalFields && (
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Notes</Text>
                            <View style={styles.inputContainer}>
                                <Icon name="note-text-outline" size={iconSize.md} color={t.icon.secondary} style={styles.inputIcon} />
                                <TextInput
                                    style={[styles.input, styles.textArea]}
                                    accessibilityLabel="Notes"
                                    value={header.note}
                                    onChangeText={handleNoteChange}
                                    placeholder="Additional notes (up to 250 characters)"
                                    placeholderTextColor={t.text.placeholder}
                                    multiline
                                    maxLength={250}
                                />
                            </View>
                            {header.note.length > 0 && (
                                <Text style={styles.charCount}>{header.note.length}/250</Text>
                            )}
                        </View>
                    )}
                </KeyboardAwareScrollView>
            </SwipeableFormStep>

            {/* Bottom Sheets */}
            <CustomerSearchBottomSheet
                ref={customerBottomSheetRef}
                onSelect={handleCustomerSelect}
                title="Choose customer"
            />

            <SupervisorBottomSheet
                isVisible={showSupervisorBottomSheet}
                onClose={() => setShowSupervisorBottomSheet(false)}
                onSelect={handleSupervisorSelect}
                currentValue={
                    header.supervisor_id
                        ? { id: header.supervisor_id, name: header.supervisor_name }
                        : undefined
                }
            />

            {/* Date Picker Modal - Pure JS with dark mode support */}
            <DatePickerModal
                locale="en"
                mode="single"
                visible={showDatePicker}
                onDismiss={handleDateDismiss}
                date={header.disp_date ? new Date(header.disp_date) : new Date()}
                onConfirm={handleDateConfirm}
                onChange={handleDateConfirm}
                validRange={{ endDate: new Date() }}
                label="Choose date"
            />

            {/* Discard Changes Dialog */}
            <ConfirmDialog
                visible={showDiscardDialog}
                title="Discard this dispatch?"
                message="The details you entered will be lost."
                confirmText="Discard dispatch"
                cancelText="Keep editing"
                onConfirm={handleDiscardConfirm}
                onCancel={() => setShowDiscardDialog(false)}
                variant="danger"
                icon="trash-outline"
            />
        </View>
    );
}

export default DispatchHeaderStep;
