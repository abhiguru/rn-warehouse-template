/**
 * Date Range Filter Field Component
 *
 * From/to date fields for date range filtering (style guide §13.3): the to date
 * cannot be before the from date; dates show as "9 Oct 2026".
 */

import React, { useState, useRef } from 'react';
import { View, Text, Platform, Pressable, Insets } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
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
import type { DateRangeFilterFieldProps } from '@/types/filter.types';
import { formatDate as formatSharedDate, toDate as parseDateValue } from '@/utils/formatters';

const CHIP_HEIGHT = 32;
const REMOVE_HIT_SLOP: Insets = {
  top: (touchTarget - iconSize.sm) / 2,
  bottom: (touchTarget - iconSize.sm) / 2,
  left: space.sm,
  right: space.sm,
};

export const DateRangeFilterField: React.FC<DateRangeFilterFieldProps> = ({
  label: _label,
  icon: _icon,
  placeholder = ['From date', 'To date'],
  value,
  onChange,
}) => {
  const { tokens: t, resolvedMode } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const fromInputRef = useRef<any>(null);

  const toInputRef = useRef<any>(null);

  // Helper to normalize date values (could be Date objects or strings from Redux)
  const normalizeDate = (date: Date | undefined): Date | undefined => {
    if (!date) return undefined;
    if (date instanceof Date) return date;
    const parsedDate = new Date(date);
    return isNaN(parsedDate.getTime()) ? undefined : parsedDate;
  };

  const fromDate = normalizeDate(value[0]);
  const toDate = normalizeDate(value[1]);

  // "9 Oct 2026" (§12.3); null when not set
  const formatDate = (date: Date | undefined) => (parseDateValue(date) ? formatSharedDate(date) : null);

  const handleFromDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowFromPicker(false);
    }
    if (event.type === 'set' && selectedDate) {
      onChange(selectedDate, toDate);
    } else if (event.type === 'dismissed') {
      setShowFromPicker(false);
    }
  };

  const handleToDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowToPicker(false);
    }
    if (event.type === 'set' && selectedDate) {
      onChange(fromDate, selectedDate);
    } else if (event.type === 'dismissed') {
      setShowToPicker(false);
    }
  };

  const handleFromPress = () => {
    // Focus hidden input to trigger scroll, then show picker
    fromInputRef.current?.focus();
    setTimeout(() => {
      setShowFromPicker(true);
    }, 100);
  };

  const handleToPress = () => {
    // Focus hidden input to trigger scroll, then show picker
    toInputRef.current?.focus();
    setTimeout(() => {
      setShowToPicker(true);
    }, 100);
  };

  const renderDateField = (
    date: Date | undefined,
    fallback: string,
    onPress: () => void,
    expanded: boolean
  ) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.dateButton,
        expanded && styles.dateButtonFocused,
        pressed && styles.dateButtonPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${fallback}, ${formatDate(date) ?? 'not set'}`}
      accessibilityHint="Opens the date picker"
      accessibilityState={{ expanded }}
    >
      <Icon name="calendar-outline" size={iconSize.md} color={t.icon.secondary} />
      <Text style={[styles.dateButtonText, !date && styles.dateButtonPlaceholder]} numberOfLines={1}>
        {formatDate(date) || fallback}
      </Text>
    </Pressable>
  );

  const renderChip = (iconName: string, text: string, onRemove: () => void, removeLabel: string) => (
    <View style={styles.chip}>
      <Icon name={iconName} size={iconSize.sm} color={t.brand.tint} />
      <Text style={styles.chipText} maxFontSizeMultiplier={1.6}>
        {text}
      </Text>
      <Pressable
        onPress={onRemove}
        hitSlop={REMOVE_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={removeLabel}
      >
        <Icon name="close" size={iconSize.sm} color={t.brand.tint} />
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Hidden inputs to trigger scroll behavior */}
      <BottomSheetTextInput
        ref={fromInputRef}
        style={styles.hiddenInput}
        editable={false}
        pointerEvents="none"
        importantForAccessibility="no"
      />
      <BottomSheetTextInput
        ref={toInputRef}
        style={styles.hiddenInput}
        editable={false}
        pointerEvents="none"
        importantForAccessibility="no"
      />

      {/* From and to fields */}
      <View style={styles.dateContainer}>
        {renderDateField(fromDate, placeholder[0], handleFromPress, showFromPicker)}
        <Icon name="arrow-right" size={iconSize.md} color={t.icon.secondary} />
        {renderDateField(toDate, placeholder[1], handleToPress, showToPicker)}
      </View>

      {/* Selected date chips */}
      {(fromDate || toDate) && (
        <View style={styles.chipsContainer}>
          {fromDate &&
            renderChip(
              'calendar-start',
              `From ${formatDate(fromDate)}`,
              () => onChange(undefined, toDate),
              'Remove filter from date'
            )}
          {toDate &&
            renderChip(
              'calendar-end',
              `To ${formatDate(toDate)}`,
              () => onChange(fromDate, undefined),
              'Remove filter to date'
            )}
        </View>
      )}

      {/* From date picker */}
      {showFromPicker && (
        <DateTimePicker
          value={fromDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleFromDateChange}
          maximumDate={toDate || undefined}
          themeVariant={resolvedMode}
          textColor={t.text.primary}
          accentColor={t.brand.tint}
        />
      )}

      {/* To date picker */}
      {showToPicker && (
        <DateTimePicker
          value={toDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleToDateChange}
          minimumDate={fromDate || undefined}
          themeVariant={resolvedMode}
          textColor={t.text.primary}
          accentColor={t.brand.tint}
        />
      )}
    </View>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    marginBottom: space.sm,
  },
  hiddenInput: {
    position: 'absolute' as const,
    opacity: 0,
    height: 0,
    width: 0,
  },
  dateContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    backgroundColor: t.surface.field,
  },
  dateButtonFocused: {
    borderWidth: 2,
    borderColor: t.border.fieldFocus,
    paddingHorizontal: space.md - 1,
  },
  dateButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  dateButtonText: {
    ...typography.body,
    flexShrink: 1,
    color: t.text.primary,
  },
  dateButtonPlaceholder: {
    color: t.text.placeholder,
  },
  chipsContainer: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    marginTop: space.md,
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    minHeight: CHIP_HEIGHT,
    paddingVertical: space.s6,
    paddingLeft: space.md,
    paddingRight: space.sm,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtle,
  },
  chipText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
});
