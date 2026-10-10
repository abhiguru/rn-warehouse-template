/**
 * SortBar: the sort row under a list report header (style guide §14.5).
 * "Sort by", a segmented control of sort fields (§13.4), a sort-direction
 * button, and an optional expand/collapse-all button. Every list with
 * in-place sorting uses it, so sorting looks and works the same everywhere.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export interface SortOption<F extends string> {
  field: F;
  label: string;
  /** Spoken name, e.g. "GRN number". Defaults to the label. */
  a11y?: string;
  icon: string;
  /**
   * What the field holds, so the direction button names the order in the right
   * words: 'date' newest/oldest first, 'number' highest/lowest number first,
   * 'text' Z to A / A to Z. Defaults to 'date'.
   */
  kind?: SortKind;
}

export type SortKind = 'date' | 'number' | 'text';

/** Spoken name of each direction, per kind of field. */
const DIRECTION_WORDS: Record<SortKind, { desc: string; asc: string }> = {
  date: { desc: 'newest first', asc: 'oldest first' },
  number: { desc: 'highest number first', asc: 'lowest number first' },
  text: { desc: 'Z to A', asc: 'A to Z' },
};

/** Label of the direction button: the current order, then what a tap does. */
export function sortDirectionLabel(kind: SortKind = 'date', order: 'asc' | 'desc'): string {
  const words = DIRECTION_WORDS[kind];
  const current = order === 'desc' ? words.desc : words.asc;
  const other = order === 'desc' ? words.asc : words.desc;
  return `Sorted ${current}. Sort ${other}`;
}

export interface SortBarProps<F extends string> {
  options: SortOption<F>[];
  field: F;
  order: 'asc' | 'desc';
  onFieldChange: (field: F) => void;
  onOrderToggle: () => void;
  /** Show the expand/collapse-all button when provided. */
  expanded?: boolean;
  onExpandToggle?: () => void;
  /** Plural noun for the expand button label: "GRNs", "dispatches". */
  itemsLabel?: string;
}

const makeStyles = (t: ThemeTokens) => ({
  bar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    gap: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
  },
  label: { ...typography.footnote, color: t.text.secondary },
  segmented: {
    flexDirection: 'row' as const,
    flexShrink: 1,
    borderWidth: 1,
    borderColor: t.border.button,
    borderRadius: radius.button,
    overflow: 'hidden' as const,
  },
  segment: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: space.xxxl,
    paddingHorizontal: space.md,
    gap: space.xs,
  },
  segmentSelected: { backgroundColor: t.brand.fill },
  segmentText: { ...typography.footnote, fontWeight: fontWeight.medium, color: t.text.primary },
  segmentTextSelected: { fontWeight: fontWeight.semibold, color: t.brand.onFill },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.pill,
  },
  pushRight: { marginLeft: 'auto' as const },
  pressed: { backgroundColor: t.brand.subtle },
});

export function SortBar<F extends string>({
  options,
  field,
  order,
  onFieldChange,
  onOrderToggle,
  expanded,
  onExpandToggle,
  itemsLabel = 'items',
}: SortBarProps<F>) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.bar}>
      <Text style={styles.label} maxFontSizeMultiplier={1.6}>Sort by</Text>
      <View style={styles.segmented} accessibilityRole="radiogroup">
        {options.map(option => {
          const selected = option.field === field;
          return (
            <Pressable
              key={option.field}
              style={[styles.segment, selected && styles.segmentSelected]}
              onPress={selected ? undefined : () => onFieldChange(option.field)}
              hitSlop={space.sm}
              accessibilityRole="radio"
              accessibilityLabel={`Sort by ${option.a11y ?? option.label}`}
              accessibilityState={{ selected, checked: selected }}
            >
              <Icon name={option.icon} size={iconSize.sm} color={selected ? t.brand.onFill : t.icon.primary} />
              <Text
                style={[styles.segmentText, selected && styles.segmentTextSelected]}
                maxFontSizeMultiplier={1.6}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        onPress={onOrderToggle}
        accessibilityRole="button"
        accessibilityLabel={sortDirectionLabel(options.find(option => option.field === field)?.kind, order)}
      >
        <Icon name={order === 'desc' ? 'sort-descending' : 'sort-ascending'} size={iconSize.md} color={t.icon.primary} />
      </Pressable>
      {onExpandToggle && (
        <Pressable
          style={({ pressed }) => [styles.iconButton, styles.pushRight, pressed && styles.pressed]}
          onPress={onExpandToggle}
          accessibilityRole="button"
          accessibilityLabel={expanded ? `Collapse all ${itemsLabel}` : `Expand all ${itemsLabel}`}
          accessibilityState={{ expanded: !!expanded }}
        >
          <Icon
            name={expanded ? 'unfold-less-horizontal' : 'unfold-more-horizontal'}
            size={iconSize.lg}
            color={t.brand.tint}
          />
        </Pressable>
      )}
    </View>
  );
}

export default SortBar;
