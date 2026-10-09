/**
 * Text Filter Field Component
 *
 * Text input with an icon and a clear button for the filter sheet
 * (style guide §13.2).
 */

import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import type { TextFilterFieldProps } from '@/types/filter.types';

export const TextFilterField: React.FC<TextFilterFieldProps> = ({
  label,
  icon,
  placeholder,
  value,
  onChangeText,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  const handleClear = () => {
    onChangeText('');
  };

  const showPlaceholderText = !value && !isFocused;
  const placeholderText = placeholder || label;

  return (
    <View style={styles.container}>
      <View style={[styles.inputWrapper, isFocused && styles.inputWrapperFocused]}>
        {icon && (
          <Icon
            name={icon}
            size={iconSize.md}
            color={t.icon.secondary}
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
          style={[styles.input, icon && styles.inputWithIcon]}
          placeholderTextColor={t.text.placeholder}
          accessibilityLabel={label || placeholder}
        />
        {showPlaceholderText && (
          <Text
            style={[styles.placeholderText, icon && styles.placeholderWithIcon]}
            pointerEvents="none"
            importantForAccessibility="no"
          >
            {placeholderText}
          </Text>
        )}
        {value && value.length > 0 && (
          <Pressable
            onPress={handleClear}
            style={styles.clearButton}
            hitSlop={(touchTarget - iconSize.md) / 2}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${(label || 'text').toLowerCase()}`}
          >
            <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
          </Pressable>
        )}
      </View>
    </View>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    marginBottom: space.xs,
  },
  inputWrapper: {
    position: 'relative' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    backgroundColor: t.surface.field,
    paddingHorizontal: space.lg,
    minHeight: touchTarget,
  },
  inputWrapperFocused: {
    borderWidth: 2,
    borderColor: t.border.fieldFocus,
    paddingHorizontal: space.lg - 1,
  },
  leftIcon: {
    marginRight: space.md,
  },
  input: {
    ...typography.body,
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: space.md,
    color: t.text.primary,
  },
  inputWithIcon: {
    paddingLeft: 0,
  },
  placeholderText: {
    ...typography.body,
    position: 'absolute' as const,
    left: space.lg,
    color: t.text.placeholder,
  },
  placeholderWithIcon: {
    left: space.lg + iconSize.md + space.md,
  },
  clearButton: {
    marginLeft: space.sm,
  },
});
