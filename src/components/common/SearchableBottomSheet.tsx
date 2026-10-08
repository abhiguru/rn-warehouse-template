/**
 * SearchableBottomSheet
 *
 * A generic, reusable bottom sheet with search functionality.
 * Extracts common patterns from 15+ BottomSheet components in the codebase.
 *
 * Features:
 * - Debounced search with configurable delay
 * - Optional recent items with AsyncStorage persistence
 * - Customizable rendering via render props
 * - Keyboard-aware behavior
 * - Consistent styling with theme
 *
 * @example
 * ```tsx
 * <SearchableBottomSheet<Customer>
 *   isVisible={isVisible}
 *   onClose={onClose}
 *   onSelect={handleSelect}
 *   title="Select Customer"
 *   placeholder="Search customers..."
 *   searchFn={searchCustomers}
 *   renderItem={renderCustomerItem}
 *   keyExtractor={(item) => item.id}
 *   recentItemsKey="recent_customers"
 * />
 * ```
 */

import React, {
  useCallback,
  useMemo,
  useRef,
  useEffect,
  ReactElement,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ListRenderItem,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetFlatList,
  BottomSheetTextInput,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { useSearchAutocomplete } from '@/hooks';
import { useListColors } from '@/hooks/useListColors';
import { useAppSelector } from '@/store/hooks';

// ============================================================================
// Types
// ============================================================================

export interface SearchableBottomSheetProps<T> {
  /** Whether the bottom sheet is visible */
  isVisible: boolean;
  /** Called when the sheet is closed */
  onClose: () => void;
  /** Called when an item is selected */
  onSelect: (item: T) => void;
  /** Title displayed in the header */
  title: string;
  /** Placeholder text for the search input */
  placeholder?: string;
  /** Async function to search for items */
  searchFn: (query: string) => Promise<T[]>;
  /** Render function for each item - receives onSelect handler */
  renderItem: (item: T, onSelect: (item: T) => void) => ReactElement;
  /** Extract unique key from item */
  keyExtractor: (item: T) => string;
  /** Optional: Current selected value for initial search */
  currentValue?: { id: string; name: string } | null;
  /** Optional: AsyncStorage key for recent items (enables recent items feature) */
  recentItemsKey?: string;
  /** Optional: Max recent items to store (default: 5) */
  maxRecentItems?: number;
  /** Optional: Render function for recent items (defaults to renderItem) */
  renderRecentItem?: (item: T, onSelect: (item: T) => void) => ReactElement;
  /** Optional: Minimum query length before searching (default: 2) */
  minQueryLength?: number;
  /** Optional: Debounce delay in ms (default: 300) */
  debounceMs?: number;
  /** Optional: Snap points (default: ['60%', '95%']) */
  snapPoints?: string[];
  /** Optional: Backdrop opacity (default: 0.4) */
  backdropOpacity?: number;
  /** Optional: Empty state when no search results */
  emptySearchText?: string;
  /** Optional: Initial empty state text */
  emptyInitialText?: string;
  /** Optional: Sub-text for empty states */
  emptySubText?: string;
}

// ============================================================================
// Hook for Recent Items (User-Scoped)
// ============================================================================

function useRecentItems<T extends { id: string }>(
  storageKey: string | undefined,
  maxItems: number = 5,
  userId: string | undefined
) {
  const [recentItems, setRecentItems] = React.useState<T[]>([]);

  // Scope storage key by user ID to prevent cross-user data leakage
  const scopedKey = useMemo(() => {
    if (!storageKey || !userId) return undefined;
    return `${storageKey}_${userId}`;
  }, [storageKey, userId]);

  const loadRecentItems = useCallback(async () => {
    if (!scopedKey) return;
    try {
      const stored = await AsyncStorage.getItem(scopedKey);
      if (stored) {
        setRecentItems(JSON.parse(stored));
      } else {
        setRecentItems([]);
      }
    } catch (error) {
      console.error(`[SearchableBottomSheet] Failed to load recent items:`, error);
    }
  }, [scopedKey]);

  const saveToRecent = useCallback(async (item: T) => {
    if (!scopedKey) return;
    try {
      const stored = await AsyncStorage.getItem(scopedKey);
      let recent: T[] = stored ? JSON.parse(stored) : [];

      // Remove if already exists
      recent = recent.filter((r) => r.id !== item.id);
      // Add to front
      recent.unshift(item);
      // Keep only maxItems
      recent = recent.slice(0, maxItems);

      await AsyncStorage.setItem(scopedKey, JSON.stringify(recent));
      setRecentItems(recent);
    } catch (error) {
      console.error(`[SearchableBottomSheet] Failed to save recent item:`, error);
    }
  }, [scopedKey, maxItems]);

  return { recentItems, loadRecentItems, saveToRecent };
}

// ============================================================================
// Component
// ============================================================================

export function SearchableBottomSheet<T extends { id: string }>({
  isVisible,
  onClose,
  onSelect,
  title,
  placeholder = 'Search...',
  searchFn,
  renderItem,
  keyExtractor,
  currentValue,
  recentItemsKey,
  maxRecentItems = 5,
  renderRecentItem,
  minQueryLength = 2,
  debounceMs = 300,
  snapPoints: customSnapPoints,
  backdropOpacity = 0.4,
  emptySearchText,
  emptyInitialText = 'Search to find items',
  emptySubText = 'Type at least 2 characters',
}: SearchableBottomSheetProps<T>): ReactElement {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const inputRef = useRef<React.ElementRef<typeof BottomSheetTextInput>>(null);

  // Get user ID for scoping recent items storage
  const userId = useAppSelector((state) => state.auth.userProfile?.id);

  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.cellBackground,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.cellDivider,
    },
    headerTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.semibold,
      color: colors.textPrimary,
    },
    closeButton: {
      padding: theme.spacing.sm,
      borderRadius: theme.borderRadius.full,
      backgroundColor: colors.gray100,
      minHeight: theme.touchTarget.minimum,
      minWidth: theme.touchTarget.minimum,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.gray50,
      borderRadius: theme.borderRadius.lg,
      paddingHorizontal: theme.spacing.md,
      minHeight: theme.touchTarget.minimum,
      marginHorizontal: theme.spacing.lg,
      marginTop: theme.spacing.lg,
      marginBottom: theme.spacing.sm,
      borderWidth: 1,
      borderColor: colors.gray200,
    },
    input: {
      flex: 1,
      fontSize: theme.fontSize.base,
      color: colors.textPrimary,
    },
    separator: {
      height: 1,
      backgroundColor: colors.gray100,
      marginHorizontal: theme.spacing.lg,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: theme.spacing['3xl'],
      paddingHorizontal: theme.spacing['2xl'],
    },
    emptyText: {
      fontSize: theme.fontSize.base,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: theme.spacing.sm,
    },
    emptySubText: {
      fontSize: theme.fontSize.sm,
      color: colors.textTertiary,
      textAlign: 'center',
    },
    recentSection: {
      width: '100%',
      paddingHorizontal: theme.spacing.md,
    },
    recentTitle: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: theme.spacing.md,
    },
    recentItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.sm,
      backgroundColor: colors.gray50,
      borderRadius: theme.borderRadius.lg,
      marginBottom: theme.spacing.sm,
    },
    recentIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.cellBackground,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: theme.spacing.md,
    },
    recentName: {
      fontSize: theme.fontSize.base,
      color: colors.textPrimary,
      fontWeight: theme.fontWeight.medium,
      flex: 1,
    },
  }), [colors]);

  // Recent items (optional feature, user-scoped)
  const { recentItems, loadRecentItems, saveToRecent } = useRecentItems<T>(
    recentItemsKey,
    maxRecentItems,
    userId
  );

  // Search state via hook
  const {
    searchQuery,
    results,
    isLoading,
    handleSearchChange,
    clearSearch,
    performSearchNow,
    searchTimeoutRef,
  } = useSearchAutocomplete<T>({
    searchFn,
    minQueryLength,
    debounceMs,
  });

  // Snap points
  const snapPoints = useMemo(
    () => customSnapPoints || ['60%', '95%'],
    [customSnapPoints]
  );

  // Handle sheet changes
  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
          searchTimeoutRef.current = null;
        }
        onClose();
        clearSearch();
      }
    },
    [onClose, clearSearch, searchTimeoutRef]
  );

  // Render backdrop
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={backdropOpacity}
      />
    ),
    [backdropOpacity]
  );

  // Handle item selection
  const handleItemSelect = useCallback(
    (item: T) => {
      if (recentItemsKey) {
        saveToRecent(item);
      }
      onSelect(item);
      bottomSheetRef.current?.dismiss();
    },
    [onSelect, recentItemsKey, saveToRecent]
  );

  // Render recent items section
  const renderRecentSection = useCallback(() => {
    if (!recentItemsKey || searchQuery.length > 0 || recentItems.length === 0) {
      return null;
    }

    return (
      <View style={dynamicStyles.recentSection}>
        <Text style={dynamicStyles.recentTitle}>Recent</Text>
        {recentItems.map((item) => (
          <React.Fragment key={keyExtractor(item)}>
            {renderRecentItem ? (
              renderRecentItem(item, handleItemSelect)
            ) : (
              <TouchableOpacity
                style={dynamicStyles.recentItem}
                onPress={() => handleItemSelect(item)}
                activeOpacity={0.7}
              >
                <View style={dynamicStyles.recentIcon}>
                  <Icon name="clock-outline" size={16} color={colors.textSecondary} />
                </View>
                <Text style={dynamicStyles.recentName} numberOfLines={1}>
                  {(item as T & { name?: string }).name || keyExtractor(item)}
                </Text>
              </TouchableOpacity>
            )}
          </React.Fragment>
        ))}
      </View>
    );
  }, [
    recentItemsKey,
    searchQuery,
    recentItems,
    keyExtractor,
    renderRecentItem,
    handleItemSelect,
    dynamicStyles,
    colors,
  ]);

  // Empty component
  const ListEmptyComponent = useCallback(() => {
    if (isLoading) {
      return (
        <View style={dynamicStyles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={dynamicStyles.emptyText}>Searching...</Text>
        </View>
      );
    }

    if (searchQuery.length >= minQueryLength) {
      return (
        <View style={dynamicStyles.emptyContainer}>
          <Text style={dynamicStyles.emptyText}>
            {emptySearchText || `No results for "${searchQuery}"`}
          </Text>
          <Text style={dynamicStyles.emptySubText}>Try different search terms</Text>
        </View>
      );
    }

    return (
      <View style={dynamicStyles.emptyContainer}>
        {renderRecentSection()}
        {recentItems.length === 0 && (
          <>
            <Icon
              name="magnify"
              size={48}
              color={colors.textTertiary}
              style={{ marginBottom: theme.spacing.lg }}
            />
            <Text style={dynamicStyles.emptyText}>{emptyInitialText}</Text>
            <Text style={dynamicStyles.emptySubText}>{emptySubText}</Text>
          </>
        )}
      </View>
    );
  }, [
    isLoading,
    searchQuery,
    minQueryLength,
    emptySearchText,
    emptyInitialText,
    emptySubText,
    recentItems,
    renderRecentSection,
    dynamicStyles,
    colors,
  ]);

  // Wrapped renderItem - passes item and onSelect to parent's renderItem
  const wrappedRenderItem: ListRenderItem<T> = useCallback(
    ({ item }) => renderItem(item, handleItemSelect),
    [renderItem, handleItemSelect]
  );

  // Control bottom sheet based on isVisible
  useEffect(() => {
    if (isVisible) {
      if (recentItemsKey) {
        loadRecentItems();
      }
      bottomSheetRef.current?.present();
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [isVisible, recentItemsKey, loadRecentItems]);

  // Set initial search query if currentValue exists
  useEffect(() => {
    if (currentValue?.name && isVisible) {
      performSearchNow(currentValue.name);
    }
  }, [currentValue, isVisible, performSearchNow]);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={1}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      backdropComponent={renderBackdrop}
      keyboardBehavior="fillParent"
      keyboardBlurBehavior="none"
      enablePanDownToClose
      android_keyboardInputMode="adjustResize"
      enableDynamicSizing={false}
      backgroundStyle={{ backgroundColor: colors.cellBackground }}
      handleIndicatorStyle={{ backgroundColor: colors.gray300 }}
    >
      <View style={dynamicStyles.container}>
        {/* Header */}
        <View style={dynamicStyles.header}>
          <Text style={dynamicStyles.headerTitle}>{title}</Text>
          <TouchableOpacity
            style={dynamicStyles.closeButton}
            onPress={() => bottomSheetRef.current?.dismiss()}
            activeOpacity={0.7}
          >
            <Icon name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Search Input */}
        <View style={dynamicStyles.searchContainer}>
          <Icon
            name="magnify"
            size={18}
            color={colors.textSecondary}
            style={{ marginRight: theme.spacing.sm }}
          />
          <BottomSheetTextInput
            ref={inputRef}
            style={dynamicStyles.input}
            placeholder={placeholder}
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
          />
          {isLoading && (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={styles.loader}
            />
          )}
          {searchQuery.length > 0 && !isLoading && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                clearSearch();
                inputRef.current?.focus();
              }}
              activeOpacity={0.7}
            >
              <Icon name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Results List */}
        <BottomSheetFlatList
          data={results}
          renderItem={wrappedRenderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={ListEmptyComponent}
          ItemSeparatorComponent={() => <View style={dynamicStyles.separator} />}
        />
      </View>
    </BottomSheetModal>
  );
}

// ============================================================================
// Styles (Static layout only - colors are in dynamicStyles)
// ============================================================================

const styles = StyleSheet.create({
  loader: {
    marginLeft: theme.spacing.sm,
  },
  clearButton: {
    padding: theme.spacing.xs,
  },
  listContent: {
    paddingBottom: theme.spacing.xl,
  },
});

export default SearchableBottomSheet;
