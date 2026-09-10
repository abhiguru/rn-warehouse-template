/**
 * Generic Filter Modal Component
 *
 * Main filter modal component that renders configured filter fields,
 * manages state with Redux persistence, and handles auto-apply with debouncing.
 * Fully integrated autocomplete functionality - zero boilerplate required.
 *
 * SAP Fiori Design System - Modal/Dialog Component
 * @see design/sap-fiori-specs/10-modal-dialog.md
 */

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Vibration,
  Pressable,
  Platform,
  Text,
  useColorScheme,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import Icon from 'react-native-vector-icons/Ionicons';
import { colors, darkColors } from '@/theme';
import { createLogger } from '@/utils/logger';
import type {
  GenericFilterModalProps,
  FilterFieldConfig,
  AutocompleteSelection,
  FilterValues,
  FilterValueType,
  AutocompleteFieldConfig,
} from '@/types/filter.types';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectFilterValues,
  setFilterValues,
  clearFilter as clearFilterAction,
} from '@/store/slices/filterSlice';
import { calculateActiveFilterCount } from '@/utils/filterHelpers';

// =============================================================================
// FIORI DESIGN CONSTANTS
// =============================================================================
const FIORI = {
  // Modal dimensions (from 10-modal-dialog.md)
  modal: {
    cornerRadius: 16,
    handleWidth: 36,
    handleHeight: 5,
    handleColor: '#C6C6C8', // Fiori handle color
    handleMarginTop: 8,
    handleMarginBottom: 8,
  },
  // Header (from 10-modal-dialog.md)
  header: {
    height: 56,
    paddingHorizontal: 16,
  },
  // Typography
  typography: {
    title: {
      fontSize: 17,
      fontWeight: '600' as const,
      lineHeight: 22,
    },
    subtitle: {
      fontSize: 13,
      fontWeight: '400' as const,
      lineHeight: 18,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '600' as const,
      lineHeight: 20,
    },
    body: {
      fontSize: 15,
      fontWeight: '400' as const,
      lineHeight: 20,
    },
    button: {
      fontSize: 17,
      fontWeight: '600' as const,
    },
    buttonSecondary: {
      fontSize: 17,
      fontWeight: '400' as const,
    },
  },
  // Buttons (from 08-button.md)
  button: {
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  // Chips (from 09-chip.md)
  chip: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
  },
  // Touch targets
  touchTarget: {
    minHeight: 44,
    minWidth: 44,
  },
  // Spacing scale
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  // Backdrop opacity (from 10-modal-dialog.md)
  backdrop: {
    opacity: 0.4,
  },
} as const;

// Field components
import { TextFilterField } from './fields/TextFilterField';
import { NumberRangeFilterField } from './fields/NumberRangeFilterField';
import { DateRangeFilterField } from './fields/DateRangeFilterField';
import { RadioFilterField } from './fields/RadioFilterField';
import { AutocompleteFilterField } from './fields/AutocompleteFilterField';
import { AutocompleteBottomSheet } from './AutocompleteBottomSheet';

// =============================================================================
// ICON MAPPING (MaterialCommunityIcons → Ionicons)
// Filter configs use MaterialCommunityIcons names, but this modal uses Ionicons
// =============================================================================
const ICON_MAP: Record<string, string> = {
  'file-document': 'document-text-outline',
  'file-document-outline': 'document-text-outline',
  'package-variant': 'cube-outline',
  'package-variant-closed': 'cube-outline',
  'account': 'person-outline',
  'account-group-outline': 'people-outline',
  'chart-bar': 'bar-chart-outline',
  'weight-kilogram': 'scale-outline',
  'tag': 'pricetag-outline',
  'calendar-range': 'calendar-outline',
  'cash-multiple': 'cash-outline',
  'currency-inr': 'cash-outline',
  'magnify': 'search-outline',
  'close': 'close',
  'close-circle': 'close-circle',
};

/**
 * Map MaterialCommunityIcons name to Ionicons name
 */
const mapIcon = (iconName?: string): string => {
  if (!iconName) return 'document-text-outline';
  return ICON_MAP[iconName] || iconName;
};

export const GenericFilterModal: React.FC<GenericFilterModalProps> = ({
  visible,
  onClose,
  config,
  onFilterChange,
}) => {
  const logger = createLogger('GenericFilterModal');
  logger.debug(`[INIT] Modal rendering - visible=${visible}, config.title=${config.title}`);

  const dispatch = useAppDispatch();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['100%'], []);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

  // Get filter values from Redux (applied filters)
  const filterValues = useAppSelector(state =>
    selectFilterValues(state, config.persistKey)
  );

  // Local state for pending changes (not yet applied)
  const [localFilters, setLocalFilters] = useState<FilterValues>({});
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  // Track previous visible state to detect opening
  const prevVisibleRef = useRef(false);

  // Initialize local state from Redux when modal opens
  useEffect(() => {
    logger.debug(`[VISIBILITY_CHANGE] visible=${visible}, prevVisible=${prevVisibleRef.current}`);

    // Detect when modal is opening (visible changes from false to true)
    if (visible && !prevVisibleRef.current) {
      logger.info(`[MODAL_OPENING] Filter modal is now visible`);
      // Always reset to current Redux state when opening
      setLocalFilters({ ...filterValues });
      setHasPendingChanges(false);
    } else if (!visible && prevVisibleRef.current) {
      logger.info(`[MODAL_CLOSING] Filter modal is now hidden`);
    }
    prevVisibleRef.current = visible;
  }, [visible, filterValues]);

  // Helper function to update local filters (not Redux yet)
  const updateLocalFilter = useCallback((field: string, value: FilterValueType) => {
    // Haptic feedback for filter changes
    Vibration.vibrate(5);

    // Serialize Date objects to ISO strings
    let serializedValue = value;
    if (value instanceof Date) {
      serializedValue = value.toISOString();
    }

    setLocalFilters(prev => {
      const updated = { ...prev, [field]: serializedValue };

      // Auto-fill logic for range fields
      // When user selects a "From" value, auto-fill the "To" field with same value if empty
      const valueLength = typeof serializedValue === 'string' ? serializedValue.length :
                          Array.isArray(serializedValue) ? serializedValue.length : 0;

      // GRN Number Range: grNoFrom -> grNoTo
      if (field === 'grNoFrom' && serializedValue && valueLength > 0) {
        const toLength = typeof updated.grNoTo === 'string' ? updated.grNoTo.length :
                         Array.isArray(updated.grNoTo) ? updated.grNoTo.length : 0;
        if (!updated.grNoTo || toLength === 0) {
          updated.grNoTo = serializedValue;
        }
      }

      // Dispatch Number Range: dispNoFrom -> dispNoTo
      if (field === 'dispNoFrom' && serializedValue && valueLength > 0) {
        const toLength = typeof updated.dispNoTo === 'string' ? updated.dispNoTo.length :
                         Array.isArray(updated.dispNoTo) ? updated.dispNoTo.length : 0;
        if (!updated.dispNoTo || toLength === 0) {
          updated.dispNoTo = serializedValue;
        }
      }

      return updated;
    });
    setHasPendingChanges(true);
  }, []);

  // Apply filters: commit local changes to Redux and close modal
  const handleApply = useCallback(() => {
    logger.info(`[APPLY_FILTERS] Applying ${Object.keys(localFilters).length} filters`);
    Vibration.vibrate(10);
    dispatch(setFilterValues({
      key: config.persistKey,
      values: localFilters,
    }));
    setHasPendingChanges(false);
    // Close modal immediately
    logger.debug(`[APPLY_FILTERS] Calling onClose`);
    onClose();
  }, [dispatch, config.persistKey, localFilters, onClose]);

  // Close modal: discard local changes, revert to Redux state
  const handleClose = useCallback(() => {
    logger.info(`[CLOSE_MODAL] Closing modal without applying changes`);
    Vibration.vibrate(5);
    setLocalFilters(filterValues);
    setHasPendingChanges(false);
    logger.debug(`[CLOSE_MODAL] Calling bottomSheetRef.close()`);
    bottomSheetRef.current?.close();
  }, [filterValues]);

  // Reset filters: clear both Redux and local state
  const handleReset = useCallback(() => {
    logger.info(`[RESET_FILTERS] Resetting all filters`);
    Vibration.vibrate(10);
    dispatch(clearFilterAction({ key: config.persistKey }));
    setLocalFilters({});
    setHasPendingChanges(false);
  }, [dispatch, config.persistKey]);

  // Calculate pending filter count
  const pendingFilterCount = useMemo(() => {
    return calculateActiveFilterCount(localFilters);
  }, [localFilters]);

  // Autocomplete sheet state
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);
  const [activeAutocompleteField, setActiveAutocompleteField] =
    useState<AutocompleteFieldConfig | null>(null);

  // Collapsible sections state - expand first section by default
  const [expandedSections, setExpandedSections] = useState<Set<string | number>>(() => new Set([0]));

  // Convert each field/field-pair into its own collapsible section
  const groupedFields = useMemo(() => {
    const sections: Array<{ key: string; title: string; fields: FilterFieldConfig[] }> = [];
    const processedKeys = new Set<string>();

    config.fields.forEach((field, index) => {
      const fieldKey = field.key.toString();

      // Skip if already processed (for range pairs)
      if (processedKeys.has(fieldKey)) return;

      // Check if this is a "From" field that pairs with a "To" field
      if (field.type === 'autocomplete' && fieldKey.includes('From')) {
        const baseKey = fieldKey.replace('From', '');
        const toKey = baseKey + 'To';
        const toField = config.fields.find(f => f.key.toString() === toKey);

        if (toField) {
          // Create a range section with both From and To
          sections.push({
            key: `section-${index}`,
            title: field.label.replace(' From', ' Range'), // "GRN Number From" -> "GRN Number Range"
            fields: [field, toField],
          });
          processedKeys.add(fieldKey);
          processedKeys.add(toKey);
          return;
        }
      }

      // For all other fields, create individual sections
      sections.push({
        key: `section-${index}`,
        title: field.label,
        fields: [field],
      });
      processedKeys.add(fieldKey);
    });

    // Sort sections: non-collapsible first, collapsible at bottom
    // Note: Autocomplete range pairs (like GRN Number From/To) are non-collapsible
    const sortedSections = sections.sort((a, b) => {
      const aFirstFieldType = a.fields[0]?.type;
      // Autocomplete range pairs are NOT collapsible (they show side by side)
      const aIsAutocompleteRange = a.fields.length > 1 && aFirstFieldType === 'autocomplete';
      const aIsCollapsible =
        !aIsAutocompleteRange &&
        (a.fields.length > 1 ||
        aFirstFieldType === 'radio' ||
        aFirstFieldType === 'number-range' ||
        aFirstFieldType === 'date-range');

      const bFirstFieldType = b.fields[0]?.type;
      const bIsAutocompleteRange = b.fields.length > 1 && bFirstFieldType === 'autocomplete';
      const bIsCollapsible =
        !bIsAutocompleteRange &&
        (b.fields.length > 1 ||
        bFirstFieldType === 'radio' ||
        bFirstFieldType === 'number-range' ||
        bFirstFieldType === 'date-range');

      // Non-collapsible (false) comes before collapsible (true)
      if (aIsCollapsible === bIsCollapsible) return 0;
      return aIsCollapsible ? 1 : -1;
    });

    return sortedSections;
  }, [config.fields]);

  const toggleSection = (sectionKey: string | number) => {
    setExpandedSections(prev => {
      const next = new Set<string | number>(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  // Handle bottom sheet visibility - sheet starts expanded (index=0) when rendered
  // No need to call expand() since we use index={0}
  // Close is handled by handleSheetChanges when user drags down

  /**
   * Handle autocomplete field press
   */
  const handleAutocompletePress = (field: AutocompleteFieldConfig) => {
    logger.debug(`[AUTOCOMPLETE_PRESS] Opening autocomplete for field: ${field.key}`);
    setActiveAutocompleteField(field);
    setAutocompleteVisible(true);
  };

  /**
   * Handle autocomplete selection
   */
  const handleAutocompleteSelect = (selections: AutocompleteSelection[]) => {
    if (activeAutocompleteField) {
      // For single-select mode, ensure we only keep the last selected item
      // This is a defensive measure to prevent appending when replacing is expected
      const finalSelections = activeAutocompleteField.multiSelect
        ? selections
        : selections.slice(-1); // Only take the last item for single-select

      updateLocalFilter(activeAutocompleteField.key, finalSelections);
    }
    setAutocompleteVisible(false);
    setActiveAutocompleteField(null);
  };

  /**
   * Handle autocomplete sheet close
   */
  const handleAutocompleteClose = () => {
    setAutocompleteVisible(false);
    setActiveAutocompleteField(null);
  };

  /**
   * Handle remove autocomplete selection
   */
  const handleRemoveSelection = (fieldKey: string, selectionId: string) => {
    const currentValue = localFilters[fieldKey];
    // Defensive: ensure we're working with an array
    const currentSelections = Array.isArray(currentValue) ? currentValue : [];
    const newSelections = currentSelections.filter((s) => s.id !== selectionId);
    updateLocalFilter(fieldKey, newSelections);
  };

  /**
   * Render a single filter field
   * @param field - The field configuration
   * @param inlineChips - Whether to show chips inline (for range pairs)
   */
  const renderField = (field: FilterFieldConfig, inlineChips: boolean = false) => {
    switch (field.type) {
      case 'text':
        return (
          <TextFilterField
            key={field.key as string}
            label={field.label}
            icon={field.icon}
            placeholder={field.placeholder}
            value={localFilters[field.key as string] || ''}
            onChangeText={(text) => updateLocalFilter(field.key as string, text)}
          />
        );

      case 'number-range': {
        const [minKey, maxKey] = field.key as [string, string];
        return (
          <NumberRangeFilterField
            key={`${minKey}-${maxKey}`}
            label={field.label}
            icon={field.icon}
            placeholder={field.placeholder}
            minValue={field.minValue}
            maxValue={field.maxValue}
            value={[localFilters[minKey], localFilters[maxKey]]}
            onChange={(min, max) => {
              updateLocalFilter(minKey, min);
              updateLocalFilter(maxKey, max);
            }}
          />
        );
      }

      case 'date-range': {
        const [fromKey, toKey] = field.key as [string, string];
        return (
          <DateRangeFilterField
            key={`${fromKey}-${toKey}`}
            label={field.label}
            icon={field.icon}
            placeholder={field.placeholder}
            value={[localFilters[fromKey], localFilters[toKey]]}
            onChange={(from, to) => {
              updateLocalFilter(fromKey, from);
              updateLocalFilter(toKey, to);
            }}
          />
        );
      }

      case 'radio':
        return (
          <RadioFilterField
            key={field.key as string}
            label={field.label}
            icon={field.icon}
            options={field.options}
            value={localFilters[field.key as string] || field.defaultValue || field.options[0]?.value || ''}
            onChange={(value) => updateLocalFilter(field.key as string, value)}
          />
        );

      case 'autocomplete': {
        // Defensive: ensure value is an array (handle legacy text field values)
        const autocompleteValue = localFilters[field.key as string];
        const normalizedValue = Array.isArray(autocompleteValue) ? autocompleteValue : [];

        return (
          <AutocompleteFilterField
            key={field.key as string}
            label={field.label}
            icon={field.icon}
            placeholder={field.placeholder}
            autocompleteType={field.autocompleteType}
            value={normalizedValue}
            onPress={() => handleAutocompletePress(field)}
            onRemoveSelection={
              field.renderAsChips
                ? (id) => handleRemoveSelection(field.key as string, id)
                : undefined
            }
            inlineChips={inlineChips}
          />
        );
      }

      default:
        return null;
    }
  };

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => {
      logger.debug(`[BACKDROP_RENDER] Rendering backdrop with opacity=${FIORI.backdrop.opacity}`);
      return (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={FIORI.backdrop.opacity}
        />
      );
    },
    [logger]
  );

  const handleSheetChanges = useCallback(
    (index: number) => {
      logger.debug(`[SHEET_CHANGE] Bottom sheet index changed to ${index}`);
      if (index === -1) {
        logger.info(`[SHEET_CHANGE] Bottom sheet closed (index=-1), calling onClose`);
        onClose();
      } else if (index === 0) {
        logger.info(`[SHEET_CHANGE] Bottom sheet expanded (index=0)`);
      }
    },
    [onClose, logger]
  );

  // Don't render anything when not visible - fixes Android touch blocking issue
  // GestureHandlerRootView with pointerEvents: 'none' still captures touches on Android
  if (!visible) {
    logger.debug(`[RENDER] Modal not visible, returning null`);
    return null;
  }

  logger.debug(`[RENDER] Rendering modal`);
  logger.debug(`[RENDER] snapPoints=${JSON.stringify(snapPoints)}, initial index=-1`);

  // GestureHandlerRootView is required because Portal renders outside root layout's gesture handler
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <BottomSheet
        ref={(ref) => {
          bottomSheetRef.current = ref;
          logger.debug(`[BOTTOMSHEET_MOUNT] BottomSheet ref set: ${!!ref}`);
        }}
        index={0}
        snapPoints={snapPoints}
        topInset={0}
        enableDynamicSizing={false}
        onChange={handleSheetChanges}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        handleStyle={[styles.handle, { backgroundColor: themeColors.white }]}
        backgroundStyle={[styles.background, { backgroundColor: themeColors.white }]}
        style={styles.bottomSheet}
        keyboardBehavior="fillParent"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        {/* Fiori Header - Title centered, Cancel/Apply on sides */}
        <View style={[styles.header, { backgroundColor: themeColors.white }]}>
          {/* Cancel Button (left) - Fiori Tertiary Normal */}
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.headerButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            accessibilityHint="Discard changes and close filter"
          >
            <Text style={[styles.cancelButtonText, { color: themeColors.fiori.text.primary }]}>
              Cancel
            </Text>
          </Pressable>

          {/* Title (center) */}
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, { color: themeColors.fiori.text.primary }]}>
              {config.title || 'Filter'}
            </Text>
            {pendingFilterCount > 0 && (
              <Text style={[styles.headerSubtitle, { color: themeColors.fiori.text.secondary }]}>
                {pendingFilterCount} selected
              </Text>
            )}
          </View>

          {/* Apply Button (right) - Fiori Tertiary Tint */}
          <Pressable
            onPress={handleApply}
            disabled={!hasPendingChanges}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.headerButtonPressed,
              !hasPendingChanges && styles.headerButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Apply ${pendingFilterCount} filter${pendingFilterCount !== 1 ? 's' : ''}`}
          >
            <Text
              style={[
                styles.applyButtonText,
                { color: themeColors.primary },
                !hasPendingChanges && { color: themeColors.gray[400] },
              ]}
            >
              Apply
            </Text>
          </Pressable>
        </View>

        {/* Divider */}
        <View style={[styles.headerDivider, { backgroundColor: themeColors.gray[200] }]} />

        {/* Filter Fields with Collapsible Sections */}
        <BottomSheetScrollView
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
          keyboardDismissMode="interactive"
        >
          {groupedFields.map((section, sectionIndex) => {
            // Check if section should be collapsible:
            // - Has radio buttons (even if single field, radio has multiple options)
            // - Has number-range or date-range fields (these are complex range inputs)
            // - Autocomplete range pairs (like GRN Number From/To) are NOT collapsible
            const firstFieldType = section.fields[0]?.type;
            const isAutocompleteRange = section.fields.length > 1 && firstFieldType === 'autocomplete';
            const isCollapsible =
              !isAutocompleteRange &&
              (section.fields.length > 1 ||
              firstFieldType === 'radio' ||
              firstFieldType === 'number-range' ||
              firstFieldType === 'date-range');
            const isExpanded = expandedSections.has(sectionIndex);

            return (
              <View key={section.key} style={styles.sectionContainer}>
                {isCollapsible ? (
                  <>
                    {/* Collapsible Section Header */}
                    <Pressable
                      onPress={() => toggleSection(sectionIndex)}
                      style={({ pressed }) => [
                        styles.sectionHeader,
                        { backgroundColor: themeColors.gray[50] },
                        pressed && { backgroundColor: themeColors.gray[100] },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${section.title}`}
                    >
                      <Text style={[styles.sectionTitle, { color: themeColors.fiori.text.primary }]}>
                        {section.title}
                      </Text>
                      <Icon
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={themeColors.gray[600]}
                      />
                    </Pressable>

                    {/* Collapsible Content */}
                    {isExpanded && (
                      <View style={styles.sectionContent}>
                        {/* For range pairs (2 fields), show them side by side */}
                        {section.fields.length === 2 ? (
                          <View style={styles.rangeFieldsRow}>
                            {section.fields.map((field, fieldIndex) => (
                              <View key={fieldIndex} style={styles.rangeFieldHalf}>
                                {renderField(field, true)}
                              </View>
                            ))}
                          </View>
                        ) : (
                          /* For single fields or radio groups, stack vertically */
                          section.fields.map((field, fieldIndex) => (
                            <View key={fieldIndex} style={styles.fieldWrapper}>
                              {renderField(field, false)}
                            </View>
                          ))
                        )}
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    {/* Non-collapsible Section */}
                    {isAutocompleteRange ? (
                      /* Autocomplete Range Pair - show with title and side by side fields */
                      <View style={styles.rangeFilterContainer}>
                        <View style={styles.rangeFilterHeader}>
                          <Icon
                            name={mapIcon(section.fields[0].icon)}
                            size={20}
                            color={themeColors.primary}
                          />
                          <Text style={[styles.rangeFilterTitle, { color: themeColors.fiori.text.primary }]}>
                            {section.title}
                          </Text>
                        </View>
                        <View style={styles.rangeFieldsRow}>
                          {section.fields.map((field, fieldIndex) => (
                            <View key={fieldIndex} style={styles.rangeFieldHalf}>
                              {renderField(field, true)}
                            </View>
                          ))}
                        </View>
                        {/* Show selected items as chips for the range */}
                        {(Array.isArray(localFilters[section.fields[0].key as string]) &&
                          localFilters[section.fields[0].key as string].length > 0) && (
                            <View style={styles.quickFilterChips}>
                              {localFilters[section.fields[0].key as string].map((item: AutocompleteSelection) => (
                                <View
                                  key={`from-${item.id}`}
                                  style={[styles.filterChip, { backgroundColor: themeColors.primary }]}
                                >
                                  <Text style={[styles.filterChipText, { color: themeColors.fiori.text.inverse }]} numberOfLines={1}>
                                    From: {item.label}
                                  </Text>
                                  <Pressable
                                    onPress={() => handleRemoveSelection(section.fields[0].key as string, item.id)}
                                    style={styles.filterChipRemove}
                                    hitSlop={8}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove ${item.label}`}
                                  >
                                    <Icon name="close" size={14} color={themeColors.fiori.text.inverse} />
                                  </Pressable>
                                </View>
                              ))}
                              {Array.isArray(localFilters[section.fields[1]?.key as string]) &&
                                localFilters[section.fields[1].key as string].map((item: AutocompleteSelection) => (
                                  <View
                                    key={`to-${item.id}`}
                                    style={[styles.filterChip, { backgroundColor: themeColors.primary }]}
                                  >
                                    <Text style={[styles.filterChipText, { color: themeColors.fiori.text.inverse }]} numberOfLines={1}>
                                      To: {item.label}
                                    </Text>
                                    <Pressable
                                      onPress={() => handleRemoveSelection(section.fields[1].key as string, item.id)}
                                      style={styles.filterChipRemove}
                                      hitSlop={8}
                                      accessibilityRole="button"
                                      accessibilityLabel={`Remove ${item.label}`}
                                    >
                                      <Icon name="close" size={14} color={themeColors.fiori.text.inverse} />
                                    </Pressable>
                                  </View>
                                ))}
                            </View>
                          )}
                      </View>
                    ) : section.fields[0]?.type === 'autocomplete' ? (
                      /* Single Autocomplete - show label with search icon */
                      <View style={styles.quickFilterContainer}>
                        <Pressable
                          onPress={() => handleAutocompletePress(section.fields[0] as AutocompleteFieldConfig)}
                          style={({ pressed }) => [
                            styles.quickFilterPressable,
                            {
                              backgroundColor: themeColors.white,
                              borderColor: themeColors.gray[300],
                            },
                            pressed && {
                              backgroundColor: themeColors.gray[50],
                              borderColor: themeColors.primary,
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Search ${section.title}`}
                        >
                          <View style={styles.quickFilterContent}>
                            {section.fields[0].icon && (
                              <Icon name={mapIcon(section.fields[0].icon)} size={20} color={themeColors.gray[600]} />
                            )}
                            <Text style={[styles.quickFilterLabel, { color: themeColors.fiori.text.primary }]}>
                              {section.title}
                            </Text>
                          </View>
                          <Icon name="search-outline" size={22} color={themeColors.primary} />
                        </Pressable>

                        {/* Show selected items as chips */}
                        {Array.isArray(localFilters[section.fields[0].key as string]) &&
                          localFilters[section.fields[0].key as string].length > 0 && (
                            <View style={styles.quickFilterChips}>
                              {localFilters[section.fields[0].key as string].map((item: AutocompleteSelection) => (
                                <View
                                  key={item.id}
                                  style={[styles.filterChip, { backgroundColor: themeColors.primary }]}
                                >
                                  <Text style={[styles.filterChipText, { color: themeColors.fiori.text.inverse }]} numberOfLines={1}>
                                    {item.label}
                                  </Text>
                                  <Pressable
                                    onPress={() => handleRemoveSelection(section.fields[0].key as string, item.id)}
                                    style={styles.filterChipRemove}
                                    hitSlop={8}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove ${item.label}`}
                                  >
                                    <Icon name="close" size={14} color={themeColors.fiori.text.inverse} />
                                  </Pressable>
                                </View>
                              ))}
                            </View>
                          )}
                      </View>
                    ) : (
                      /* For other single field types, show the field directly */
                      <View style={styles.fieldWrapperCompact}>
                        {renderField(section.fields[0])}
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })}

          {/* Action Buttons at bottom of scroll - Fiori style */}
          <View style={[styles.actionButtonsContainer, { borderTopColor: themeColors.gray[200] }]}>
            {/* Reset Button - Fiori Secondary Negative */}
            <Pressable
              onPress={handleReset}
              disabled={pendingFilterCount === 0}
              style={({ pressed }) => [
                styles.resetButton,
                {
                  borderColor: themeColors.error,
                  backgroundColor: themeColors.white,
                },
                pressed && { backgroundColor: themeColors.semantic.errorLight },
                pendingFilterCount === 0 && {
                  borderColor: themeColors.gray[300],
                  opacity: 0.5,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Reset all filters"
            >
              <Icon
                name="refresh-outline"
                size={18}
                color={pendingFilterCount === 0 ? themeColors.gray[400] : themeColors.error}
              />
              <Text
                style={[
                  styles.resetButtonText,
                  { color: themeColors.error },
                  pendingFilterCount === 0 && { color: themeColors.gray[400] },
                ]}
              >
                Reset
              </Text>
            </Pressable>

            {/* Clear All Button - Only shows when filters applied */}
            {pendingFilterCount > 0 && (
              <Pressable
                onPress={handleReset}
                style={({ pressed }) => [
                  styles.clearAllButton,
                  pressed && styles.clearAllButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Clear all filters"
              >
                <Text style={[styles.clearAllButtonText, { color: themeColors.primary }]}>
                  Clear All
                </Text>
              </Pressable>
            )}
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Autocomplete Bottom Sheet */}
      {activeAutocompleteField && (() => {
        // Defensive: ensure currentSelections is always an array
        const currentValue = localFilters[activeAutocompleteField.key as string];
        const currentSelections = Array.isArray(currentValue) ? currentValue : [];

        return (
          <AutocompleteBottomSheet
            visible={autocompleteVisible}
            onClose={handleAutocompleteClose}
            autocompleteType={activeAutocompleteField.autocompleteType}
            multiSelect={activeAutocompleteField.multiSelect || false}
            currentSelections={currentSelections}
            onSelect={handleAutocompleteSelect}
            searchPlaceholder={activeAutocompleteField.searchPlaceholder}
          />
        );
      })()}
    </GestureHandlerRootView>
  );
};

// =============================================================================
// STYLES - SAP Fiori Design System
// Colors are applied dynamically in JSX for dark mode support
// =============================================================================
const styles = StyleSheet.create({
  // Bottom Sheet Structure
  gestureRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  bottomSheet: {
    zIndex: 9999,
  },
  handle: {
    borderTopLeftRadius: FIORI.modal.cornerRadius,
    borderTopRightRadius: FIORI.modal.cornerRadius,
  },
  handleIndicator: {
    width: FIORI.modal.handleWidth,
    height: FIORI.modal.handleHeight,
    backgroundColor: FIORI.modal.handleColor,
    borderRadius: FIORI.modal.handleHeight / 2,
    alignSelf: 'center',
    marginTop: FIORI.modal.handleMarginTop,
    marginBottom: FIORI.modal.handleMarginBottom,
  },
  background: {
    borderTopLeftRadius: FIORI.modal.cornerRadius,
    borderTopRightRadius: FIORI.modal.cornerRadius,
  },

  // ==========================================================================
  // HEADER - Fiori Modal Header with Cancel/Title/Apply
  // ==========================================================================
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: FIORI.header.height,
    paddingHorizontal: FIORI.header.paddingHorizontal,
  },
  headerButton: {
    minHeight: FIORI.touchTarget.minHeight,
    minWidth: 60,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: FIORI.spacing.xs,
  },
  headerButtonPressed: {
    opacity: 0.7,
  },
  headerButtonDisabled: {
    opacity: 0.3,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FIORI.typography.title.fontSize,
    fontWeight: FIORI.typography.title.fontWeight,
    lineHeight: FIORI.typography.title.lineHeight,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: FIORI.typography.subtitle.fontSize,
    fontWeight: FIORI.typography.subtitle.fontWeight,
    lineHeight: FIORI.typography.subtitle.lineHeight,
    textAlign: 'center',
    marginTop: 2,
  },
  cancelButtonText: {
    fontSize: FIORI.typography.buttonSecondary.fontSize,
    fontWeight: FIORI.typography.buttonSecondary.fontWeight,
  },
  applyButtonText: {
    fontSize: FIORI.typography.button.fontSize,
    fontWeight: FIORI.typography.button.fontWeight,
  },
  headerDivider: {
    height: 1,
  },

  // ==========================================================================
  // CONTENT AREA
  // ==========================================================================
  contentContainer: {
    paddingHorizontal: FIORI.spacing.md,
    paddingTop: FIORI.spacing.sm,
    paddingBottom: FIORI.spacing.xxl,
  },

  // ==========================================================================
  // COLLAPSIBLE SECTIONS
  // ==========================================================================
  sectionContainer: {
    marginBottom: FIORI.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: FIORI.spacing.sm,
    paddingHorizontal: FIORI.spacing.md,
    paddingVertical: FIORI.spacing.sm,
    minHeight: FIORI.touchTarget.minHeight,
    marginBottom: FIORI.spacing.xs,
  },
  sectionTitle: {
    fontSize: FIORI.typography.sectionTitle.fontSize,
    fontWeight: FIORI.typography.sectionTitle.fontWeight,
    lineHeight: FIORI.typography.sectionTitle.lineHeight,
    flex: 1,
  },
  sectionContent: {
    paddingLeft: FIORI.spacing.xxs,
  },
  fieldWrapper: {
    marginBottom: FIORI.spacing.lg,
  },
  fieldWrapperCompact: {
    marginBottom: 0,
  },
  rangeFieldsRow: {
    flexDirection: 'row',
    gap: FIORI.spacing.sm,
    alignItems: 'flex-start',
  },
  rangeFieldHalf: {
    flex: 1,
  },

  // ==========================================================================
  // QUICK FILTER BUTTON (for autocomplete fields)
  // ==========================================================================
  quickFilterPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: FIORI.spacing.xs,
    paddingHorizontal: FIORI.spacing.md,
    paddingVertical: FIORI.spacing.sm,
    minHeight: FIORI.touchTarget.minHeight,
  },
  quickFilterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI.spacing.sm,
    flex: 1,
  },
  quickFilterLabel: {
    fontSize: FIORI.typography.body.fontSize,
    fontWeight: '500' as const,
    lineHeight: FIORI.typography.body.lineHeight,
    flex: 1,
  },
  quickFilterContainer: {
    marginBottom: 0,
  },

  // ==========================================================================
  // RANGE FILTER (non-collapsible autocomplete range)
  // ==========================================================================
  rangeFilterContainer: {
    marginBottom: 0,
  },
  rangeFilterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI.spacing.xs,
    marginBottom: FIORI.spacing.sm,
  },
  rangeFilterTitle: {
    fontSize: FIORI.typography.sectionTitle.fontSize,
    fontWeight: FIORI.typography.sectionTitle.fontWeight,
    lineHeight: FIORI.typography.sectionTitle.lineHeight,
  },

  // ==========================================================================
  // FILTER CHIPS - Fiori Chip Style
  // ==========================================================================
  quickFilterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FIORI.spacing.xs,
    marginTop: FIORI.spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: FIORI.chip.height,
    borderRadius: FIORI.chip.borderRadius,
    paddingLeft: FIORI.chip.paddingHorizontal,
    paddingRight: FIORI.spacing.xxs,
    maxWidth: 200,
    gap: FIORI.spacing.xs,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500' as const,
    flexShrink: 1,
  },
  filterChipRemove: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ==========================================================================
  // ACTION BUTTONS - Fiori style (bottom of scroll)
  // ==========================================================================
  actionButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: FIORI.spacing.md,
    marginTop: FIORI.spacing.xxl,
    paddingTop: FIORI.spacing.lg,
    borderTopWidth: 1,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: FIORI.button.height,
    paddingHorizontal: FIORI.button.paddingHorizontal,
    borderRadius: FIORI.button.borderRadius,
    borderWidth: 1,
    gap: FIORI.spacing.xs,
  },
  resetButtonText: {
    fontSize: FIORI.typography.button.fontSize,
    fontWeight: FIORI.typography.button.fontWeight,
  },
  clearAllButton: {
    height: FIORI.touchTarget.minHeight,
    paddingHorizontal: FIORI.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearAllButtonPressed: {
    opacity: 0.7,
  },
  clearAllButtonText: {
    fontSize: FIORI.typography.body.fontSize,
    fontWeight: '500' as const,
  },
});
