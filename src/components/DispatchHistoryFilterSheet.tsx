import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  ScrollView,
  BackHandler,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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

const formatDateDisplay = (date: Date | null) => {
  if (!date) return 'Choose date';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const makeStyles = (t: ThemeTokens) => ({
  sheetBackground: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...t.shadow[4],
  },
  handleIndicator: {
    backgroundColor: t.border.separator,
    width: 36,
    height: 4,
  },
  container: {
    flex: 1,
    backgroundColor: t.surface.sheet,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingLeft: layout.marginCompact,
    paddingRight: space.xs,
    minHeight: touchTarget + space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  headerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  headerTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  filterBadge: {
    borderRadius: radius.pill,
    minWidth: 18,
    minHeight: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: space.s6,
    backgroundColor: t.brand.fill,
  },
  filterBadgeText: {
    ...typography.caption2,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  resetButton: {
    paddingHorizontal: space.md,
    minHeight: touchTarget,
    justifyContent: 'center' as const,
    borderRadius: radius.button,
  },
  resetButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  resetButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: layout.marginCompact,
    gap: space.lg,
  },
  section: {
    gap: space.xs,
  },
  sectionLabel: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  inputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    backgroundColor: t.surface.field,
    paddingLeft: space.md,
    minHeight: layout.rowMinHeight,
    gap: space.sm,
  },
  inputContainerFocused: {
    borderWidth: 2,
    borderColor: t.border.fieldFocus,
    paddingLeft: space.md - 1,
  },
  input: {
    ...typography.body,
    flex: 1,
    paddingVertical: space.sm,
    color: t.text.primary,
  },
  clearButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  dateRange: {
    gap: space.md,
  },
  dateButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    backgroundColor: t.surface.field,
    paddingLeft: space.md,
    minHeight: touchTarget + space.md,
    gap: space.sm,
  },
  dateButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  dateContent: {
    flex: 1,
    paddingVertical: space.sm,
  },
  dateLabel: {
    ...typography.caption1,
    color: t.text.secondary,
  },
  dateValue: {
    ...typography.body,
    color: t.text.primary,
  },
  datePlaceholder: {
    color: t.text.placeholder,
  },
  footer: {
    flexDirection: 'row' as const,
    gap: space.sm,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.separator,
    backgroundColor: t.surface.sheet,
  },
  cancelButton: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  cancelButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  cancelButtonText: {
    ...typography.callout,
    color: t.text.primary,
  },
  applyButton: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radius.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.brand.fill,
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

type Styles = ReturnType<typeof makeStyles>;

/** Labelled search field with a clear button (guide §13.2). */
function FilterField({
  label,
  icon,
  value,
  placeholder,
  onChange,
  styles,
  t,
}: {
  label: string;
  icon: string;
  value: string;
  placeholder: string;
  onChange: (text: string) => void;
  styles: Styles;
  t: ThemeTokens;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={[styles.inputContainer, focused && styles.inputContainerFocused]}>
        <Icon name={icon} size={iconSize.md} color={t.icon.secondary} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={t.text.placeholder}
          returnKeyType="search"
          accessibilityLabel={label}
        />
        {!!value && (
          <Pressable
            onPress={() => onChange('')}
            style={styles.clearButton}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label.toLowerCase()}`}
          >
            <Icon name="close" size={iconSize.sm} color={t.icon.secondary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const DispatchHistoryFilterSheet: React.FC<DispatchHistoryFilterSheetProps> = ({
  isVisible,
  onClose,
  onApply,
  currentFilters,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['60%', '90%'], []);

  const [localFilters, setLocalFilters] = useState<FilterValues>(currentFilters);
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);

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

  // Android back closes the sheet first
  useEffect(() => {
    if (!isVisible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [isVisible, onClose]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={1}
        style={[props.style, { backgroundColor: t.overlay.scrim }]}
      />
    ),
    [t]
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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (localFilters.itemName) count++;
    if (localFilters.grNo) count++;
    if (localFilters.dispNo) count++;
    if (localFilters.dateFrom) count++;
    if (localFilters.dateTo) count++;
    return count;
  }, [localFilters]);

  const renderDateButton = (
    label: string,
    value: Date | null,
    onOpen: () => void,
    onClear: () => void
  ) => (
    <Pressable
      style={({ pressed }) => [styles.dateButton, pressed && styles.dateButtonPressed]}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${label} date, ${formatDateDisplay(value)}`}
    >
      <Icon name="calendar-outline" size={iconSize.md} color={t.icon.secondary} />
      <View style={styles.dateContent}>
        <Text style={styles.dateLabel}>{label}</Text>
        <Text style={[styles.dateValue, !value && styles.datePlaceholder]}>
          {formatDateDisplay(value)}
        </Text>
      </View>
      {value && (
        <Pressable
          onPress={onClear}
          style={styles.clearButton}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${label.toLowerCase()} date`}
        >
          <Icon name="close" size={iconSize.sm} color={t.icon.secondary} />
        </Pressable>
      )}
    </Pressable>
  );

  return (
    <>
      <BottomSheetModal
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        onDismiss={onClose}
        enablePanDownToClose
        handleIndicatorStyle={styles.handleIndicator}
        backgroundStyle={styles.sheetBackground}
      >
        <BottomSheetView style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle} accessibilityRole="header">
                Filter dispatches
              </Text>
              {activeFilterCount > 0 && (
                <View
                  style={styles.filterBadge}
                  accessible
                  accessibilityLabel={`${activeFilterCount} ${activeFilterCount === 1 ? 'filter' : 'filters'} set`}
                >
                  <Text style={styles.filterBadgeText} maxFontSizeMultiplier={1.6}>
                    {activeFilterCount}
                  </Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={handleReset}
              style={({ pressed }) => [styles.resetButton, pressed && styles.resetButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Reset filters"
            >
              <Text style={styles.resetButtonText}>Reset</Text>
            </Pressable>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <FilterField
              label="Item name"
              icon="magnify"
              value={localFilters.itemName}
              placeholder="Search by item name"
              onChange={(text) => setLocalFilters((prev) => ({ ...prev, itemName: text }))}
              styles={styles}
              t={t}
            />
            <FilterField
              label="GRN number"
              icon="package-down"
              value={localFilters.grNo}
              placeholder="Search by GRN number"
              onChange={(text) => setLocalFilters((prev) => ({ ...prev, grNo: text }))}
              styles={styles}
              t={t}
            />
            <FilterField
              label="Dispatch number"
              icon="truck-delivery-outline"
              value={localFilters.dispNo}
              placeholder="Search by dispatch number"
              onChange={(text) => setLocalFilters((prev) => ({ ...prev, dispNo: text }))}
              styles={styles}
              t={t}
            />

            {/* Date Range */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Date range</Text>
              <View style={styles.dateRange}>
                {renderDateButton(
                  'From',
                  localFilters.dateFrom,
                  () => setShowDateFromPicker(true),
                  () => setLocalFilters((prev) => ({ ...prev, dateFrom: null }))
                )}
                {renderDateButton(
                  'To',
                  localFilters.dateTo,
                  () => setShowDateToPicker(true),
                  () => setLocalFilters((prev) => ({ ...prev, dateTo: null }))
                )}
              </View>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>
            <Pressable
              style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.applyButton, pressed && styles.applyButtonPressed]}
              onPress={handleApply}
              accessibilityRole="button"
              accessibilityLabel="Show results"
            >
              <Text style={styles.applyButtonText}>Show results</Text>
            </Pressable>
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

export default DispatchHistoryFilterSheet;
