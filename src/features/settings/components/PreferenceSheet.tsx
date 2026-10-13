/**
 * A short sheet for one preference (appearance, language, brand), opened from
 * its row in Settings (docs/STYLE_GUIDE.md §14.12, §13.9).
 *
 * The choices are a radio group. A tap applies the choice at once, so the app
 * changes behind the sheet, and the sheet stays open; Done closes it. An
 * optional note under the choices says what the choice does.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { SheetFrame } from '@/features/filters/components/SheetFrame';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export interface PreferenceOption<T extends string> {
  value: T;
  label: string;
  /** Read in place of the label, e.g. "ગુજરાતી language". */
  accessibilityLabel?: string;
  icon?: string;
  /** Drawn in place of the icon, e.g. brand swatches. */
  leading?: React.ReactNode;
}

export interface PreferenceSheetProps<T extends string> {
  visible: boolean;
  title: string;
  options: PreferenceOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  onClose: () => void;
  /** Lines under the choices, one paragraph each. */
  notes?: string[];
  testID?: string;
}

const makeStyles = (t: ThemeTokens) => ({
  group: {
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    backgroundColor: t.surface.card,
  },
  option: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: Math.max(touchTarget, layout.rowMinHeight + space.sm),
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  optionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
  },
  optionPressed: { backgroundColor: t.surface.cardPressed },
  optionLabel: { ...typography.body, flex: 1, color: t.text.primary },
  optionLabelSelected: { fontWeight: fontWeight.semibold, color: t.brand.tint },
  check: { width: iconSize.md },
  note: { ...typography.footnote, color: t.text.secondary, marginTop: space.md },
});

export function PreferenceSheet<T extends string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
  notes,
  testID,
}: PreferenceSheetProps<T>) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  if (!visible) return null;
  return (
    <SheetFrame visible title={title} onClose={onClose} closeLabel={tr('common.done')}>
      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={title} testID={testID}>
        {options.map((option, index) => {
          const isSelected = option.value === selected;
          return (
            <Pressable
              key={option.value}
              testID={testID ? `${testID}-${option.value}` : undefined}
              style={({ pressed }) => [
                styles.option,
                index < options.length - 1 && styles.optionDivider,
                pressed && !isSelected && styles.optionPressed,
              ]}
              onPress={() => onSelect(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, checked: isSelected }}
              accessibilityLabel={option.accessibilityLabel ?? option.label}
            >
              {option.leading ?? (option.icon ? <Icon name={option.icon} size={iconSize.md} color={t.icon.primary} /> : null)}
              <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>{option.label}</Text>
              <View style={styles.check}>
                {isSelected ? <Icon name="check" size={iconSize.md} color={t.brand.tint} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {notes?.map(note => (
        <Text key={note} style={styles.note}>
          {note}
        </Text>
      ))}
    </SheetFrame>
  );
}

export default PreferenceSheet;
