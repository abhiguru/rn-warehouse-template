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
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { useSearchAutocomplete } from '@/hooks';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, trackedText } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { useAppSelector } from '@/store/hooks';
import { normalizeDigits, t as tr } from '@/i18n';
import { useModalSheet } from '@/hooks/useModalSheet';
import type { TextInputRef } from '@/types/nativeRefs';

// ============================================================================
// Types
// ============================================================================

// The sheet's input is a gesture-handler wrapper whose instance type has no `focus` under React Native's strict API.
function focusInput(input: unknown): void {
  (input as TextInputRef | null)?.focus();
}

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
  /** Optional: a button under the empty-state text (for example Try again when the list could not be loaded) */
  emptyAction?: { label: string; onPress: () => void };
  /** Optional: show `emptyAction` only after a search found nothing, not in the initial empty state. */
  emptyActionAfterSearchOnly?: boolean;
  /**
   * Optional: what to say when the search itself failed (no connection ...), for
   * example "Couldn't search customers. Check your connection and try again."
   * The sheet then shows this text and a Try again button that repeats the search,
   * instead of "Nothing matches". The `searchFn` must throw for a failure; a
   * `searchFn` that returns [] on failure shows the empty result.
   */
  searchErrorText?: string;
  /** Optional: stay open after an item is picked, so several can be picked one after another (default: closes). */
  keepOpenOnSelect?: boolean;
  /** Optional: the most results listed. Ask `searchFn` for one more: the sheet lists `resultLimit` and, with `limitText`, says so under them only when that extra one came back. */
  resultLimit?: number;
  /** Optional: the line shown under the results when there are more than `resultLimit`. */
  limitText?: string;
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
  emptyAction,
  emptyActionAfterSearchOnly,
  searchErrorText,
  keepOpenOnSelect = false,
  resultLimit,
  limitText,
}: SearchableBottomSheetProps<T>): ReactElement {
  const placeholder = placeholderProp ?? tr('common.search');
  const emptyInitialText = emptyInitialTextProp ?? tr('components.searchSheet.emptyInitial');
  const emptySubText = emptySubTextProp ?? tr('components.searchSheet.emptyHint');
  // ૧૨ and 12 find the same things (docs/I18N.md rule 6)
  const searchNormalized = useCallback((query: string) => searchFn(normalizeDigits(query)), [searchFn]);
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const sheet = useModalSheet(bottomSheetRef);
  const inputRef = useRef<React.ComponentRef<typeof BottomSheetTextInput>>(null);

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

  // Whether the last search failed (thrown by searchFn), as opposed to finding nothing
  const [searchFailed, setSearchFailed] = React.useState(false);
  const handleSearchStart = useCallback(() => setSearchFailed(false), []);
  const failedText = searchErrorText ?? tr('components.searchSheet.searchFailed');
  const handleSearchError = useCallback(() => {
    // The failure text is a polite live region: it is announced once, there.
    setSearchFailed(true);
  }, []);

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
    onSearchStart: handleSearchStart,
    onSearchError: handleSearchError,
  });

  // Snap points
  const snapPoints = useMemo(
    () => customSnapPoints || ['60%', '95%'],
    [customSnapPoints]
  );

  // A new text is a new search: the failure of the last one no longer applies
  const handleTextChange = useCallback(
    (text: string) => {
      setSearchFailed(false);
      handleSearchChange(text);
    },
    [handleSearchChange]
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
        setSearchFailed(false);
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
      if (!keepOpenOnSelect) sheet.dismiss();
    },
    [onSelect, recentItemsKey, saveToRecent, keepOpenOnSelect]
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

    if (searchFailed && searchQuery.length >= minQueryLength) {
      return (
        <View style={dynamicStyles.emptyContainer}>
          <Icon
            name="alert-circle-outline"
            size={iconSize.hero}
            color={t.status.negative.text}
            style={styles.emptyIcon}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={dynamicStyles.emptyText} accessibilityLiveRegion="polite">{failedText}</Text>
          <Button type="secondary" onPress={() => { void performSearchNow(searchQuery); }} testID="sheet-search-retry">{tr('common.retry')}</Button>
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
          {emptyAction ? null : <Text style={dynamicStyles.emptySubText}>{tr('components.searchSheet.noMatchHint')}</Text>}
          {emptyAction ? <Button type="secondary" onPress={emptyAction.onPress} testID="sheet-empty-action">{emptyAction.label}</Button> : null}
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
            {emptyAction && !emptyActionAfterSearchOnly ? <Button type="secondary" onPress={emptyAction.onPress} testID="sheet-empty-action">{emptyAction.label}</Button> : null}
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
    emptyAction,
    emptyActionAfterSearchOnly,
    searchFailed,
    searchErrorText,
    performSearchNow,
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
      sheet.present();
      setTimeout(() => {
        focusInput(inputRef.current);
      }, 100);
    } else {
      sheet.dismiss();
    }
  }, [isVisible, recentItemsKey, loadRecentItems]);

  // Android back closes the sheet before leaving the screen (style guide 15)
  useEffect(() => {
    if (!isVisible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      sheet.dismiss();
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

  // A sheet that searches from zero letters (minQueryLength 0) lists everything as soon as it opens.
  // Only on the closed-to-open change: when the items it searches change while it is open (a refresh
  // lands while the person types), the typed query is searched again instead of being wiped.
  const wasOpen = useRef(false);
  const typedQuery = useRef(searchQuery);
  typedQuery.current = searchQuery;
  useEffect(() => {
    const opening = isVisible && !wasOpen.current;
    wasOpen.current = isVisible;
    if (isVisible && minQueryLength === 0 && !currentValue?.name) void performSearchNow(opening ? '' : typedQuery.current);
  }, [isVisible, minQueryLength, currentValue, performSearchNow]);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      onDismiss={sheet.onDismissed}
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
            onPress={() => sheet.dismiss()}
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
            onChangeText={handleTextChange}
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
          {searchQuery.length > 0 && (
            <Pressable
              style={styles.clearButton}
              onPress={() => {
                clearSearch();
                // A sheet that lists everything with nothing typed lists it again.
                if (minQueryLength === 0) void performSearchNow('');
                focusInput(inputRef.current);
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
          data={resultLimit ? results.slice(0, resultLimit) : results}
          renderItem={wrappedRenderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.listContent, { paddingBottom: space.xl + insets.bottom }]}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={ListEmptyComponent}
          ListFooterComponent={
            resultLimit && limitText && results.length > resultLimit ? (
              <Text style={[dynamicStyles.emptySubText, { paddingTop: space.md }]} accessibilityLiveRegion="polite">{limitText}</Text>
            ) : undefined
          }
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
    letterSpacing: trackedText(0.5),
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
