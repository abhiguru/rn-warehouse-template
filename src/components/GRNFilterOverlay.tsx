/**
 * GRNFilterOverlay - Filter modal for GRN list
 *
 * Full-screen filter sheet (style guide 13.9 / 14.5) for the GRN list.
 * Supports date range, items, stock status, weight range, and package mark filters.
 *
 * Features:
 * - Date range selection with DateRangePicker
 * - Multi-select item filtering
 * - Stock status radio list (all/in_stock/out_of_stock)
 * - Weight range inputs
 * - Package mark text filter
 * - Reset and show-results actions
 *
 * @example
 * ```tsx
 * <GRNFilterOverlay
 *   visible={showFilters}
 *   onClose={() => setShowFilters(false)}
 *   onApply={handleApplyFilters}
 *   currentFilters={filters}
 *   activeFilterCount={3}
 * />
 * ```
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Modal, Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import DateRangePicker from './DateRangePicker';
import FilterChip from './FilterChip';

export interface GRNFilterState {
  dateFrom?: string;
  dateTo?: string;
  selectedItems: Array<{ id: string; label: string; type: string }>;
  stockStatus: 'all' | 'in_stock' | 'out_of_stock';
  weightMin?: number;
  weightMax?: number;
  packageMark?: string;
}

interface GRNFilterOverlayProps {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: GRNFilterState) => void;
  currentFilters: GRNFilterState;
  activeFilterCount: number;
}

const STOCK_OPTIONS: Array<{ value: GRNFilterState['stockStatus']; label: string }> = [
  { value: 'all', label: 'All items' },
  { value: 'in_stock', label: 'In stock' },
  { value: 'out_of_stock', label: 'Out of stock' },
];

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space.sm,
    paddingBottom: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
  },
  headerButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.button,
  },
  headerButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  title: {
    ...typography.headline,
    color: t.text.primary,
    flex: 1,
    textAlign: 'center' as const,
  },
  resetText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: layout.marginCompact,
  },
  section: {
    marginBottom: space.xxl,
  },
  sectionTitle: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    color: t.text.secondary,
    marginBottom: space.sm,
  },
  chipContainer: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  dateRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
  },
  field: {
    flex: 1,
    minHeight: touchTarget,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  fieldPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  dateField: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  dateLabel: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.xs,
  },
  dateValue: {
    ...typography.body,
    color: t.text.primary,
    flexShrink: 1,
  },
  datePlaceholder: {
    ...typography.body,
    color: t.text.placeholder,
    flexShrink: 1,
  },
  separator: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  radioList: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  radioRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: t.surface.card,
  },
  radioRowPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  radioDivider: {
    height: 1,
    backgroundColor: t.border.divider,
    marginLeft: space.lg,
  },
  radioText: {
    ...typography.body,
    color: t.text.primary,
    flex: 1,
  },
  radioTextSelected: {
    fontWeight: fontWeight.semibold,
  },
  input: {
    ...typography.body,
    flex: 1,
    minHeight: touchTarget,
    color: t.text.primary,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    fontVariant: ['tabular-nums' as const],
  },
  rangeInputs: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
  },
  footer: {
    flexDirection: 'row' as const,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    backgroundColor: t.surface.card,
    gap: space.sm,
    ...t.shadow[3],
  },
  button: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radius.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: space.lg,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: t.border.button,
  },
  secondaryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  secondaryText: {
    ...typography.callout,
    color: t.text.primary,
  },
  primaryButton: {
    backgroundColor: t.brand.fill,
  },
  primaryButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  primaryText: {
    ...typography.callout,
    color: t.brand.onFill,
  },
});

/** Shows a stored date as "9 Oct 2026" (style guide 12.3). */
const formatDate = (date?: string) => {
  if (!date) return undefined;
  const d = new Date(date);
  if (isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function GRNFilterOverlay({
  visible,
  onClose,
  onApply,
  currentFilters,
  activeFilterCount,
}: GRNFilterOverlayProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();

  const [filters, setFilters] = useState<GRNFilterState>(currentFilters);
  const [showDatePicker, setShowDatePicker] = useState<'from' | 'to' | null>(null);

  useEffect(() => {
    setFilters(currentFilters);
  }, [currentFilters]);

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const handleReset = () => {
    const resetFilters: GRNFilterState = {
      selectedItems: [],
      stockStatus: 'all',
    };
    setFilters(resetFilters);
  };

  // Id-based removal keeps the callback stable across renders
  const removeSelectedItem = useCallback((itemId: string) => {
    setFilters(prev => ({
      ...prev,
      selectedItems: prev.selectedItems.filter(item => item.id !== itemId),
    }));
  }, []);

  const renderDateField = (which: 'from' | 'to') => {
    const label = which === 'from' ? 'From' : 'To';
    const value = formatDate(which === 'from' ? filters.dateFrom : filters.dateTo);
    return (
      <Pressable
        style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}
        onPress={() => setShowDatePicker(which)}
        accessibilityRole="button"
        accessibilityLabel={`${label} date, ${value ?? 'not set'}`}
        accessibilityHint="Opens the date picker"
      >
        <Text style={styles.dateLabel}>{label}</Text>
        <View style={styles.dateField}>
          <Icon name="calendar-outline" size={iconSize.md} color={t.icon.secondary} />
          <Text style={value ? styles.dateValue : styles.datePlaceholder}>{value ?? 'Select date'}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
      accessibilityLabel="Filter GRNs"
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
            accessibilityLabel="Close filters"
            accessibilityRole="button"
          >
            <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">Filter GRNs</Text>
          <Pressable
            onPress={handleReset}
            style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
            accessibilityLabel="Reset all filters"
            accessibilityRole="button"
          >
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Selected items from search */}
          {filters.selectedItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">Selected filters</Text>
              <View style={styles.chipContainer}>
                {filters.selectedItems.map((item) => (
                  <FilterChip
                    key={`${item.type}-${item.id}`}
                    label={item.label}
                    type={item.type}
                    onRemove={() => removeSelectedItem(item.id)}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Date range */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">Date range</Text>
            <View style={styles.dateRow}>
              {renderDateField('from')}
              <Text style={styles.separator}>to</Text>
              {renderDateField('to')}
            </View>
          </View>

          {/* Stock status */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">Stock status</Text>
            <View style={styles.radioList} accessibilityRole="radiogroup">
              {STOCK_OPTIONS.map((option, index) => {
                const selected = filters.stockStatus === option.value;
                return (
                  <React.Fragment key={option.value}>
                    {index > 0 && <View style={styles.radioDivider} />}
                    <Pressable
                      style={({ pressed }) => [styles.radioRow, pressed && styles.radioRowPressed]}
                      onPress={() => setFilters({ ...filters, stockStatus: option.value })}
                      accessibilityRole="radio"
                      accessibilityLabel={option.label}
                      accessibilityState={{ selected, checked: selected }}
                    >
                      <Text style={[styles.radioText, selected && styles.radioTextSelected]}>
                        {option.label}
                      </Text>
                      {selected && <Icon name="check" size={iconSize.md} color={t.brand.tint} />}
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </View>
          </View>

          {/* Weight range */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">Weight range (kg)</Text>
            <View style={styles.rangeInputs}>
              <TextInput
                style={styles.input}
                placeholder="Min"
                placeholderTextColor={t.text.placeholder}
                keyboardType="decimal-pad"
                value={filters.weightMin?.toString() || ''}
                onChangeText={(text) => setFilters({
                  ...filters,
                  weightMin: text ? parseFloat(text) : undefined,
                })}
                accessibilityLabel="Minimum weight in kilograms"
                returnKeyType="done"
              />
              <Text style={styles.separator}>to</Text>
              <TextInput
                style={styles.input}
                placeholder="Max"
                placeholderTextColor={t.text.placeholder}
                keyboardType="decimal-pad"
                value={filters.weightMax?.toString() || ''}
                onChangeText={(text) => setFilters({
                  ...filters,
                  weightMax: text ? parseFloat(text) : undefined,
                })}
                accessibilityLabel="Maximum weight in kilograms"
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Package mark */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">Package mark</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter package mark"
              placeholderTextColor={t.text.placeholder}
              value={filters.packageMark || ''}
              onChangeText={(text) => setFilters({ ...filters, packageMark: text })}
              accessibilityLabel="Package mark"
              returnKeyType="done"
            />
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Pressable
            style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={onClose}
            accessibilityLabel="Cancel"
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.primaryButtonPressed]}
            onPress={handleApply}
            accessibilityLabel={activeFilterCount > 0 ? `Show results, ${activeFilterCount} filters` : 'Show results'}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>
              {activeFilterCount > 0 ? `Show results (${activeFilterCount})` : 'Show results'}
            </Text>
          </Pressable>
        </View>

        {/* Date picker */}
        {showDatePicker && (
          <DateRangePicker
            visible={true}
            mode={showDatePicker}
            currentDate={showDatePicker === 'from' ? filters.dateFrom : filters.dateTo}
            minDate={showDatePicker === 'to' ? filters.dateFrom : undefined}
            maxDate={showDatePicker === 'from' ? filters.dateTo : undefined}
            onSelect={(date) => {
              if (showDatePicker === 'from') {
                setFilters({ ...filters, dateFrom: date });
              } else {
                setFilters({ ...filters, dateTo: date });
              }
              setShowDatePicker(null);
            }}
            onClose={() => setShowDatePicker(null)}
          />
        )}
      </View>
    </Modal>
  );
}
