/**
 * Date Range Filter Field Component
 *
 * From/to date picker fields for date range filtering.
 * Mobile-First Design with Material Design 3 and react-native-paper.
 */

import React, { useState, useRef } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, TextInput as RNTextInput, useColorScheme } from 'react-native';
import { Text, Button, Surface, Chip } from 'react-native-paper';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, darkColors } from '@/theme';
import type { DateRangeFilterFieldProps } from '@/types/filter.types';

export const DateRangeFilterField: React.FC<DateRangeFilterFieldProps> = ({
  label,
  icon,
  placeholder = ['From date', 'To date'],
  value,
  onChange,
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

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

  const formatDate = (date: Date | undefined) => {
    if (!date) return null;
    // Convert to Date if it's a string
    const dateObj = date instanceof Date ? date : new Date(date);
    // Check if valid date
    if (isNaN(dateObj.getTime())) return null;
    return dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

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

  const handleFromDismiss = () => {
    setShowFromPicker(false);
  };

  const handleToDismiss = () => {
    setShowToPicker(false);
  };

  return (
    <View style={styles.container}>
      {/* Hidden inputs to trigger scroll behavior */}
      <BottomSheetTextInput
        ref={fromInputRef}
        style={styles.hiddenInput}
        editable={false}
        pointerEvents="none"
      />
      <BottomSheetTextInput
        ref={toInputRef}
        style={styles.hiddenInput}
        editable={false}
        pointerEvents="none"
      />

      {/* Date Range Buttons */}
      <View style={styles.dateContainer}>
        {/* From Date */}
        <Surface
          style={[
            styles.dateButton,
            {
              backgroundColor: fromDate ? themeColors.white : (isDark ? themeColors.gray[800] : colors.gray[50]),
              borderColor: fromDate ? themeColors.primary : (isDark ? themeColors.gray[700] : colors.gray[200]),
            },
            fromDate && styles.dateButtonActive,
          ]}
          elevation={fromDate ? 1 : 0}
        >
          <TouchableOpacity
            onPress={handleFromPress}
            style={styles.dateButtonTouchable}
            activeOpacity={0.7}
          >
            <Icon
              name="calendar"
              size={18}
              color={fromDate ? themeColors.primary : (isDark ? themeColors.gray[500] : colors.gray[400])}
            />
            <Text
              variant="bodyMedium"
              style={[
                styles.dateButtonText,
                {
                  color: fromDate ? themeColors.gray[900] : (isDark ? themeColors.gray[500] : colors.gray[400]),
                },
                fromDate && styles.dateButtonTextActive,
              ]}
            >
              {formatDate(fromDate) || placeholder[0]}
            </Text>
          </TouchableOpacity>
        </Surface>

        <Icon name="arrow-right" size={20} color={isDark ? themeColors.gray[500] : colors.gray[400]} />

        {/* To Date */}
        <Surface
          style={[
            styles.dateButton,
            {
              backgroundColor: toDate ? themeColors.white : (isDark ? themeColors.gray[800] : colors.gray[50]),
              borderColor: toDate ? themeColors.primary : (isDark ? themeColors.gray[700] : colors.gray[200]),
            },
            toDate && styles.dateButtonActive,
          ]}
          elevation={toDate ? 1 : 0}
        >
          <TouchableOpacity
            onPress={handleToPress}
            style={styles.dateButtonTouchable}
            activeOpacity={0.7}
          >
            <Icon
              name="calendar"
              size={18}
              color={toDate ? themeColors.primary : (isDark ? themeColors.gray[500] : colors.gray[400])}
            />
            <Text
              variant="bodyMedium"
              style={[
                styles.dateButtonText,
                {
                  color: toDate ? themeColors.gray[900] : (isDark ? themeColors.gray[500] : colors.gray[400]),
                },
                toDate && styles.dateButtonTextActive,
              ]}
            >
              {formatDate(toDate) || placeholder[1]}
            </Text>
          </TouchableOpacity>
        </Surface>
      </View>

      {/* Selected Date Chips */}
      {(fromDate || toDate) && (
        <View style={styles.chipsContainer}>
          {fromDate && (
            <Chip
              icon="calendar-start"
              onClose={() => onChange(undefined, toDate)}
              style={styles.chip}
              textStyle={styles.chipText}
            >
              From: {formatDate(fromDate)}
            </Chip>
          )}
          {toDate && (
            <Chip
              icon="calendar-end"
              onClose={() => onChange(fromDate, undefined)}
              style={styles.chip}
              textStyle={styles.chipText}
            >
              To: {formatDate(toDate)}
            </Chip>
          )}
        </View>
      )}

      {/* From Date Picker */}
      {showFromPicker && (
        <DateTimePicker
          value={fromDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleFromDateChange}
          maximumDate={toDate || undefined}
        />
      )}

      {/* To Date Picker */}
      {showToPicker && (
        <DateTimePicker
          value={toDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleToDateChange}
          minimumDate={fromDate || undefined}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dateButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  dateButtonActive: {
    borderWidth: 2,
  },
  dateButtonTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  dateButtonText: {
    // Color applied dynamically
  },
  dateButtonTextActive: {
    fontWeight: '500',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    // backgroundColor applied dynamically via Chip component theming
  },
  chipText: {
    fontSize: 12,
  },
});
