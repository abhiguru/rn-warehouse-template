/**
 * Radio Filter Field Component
 *
 * Single-select radio button group for filter modal.
 * Mobile-First Design with Material Design 3 and react-native-paper.
 */

import React from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { Text, RadioButton, Surface } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, darkColors } from '@/theme';
import type { RadioFilterFieldProps } from '@/types/filter.types';

export const RadioFilterField: React.FC<RadioFilterFieldProps> = ({
  label,
  icon,
  options,
  value,
  onChange,
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

  return (
    <View style={styles.container}>
      {/* Label */}
      <View style={styles.labelContainer}>
        {icon && <Icon name={icon} size={18} color={isDark ? themeColors.gray[400] : colors.gray[600]} />}
        <Text variant="labelLarge" style={[styles.label, { color: isDark ? themeColors.gray[100] : colors.gray[700] }]}>
          {label}
        </Text>
      </View>

      {/* Radio Group */}
      <RadioButton.Group onValueChange={onChange} value={value}>
        <View style={styles.optionsContainer}>
          {options.map((option) => {
            const isSelected = value === option.value;
            return (
              <Surface
                key={option.value}
                style={[
                  styles.option,
                  {
                    backgroundColor: isSelected ? themeColors.white : (isDark ? themeColors.gray[800] : colors.white),
                    borderColor: isSelected ? themeColors.primary : (isDark ? themeColors.gray[700] : colors.gray[200]),
                  },
                  isSelected && styles.optionSelected,
                ]}
                elevation={isSelected ? 2 : 0}
              >
                <RadioButton.Item
                  label={option.label}
                  value={option.value}
                  status={isSelected ? 'checked' : 'unchecked'}
                  color={themeColors.primary}
                  uncheckedColor={isDark ? themeColors.gray[500] : colors.gray[400]}
                  labelStyle={[
                    styles.optionLabel,
                    { color: isDark ? (isSelected ? themeColors.gray[900] : themeColors.gray[200]) : (isSelected ? colors.gray[900] : colors.gray[700]) },
                    isSelected && styles.optionLabelSelected,
                  ]}
                  style={styles.radioItem}
                  mode="android"
                />
                {option.description && (
                  <Text variant="bodySmall" style={[styles.optionDescription, { color: isDark ? themeColors.gray[400] : colors.gray[500] }]}>
                    {option.description}
                  </Text>
                )}
              </Surface>
            );
          })}
        </View>
      </RadioButton.Group>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  label: {
    // Color applied dynamically
    fontWeight: '600',
  },
  optionsContainer: {
    gap: 8,
  },
  option: {
    // backgroundColor and borderColor applied dynamically
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  optionSelected: {
    // backgroundColor and borderColor applied dynamically
    borderWidth: 2,
  },
  radioItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  optionLabel: {
    // Color applied dynamically
  },
  optionLabelSelected: {
    // Color applied dynamically
    fontWeight: '600',
  },
  optionDescription: {
    // Color applied dynamically
    paddingHorizontal: 16,
    paddingBottom: 12,
    marginTop: -8,
  },
});
