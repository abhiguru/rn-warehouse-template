/**
 * DispatchFilterOverlay - Filter modal for dispatch list
 *
 * Full-screen modal that provides filtering options for the dispatch list.
 * Supports date range, GRN number, and multi-select dispatch/customer/item filters.
 *
 * Features:
 * - Date range selection (from/to)
 * - GRN number text filter
 * - Multi-select filter chips for dispatches, customers, and items
 * - Clear all/apply actions
 *
 * @example
 * ```tsx
 * <DispatchFilterOverlay
 *   visible={showFilters}
 *   onClose={() => setShowFilters(false)}
 *   onApply={handleApplyFilters}
 *   currentFilters={filters}
 *   activeFilterCount={2}
 * />
 * ```
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import DateTimePicker from '@react-native-community/datetimepicker';

export interface DispatchFilterState {
  dateFrom?: Date;
  dateTo?: Date;
  grnNo?: string;
  selectedItems: Array<{
    type: 'dispatch' | 'customer' | 'item';
    id: string;
    label: string;
    value: string;
  }>;
}

interface DispatchFilterOverlayProps {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: DispatchFilterState) => void;
  currentFilters: DispatchFilterState;
  activeFilterCount: number;
}

const DispatchFilterOverlay: React.FC<DispatchFilterOverlayProps> = ({
  visible,
  onClose,
  onApply,
  currentFilters,
  activeFilterCount,
}) => {
  const [filters, setFilters] = useState<DispatchFilterState>(currentFilters);
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);

  useEffect(() => {
    setFilters(currentFilters);
  }, [currentFilters]);

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const handleReset = () => {
    const resetFilters: DispatchFilterState = {
      selectedItems: [],
    };
    setFilters(resetFilters);
  };

  const formatDate = (date?: Date) => {
    if (!date) return 'Not set';
    return date.toLocaleDateString();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
      accessibilityLabel="Dispatch Filter Options"
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            accessibilityLabel="Cancel"
            accessibilityRole="button"
          >
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Filters</Text>
          <TouchableOpacity
            onPress={handleReset}
            style={styles.resetButton}
            accessibilityLabel="Reset all filters"
            accessibilityRole="button"
          >
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>
        </View>

        {/* Filter Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Date Range Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date Range</Text>
            
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDateFromPicker(true)}
            >
              <Text style={styles.dateLabel}>From Date</Text>
              <Text style={styles.dateValue}>{formatDate(filters.dateFrom)}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDateToPicker(true)}
            >
              <Text style={styles.dateLabel}>To Date</Text>
              <Text style={styles.dateValue}>{formatDate(filters.dateTo)}</Text>
            </TouchableOpacity>
          </View>

          {/* GRN Number Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>GRN Number</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter GRN number"
              placeholderTextColor={theme.colors.gray[500]}
              value={filters.grnNo}
              onChangeText={(text) => setFilters({ ...filters, grnNo: text })}
              accessibilityLabel="GRN number filter"
              returnKeyType="done"
            />
          </View>

          {/* Active Search Filters */}
          {filters.selectedItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Active Search Filters</Text>
              <Text style={styles.helpText}>
                These filters are applied from your search selections
              </Text>
              {filters.selectedItems.map((item, index) => (
                <View key={`${item.type}-${item.id}`} style={styles.activeFilter}>
                  <View style={styles.activeFilterContent}>
                    <Icon
                      name={item.type === 'dispatch' ? 'clipboard-list' : item.type === 'customer' ? 'account' : 'package-variant'}
                      size={14}
                      color={theme.colors.gray[600]}
                      style={styles.activeFilterIcon}
                    />
                    <Text style={styles.activeFilterText}>
                      {item.label}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Apply Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.applyButton}
            onPress={handleApply}
            accessibilityLabel={`Apply ${activeFilterCount} filters`}
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <Text style={styles.applyButtonText}>
              Apply Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Date Pickers */}
        {showDateFromPicker && (
          <DateTimePicker
            value={filters.dateFrom || new Date()}
            mode="date"
            display="default"
            onChange={(event, date) => {
              setShowDateFromPicker(false);
              if (date) {
                setFilters({ ...filters, dateFrom: date });
              }
            }}
          />
        )}

        {showDateToPicker && (
          <DateTimePicker
            value={filters.dateTo || new Date()}
            mode="date"
            display="default"
            onChange={(event, date) => {
              setShowDateToPicker(false);
              if (date) {
                setFilters({ ...filters, dateTo: date });
              }
            }}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.gray[50],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[200],
  },
  closeButton: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.primary,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.gray[900],
  },
  resetButton: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  resetButtonText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.gray[600],
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: theme.colors.white,
    marginVertical: 8,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.gray[900],
    marginBottom: theme.spacing.md,
  },
  dateButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[200],
  },
  dateLabel: {
    fontSize: theme.fontSize.base,
    color: theme.colors.gray[700],
  },
  dateValue: {
    fontSize: theme.fontSize.base,
    color: theme.colors.primary,
  },
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.gray[300],
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    fontSize: theme.fontSize.base,
    color: theme.colors.gray[900],
    backgroundColor: theme.colors.white,
  },
  helpText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[600],
    marginBottom: theme.spacing.sm,
  },
  activeFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.gray[100],
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.sm,
  },
  activeFilterContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeFilterIcon: {
    marginRight: 6,
  },
  activeFilterText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[700],
  },
  footer: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.gray[200],
  },
  applyButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
  },
  applyButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
});

export default DispatchFilterOverlay;