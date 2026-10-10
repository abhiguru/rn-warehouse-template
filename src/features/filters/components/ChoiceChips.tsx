/**
 * Single-choice chips with radio semantics (docs/STYLE_GUIDE.md §13.3):
 * wrapping, at least 36 tall, the selected one in brand.subtle with a check.
 */
import React from 'react';
import { Pressable, Text, View, type Insets } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

const HEIGHT = 36;
const HIT_SLOP: Insets = { top: (touchTarget - HEIGHT) / 2, bottom: (touchTarget - HEIGHT) / 2 };

export interface ChoiceChipsProps<T extends string> {
  options: { value: T; label: string }[];
  /** Selected value, or undefined when none is. */
  value: T | undefined;
  onChange: (value: T) => void;
  /** Name of the group for screen readers. */
  accessibilityLabel: string;
}

const makeStyles = (t: ThemeTokens) => ({
  group: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.sm },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: HEIGHT,
    paddingHorizontal: space.md,
    gap: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: t.border.button,
    backgroundColor: t.surface.card,
  },
  chipSelected: { borderColor: t.brand.tint, backgroundColor: t.brand.subtle },
  chipPressed: { backgroundColor: t.surface.cardPressed },
  label: { ...typography.subhead, color: t.text.primary },
  labelSelected: { fontWeight: fontWeight.semibold, color: t.brand.tint },
});

export function ChoiceChips<T extends string>({ options, value, onChange, accessibilityLabel }: ChoiceChipsProps<T>) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && !selected && styles.chipPressed]}
            onPress={() => onChange(option.value)}
            hitSlop={HIT_SLOP}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, checked: selected }}
          >
            {selected ? <Icon name="check" size={iconSize.sm} color={t.brand.tint} /> : null}
            <Text style={[styles.label, selected && styles.labelSelected]} maxFontSizeMultiplier={1.6}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default ChoiceChips;
