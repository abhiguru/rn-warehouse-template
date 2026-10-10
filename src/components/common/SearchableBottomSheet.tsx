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
 *   title="Select customer"
 *   placeholder="Search customers"
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
  Pressable,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSearchAutocomplete } from '@/hooks';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { useAppSelector } from '@/store/hooks';
import { normalizeDigits, t as tr } from '@/i18n';

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
  /**
   * @deprecated The scrim colour now comes from the theme (`overlay.scrim`);
   * this value is ignored and kept only so existing callers still compile.
   */
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
  placeholder: placeholderProp,
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
  emptySearchText,
  emptyInitialText: emptyInitialTextProp,
  emptySubText: emptySubTextProp,
}: SearchableBottomSheetProps<T>): ReactElement {
  const placeholder = placeholderProp ?? tr('common.search');
  const emptyInitialText = emptyInitialTextProp ?? tr('components.searchSheet.emptyInitial');
  const emptySubText = emptySubTextProp ?? tr('components.searchSheet.emptyHint');
  // ૧૨ and 12 find the same things (docs/I18N.md rule 6)
  const searchNormalized = useCallback((query: string) => searchFn(normalizeDigits(query)), [searchFn]);
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const inputRef = useRef<React.ElementRef<typeof BottomSheetTextInput>>(null);

  // Get user ID for scoping recent items storage
  const userId = useAppSelector((state) => state.auth.userProfile?.id);

  const t = useTokens();
  const dynamicStyles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

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
    searchFn: searchNormalized,
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
        opacity={1}
        pressBehavior="close"
        style={[props.style, dynamicStyles.backdrop]}
      />
    ),
    [dynamicStyles.backdrop]
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
        <Text style={dynamicStyles.recentTitle} accessibilityRole="header">{tr('components.searchSheet.recent')}</Text>
        {recentItems.map((item) => (
          <React.Fragment key={keyExtractor(item)}>
            {renderRecentItem ? (
              renderRecentItem(item, handleItemSelect)
            ) : (
              <Pressable
                style={({ pressed }) => [dynamicStyles.recentItem, pressed && dynamicStyles.recentItemPressed]}
                onPress={() => handleItemSelect(item)}
                accessibilityRole="button"
                accessibilityLabel={tr('components.searchSheet.selectItem', { name: (item as T & { name?: string }).name || keyExtractor(item) })}
              >
                <View style={dynamicStyles.recentIcon}>
                  <Icon name="clock-outline" size={iconSize.sm} color={t.icon.secondary} />
                </View>
                <Text style={dynamicStyles.recentName} numberOfLines={1}>
                  {(item as T & { name?: string }).name || keyExtractor(item)}
                </Text>
              </Pressable>
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
    t,
  ]);

  // Empty component
  const ListEmptyComponent = useCallback(() => {
    if (isLoading) {
      return (
        <View style={dynamicStyles.emptyContainer}>
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={dynamicStyles.emptyText}>{tr('components.searchSheet.searching')}</Text>
        </View>
      );
    }

    if (searchQuery.length >= minQueryLength) {
      return (
        <View style={dynamicStyles.emptyContainer}>
          <Icon
            name="magnify"
            size={iconSize.hero}
            color={t.icon.secondary}
            style={styles.emptyIcon}
          />
          <Text style={dynamicStyles.emptyText}>
            {emptySearchText || tr('components.searchSheet.noMatch', { search: searchQuery })}
          </Text>
          <Text style={dynamicStyles.emptySubText}>{tr('components.searchSheet.noMatchHint')}</Text>
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
              size={iconSize.hero}
              color={t.icon.secondary}
              style={styles.emptyIcon}
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
    t,
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

  // Android back closes the sheet before leaving the screen (style guide 15)
  useEffect(() => {
    if (!isVisible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      bottomSheetRef.current?.dismiss();
      return true;
    });
    return () => sub.remove();
  }, [isVisible]);

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
      backgroundStyle={dynamicStyles.sheetBackground}
      handleIndicatorStyle={dynamicStyles.handleIndicator}
    >
      <View style={dynamicStyles.container}>
        {/* Header */}
        <View style={dynamicStyles.header}>
          <Text style={dynamicStyles.headerTitle} accessibilityRole="header" numberOfLines={2}>
            {title}
          </Text>
          <Pressable
            style={({ pressed }) => [dynamicStyles.closeButton, pressed && dynamicStyles.closeButtonPressed]}
            onPress={() => bottomSheetRef.current?.dismiss()}
            accessibilityRole="button"
            accessibilityLabel={tr('common.close')}
          >
            <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
          </Pressable>
        </View>

        {/* Search Input */}
        <View style={dynamicStyles.searchContainer}>
          <Icon
            name="magnify"
            size={iconSize.md}
            color={t.icon.secondary}
            style={styles.searchIcon}
          />
          <BottomSheetTextInput
            ref={inputRef}
            style={dynamicStyles.input}
            placeholder={placeholder}
            placeholderTextColor={t.text.placeholder}
            accessibilityLabel={placeholder}
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
              color={t.brand.tint}
              style={styles.loader}
            />
          )}
          {searchQuery.length > 0 && !isLoading && (
            <Pressable
              style={styles.clearButton}
              onPress={() => {
                clearSearch();
                inputRef.current?.focus();
              }}
              accessibilityRole="button"
              accessibilityLabel={tr('common.clearSearch')}
            >
              <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
            </Pressable>
          )}
        </View>

        {/* Results List */}
        <BottomSheetFlatList
          data={results}
          renderItem={wrappedRenderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.listContent, { paddingBottom: space.xl + insets.bottom }]}
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
// Styles
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  backdrop: {
    backgroundColor: t.overlay.scrim,
  },
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
    paddingLeft: space.lg,
    paddingRight: space.sm,
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  headerTitle: {
    ...typography.headline,
    flex: 1,
    color: t.text.primary,
  },
  closeButton: {
    borderRadius: radius.pill,
    minHeight: touchTarget,
    minWidth: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  closeButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  searchContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.surface.field,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    minHeight: touchTarget,
    marginHorizontal: space.lg,
    marginTop: space.lg,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: t.border.field,
  },
  input: {
    ...typography.body,
    flex: 1,
    color: t.text.primary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.border.divider,
    marginLeft: space.lg,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: space.giant,
    paddingHorizontal: space.xxxl,
  },
  emptyText: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginBottom: space.sm,
  },
  emptySubText: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  recentSection: {
    width: '100%' as const,
    paddingHorizontal: space.md,
  },
  recentTitle: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: space.md,
  },
  recentItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.rowMinHeight,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border.divider,
    marginBottom: space.sm,
  },
  recentItemPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  recentIcon: {
    width: layout.avatar.sm,
    height: layout.avatar.sm,
    borderRadius: radius.pill,
    backgroundColor: t.background.base,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: space.md,
  },
  recentName: {
    ...typography.body,
    fontWeight: fontWeight.medium,
    color: t.text.primary,
    flex: 1,
  },
});

const styles = StyleSheet.create({
  loader: {
    marginLeft: space.sm,
  },
  searchIcon: {
    marginRight: space.sm,
  },
  emptyIcon: {
    marginBottom: space.lg,
  },
  clearButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    marginRight: -space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: space.xl,
  },
});

export default SearchableBottomSheet;
