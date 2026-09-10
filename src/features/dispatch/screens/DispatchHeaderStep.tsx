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
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Platform,
    ActivityIndicator,
    LayoutAnimation,
    UIManager,
} from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { router, useLocalSearchParams } from 'expo-router';
import { DatePickerModal } from 'react-native-paper-dates';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { useDispatchForm } from '@/hooks/useDispatchForm';
import { CustomerSearchBottomSheet, CustomerSearchBottomSheetRef } from '@/components/CustomerSearchBottomSheet';
import { SupervisorBottomSheet } from '@/features/grn/components/SupervisorBottomSheet';
import { DispatchStepIndicator } from '@/components/DispatchStepIndicator';
import SwipeableFormStep from '@/components/SwipeableFormStep';
import { DISPATCH_STEPS, DISPATCH_STEP_NUMBERS, getDispatchCompletedSteps } from '@/constants/dispatchSteps';
import { toLocalISODate } from '@/utils/formatters';
import { GhostTextInput } from '@/components/GhostTextInput';
import { getTopVehicleSuggestion } from '@/services/vehicle-suggestion-service';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

type DispatchHeaderStepProps = {
    mode: 'create' | 'edit';
};

export function DispatchHeaderStep({ mode }: DispatchHeaderStepProps) {
    // Theme colors for dark mode support
    const colors = useListColors();

    const { id } = useLocalSearchParams<{ id: string }>();

    // Use the consolidated dispatch form hook - all auto-navigation logic is now in the hook
    const {
        header,
        validationErrors,
        isLoading,
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

    const getNextRoute = () => {
        return isCreateMode ? '/dispatch-form/step2' : `/dispatch-edit/${id}/step2`;
    };

    const handleNext = async () => {
        console.log('[DispatchHeaderStep] Navigating to step 2 via hook');
        await navigateToStep(2);
    };

    const formatDisplayDate = (isoDate: string) => {
        if (!isoDate) return '';
        const date = new Date(isoDate);
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear().toString().slice(-2);
        return `${day}/${month}/${year}`;
    };

    // Loading state (edit mode)
    if (isLoading) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: colors.gray50 }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.gray600 }]}>Loading dispatch data...</Text>
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

    return (
        <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
            {/* Step Indicator with Cancel Pill */}
            <DispatchStepIndicator
                steps={DISPATCH_STEPS}
                currentStep={DISPATCH_STEP_NUMBERS.INFO}
                completedSteps={getDispatchCompletedSteps(DISPATCH_STEP_NUMBERS.INFO)}
                onCancel={handleCancel}
                cancelMessage={
                    isCreateMode
                        ? 'Are you sure you want to cancel? All entered data will be lost.'
                        : 'Are you sure you want to cancel editing? All unsaved changes will be lost.'
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
                    <View style={[styles.formSection, { backgroundColor: colors.cellBackground }]}>
                        {/* Compact Row: Dispatch Number & Date */}
                        <View style={styles.compactRow}>
                            {/* Dispatch Number */}
                            <View style={[styles.formGroup, styles.halfField]}>
                                <Text style={[styles.label, { color: colors.gray600 }]}>
                                    DISPATCH NO<Text style={[styles.required, { color: colors.error }]}> *</Text>
                                </Text>
                                {isCreateMode && !header.disp_no ? (
                                    <View style={[styles.loadingInputContainer, { backgroundColor: colors.gray100 }]}>
                                        <ActivityIndicator size="small" color={colors.primary} />
                                    </View>
                                ) : (
                                    <View style={[styles.inputContainer, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }, validationErrors.disp_no && { borderColor: colors.error, borderWidth: 2 }]}>
                                        <Icon name="truck" size={18} color={colors.gray400} style={styles.inputIcon} />
                                        <TextInput
                                            style={[styles.input, { color: colors.gray900 }]}
                                            value={header.disp_no}
                                            onChangeText={(text) => handleDispNoChange(text.toUpperCase())}
                                            placeholder="D####"
                                            placeholderTextColor={colors.gray400}
                                            autoCapitalize="characters"
                                        />
                                    </View>
                                )}
                                {validationErrors.disp_no && (
                                    <Text style={[styles.errorText, { color: colors.error }]}>{validationErrors.disp_no}</Text>
                                )}
                            </View>

                            {/* Date */}
                            <View style={[styles.formGroup, styles.halfField]}>
                                <Text style={[styles.label, { color: colors.gray600 }]}>
                                    DATE<Text style={[styles.required, { color: colors.error }]}> *</Text>
                                </Text>
                                <TouchableOpacity
                                    style={[styles.inputContainer, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }, validationErrors.disp_date && { borderColor: colors.error, borderWidth: 2 }]}
                                    onPress={openDatePicker}
                                    activeOpacity={0.7}
                                >
                                    <Icon name="calendar" size={18} color={colors.gray500} style={styles.inputIcon} />
                                    <Text style={[styles.dateText, { color: colors.gray900 }, !header.disp_date && { color: colors.gray400 }]} numberOfLines={1}>
                                        {header.disp_date ? formatDisplayDate(header.disp_date) : 'Select'}
                                    </Text>
                                </TouchableOpacity>
                                {validationErrors.disp_date && (
                                    <Text style={[styles.errorText, { color: colors.error }]}>{validationErrors.disp_date}</Text>
                                )}
                            </View>
                        </View>

                        {/* Customer - before Registration so we can use customer-specific suggestions */}
                        <View style={styles.formGroup}>
                            <Text style={[styles.label, { color: colors.gray600 }]}>
                                CUSTOMER<Text style={[styles.required, { color: colors.error }]}> *</Text>
                            </Text>
                            <TouchableOpacity
                                style={[styles.inputContainer, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }, validationErrors.customer_id && { borderColor: colors.error, borderWidth: 2 }]}
                                onPress={() => customerBottomSheetRef.current?.open()}
                                activeOpacity={0.7}
                            >
                                <Text
                                    style={[styles.selectorText, { color: colors.gray900 }, !header.customer_name && { color: colors.gray400 }]}
                                    numberOfLines={1}
                                >
                                    {header.customer_name || 'Select customer...'}
                                </Text>
                                <Icon name="magnify" size={20} color={colors.gray400} />
                            </TouchableOpacity>
                            {validationErrors.customer_id && (
                                <Text style={[styles.errorText, { color: colors.error }]}>{validationErrors.customer_id}</Text>
                            )}
                        </View>

                        {/* Vehicle Registration - uses customer-specific suggestions */}
                        <View style={styles.formGroup}>
                            <Text style={[styles.label, { color: colors.gray600 }]}>
                                REGISTRATION<Text style={[styles.required, { color: colors.error }]}> *</Text>
                            </Text>
                            <GhostTextInput
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
                            {validationErrors.registration && (
                                <Text style={[styles.errorText, { color: colors.error }]}>{validationErrors.registration}</Text>
                            )}
                        </View>

                        {/* Supervisor */}
                        <View style={styles.formGroup}>
                            <Text style={[styles.label, { color: colors.gray600 }]}>
                                SUPERVISOR<Text style={[styles.required, { color: colors.error }]}> *</Text>
                            </Text>
                            <TouchableOpacity
                                style={[styles.inputContainer, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }, validationErrors.supervisor_id && { borderColor: colors.error, borderWidth: 2 }]}
                                onPress={() => setShowSupervisorBottomSheet(true)}
                                activeOpacity={0.7}
                            >
                                <Text
                                    style={[styles.selectorText, { color: colors.gray900 }, !header.supervisor_name && { color: colors.gray400 }]}
                                    numberOfLines={1}
                                >
                                    {header.supervisor_name || 'Select supervisor...'}
                                </Text>
                                <Icon name="magnify" size={20} color={colors.gray400} />
                            </TouchableOpacity>
                            {validationErrors.supervisor_id && (
                                <Text style={[styles.errorText, { color: colors.error }]}>{validationErrors.supervisor_id}</Text>
                            )}
                        </View>
                    </View>
                    {isCreateMode && (
                        <TouchableOpacity
                            style={[styles.optionalToggle, { backgroundColor: colors.cellBackground }]}
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
                            {header.note && !showOptionalFields && (
                                <View style={[styles.optionalBadge, { backgroundColor: colors.primaryLight }]}>
                                    <Text style={[styles.optionalBadgeText, { color: colors.primary }]}>Has notes</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}

                    {/* Notes (Optional) */}
                    {showOptionalFields && (
                        <View style={styles.formGroup}>
                            <Text style={[styles.label, { color: colors.gray600 }]}>NOTES</Text>
                            <View style={[styles.inputContainer, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}>
                                <Icon name="note-text" size={20} color={colors.gray400} style={styles.inputIcon} />
                                <TextInput
                                    style={[styles.input, styles.textArea, { color: colors.gray900 }]}
                                    value={header.note}
                                    onChangeText={handleNoteChange}
                                    placeholder="Additional notes (max 250 characters)"
                                    placeholderTextColor={colors.gray400}
                                    multiline
                                    maxLength={250}
                                />
                            </View>
                            {header.note.length > 0 && (
                                <Text style={[styles.charCount, { color: colors.gray500 }]}>{header.note.length}/250</Text>
                            )}
                        </View>
                    )}
                </KeyboardAwareScrollView>
            </SwipeableFormStep>

            {/* Bottom Sheets */}
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
                label="Select date"
            />

            {/* Discard Changes Dialog */}
            <ConfirmDialog
                visible={showDiscardDialog}
                title="Discard Changes?"
                message="You have unsaved changes. Are you sure you want to leave?"
                confirmText="Discard"
                cancelText="Stay"
                onConfirm={handleDiscardConfirm}
                onCancel={() => setShowDiscardDialog(false)}
                variant="danger"
                icon="trash-outline"
            />
        </View>
    );
}

// SAP Fiori Form Cell Styles
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
    scrollContent: {
        padding: theme.spacing.md,
        paddingBottom: 40,
    },
    formSection: {
        borderRadius: theme.borderRadius.xl,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.lg,
    },
    formGroup: {
        marginBottom: theme.spacing.md,
    },
    // Fiori: Label - 13pt
    label: {
        fontSize: 13,
        fontWeight: '400',
        marginBottom: 6,
        letterSpacing: 0.5,
        lineHeight: 18,
    },
    // Fiori: Required indicator
    required: {
    },
    // Fiori: Input container - 44pt min height
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 8,
        minHeight: 44,
        paddingHorizontal: 12,
    },
    // Fiori: Loading input
    loadingInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 8,
        minHeight: 44,
    },
    inputIcon: {
        marginRight: 8,
    },
    // Fiori: Input text - 17pt
    input: {
        flex: 1,
        fontSize: theme.fontSize.base,
        padding: 0,
    },
    // Fiori: Text area - 88pt min height
    textArea: {
        minHeight: 88,
        textAlignVertical: 'top',
        paddingVertical: 10,
    },
    dateText: {
        flex: 1,
        fontSize: theme.fontSize.base,
        lineHeight: 22,
    },
    selectorText: {
        flex: 1,
        fontSize: theme.fontSize.base,
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
        marginTop: 4,
        textAlign: 'right',
        lineHeight: 18,
    },
    compactRow: {
        flexDirection: 'row',
        gap: theme.spacing.md,
    },
    halfField: {
        flex: 1,
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
        borderColor: theme.colors.gray[200],
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
    // iOS Date Picker Overlay styles (matching GRN form)
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

export default DispatchHeaderStep;
