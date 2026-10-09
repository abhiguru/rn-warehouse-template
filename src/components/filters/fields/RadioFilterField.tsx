/**
 * Radio Filter Field Component
 *
 * Single-select radio list for the filter sheet (style guide §13.4): 20 px ring
 * in border.field, selected ring and dot in brand.tint, the whole row is the target.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { triggerSelection } from '@/hooks/useHaptics';
import type { RadioFilterFieldProps } from '@/types/filter.types';

const RADIO_SIZE = 20;
const RADIO_DOT = 10;

export const RadioFilterField: React.FC<RadioFilterFieldProps> = ({
  label,
  icon,
  options,
  value,
  onChange,
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      {/* Label */}
      <View style={styles.labelContainer}>
        {icon && <Icon name={icon} size={iconSize.sm} color={t.icon.secondary} />}
        <Text style={styles.label}>{label}</Text>
      </View>

      {/* Radio group */}
      <View style={styles.optionsContainer} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const isSelected = value === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                if (!isSelected) {
                  triggerSelection();
                  onChange(option.value);
                }
              }}
              style={({ pressed }) => [
                styles.option,
                isSelected && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={option.description ? `${option.label}, ${option.description}` : option.label}
            >
              <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                {isSelected && <View style={styles.radioInner} />}
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                  {option.label}
                </Text>
                {option.description && (
                  <Text style={styles.optionDescription}>{option.description}</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    marginBottom: space.sm,
  },
  labelContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    marginBottom: space.sm,
  },
  label: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  optionsContainer: {
    gap: space.sm,
  },
  option: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    gap: space.md,
    borderWidth: 1,
    borderColor: t.border.divider,
    borderRadius: radius.button,
    backgroundColor: t.surface.card,
  },
  optionSelected: {
    borderColor: t.brand.tint,
    backgroundColor: t.brand.subtle,
  },
  optionPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  radioOuter: {
    width: RADIO_SIZE,
    height: RADIO_SIZE,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: t.border.field,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  radioOuterSelected: {
    borderColor: t.brand.tint,
  },
  radioInner: {
    width: RADIO_DOT,
    height: RADIO_DOT,
    borderRadius: radius.pill,
    backgroundColor: t.brand.tint,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    ...typography.body,
    color: t.text.primary,
  },
  optionLabelSelected: {
    fontWeight: fontWeight.semibold,
  },
  optionDescription: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
});
