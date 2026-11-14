/**
 * A short sheet for one preference (appearance, language, brand), opened from
 * its row in Settings (docs/STYLE_GUIDE.md §14.12, §13.9).
 *
 * The choices are a radio group. A tap applies the choice at once, so the app
 * changes behind the sheet, and the sheet stays open; Done closes it. An
 * optional note under the choices says what the choice does.
 */
import React, { useRef } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import type { IconName } from '@/types/icon.types';
import type { ScrollViewRef } from '@/types/nativeRefs';
import { SheetFrame } from '@/features/filters/components/SheetFrame';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export interface PreferenceOption<T extends string> {
  value: T;
  label: string;
  /** Read in place of the label, e.g. "ગુજરાતી language". */
  accessibilityLabel?: string;
  icon?: IconName;
  /** Drawn in place of the icon, e.g. brand swatches. */
  leading?: React.ReactNode;
  /** Shown but not choosable (greyed), with `hint` under the label saying why. */
  disabled?: boolean;
  hint?: string;
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

/** More choices than this and the sheet is tall and the choices scroll (the list of states). */
const SHORT_SHEET_MAX_OPTIONS = 8;
/** The share of the window a short sheet's choices may take before they scroll. */
const SHORT_SHEET_WINDOW_SHARE = 0.6;

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
  optionDisabled: { opacity: 0.45 },
  optionHint: { ...typography.footnote, color: t.text.secondary },
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
  const { height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollViewRef>(null);
  if (!visible) return null;
  // The sheet's content does not scroll by itself: a long list (the states) ran off the sheet and could not be reached.
  const tall = options.length > SHORT_SHEET_MAX_OPTIONS;
  return (
    <SheetFrame visible title={title} onClose={onClose} closeLabel={tr('common.done')} tall={tall}>
      <ScrollView
        ref={scrollRef}
        testID={testID ? `${testID}-scroll` : undefined}
        style={tall ? { flex: 1 } : { maxHeight: windowHeight * SHORT_SHEET_WINDOW_SHARE }}
        showsVerticalScrollIndicator
      >
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
                pressed && !isSelected && !option.disabled && styles.optionPressed,
                option.disabled && styles.optionDisabled,
              ]}
              disabled={option.disabled}
              // Rows differ in height with the font scale, so the selected row is measured, not computed.
              onLayout={isSelected && tall ? event => scrollRef.current?.scrollTo({ y: event.nativeEvent.layout.y, animated: false }) : undefined}
              onPress={() => onSelect(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, checked: isSelected, disabled: option.disabled === true }}
              accessibilityLabel={option.accessibilityLabel ?? option.label}
            >
              {option.leading ?? (option.icon ? <Icon name={option.icon} size={iconSize.md} color={t.icon.primary} /> : null)}
              {option.hint ? (
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>{option.label}</Text>
                  <Text style={styles.optionHint}>{option.hint}</Text>
                </View>
              ) : (
                <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>{option.label}</Text>
              )}
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
      </ScrollView>
    </SheetFrame>
  );
}

export default PreferenceSheet;
