/**
 * SAP Fiori form cell for date/time selection (docs/STYLE_GUIDE.md §13.3).
 *
 * Features:
 * - Looks like a text field: label above (sentence case) with required asterisk
 * - Helper text / error message (mutually exclusive)
 * - Read-only and disabled states
 * - 44pt minimum touch target
 * - Calendar/clock icon on the right
 * - Platform date picker (dialog on Android, spinner in a sheet on iOS)
 * - Dates shown as "9 Oct 2026", times as "4:05 pm"
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ViewStyle,
  StyleProp,
  Modal,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { formatDate, formatDateTime, formatTime } from '@/utils/formatters';

const IOS_PICKER_HEIGHT = 216;

// ============================================================================
// TYPES
// ============================================================================

export interface DatePickerInputProps {
  /** Input label (sentence case) */
  label?: string;
  /** Current date value */
  value: Date;
  /** Called when date changes */
  onChange: (date: Date) => void;
  /** Picker mode: date, time, or datetime */
  mode?: 'date' | 'time' | 'datetime';
  /** Disable interaction */
  disabled?: boolean;
  /** Show required asterisk */
  required?: boolean;
  /** Error message (overrides helperText per Fiori spec) */
  error?: string;
  /** Helper text below input */
  helperText?: string;
  /** Custom container style */
  style?: StyleProp<ViewStyle>;
  /** Minimum selectable date */
  minimumDate?: Date;
  /** Maximum selectable date */
  maximumDate?: Date;
  /** Read-only mode (can view but not edit) */
  readOnly?: boolean;
  /** Placeholder text when no date selected */
  placeholder?: string;
}

// ============================================================================
// FORMATTING (style guide §12.3)
// ============================================================================

/** "9 Oct 2026", "4:05 pm" or "9 Oct 2026, 4:05 pm". */
export function formatPickerValue(date: Date, mode: 'date' | 'time' | 'datetime'): string {
  if (mode === 'time') return formatTime(date);
  if (mode === 'datetime') return formatDateTime(date);
  return formatDate(date);
}

// ============================================================================
// COMPONENT
// ============================================================================

export const DatePickerInput: React.FC<DatePickerInputProps> = ({
  label,
  value,
  onChange,
  mode = 'date',
  disabled = false,
  required = false,
  error,
  helperText,
  style,
  minimumDate,
  maximumDate,
  readOnly = false,
  placeholder,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const { tokens: t, resolvedMode } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const hasError = Boolean(error);
  const isDisabled = disabled;
  const isReadOnly = readOnly;

  // Handle date picker change
  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      setIsFocused(false);
    }

    if (event.type === 'set' && selectedDate) {
      onChange(selectedDate);
    }

    if (event.type === 'dismissed') {
      setShowPicker(false);
      setIsFocused(false);
    }
  };

  const closeIOSPicker = () => {
    setShowPicker(false);
    setIsFocused(false);
  };

  const displayValue = value ? formatPickerValue(value, mode) : undefined;
  const fieldName = mode === 'time' ? 'time' : 'date';

  // Field outline per state (style guide §13.2)
  const fieldStateStyle = hasError
    ? styles.fieldError
    : isFocused
      ? styles.fieldFocused
      : isReadOnly
        ? styles.fieldReadOnly
        : null;

  // Error overrides helper text
  const message = error
    ? { text: error, isError: true }
    : helperText
      ? { text: helperText, isError: false }
      : null;

  const handlePress = () => {
    if (!isDisabled && !isReadOnly) {
      setShowPicker(true);
      setIsFocused(true);
    }
  };

  return (
    <View
      style={[
        styles.container,
        isDisabled && styles.containerDisabled,
        style,
      ]}
    >
      {label && (
        <Text style={[styles.label, hasError && styles.labelError, isDisabled && styles.textDisabled]}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}

      {/* Field */}
      <Pressable
        style={[styles.inputContainer, fieldStateStyle]}
        onPress={handlePress}
        disabled={isDisabled || isReadOnly}
        accessibilityLabel={`${label ?? (mode === 'time' ? 'Time' : 'Date')}${required ? ', required' : ''}, ${
          displayValue ?? 'not set'
        }`}
        accessibilityHint={isReadOnly ? 'Read only' : `Opens the ${fieldName} picker`}
        accessibilityRole="button"
        accessibilityState={{
          disabled: isDisabled || isReadOnly,
          expanded: showPicker,
        }}
      >
        <Text
          style={[
            styles.inputText,
            !displayValue && styles.placeholderText,
            isDisabled && styles.textDisabled,
          ]}
        >
          {displayValue ?? placeholder ?? `Select ${fieldName}`}
        </Text>

        <Icon
          name={mode === 'time' ? 'clock-outline' : 'calendar-outline'}
          size={iconSize.md}
          color={t.icon.secondary}
        />
      </Pressable>

      {/* Date picker - Android (system dialog) */}
      {showPicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={value}
          mode={mode === 'datetime' ? 'date' : mode}
          display="default"
          onChange={handleDateChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          themeVariant={resolvedMode}
        />
      )}

      {/* Date picker - iOS (spinner in a bottom sheet) */}
      {showPicker && Platform.OS === 'ios' && (
        <Modal
          transparent
          animationType="slide"
          visible={showPicker}
          onRequestClose={closeIOSPicker}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={closeIOSPicker}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Pressable style={styles.modalContent} onPress={() => undefined} accessible={false}>
              <View style={styles.modalHeader}>
                <Pressable
                  onPress={closeIOSPicker}
                  style={styles.modalAction}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Text style={styles.modalTitle} accessibilityRole="header">
                  {mode === 'time' ? 'Select time' : 'Select date'}
                </Text>
                <Pressable
                  onPress={closeIOSPicker}
                  style={styles.modalAction}
                  accessibilityRole="button"
                  accessibilityLabel="Done"
                >
                  <Text style={styles.modalDoneText}>Done</Text>
                </Pressable>
              </View>

              <DateTimePicker
                value={value}
                mode={mode === 'datetime' ? 'date' : mode}
                display="spinner"
                onChange={handleDateChange}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                accentColor={t.brand.tint}
                textColor={t.text.primary}
                themeVariant={resolvedMode}
                style={styles.iosPicker}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Footer: helper or error text */}
      {message && (
        <View style={styles.footerRow}>
          {message.isError && (
            <Icon
              name="alert-circle"
              size={iconSize.sm}
              color={t.status.negative.text}
              style={styles.messageIcon}
            />
          )}
          <Text style={[styles.helperText, message.isError && styles.errorText]}>
            {message.text}
          </Text>
        </View>
      )}
    </View>
  );
};

// ============================================================================
// STYLES (SAP Fiori form cell, matching Input.tsx)
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    marginBottom: space.lg,
  },
  containerDisabled: {
    opacity: t.interaction.disabledOpacity,
  },

  label: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.xs,
  },
  labelError: {
    color: t.status.negative.text,
  },
  required: {
    color: t.text.required,
  },
  textDisabled: {
    color: t.text.disabled,
  },

  inputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: radius.field,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    gap: space.sm,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
  },
  fieldFocused: {
    borderWidth: 2,
    borderColor: t.border.fieldFocus,
    paddingHorizontal: space.md - 1,
  },
  fieldError: {
    borderWidth: 2,
    borderColor: t.status.negative.border,
    paddingHorizontal: space.md - 1,
  },
  fieldReadOnly: {
    borderWidth: 0,
    backgroundColor: t.surface.fieldReadOnly,
    paddingHorizontal: space.md + 1,
  },

  inputText: {
    ...typography.body,
    flex: 1,
    color: t.text.primary,
  },
  placeholderText: {
    color: t.text.placeholder,
  },

  footerRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    marginTop: space.xs,
  },
  messageIcon: {
    marginTop: 1,
    marginRight: space.xs,
  },
  helperText: {
    ...typography.footnote,
    color: t.text.secondary,
    flex: 1,
  },
  errorText: {
    color: t.status.negative.text,
  },

  // iOS bottom sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'flex-end' as const,
  },
  modalContent: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingBottom: space.xxxl, // home indicator
    ...t.shadow[4],
  },
  modalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  modalAction: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingHorizontal: space.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  modalTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  modalCancelText: {
    ...typography.body,
    color: t.brand.tint,
  },
  modalDoneText: {
    ...typography.body,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  iosPicker: {
    height: IOS_PICKER_HEIGHT,
  },
});

export default DatePickerInput;
