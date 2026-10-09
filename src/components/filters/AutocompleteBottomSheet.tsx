/**
 * Autocomplete Bottom Sheet Component
 *
 * Fully integrated autocomplete search sheet with debounced search,
 * loading states, and result display. Handles all autocomplete types.
 * SAP Fiori Design System implementation.
 */

import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  ActivityIndicator,
  TextStyle,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
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

  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  // Insets when a SafeAreaProvider is mounted; zero otherwise.
  const insets = useContext(SafeAreaInsetsContext) ?? { top: 0, bottom: 0, left: 0, right: 0 };

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
      <Pressable
        onPress={() =>
          multiSelect ? handleMultiSelectToggle(item) : handleSingleSelect(item)
        }
        style={({ pressed }) => [
          styles.resultItem,
          isSelected && styles.resultItemSelected,
          pressed && styles.resultItemPressed,
        ]}
        accessibilityRole={multiSelect ? 'checkbox' : 'button'}
        accessibilityState={multiSelect ? { checked: isSelected } : undefined}
        accessibilityLabel={item.detail ? `${item.label}, ${item.detail}` : item.label}
      >
        <View style={styles.resultText}>
          <Text
            style={[styles.resultLabel, isSelected && styles.resultLabelSelected]}
            numberOfLines={2}
          >
            {renderHighlighted(item.label, searchQuery, styles.resultLabelMatch)}
          </Text>
          {item.detail ? (
            <Text style={styles.resultDetail} numberOfLines={1}>
              {item.detail}
            </Text>
          ) : null}
        </View>
        {multiSelect ? (
          <Icon
            name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={iconSize.lg}
            color={isSelected ? t.brand.tint : t.border.field}
          />
        ) : (
          <Icon name="chevron-right" size={iconSize.lg} color={t.icon.secondary} />
        )}
      </Pressable>
    );
  };

  /**
   * Render empty state
   */
  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyState} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.emptyText}>Searching…</Text>
        </View>
      );
    }

    if (!searchQuery || searchQuery.trim().length < 1) {
      return (
        <View style={styles.emptyState}>
          <Icon name="magnify" size={iconSize.hero} color={t.icon.secondary} />
          <Text style={styles.emptyText}>Type to search</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState} accessibilityLiveRegion="polite">
        <Icon name="magnify-close" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle}>No matches</Text>
        <Text style={styles.emptyText}>
          {`Nothing matches "${searchQuery.trim()}". Try fewer letters.`}
        </Text>
      </View>
    );
  };

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
        <Pressable
          style={styles.backdropTouchable}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.keyboardView, { marginTop: insets.top + space.xl }]}
        >
          <View style={styles.sheetContainer}>
            <View style={styles.grabHandle} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                Select {lowerFirst(getAutocompleteTypeLabel(autocompleteType))}
              </Text>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
              </Pressable>
            </View>

            {/* Search field stays visible at the top */}
            <View style={styles.searchContainer}>
              <View style={styles.searchBar}>
                <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} style={styles.searchIcon} />
                <TextInput
                  ref={inputRef}
                  placeholder={searchPlaceholder || getAutocompletePlaceholder(autocompleteType)}
                  placeholderTextColor={t.text.placeholder}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.searchInput}
                  returnKeyType="search"
                  accessibilityLabel={`Search ${lowerFirst(getAutocompleteTypeLabel(autocompleteType))}`}
                />
                {isLoading && (
                  <ActivityIndicator size="small" color={t.brand.tint} style={styles.searchLoader} />
                )}
                {searchQuery.length > 0 && !isLoading && (
                  <Pressable
                    style={styles.clearButton}
                    onPress={handleClear}
                    hitSlop={(touchTarget - iconSize.md) / 2}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                  >
                    <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
                  </Pressable>
                )}
              </View>
            </View>

            {/* Results */}
            <FlatList
              data={results}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={renderEmpty}
              style={styles.resultsList}
              contentContainerStyle={styles.resultsContentContainer}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />

            {/* Multi-select footer, pinned with the bottom inset */}
            {multiSelect && (
              <View style={[styles.footer, { paddingBottom: space.lg + insets.bottom }]}>
                <View style={styles.footerContent}>
                  <Icon name="check-circle" size={iconSize.md} color={t.brand.tint} />
                  <Text style={styles.footerText}>
                    {tempSelections.length} selected
                  </Text>
                </View>
                <Button type="primary" size="standalone" onPress={handleMultiSelectDone}>
                  Done
                </Button>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

/** "Customer" -> "customer", but keeps acronyms such as "GRN number". */
function lowerFirst(label: string): string {
  if (label.length > 1 && label[1] === label[1].toUpperCase() && /[A-Z]/.test(label[1])) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** Splits a label so the part matching the query renders bold (match never in colour alone). */
function renderHighlighted(label: string, query: string, matchStyle: TextStyle): React.ReactNode {
  const q = query.trim();
  if (!q) return label;
  const index = label.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return label;
  return (
    <>
      {label.slice(0, index)}
      <Text style={matchStyle}>{label.slice(index, index + q.length)}</Text>
      {label.slice(index + q.length)}
    </>
  );
}

// ============================================================================
// STYLES (bottom sheet, style guide §13.9)
// ============================================================================

const SEARCH_BAR_HEIGHT = 36;
const GRAB_HANDLE = { width: 36, height: 4 };

const makeStyles = (t: ThemeTokens) => ({
  backdrop: {
    flex: 1,
    backgroundColor: t.overlay.scrim,
  },
  backdropTouchable: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  keyboardView: {
    flex: 1,
  },
  sheetContainer: {
    flex: 1,
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden' as const,
    ...t.shadow[4],
  },
  grabHandle: {
    alignSelf: 'center' as const,
    width: GRAB_HANDLE.width,
    height: GRAB_HANDLE.height,
    borderRadius: radius.pill,
    backgroundColor: t.border.separator,
    marginTop: space.sm,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingTop: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  title: {
    ...typography.headline,
    flex: 1,
    color: t.text.primary,
  },
  closeButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  closeButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  searchContainer: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  searchBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: radius.button,
    paddingHorizontal: space.md,
    minHeight: touchTarget,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
  },
  searchIcon: {
    marginRight: space.sm,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    minHeight: SEARCH_BAR_HEIGHT,
    color: t.text.primary,
    paddingVertical: Platform.OS === 'android' ? space.sm : 0,
  },
  searchLoader: {
    marginLeft: space.sm,
  },
  clearButton: {
    marginLeft: space.sm,
  },
  resultsList: {
    flex: 1,
    minHeight: 0,
  },
  resultsContentContainer: {
    paddingBottom: space.lg,
  },
  resultItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.rowMinHeight + space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.md,
    backgroundColor: t.surface.sheet,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  resultItemSelected: {
    backgroundColor: t.surface.selected,
  },
  resultItemPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  resultText: {
    flex: 1,
  },
  resultLabel: {
    ...typography.body,
    color: t.text.primary,
  },
  resultLabelSelected: {
    fontWeight: fontWeight.semibold,
  },
  resultLabelMatch: {
    fontWeight: fontWeight.bold,
  },
  resultDetail: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  emptyState: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.max,
    paddingHorizontal: space.xxl,
    gap: space.md,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  emptyText: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: t.surface.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.separator,
  },
  footerContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  footerText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
});
