/**
 * Text Filter Field Component
 *
 * Text input field with icon and clear button for filter modal.
 * Mobile-First Design with Material Design 3 and react-native-paper.
 */

import React, { useState } from 'react';
import { View, StyleSheet, TextInput as RNTextInput, useColorScheme } from 'react-native';
import { TextInput, Text } from 'react-native-paper';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, darkColors } from '@/theme';
import type { TextFilterFieldProps } from '@/types/filter.types';

export const TextFilterField: React.FC<TextFilterFieldProps> = ({
  label,
  icon,
  placeholder,
  value,
  onChangeText,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

  const handleClear = () => {
    onChangeText('');
  };

  const showPlaceholderText = !value && !isFocused;
  const placeholderText = placeholder || label;

  return (
    <View style={styles.container}>
      {/* Input with icon inline */}
      <View style={[
        styles.inputWrapper,
        {
          backgroundColor: themeColors.white,
          borderColor: isDark ? themeColors.gray[600] : colors.gray[300],
        },
      ]}>
        {icon && (
          <Icon
            name={icon}
            size={20}
            color={isDark ? themeColors.gray[400] : colors.gray[600]}
            style={styles.leftIcon}
          />
        )}
        <BottomSheetTextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[
            styles.input,
            icon && styles.inputWithIcon,
            {
              color: themeColors.gray[isDark ? 50 : 900],
            },
          ]}
          placeholderTextColor={themeColors.gray[isDark ? 600 : 500]}
          accessibilityLabel={label || placeholder}
        />
        {showPlaceholderText && (
          <Text style={[
            styles.placeholderText,
            icon && styles.placeholderWithIcon,
            {
              color: themeColors.gray[isDark ? 500 : 500],
            },
          ]}>
            {placeholderText}
          </Text>
        )}
        {value && value.length > 0 && (
          <Icon
            name="close-circle"
            size={20}
            color={isDark ? themeColors.gray[500] : colors.gray[500]}
            onPress={handleClear}
            style={styles.clearIcon}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 4,
  },
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  leftIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 12,
    fontSize: 16,
  },
  inputWithIcon: {
    paddingLeft: 0,
  },
  placeholderText: {
    position: 'absolute',
    left: 16,
    fontSize: 16,
    pointerEvents: 'none',
  },
  placeholderWithIcon: {
    left: 48,
  },
  clearIcon: {
    marginLeft: 8,
  },
});
