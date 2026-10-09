/**
 * Autocomplete Filter Field Component
 *
 * A field-like trigger that opens the autocomplete bottom sheet. Selected items
 * show as applied-filter chips (style guide §13.2 and §13.5).
 */

import React from 'react';
import { View, Text, Pressable, ScrollView, Insets } from 'react-native';
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
import type { AutocompleteFilterFieldProps, AutocompleteSelection } from '@/types/filter.types';
import { getAutocompleteChipColor } from '@/services/filter-autocomplete-service';

const CHIP_HEIGHT = 32;
const REMOVE_HIT_SLOP: Insets = {
  top: (touchTarget - iconSize.sm) / 2,
  bottom: (touchTarget - iconSize.sm) / 2,
  left: space.sm,
  right: space.sm,
};

export const AutocompleteFilterField: React.FC<AutocompleteFilterFieldProps> = ({
  label,
  icon,
  placeholder,
  autocompleteType: _autocompleteType,
  value,
  onPress,
  onRemoveSelection,
  inlineChips = false, // Show chips inside the field instead of below it
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  // Defensive: ensure value is always an array (handle legacy string values)
  const selections = Array.isArray(value) ? value : [];
  const hasSelections = selections.length > 0;

  const renderChip = (selection: AutocompleteSelection) => {
    const chipColors = getAutocompleteChipColor(selection.type, t);
    return (
      <View key={selection.id} style={[styles.chip, { backgroundColor: chipColors.backgroundColor }]}>
        <Text
          style={[styles.chipText, { color: chipColors.textColor }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.6}
        >
          {selection.label}
        </Text>
        {onRemoveSelection && (
          <Pressable
            onPress={() => onRemoveSelection(selection.id)}
            hitSlop={REMOVE_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={`Remove filter ${selection.label}`}
          >
            <Icon name="close" size={iconSize.sm} color={chipColors.textColor} />
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Label - only for the non-inline mode */}
      {!inlineChips && (
        <View style={styles.labelContainer}>
          {icon && <Icon name={icon} size={iconSize.sm} color={t.icon.secondary} />}
          <Text style={styles.label}>{label}</Text>
          {hasSelections && <Text style={styles.count}>({selections.length})</Text>}
        </View>
      )}

      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
        accessibilityRole="button"
        accessibilityLabel={
          hasSelections
            ? `${label}, ${selections.map((s) => s.label).join(', ')}`
            : placeholder || `Select ${label.toLowerCase()}`
        }
        accessibilityHint="Opens a search list"
      >
        {inlineChips && hasSelections ? (
          <View style={styles.inlineChipContainer}>{selections.map(renderChip)}</View>
        ) : (
          <>
            <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} />
            <Text style={styles.triggerText} numberOfLines={1}>
              {placeholder || `Select ${label.toLowerCase()}`}
            </Text>
          </>
        )}
      </Pressable>

      {/* Selected items below the field (non-inline mode) */}
      {!inlineChips && hasSelections && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScrollView}
          contentContainerStyle={styles.chipsContainer}
        >
          {selections.map(renderChip)}
        </ScrollView>
      )}
    </View>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    marginBottom: space.xs,
  },
  labelContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    marginBottom: space.xs,
  },
  label: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  count: {
    ...typography.footnote,
    color: t.text.secondary,
    fontVariant: ['tabular-nums' as const],
  },
  trigger: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    backgroundColor: t.surface.field,
  },
  triggerPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  triggerText: {
    ...typography.body,
    flex: 1,
    color: t.text.placeholder,
  },
  inlineChipContainer: {
    flex: 1,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  chipsScrollView: {
    marginTop: space.sm,
  },
  chipsContainer: {
    flexDirection: 'row' as const,
    gap: space.sm,
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    minHeight: CHIP_HEIGHT,
    maxWidth: 200,
    paddingVertical: space.s6,
    paddingLeft: space.md,
    paddingRight: space.sm,
    borderRadius: radius.pill,
  },
  chipText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    flexShrink: 1,
  },
});
