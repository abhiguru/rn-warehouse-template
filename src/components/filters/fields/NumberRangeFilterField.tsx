/**
 * Number Range Filter Field Component
 *
 * Min/max number input fields for range filtering.
 * Mobile-First Design with Material Design 3 and react-native-paper.
 */

import React from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, darkColors } from '@/theme';
import type { NumberRangeFilterFieldProps } from '@/types/filter.types';

export const NumberRangeFilterField: React.FC<NumberRangeFilterFieldProps> = ({
  label,
  icon,
  placeholder = ['Min', 'Max'],
  minValue,
  maxValue,
  value,
  onChange,
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

  const handleMinChange = (text: string) => {
    const numValue = text === '' ? undefined : parseFloat(text);
    if (text === '' || !isNaN(numValue!)) {
      onChange(numValue, value[1]);
    }
  };

  const handleMaxChange = (text: string) => {
    const numValue = text === '' ? undefined : parseFloat(text);
    if (text === '' || !isNaN(numValue!)) {
      onChange(value[0], numValue);
    }
  };

  return (
    <View style={styles.container}>
      {/* Range Inputs */}
      <View style={styles.rangeContainer}>
        <BottomSheetTextInput
          placeholder={placeholder[0]}
          placeholderTextColor={themeColors.gray[isDark ? 600 : 500]}
          value={value[0]?.toString() || ''}
          onChangeText={handleMinChange}
          keyboardType="decimal-pad"
          returnKeyType="done"
          style={[
            styles.input,
            {
              backgroundColor: themeColors.white,
              borderColor: isDark ? themeColors.gray[600] : colors.gray[300],
              color: themeColors.gray[isDark ? 50 : 900],
            },
          ]}
          accessibilityLabel={`${label} minimum value`}
        />

        <Icon name="minus" size={20} color={isDark ? themeColors.gray[500] : colors.gray[400]} style={styles.separator} />

        <BottomSheetTextInput
          placeholder={placeholder[1]}
          placeholderTextColor={themeColors.gray[isDark ? 600 : 500]}
          value={value[1]?.toString() || ''}
          onChangeText={handleMaxChange}
          keyboardType="decimal-pad"
          returnKeyType="done"
          style={[
            styles.input,
            {
              backgroundColor: themeColors.white,
              borderColor: isDark ? themeColors.gray[600] : colors.gray[300],
              color: themeColors.gray[isDark ? 50 : 900],
            },
          ]}
          accessibilityLabel={`${label} maximum value`}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 4,
  },
  rangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
  },
  separator: {
    marginBottom: 0,
  },
});
