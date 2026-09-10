/**
 * Autocomplete Bottom Sheet Component
 *
 * Fully integrated autocomplete search sheet with debounced search,
 * loading states, and result display. Handles all autocomplete types.
 * SAP Fiori Design System implementation.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import {
  Text,
  Surface,
  ActivityIndicator,
  Button,
  IconButton,
  List,
  Divider,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors } from '@/hooks/useListColors';
import type {
  AutocompleteBottomSheetProps,
  AutocompleteResult,
  AutocompleteSelection,
} from '@/types/filter.types';
import {
  searchAutocomplete,
  getAutocompleteTypeLabel,
  getAutocompletePlaceholder,
} from '@/services/filter-autocomplete-service';

export const AutocompleteBottomSheet: React.FC<AutocompleteBottomSheetProps> = ({
  visible,
  onClose,
  autocompleteType,
  multiSelect,
  currentSelections,
  onSelect,
  searchPlaceholder,
}) => {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<AutocompleteResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Multi-select temporary state
  const [tempSelections, setTempSelections] = useState<AutocompleteSelection[]>(
    currentSelections
  );

  // Theme colors for dark mode support
  const colors = useListColors();

  // Debounce timer
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Input ref for programmatic focus
  const inputRef = useRef<TextInput>(null);

  /**
   * Reset temp selections when opening
   */
  useEffect(() => {
    if (visible && multiSelect) {
      setTempSelections(currentSelections);
    }
  }, [visible, multiSelect, currentSelections]);

  /**
   * Focus input when modal opens - delay to allow modal animation to complete
   */
  useEffect(() => {
    if (visible) {
      // Reset search query when opening
      setSearchQuery('');
      setResults([]);

      // Focus input after a short delay to ensure modal is fully rendered
      const focusTimer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);

      return () => clearTimeout(focusTimer);
    }
  }, [visible]);

  /**
   * Perform search with debouncing
   */
  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // If query is empty or too short, clear results
    if (!searchQuery || searchQuery.trim().length < 1) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    // Set loading state
    setIsLoading(true);

    // Set new timer for debounced search
    debounceTimerRef.current = setTimeout(async () => {
      if (__DEV__) console.log('[AutocompleteBottomSheet] Performing search:', { autocompleteType, searchQuery });
      try {
        const searchResults = await searchAutocomplete(
          autocompleteType,
          searchQuery
        );
        if (__DEV__) console.log('[AutocompleteBottomSheet] Search results:', searchResults.length);
        setResults(searchResults);
      } catch (error) {
        console.error('Error searching autocomplete:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, autocompleteType]);

  /**
   * Handle clear search
   */
  const handleClear = () => {
    setSearchQuery('');
  };

  /**
   * Handle single-select item selection
   */
  const handleSingleSelect = (item: AutocompleteResult) => {
    const selection: AutocompleteSelection = {
      id: item.id,
      label: item.label,
      detail: item.detail,
      type: item.type,
      metadata: item.metadata,
    };
    onSelect([selection]);
    onClose();
  };

  /**
   * Handle multi-select toggle
   */
  const handleMultiSelectToggle = (item: AutocompleteResult) => {
    const isSelected = tempSelections.some((s) => s.id === item.id);

    if (isSelected) {
      // Remove from selections
      setTempSelections((prev) => prev.filter((s) => s.id !== item.id));
    } else {
      // Add to selections
      const selection: AutocompleteSelection = {
        id: item.id,
        label: item.label,
        detail: item.detail,
        type: item.type,
        metadata: item.metadata,
      };
      setTempSelections((prev) => [...prev, selection]);
    }
  };

  /**
   * Handle multi-select done
   */
  const handleMultiSelectDone = () => {
    onSelect(tempSelections);
    onClose();
  };

  /**
   * Check if item is selected (multi-select mode)
   */
  const isItemSelected = (itemId: string) => {
    return tempSelections.some((s) => s.id === itemId);
  };

  /**
   * Render result item
   */
  const renderItem = ({ item }: { item: AutocompleteResult }) => {
    const isSelected = multiSelect ? isItemSelected(item.id) : false;

    return (
      <Surface
        style={[
          styles.resultItem,
          { backgroundColor: colors.cellBackground, borderColor: colors.gray200 },
          isSelected && { backgroundColor: colors.blueLight, borderColor: colors.primary, borderWidth: 2 },
        ]}
        elevation={isSelected ? 1 : 0}
      >
        <List.Item
          title={item.label}
          description={item.detail}
          onPress={() =>
            multiSelect ? handleMultiSelectToggle(item) : handleSingleSelect(item)
          }
          titleNumberOfLines={1}
          descriptionNumberOfLines={1}
          titleStyle={[
            { color: colors.textPrimary },
            isSelected && styles.resultLabelSelected,
          ]}
          descriptionStyle={{ color: colors.textSecondary }}
          right={() =>
            multiSelect && isSelected ? (
              <Icon name="check-circle" size={24} color={colors.primary} />
            ) : multiSelect ? (
              <Icon name="checkbox-blank-circle-outline" size={24} color={colors.gray300} />
            ) : (
              <Icon name="chevron-right" size={24} color={colors.gray400} />
            )
          }
          style={styles.listItem}
        />
      </Surface>
    );
  };

  /**
   * Render empty state
   */
  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text variant="bodyMedium" style={[styles.emptyText, { color: colors.textSecondary }]}>
            Searching...
          </Text>
        </View>
      );
    }

    if (!searchQuery || searchQuery.trim().length < 1) {
      return (
        <View style={styles.emptyState}>
          <Icon name="magnify" size={64} color={colors.gray300} />
          <Text variant="bodyLarge" style={[styles.emptyText, { color: colors.textSecondary }]}>
            Type to search
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Icon name="alert-circle-outline" size={64} color={colors.gray300} />
        <Text variant="bodyLarge" style={[styles.emptyText, { color: colors.textSecondary }]}>
          No results found
        </Text>
      </View>
    );
  };

  /**
   * Item separator
   */
  const ItemSeparator = () => <View style={styles.separator} />;

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <Surface style={[styles.sheetContainer, { backgroundColor: colors.cellBackground }]} elevation={5}>
            <View style={[styles.container, { backgroundColor: colors.cellBackground }]}>
              {/* Header */}
              <Surface style={[styles.header, { backgroundColor: colors.cellBackground }]} elevation={0}>
                <View style={styles.headerContent}>
                  <Icon name="magnify" size={24} color={colors.primary} />
                  <Text variant="titleLarge" style={[styles.title, { color: colors.textPrimary }]}>
                    Select {getAutocompleteTypeLabel(autocompleteType)}
                  </Text>
                </View>
                <IconButton
                  icon="close"
                  size={24}
                  iconColor={colors.gray600}
                  onPress={onClose}
                  style={styles.closeButton}
                />
              </Surface>

              <Divider />

              {/* Search Input - SAP Fiori Style */}
              <View style={styles.searchContainer}>
                <View style={[styles.searchBar, { backgroundColor: colors.gray100 }]}>
                  <Icon name="magnify" size={20} color={colors.gray500} style={styles.searchIcon} />
                  <TextInput
                    ref={inputRef}
                    placeholder={searchPlaceholder || getAutocompletePlaceholder(autocompleteType)}
                    placeholderTextColor={colors.gray500}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.searchInput, { color: colors.textPrimary }]}
                    returnKeyType="search"
                  />
                  {isLoading && (
                    <ActivityIndicator size="small" color={colors.primary} style={styles.searchLoader} />
                  )}
                  {searchQuery.length > 0 && !isLoading && (
                    <TouchableOpacity
                      style={styles.clearButton}
                      onPress={handleClear}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel="Clear search"
                    >
                      <View style={[styles.clearIconContainer, { backgroundColor: colors.gray400 }]}>
                        <Icon name="close" size={16} color="#FFFFFF" />
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Results List */}
              <FlatList
                data={results}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                ItemSeparatorComponent={ItemSeparator}
                ListEmptyComponent={renderEmpty}
                style={[styles.resultsList, { backgroundColor: colors.cellBackground }]}
                contentContainerStyle={[styles.resultsContentContainer, { backgroundColor: colors.cellBackground }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              />

              {/* Multi-select footer */}
              {multiSelect && (
                <>
                  <Divider />
                  <Surface style={[styles.footer, { backgroundColor: colors.cellBackground }]} elevation={2}>
                    <View style={styles.footerContent}>
                      <Icon name="check-circle" size={20} color={colors.primary} />
                      <Text variant="bodyMedium" style={[styles.footerText, { color: colors.textSecondary }]}>
                        {tempSelections.length} selected
                      </Text>
                    </View>
                    <Button
                      mode="contained"
                      onPress={handleMultiSelectDone}
                      buttonColor={colors.primary}
                      style={styles.doneButton}
                    >
                      Done
                    </Button>
                  </Surface>
                </>
              )}
            </View>
          </Surface>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

// ============================================================================
// SAP Fiori Search Bar Dimensions
// ============================================================================
const FIORI_SEARCH = {
  height: 36, // Fiori default search bar height
  touchTarget: 44, // Minimum touch target
  borderRadius: 10, // Fiori search bar corner radius
  iconSize: 20, // Fiori icon size
  fontSize: 17, // Fiori iOS font size
  clearIconSize: 16,
  padding: 12,
  iconMargin: 8,
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdropTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  keyboardView: {
    flex: 1,
  },
  sheetContainer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: '100%',
    width: '100%',
    ...Platform.select({
      ios: {
        paddingTop: 50,
      },
      android: {
        paddingTop: 20,
      },
    }),
  },
  container: {
    flex: 1,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexShrink: 0,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  title: {
    fontWeight: '600',
  },
  closeButton: {
    margin: 0,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexShrink: 0,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: FIORI_SEARCH.borderRadius,
    paddingHorizontal: FIORI_SEARCH.padding,
    height: FIORI_SEARCH.height,
    minHeight: FIORI_SEARCH.touchTarget,
  },
  searchIcon: {
    marginRight: FIORI_SEARCH.iconMargin,
  },
  searchInput: {
    flex: 1,
    fontSize: FIORI_SEARCH.fontSize,
    paddingVertical: 0,
    ...Platform.select({
      android: {
        paddingVertical: 8,
      },
    }),
  },
  searchLoader: {
    marginLeft: FIORI_SEARCH.iconMargin,
  },
  clearButton: {
    marginLeft: FIORI_SEARCH.iconMargin,
    padding: 2,
  },
  clearIconContainer: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultsList: {
    flex: 1,
    minHeight: 0,
  },
  resultsContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
  },
  resultItem: {
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  listItem: {
    paddingVertical: 8,
  },
  resultLabelSelected: {
    fontWeight: '600',
  },
  separator: {
    height: 0,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 16,
  },
  emptyText: {
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexShrink: 0,
  },
  footerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerText: {},
  doneButton: {
    borderRadius: 12,
  },
});
