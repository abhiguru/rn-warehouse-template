/**
 * GRNFilterOverlay - Filter modal for GRN list
 *
 * Full-screen modal that provides filtering options for the GRN list.
 * Supports date range, items, stock status, weight range, and package mark filters.
 *
 * Features:
 * - Date range selection with DateRangePicker
 * - Multi-select item filtering
 * - Stock status toggle (all/in_stock/out_of_stock)
 * - Weight range inputs
 * - Package mark text filter
 * - Clear all/apply actions
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
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  useColorScheme,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme, { colors, darkColors } from '@/theme';
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

export default function GRNFilterOverlay({
  visible,
  onClose,
  onApply,
  currentFilters,
  activeFilterCount
}: GRNFilterOverlayProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

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

  // P3 Fix: Memoized callback to prevent inline function recreation on every render
  // Changed from index-based to id-based removal for better stability
  const removeSelectedItem = useCallback((itemId: string) => {
    setFilters(prev => ({
      ...prev,
      selectedItems: prev.selectedItems.filter(item => item.id !== itemId)
    }));
  }, []);

  const formatDate = (date?: string) => {
    if (!date) return 'Select date';
    return new Date(date).toLocaleDateString();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
      accessibilityLabel="GRN Filter Options"
    >
      <View style={[styles.container, { backgroundColor: isDark ? themeColors.gray[900] : themeColors.gray[50] }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: isDark ? themeColors.gray[800] : themeColors.white, borderBottomColor: isDark ? themeColors.gray[700] : themeColors.gray[200] }]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            accessibilityLabel="Close filter"
            accessibilityRole="button"
          >
            <Icon name="close" size={24} color={isDark ? themeColors.gray[400] : themeColors.gray[600]} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: isDark ? themeColors.gray[100] : themeColors.gray[900] }]}>Filter GRN Items</Text>
          <TouchableOpacity
            onPress={handleReset}
            style={styles.resetButton}
            accessibilityLabel="Reset all filters"
            accessibilityRole="button"
          >
            <Text style={[styles.resetText, { color: themeColors.primary }]}>Reset</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Selected Items from Search */}
          {filters.selectedItems.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: isDark ? themeColors.gray[300] : themeColors.gray[700] }]}>Selected Filters</Text>
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

          {/* Date Range */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDark ? themeColors.gray[300] : themeColors.gray[700] }]}>Date Range</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity
                style={[styles.dateInput, { backgroundColor: isDark ? themeColors.gray[800] : themeColors.white, borderColor: isDark ? themeColors.gray[600] : themeColors.gray[300] }]}
                onPress={() => setShowDatePicker('from')}
              >
                <Text style={[styles.dateLabel, { color: isDark ? themeColors.gray[400] : themeColors.gray[600] }]}>From</Text>
                <Text style={[styles.dateValue, { color: isDark ? themeColors.gray[100] : themeColors.gray[900] }]}>{formatDate(filters.dateFrom)}</Text>
              </TouchableOpacity>
              <Text style={[styles.dateSeparator, { color: isDark ? themeColors.gray[400] : themeColors.gray[500] }]}>to</Text>
              <TouchableOpacity
                style={[styles.dateInput, { backgroundColor: isDark ? themeColors.gray[800] : themeColors.white, borderColor: isDark ? themeColors.gray[600] : themeColors.gray[300] }]}
                onPress={() => setShowDatePicker('to')}
              >
                <Text style={[styles.dateLabel, { color: isDark ? themeColors.gray[400] : themeColors.gray[600] }]}>To</Text>
                <Text style={[styles.dateValue, { color: isDark ? themeColors.gray[100] : themeColors.gray[900] }]}>{formatDate(filters.dateTo)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Stock Status */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDark ? themeColors.gray[300] : themeColors.gray[700] }]}>Stock Status</Text>
            <View style={styles.radioGroup}>
              <TouchableOpacity
                style={[styles.radioOption, { backgroundColor: isDark ? themeColors.gray[800] : themeColors.white, borderColor: isDark ? themeColors.gray[600] : themeColors.gray[300] }, filters.stockStatus === 'all' && { backgroundColor: themeColors.primary + '10', borderColor: themeColors.primary }]}
                onPress={() => setFilters({ ...filters, stockStatus: 'all' })}
              >
                <Text style={[styles.radioText, { color: isDark ? themeColors.gray[300] : themeColors.gray[700] }, filters.stockStatus === 'all' && { color: themeColors.primary }]}>
                  All Items
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.radioOption, { backgroundColor: isDark ? themeColors.gray[800] : themeColors.white, borderColor: isDark ? themeColors.gray[600] : themeColors.gray[300] }, filters.stockStatus === 'in_stock' && { backgroundColor: themeColors.primary + '10', borderColor: themeColors.primary }]}
                onPress={() => setFilters({ ...filters, stockStatus: 'in_stock' })}
              >
                <Text style={[styles.radioText, { color: isDark ? themeColors.gray[300] : themeColors.gray[700] }, filters.stockStatus === 'in_stock' && { color: themeColors.primary }]}>
                  In Stock
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.radioOption, { backgroundColor: isDark ? themeColors.gray[800] : themeColors.white, borderColor: isDark ? themeColors.gray[600] : themeColors.gray[300] }, filters.stockStatus === 'out_of_stock' && { backgroundColor: themeColors.primary + '10', borderColor: themeColors.primary }]}
                onPress={() => setFilters({ ...filters, stockStatus: 'out_of_stock' })}
              >
                <Text style={[styles.radioText, { color: isDark ? themeColors.gray[300] : themeColors.gray[700] }, filters.stockStatus === 'out_of_stock' && { color: themeColors.primary }]}>
                  Out of Stock
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Weight Range */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDark ? themeColors.gray[300] : themeColors.gray[700] }]}>Weight Range (kg)</Text>
            <View style={styles.rangeInputs}>
              <TextInput
                style={[styles.rangeInput, { backgroundColor: isDark ? themeColors.gray[800] : themeColors.white, borderColor: isDark ? themeColors.gray[600] : themeColors.gray[300], color: isDark ? themeColors.gray[100] : themeColors.gray[900] }]}
                placeholder="Min"
                placeholderTextColor={isDark ? themeColors.gray[500] : themeColors.gray[500]}
                keyboardType="decimal-pad"
                value={filters.weightMin?.toString() || ''}
                onChangeText={(text) => setFilters({
                  ...filters,
                  weightMin: text ? parseFloat(text) : undefined
                })}
                accessibilityLabel="Minimum weight in kilograms"
                returnKeyType="done"
              />
              <Text style={[styles.rangeSeparator, { color: isDark ? themeColors.gray[400] : themeColors.gray[500] }]}>-</Text>
              <TextInput
                style={[styles.rangeInput, { backgroundColor: isDark ? themeColors.gray[800] : themeColors.white, borderColor: isDark ? themeColors.gray[600] : themeColors.gray[300], color: isDark ? themeColors.gray[100] : themeColors.gray[900] }]}
                placeholder="Max"
                placeholderTextColor={isDark ? themeColors.gray[500] : themeColors.gray[500]}
                keyboardType="decimal-pad"
                value={filters.weightMax?.toString() || ''}
                onChangeText={(text) => setFilters({
                  ...filters,
                  weightMax: text ? parseFloat(text) : undefined
                })}
                accessibilityLabel="Maximum weight in kilograms"
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Package Mark */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDark ? themeColors.gray[300] : themeColors.gray[700] }]}>Package Mark</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: isDark ? themeColors.gray[800] : themeColors.white, borderColor: isDark ? themeColors.gray[600] : themeColors.gray[300], color: isDark ? themeColors.gray[100] : themeColors.gray[900] }]}
              placeholder="Enter package mark"
              placeholderTextColor={isDark ? themeColors.gray[500] : themeColors.gray[500]}
              value={filters.packageMark || ''}
              onChangeText={(text) => setFilters({ ...filters, packageMark: text })}
              accessibilityLabel="Package mark filter"
              returnKeyType="done"
            />
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { backgroundColor: isDark ? themeColors.gray[800] : themeColors.white, borderTopColor: isDark ? themeColors.gray[700] : themeColors.gray[200] }]}>
          <TouchableOpacity
            style={[styles.cancelButton, { backgroundColor: isDark ? themeColors.gray[700] : themeColors.gray[100] }]}
            onPress={onClose}
            accessibilityLabel="Cancel"
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <Text style={[styles.cancelText, { color: isDark ? themeColors.gray[300] : themeColors.gray[700] }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.applyButton, { backgroundColor: themeColors.primary }]}
            onPress={handleApply}
            accessibilityLabel={`Apply ${activeFilterCount} filters`}
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <Text style={[styles.applyText, { color: themeColors.white }]}>
              Apply Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Date Picker Modal */}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor applied dynamically
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 60,
    paddingBottom: 16,
    // backgroundColor, borderBottomColor applied dynamically
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: theme.spacing.sm,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    // color applied dynamically
  },
  resetButton: {
    padding: theme.spacing.sm,
  },
  resetText: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    // color applied dynamically
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    // color applied dynamically
    marginBottom: theme.spacing.md,
    textTransform: 'uppercase',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateInput: {
    flex: 1,
    // backgroundColor, borderColor applied dynamically
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
  },
  dateLabel: {
    fontSize: theme.fontSize.xs,
    // color applied dynamically
    marginBottom: theme.spacing.xs,
  },
  dateValue: {
    fontSize: theme.fontSize.base,
    // color applied dynamically
  },
  dateSeparator: {
    fontSize: theme.fontSize.sm,
    // color applied dynamically
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  radioOption: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    // backgroundColor, borderColor applied dynamically
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
  },
  radioText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    // color applied dynamically
  },
  rangeInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rangeInput: {
    flex: 1,
    // backgroundColor, borderColor, color applied dynamically
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    fontSize: theme.fontSize.base,
  },
  rangeSeparator: {
    fontSize: theme.fontSize.base,
    // color applied dynamically
  },
  textInput: {
    // backgroundColor, borderColor, color applied dynamically
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    fontSize: theme.fontSize.base,
  },
  footer: {
    flexDirection: 'row',
    padding: theme.spacing.lg,
    // backgroundColor, borderTopColor applied dynamically
    borderTopWidth: 1,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    // backgroundColor applied dynamically
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    // color applied dynamically
  },
  applyButton: {
    flex: 1,
    paddingVertical: 14,
    // backgroundColor applied dynamically
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
  },
  applyText: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    // color applied dynamically
  },
});