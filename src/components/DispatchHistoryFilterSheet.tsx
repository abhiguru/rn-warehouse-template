import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors } from '@/hooks/useListColors';

export interface FilterValues {
  itemName: string;
  grNo: string;
  dispNo: string;
  dateFrom: Date | null;
  dateTo: Date | null;
}

interface DispatchHistoryFilterSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onApply: (filters: FilterValues) => void;
  currentFilters: FilterValues;
}

const DispatchHistoryFilterSheet: React.FC<DispatchHistoryFilterSheetProps> = ({
  isVisible,
  onClose,
  onApply,
  currentFilters,
}) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['60%', '90%'], []);

  const [localFilters, setLocalFilters] = useState<FilterValues>(currentFilters);
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);

  // Theme colors for dark mode support
  const colors = useListColors();

  // Update local filters when prop changes
  useEffect(() => {
    setLocalFilters(currentFilters);
  }, [currentFilters]);

  // Handle bottom sheet visibility
  useEffect(() => {
    if (isVisible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [isVisible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleReset = () => {
    setLocalFilters({
      itemName: '',
      grNo: '',
      dispNo: '',
      dateFrom: null,
      dateTo: null,
    });
  };

  const formatDateDisplay = (date: Date | null) => {
    if (!date) return 'Select date';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (localFilters.itemName) count++;
    if (localFilters.grNo) count++;
    if (localFilters.dispNo) count++;
    if (localFilters.dateFrom) count++;
    if (localFilters.dateTo) count++;
    return count;
  }, [localFilters]);

  return (
    <>
      <BottomSheetModal
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        onDismiss={onClose}
        enablePanDownToClose
        handleIndicatorStyle={{ backgroundColor: colors.gray300, width: 40 }}
        backgroundStyle={{ backgroundColor: colors.cellBackground, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      >
        <BottomSheetView style={[styles.container, { backgroundColor: colors.cellBackground }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.gray100 }]}>
            <View style={styles.headerLeft}>
              <Icon name="magnify" size={24} color={colors.textSecondary} />
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Filter Dispatches</Text>
              {activeFilterCount > 0 && (
                <View style={[styles.filterBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={handleReset} style={styles.resetButton}>
              <Text style={[styles.resetButtonText, { color: colors.primary }]}>Reset</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Item Name Search */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Item Name</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.gray50, borderColor: colors.gray200 }]}>
                <Icon name="magnify" size={20} color={colors.gray400} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  placeholder="Search by item name..."
                  value={localFilters.itemName}
                  onChangeText={(text) =>
                    setLocalFilters((prev) => ({ ...prev, itemName: text }))
                  }
                  placeholderTextColor={colors.gray500}
                  returnKeyType="search"
                />
                {localFilters.itemName && (
                  <TouchableOpacity
                    onPress={() => setLocalFilters((prev) => ({ ...prev, itemName: '' }))}
                    style={styles.clearButton}
                    accessibilityLabel="Clear item name filter"
                  >
                    <Icon name="close" size={16} color={colors.gray500} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* GRN Number */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>GRN Number</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.gray50, borderColor: colors.gray200 }]}>
                <Icon name="clipboard-list" size={20} color={colors.gray400} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  placeholder="Search by GRN number..."
                  value={localFilters.grNo}
                  onChangeText={(text) =>
                    setLocalFilters((prev) => ({ ...prev, grNo: text }))
                  }
                  placeholderTextColor={colors.gray500}
                  returnKeyType="search"
                />
                {localFilters.grNo && (
                  <TouchableOpacity
                    onPress={() => setLocalFilters((prev) => ({ ...prev, grNo: '' }))}
                    style={styles.clearButton}
                    accessibilityLabel="Clear GRN number filter"
                  >
                    <Icon name="close" size={16} color={colors.gray500} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Dispatch Number */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Dispatch Number</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.gray50, borderColor: colors.gray200 }]}>
                <Icon name="package-variant" size={20} color={colors.gray400} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  placeholder="Search by dispatch number..."
                  value={localFilters.dispNo}
                  onChangeText={(text) =>
                    setLocalFilters((prev) => ({ ...prev, dispNo: text }))
                  }
                  placeholderTextColor={colors.gray500}
                  returnKeyType="search"
                />
                {localFilters.dispNo && (
                  <TouchableOpacity
                    onPress={() => setLocalFilters((prev) => ({ ...prev, dispNo: '' }))}
                    style={styles.clearButton}
                    accessibilityLabel="Clear dispatch number filter"
                  >
                    <Icon name="close" size={16} color={colors.gray500} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Date Range */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Date Range</Text>
              <View style={styles.dateRange}>
                {/* From Date */}
                <TouchableOpacity
                  style={[styles.dateButton, { backgroundColor: colors.gray50, borderColor: colors.gray200 }]}
                  onPress={() => setShowDateFromPicker(true)}
                  accessibilityLabel="Select start date"
                >
                  <Icon name="calendar" size={20} color={colors.gray500} style={styles.dateIcon} />
                  <View style={styles.dateContent}>
                    <Text style={[styles.dateLabel, { color: colors.gray600 }]}>From</Text>
                    <Text style={[styles.dateValue, { color: colors.textPrimary }]}>
                      {formatDateDisplay(localFilters.dateFrom)}
                    </Text>
                  </View>
                  {localFilters.dateFrom && (
                    <TouchableOpacity
                      onPress={() => setLocalFilters((prev) => ({ ...prev, dateFrom: null }))}
                      style={styles.clearButton}
                      accessibilityLabel="Clear start date"
                    >
                      <Icon name="close" size={16} color={colors.gray500} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

                {/* To Date */}
                <TouchableOpacity
                  style={[styles.dateButton, { backgroundColor: colors.gray50, borderColor: colors.gray200 }]}
                  onPress={() => setShowDateToPicker(true)}
                  accessibilityLabel="Select end date"
                >
                  <Icon name="calendar" size={20} color={colors.gray500} style={styles.dateIcon} />
                  <View style={styles.dateContent}>
                    <Text style={[styles.dateLabel, { color: colors.gray600 }]}>To</Text>
                    <Text style={[styles.dateValue, { color: colors.textPrimary }]}>
                      {formatDateDisplay(localFilters.dateTo)}
                    </Text>
                  </View>
                  {localFilters.dateTo && (
                    <TouchableOpacity
                      onPress={() => setLocalFilters((prev) => ({ ...prev, dateTo: null }))}
                      style={styles.clearButton}
                      accessibilityLabel="Clear end date"
                    >
                      <Icon name="close" size={16} color={colors.gray500} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderTopColor: colors.gray100 }]}>
            <TouchableOpacity style={[styles.cancelButton, { backgroundColor: colors.gray100 }]} onPress={onClose}>
              <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.applyButton, { backgroundColor: colors.primary }]} onPress={handleApply}>
              <Text style={styles.applyButtonText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetView>
      </BottomSheetModal>

      {/* Date Pickers */}
      {showDateFromPicker && (
        <DateTimePicker
          value={localFilters.dateFrom || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selectedDate) => {
            setShowDateFromPicker(false);
            if (selectedDate) {
              setLocalFilters((prev) => ({ ...prev, dateFrom: selectedDate }));
            }
          }}
        />
      )}

      {showDateToPicker && (
        <DateTimePicker
          value={localFilters.dateTo || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selectedDate) => {
            setShowDateToPicker(false);
            if (selectedDate) {
              setLocalFilters((prev) => ({ ...prev, dateTo: selectedDate }));
            }
          }}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  filterBadge: {
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  filterBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  resetButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 20,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  inputIcon: {
    marginRight: 4,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
  },
  clearButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateRange: {
    gap: 12,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  dateIcon: {
    marginRight: 4,
  },
  dateContent: {
    flex: 1,
    gap: 4,
  },
  dateLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  applyButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default DispatchHistoryFilterSheet;
