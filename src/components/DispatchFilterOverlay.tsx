/**
 * DispatchFilterOverlay - Filter modal for dispatch list
 *
 * Full-height filter screen (docs/STYLE_GUIDE.md §13.9 filter screens): fields
 * grouped by section headers, "Reset" tertiary in the header, "Show results"
 * primary at the bottom.
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
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';

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

const formatDate = (date?: Date) => {
  if (!date) return 'Any date';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space.xs,
    paddingBottom: space.xs,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  headerButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    justifyContent: 'center' as const,
    borderRadius: radius.button,
  },
  headerButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  headerButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  title: {
    ...typography.headline,
    color: t.text.primary,
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: space.xxl,
  },
  sectionTitle: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    paddingHorizontal: layout.marginCompact,
    marginBottom: space.sm,
  },
  sectionBody: {
    backgroundColor: t.surface.card,
    paddingHorizontal: layout.marginCompact,
  },
  sectionBodyPadded: {
    paddingVertical: space.lg,
  },
  dateButton: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: layout.rowMinHeight + space.xs,
    gap: space.sm,
  },
  dateButtonDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  dateButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  dateLabel: {
    ...typography.body,
    color: t.text.primary,
    flex: 1,
  },
  dateValue: {
    ...typography.body,
    color: t.brand.tint,
  },
  fieldLabel: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.xs,
  },
  textInput: {
    ...typography.body,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: layout.rowMinHeight,
    color: t.text.primary,
    backgroundColor: t.surface.field,
  },
  textInputFocused: {
    borderWidth: 2,
    borderColor: t.border.fieldFocus,
    paddingHorizontal: space.md - 1,
  },
  helpText: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.sm,
  },
  activeFilter: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    paddingVertical: space.s6,
    paddingHorizontal: space.md,
    backgroundColor: t.brand.subtle,
    borderRadius: radius.pill,
    marginBottom: space.sm,
    gap: space.s6,
  },
  activeFilterText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  footer: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    backgroundColor: t.surface.card,
    ...t.shadow[3],
  },
  applyButton: {
    backgroundColor: t.brand.fill,
    minHeight: touchTarget,
    borderRadius: radius.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  applyButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  applyButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
});

const DispatchFilterOverlay: React.FC<DispatchFilterOverlayProps> = ({
  visible,
  onClose,
  onApply,
  currentFilters,
  activeFilterCount,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const [filters, setFilters] = useState<DispatchFilterState>(currentFilters);
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);
  const [grnFocused, setGrnFocused] = useState(false);

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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <View style={styles.container} accessibilityViewIsModal>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
            accessibilityLabel="Cancel"
            accessibilityRole="button"
          >
            <Text style={styles.headerButtonText}>Cancel</Text>
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">Filters</Text>
          <Pressable
            onPress={handleReset}
            style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
            accessibilityLabel="Reset all filters"
            accessibilityRole="button"
          >
            <Text style={styles.headerButtonText}>Reset</Text>
          </Pressable>
        </View>

        {/* Filter Content */}
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Date Range Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">Date range</Text>
            <View style={styles.sectionBody}>
              <Pressable
                style={({ pressed }) => [styles.dateButton, pressed && styles.dateButtonPressed]}
                onPress={() => setShowDateFromPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`From date, ${formatDate(filters.dateFrom)}`}
              >
                <Text style={styles.dateLabel}>From</Text>
                <Text style={styles.dateValue}>{formatDate(filters.dateFrom)}</Text>
                <Icon name="calendar-outline" size={iconSize.md} color={t.icon.secondary} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.dateButton,
                  styles.dateButtonDivider,
                  pressed && styles.dateButtonPressed,
                ]}
                onPress={() => setShowDateToPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`To date, ${formatDate(filters.dateTo)}`}
              >
                <Text style={styles.dateLabel}>To</Text>
                <Text style={styles.dateValue}>{formatDate(filters.dateTo)}</Text>
                <Icon name="calendar-outline" size={iconSize.md} color={t.icon.secondary} />
              </Pressable>
            </View>
          </View>

          {/* GRN Number Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">GRN</Text>
            <View style={[styles.sectionBody, styles.sectionBodyPadded]}>
              <Text style={styles.fieldLabel}>GRN number</Text>
              <TextInput
                style={[styles.textInput, grnFocused && styles.textInputFocused]}
                placeholder="Enter GRN number"
                placeholderTextColor={t.text.placeholder}
                value={filters.grnNo}
                onChangeText={(text) => setFilters({ ...filters, grnNo: text })}
                onFocus={() => setGrnFocused(true)}
                onBlur={() => setGrnFocused(false)}
                accessibilityLabel="GRN number"
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Active Search Filters */}
          {filters.selectedItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">Search filters</Text>
              <View style={[styles.sectionBody, styles.sectionBodyPadded]}>
                <Text style={styles.helpText}>
                  These filters come from your search selections.
                </Text>
                {filters.selectedItems.map((item) => (
                  <View key={`${item.type}-${item.id}`} style={styles.activeFilter}>
                    <Icon
                      name={item.type === 'dispatch' ? 'truck-delivery-outline' : item.type === 'customer' ? 'account-outline' : 'cube-outline'}
                      size={iconSize.sm}
                      color={t.brand.tint}
                    />
                    <Text style={styles.activeFilterText} maxFontSizeMultiplier={1.6}>
                      {item.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Apply Button */}
        <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>
          <Pressable
            style={({ pressed }) => [styles.applyButton, pressed && styles.applyButtonPressed]}
            onPress={handleApply}
            accessibilityLabel={
              activeFilterCount > 0
                ? `Show results, ${activeFilterCount} ${activeFilterCount === 1 ? 'filter' : 'filters'} set`
                : 'Show results'
            }
            accessibilityRole="button"
          >
            <Text style={styles.applyButtonText}>
              {activeFilterCount > 0 ? `Show results (${activeFilterCount})` : 'Show results'}
            </Text>
          </Pressable>
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

export default DispatchFilterOverlay;
