/**
 * Generic Filter Modal Component
 *
 * Main filter modal component that renders configured filter fields,
 * manages state with Redux persistence, and handles auto-apply with debouncing.
 * Fully integrated autocomplete functionality - zero boilerplate required.
 *
 * SAP Fiori Design System - Modal/Dialog Component
 */

import React, { useCallback, useContext, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  BackHandler,
  Insets,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
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
import { Button } from '@/components/ui/Button';
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

const CHIP_HEIGHT = 32;
const CHIP_REMOVE_HIT_SLOP: Insets = {
  top: (touchTarget - iconSize.sm) / 2,
  bottom: (touchTarget - iconSize.sm) / 2,
  left: space.sm,
  right: space.sm,
};

// Field components
import { TextFilterField } from './fields/TextFilterField';
import { NumberRangeFilterField } from './fields/NumberRangeFilterField';
import { DateRangeFilterField } from './fields/DateRangeFilterField';
import { RadioFilterField } from './fields/RadioFilterField';
import { AutocompleteFilterField } from './fields/AutocompleteFilterField';
import { AutocompleteBottomSheet } from './AutocompleteBottomSheet';
import { formatCount } from '@/utils/formatters';

/** Field configs use MaterialCommunityIcons names; fall back to a document glyph. */
const fieldIcon = (iconName?: string): string => iconName || 'file-document-outline';

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
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  // Insets when a SafeAreaProvider is mounted; zero otherwise.
  const insets = useContext(SafeAreaInsetsContext) ?? { top: 0, bottom: 0, left: 0, right: 0 };

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
    setLocalFilters(filterValues);
    setHasPendingChanges(false);
    logger.debug(`[CLOSE_MODAL] Calling bottomSheetRef.close()`);
    bottomSheetRef.current?.close();
  }, [filterValues]);

  // Reset filters: clear both Redux and local state
  const handleReset = useCallback(() => {
    logger.info(`[RESET_FILTERS] Resetting all filters`);
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
      return (
        <BottomSheetBackdrop
          {...props}
          style={[props.style, styles.backdrop]}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={1}
        />
      );
    },
    [styles.backdrop]
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

  // Android back closes the sheet first (style guide §15)
  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, handleClose]);

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
        topInset={insets.top}
        enableDynamicSizing={false}
        onChange={handleSheetChanges}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        handleStyle={styles.handle}
        handleIndicatorStyle={styles.handleIndicator}
        backgroundStyle={styles.background}
        style={styles.bottomSheet}
        keyboardBehavior="fillParent"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        {/* Header: Cancel, title, Reset */}
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.headerButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            accessibilityHint="Discards changes and closes the filters"
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>

          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1}>
              {config.title || 'Filter'}
            </Text>
            {pendingFilterCount > 0 && (
              <Text style={styles.headerSubtitle}>
                {pendingFilterCount} selected
              </Text>
            )}
          </View>

          <Pressable
            onPress={handleReset}
            disabled={pendingFilterCount === 0}
            style={({ pressed }) => [
              styles.headerButton,
              styles.headerButtonEnd,
              pressed && styles.headerButtonPressed,
              pendingFilterCount === 0 && styles.headerButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Reset all filters"
            accessibilityState={{ disabled: pendingFilterCount === 0 }}
          >
            <Text style={styles.resetButtonText}>Reset</Text>
          </Pressable>
        </View>

        {/* Filter fields grouped by section */}
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
                    {/* Collapsible section header */}
                    <Pressable
                      onPress={() => toggleSection(sectionIndex)}
                      style={({ pressed }) => [
                        styles.sectionHeader,
                        pressed && styles.sectionHeaderPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={section.title}
                      accessibilityState={{ expanded: isExpanded }}
                    >
                      <Text style={styles.sectionTitle} accessibilityRole="header">
                        {section.title}
                      </Text>
                      <Icon
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={iconSize.md}
                        color={t.icon.secondary}
                      />
                    </Pressable>

                    {/* Collapsible content */}
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
                    {isAutocompleteRange ? (
                      /* Autocomplete range pair - title and side-by-side fields */
                      <View style={styles.rangeFilterContainer}>
                        <View style={styles.rangeFilterHeader}>
                          <Icon
                            name={fieldIcon(section.fields[0].icon)}
                            size={iconSize.md}
                            color={t.icon.secondary}
                          />
                          <Text style={styles.rangeFilterTitle} accessibilityRole="header">
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
                        {/* Selected items in the range as chips */}
                        {(Array.isArray(localFilters[section.fields[0].key as string]) &&
                          localFilters[section.fields[0].key as string].length > 0) && (
                            <View style={styles.quickFilterChips}>
                              {localFilters[section.fields[0].key as string].map((item: AutocompleteSelection) => (
                                <SelectionChip
                                  key={`from-${item.id}`}
                                  label={`From ${item.label}`}
                                  onRemove={() => handleRemoveSelection(section.fields[0].key as string, item.id)}
                                />
                              ))}
                              {Array.isArray(localFilters[section.fields[1]?.key as string]) &&
                                localFilters[section.fields[1].key as string].map((item: AutocompleteSelection) => (
                                  <SelectionChip
                                    key={`to-${item.id}`}
                                    label={`To ${item.label}`}
                                    onRemove={() => handleRemoveSelection(section.fields[1].key as string, item.id)}
                                  />
                                ))}
                            </View>
                          )}
                      </View>
                    ) : section.fields[0]?.type === 'autocomplete' ? (
                      /* Single autocomplete - field-like trigger with search icon */
                      <View style={styles.quickFilterContainer}>
                        <Pressable
                          onPress={() => handleAutocompletePress(section.fields[0] as AutocompleteFieldConfig)}
                          style={({ pressed }) => [
                            styles.quickFilterPressable,
                            pressed && styles.quickFilterPressablePressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Search ${section.title}`}
                        >
                          <View style={styles.quickFilterContent}>
                            {section.fields[0].icon && (
                              <Icon name={fieldIcon(section.fields[0].icon)} size={iconSize.md} color={t.icon.secondary} />
                            )}
                            <Text style={styles.quickFilterLabel}>
                              {section.title}
                            </Text>
                          </View>
                          <Icon name="magnify" size={iconSize.lg} color={t.brand.tint} />
                        </Pressable>

                        {/* Selected items as chips */}
                        {Array.isArray(localFilters[section.fields[0].key as string]) &&
                          localFilters[section.fields[0].key as string].length > 0 && (
                            <View style={styles.quickFilterChips}>
                              {localFilters[section.fields[0].key as string].map((item: AutocompleteSelection) => (
                                <SelectionChip
                                  key={item.id}
                                  label={item.label}
                                  onRemove={() => handleRemoveSelection(section.fields[0].key as string, item.id)}
                                />
                              ))}
                            </View>
                          )}
                      </View>
                    ) : (
                      /* Other single fields render directly */
                      <View style={styles.fieldWrapperCompact}>
                        {renderField(section.fields[0])}
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })}
        </BottomSheetScrollView>

        {/* Primary action pinned at the bottom with the safe-area inset */}
        <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>
          <Button
            type="primary"
            size="fullWidth"
            onPress={hasPendingChanges ? handleApply : handleClose}
            accessibilityLabel={
              pendingFilterCount > 0
                ? `Show results, ${formatCount(pendingFilterCount, 'filter')}`
                : 'Show results'
            }
          >
            Show results
          </Button>
        </View>
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

/** Applied-selection chip (style guide §13.5) with a 44 px remove target. */
function SelectionChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.filterChip}>
      <Text style={styles.filterChipText} numberOfLines={1} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
      <Pressable
        onPress={onRemove}
        hitSlop={CHIP_REMOVE_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={`Remove filter ${label}`}
      >
        <Icon name="close" size={iconSize.sm} color={t.brand.tint} />
      </Pressable>
    </View>
  );
}

// =============================================================================
// STYLES - SAP Fiori filter sheet (style guide §13.9)
// =============================================================================
const makeStyles = (t: ThemeTokens) => ({
  // Bottom sheet structure
  gestureRoot: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  bottomSheet: {
    zIndex: 9999,
    ...t.shadow[4],
  },
  handle: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  handleIndicator: {
    width: 36,
    height: 4,
    backgroundColor: t.border.separator,
    borderRadius: radius.pill,
  },
  background: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  backdrop: {
    backgroundColor: t.overlay.scrim,
  },

  // Header: Cancel / title / Reset
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: touchTarget + space.md,
    paddingHorizontal: space.xs,
    backgroundColor: t.surface.sheet,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  headerButton: {
    minHeight: touchTarget,
    minWidth: 72,
    justifyContent: 'center' as const,
    alignItems: 'flex-start' as const,
    paddingHorizontal: space.md,
    borderRadius: radius.button,
  },
  headerButtonEnd: {
    alignItems: 'flex-end' as const,
  },
  headerButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  headerButtonDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerTitle: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  headerSubtitle: {
    ...typography.footnote,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginTop: space.xxs,
  },
  cancelButtonText: {
    ...typography.body,
    color: t.text.primary,
  },
  resetButtonText: {
    ...typography.body,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },

  // Content
  contentContainer: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    paddingBottom: space.xxl,
  },

  // Collapsible sections
  sectionContainer: {
    marginBottom: space.md,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    borderRadius: radius.button,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: touchTarget,
    marginBottom: space.sm,
    backgroundColor: t.background.base,
  },
  sectionHeaderPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  sectionTitle: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    flex: 1,
  },
  sectionContent: {
    paddingLeft: space.xs,
  },
  fieldWrapper: {
    marginBottom: space.xl,
  },
  fieldWrapperCompact: {
    marginBottom: 0,
  },
  rangeFieldsRow: {
    flexDirection: 'row' as const,
    gap: space.md,
    alignItems: 'flex-start' as const,
  },
  rangeFieldHalf: {
    flex: 1,
  },

  // Field-like trigger for autocomplete sections
  quickFilterPressable: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    backgroundColor: t.surface.field,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: touchTarget,
  },
  quickFilterPressablePressed: {
    backgroundColor: t.surface.cardPressed,
  },
  quickFilterContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    flex: 1,
  },
  quickFilterLabel: {
    ...typography.subhead,
    fontWeight: fontWeight.medium,
    color: t.text.primary,
    flex: 1,
  },
  quickFilterContainer: {
    marginBottom: 0,
  },

  // Autocomplete range pair
  rangeFilterContainer: {
    marginBottom: 0,
  },
  rangeFilterHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginBottom: space.md,
  },
  rangeFilterTitle: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },

  // Selection chips
  quickFilterChips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    marginTop: space.md,
  },
  filterChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: CHIP_HEIGHT,
    borderRadius: radius.pill,
    paddingVertical: space.s6,
    paddingLeft: space.md,
    paddingRight: space.sm,
    maxWidth: 200,
    gap: space.xs,
    backgroundColor: t.brand.subtle,
  },
  filterChipText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
    flexShrink: 1,
  },

  // Pinned footer
  footer: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    backgroundColor: t.surface.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.separator,
  },
});
