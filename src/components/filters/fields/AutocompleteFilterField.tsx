/**
 * Autocomplete Filter Field Component
 *
 * Trigger button that opens autocomplete bottom sheet for selection.
 * Selected items are displayed as chips.
 * Mobile-First Design with Material Design 3 and react-native-paper.
 */

import React from 'react';
import { View, StyleSheet, ScrollView, useColorScheme } from 'react-native';
import { Text, Button, Chip, Surface } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, darkColors } from '@/theme';
import type { AutocompleteFilterFieldProps } from '@/types/filter.types';
import { getAutocompleteChipColor } from '@/services/filter-autocomplete-service';

export const AutocompleteFilterField: React.FC<AutocompleteFilterFieldProps> = ({
  label,
  icon,
  placeholder,
  autocompleteType,
  value,
  onPress,
  onRemoveSelection,
  inlineChips = false, // New prop to control chip display mode
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

  // Defensive: ensure value is always an array (handle legacy string values)
  const selections = Array.isArray(value) ? value : [];
  const hasSelections = selections.length > 0;

  return (
    <View style={styles.container}>
      {/* Label - Only show for non-inline mode */}
      {!inlineChips && (
        <View style={styles.labelContainer}>
          {icon && <Icon name={icon} size={18} color={isDark ? themeColors.gray[400] : colors.gray[600]} />}
          <Text variant="labelLarge" style={[styles.label, { color: isDark ? themeColors.gray[100] : colors.gray[700] }]}>
            {label}
          </Text>
          {hasSelections && (
            <Text variant="labelSmall" style={[styles.count, { color: isDark ? themeColors.gray[400] : colors.gray[500] }]}>
              ({selections.length})
            </Text>
          )}
        </View>
      )}

      {/* Trigger Button with inline chips if enabled */}
      <Surface style={[styles.triggerSurface, { backgroundColor: themeColors.white }]} elevation={0}>
        {inlineChips && hasSelections ? (
          // Inline mode: Show chip inside the button area
          <View style={[
            styles.inlineChipContainer,
            {
              borderColor: isDark ? themeColors.gray[600] : colors.gray[300],
              backgroundColor: themeColors.white,
            },
          ]}>
            {selections.map((selection) => {
              const chipColors = getAutocompleteChipColor(selection.type);
              return (
                <Chip
                  key={selection.id}
                  onClose={onRemoveSelection ? () => onRemoveSelection(selection.id) : undefined}
                  style={[
                    styles.inlineChip,
                    { backgroundColor: chipColors.backgroundColor },
                  ]}
                  textStyle={[
                    styles.chipText,
                    { color: chipColors.textColor },
                  ]}
                  closeIconAccessibilityLabel="Remove"
                  onPress={onPress}
                >
                  {selection.label}
                </Chip>
              );
            })}
          </View>
        ) : (
          // Default mode: Show button
          <Button
            mode="outlined"
            onPress={onPress}
            icon={() => <Icon name="magnify" size={20} color={isDark ? themeColors.gray[400] : colors.gray[600]} />}
            contentStyle={styles.triggerButtonContent}
            labelStyle={[
              styles.triggerButtonLabel,
              { color: isDark ? themeColors.gray[400] : colors.gray[600] },
            ]}
            style={[
              styles.triggerButton,
              {
                borderColor: isDark ? themeColors.gray[600] : colors.gray[300],
                backgroundColor: themeColors.white,
              },
            ]}
          >
            {placeholder || `Select ${label.toLowerCase()}`}
          </Button>
        )}
      </Surface>

      {/* Selected Items Chips - Only show below if NOT in inline mode */}
      {!inlineChips && hasSelections && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScrollView}
          contentContainerStyle={styles.chipsContainer}
        >
          {selections.map((selection) => {
            const chipColors = getAutocompleteChipColor(selection.type);
            return (
              <Chip
                key={selection.id}
                onClose={onRemoveSelection ? () => onRemoveSelection(selection.id) : undefined}
                style={[
                  styles.chip,
                  { backgroundColor: chipColors.backgroundColor },
                ]}
                textStyle={[
                  styles.chipText,
                  { color: chipColors.textColor },
                ]}
                closeIconAccessibilityLabel="Remove"
              >
                {selection.label}
              </Chip>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 4,
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
  count: {
    // Color applied dynamically
    fontWeight: '500',
  },
  triggerSurface: {
    // backgroundColor applied dynamically
    borderRadius: 12,
  },
  triggerButton: {
    // borderColor applied dynamically
    borderRadius: 12,
  },
  triggerButtonContent: {
    justifyContent: 'flex-start',
    paddingVertical: 8,
  },
  triggerButtonLabel: {
    // Color applied dynamically
    fontSize: 14,
    textAlign: 'left',
  },
  inlineChipContainer: {
    borderWidth: 1,
    // borderColor applied dynamically
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  inlineChip: {
    maxWidth: '100%',
  },
  chipsScrollView: {
    marginTop: 12,
  },
  chipsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    maxWidth: 200,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
