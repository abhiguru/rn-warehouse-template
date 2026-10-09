/**
 * Number Range Filter Field Component
 *
 * Min/max number inputs for range filtering (style guide §13.2).
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import type { NumberRangeFilterFieldProps } from '@/types/filter.types';

export const NumberRangeFilterField: React.FC<NumberRangeFilterFieldProps> = ({
  label,
  icon: _icon,
  placeholder = ['Min', 'Max'],
  minValue: _minValue,
  maxValue: _maxValue,
  value,
  onChange,
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const [focused, setFocused] = useState<'min' | 'max' | null>(null);

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
      <View style={styles.rangeContainer}>
        <BottomSheetTextInput
          placeholder={placeholder[0]}
          placeholderTextColor={t.text.placeholder}
          value={value[0]?.toString() || ''}
          onChangeText={handleMinChange}
          onFocus={() => setFocused('min')}
          onBlur={() => setFocused(null)}
          keyboardType="decimal-pad"
          returnKeyType="done"
          style={[styles.input, focused === 'min' && styles.inputFocused]}
          accessibilityLabel={`${label} minimum value`}
        />

        <Icon name="minus" size={iconSize.md} color={t.icon.secondary} />

        <BottomSheetTextInput
          placeholder={placeholder[1]}
          placeholderTextColor={t.text.placeholder}
          value={value[1]?.toString() || ''}
          onChangeText={handleMaxChange}
          onFocus={() => setFocused('max')}
          onBlur={() => setFocused(null)}
          keyboardType="decimal-pad"
          returnKeyType="done"
          style={[styles.input, focused === 'max' && styles.inputFocused]}
          accessibilityLabel={`${label} maximum value`}
        />
      </View>
    </View>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    marginBottom: space.xs,
  },
  rangeContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  input: {
    ...typography.body,
    flex: 1,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    backgroundColor: t.surface.field,
    color: t.text.primary,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: touchTarget,
    fontVariant: ['tabular-nums' as const],
  },
  inputFocused: {
    borderWidth: 2,
    borderColor: t.border.fieldFocus,
    paddingHorizontal: space.lg - 1,
  },
});
