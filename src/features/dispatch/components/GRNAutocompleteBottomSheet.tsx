/**
 * GRN Autocomplete Bottom Sheet
 * Searchable bottom sheet for selecting GRN numbers
 * Used in dispatch form Step 2
 *
 * Bottom sheet per docs/STYLE_GUIDE.md §13.9 (searchable sheet: search field
 * stays visible, scrim behind, Android back closes):
 * - Tap to select GRN
 * - Swipe left to view GRN details
 *
 * Performance optimizations:
 * - CustomKeyboard: Memoized component with local state (prevents parent re-render on keystroke)
 * - GRNListItem: Memoized component (prevents item re-render when list unchanged)
 * - FlatList: Virtualized list (only renders visible items)
 */

import React, { useCallback, useMemo, useRef, useState, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Modal,
  FlatList,
  Pressable,
  Dimensions,
} from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
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
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { searchGRNNumbers, getGRNPrefixesWithStock, getCustomerGRNsWithStock, type GRNPrefixWithStock } from '../services/grnDetailService';
import type { GRNAutocompleteItem } from '@/types/dispatch.types';
import { formatCount, formatDate } from '@/utils/formatters';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Fixed row height, used by getItemLayout. */
const GRN_ROW_HEIGHT = 100;

interface GRNAutocompleteBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onSelect: (grn: GRNAutocompleteItem) => void;
  currentValue?: {
    id: string;
    gr_no: string;
  };
  customerId?: string; // Optional filter by customer
}

const makeStyles = (t: ThemeTokens) => ({
  // Sheet
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end' as const,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: t.overlay.scrim,
  },
  sheetContainer: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    maxHeight: SCREEN_HEIGHT,
    flex: 1,
    ...t.shadow[4],
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingLeft: layout.marginCompact,
    paddingRight: space.xs,
    paddingBottom: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
    gap: space.sm,
  },
  headerTitle: {
    ...typography.headline,
    flex: 1,
    color: t.text.primary,
  },
  closeButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.pill,
  },
  closeButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  hintContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.s6,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  hintText: {
    ...typography.footnote,
    flex: 1,
    color: t.text.secondary,
  },
  resultsCountContainer: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  resultsCount: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: t.text.secondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: space.max,
    paddingHorizontal: space.huge,
  },
  emptyText: {
    ...typography.title3,
    color: t.text.primary,
    marginTop: space.lg,
    textAlign: 'center' as const,
  },
  emptySubtext: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.sm,
    textAlign: 'center' as const,
  },
  scrollView: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: space.xl,
  },

  // CustomKeyboard
  searchContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginHorizontal: layout.marginCompact,
    marginVertical: space.md,
    paddingLeft: space.md,
    minHeight: touchTarget,
    backgroundColor: t.surface.field,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: t.border.field,
  },
  searchIcon: {
    marginRight: space.sm,
  },
  searchInputText: {
    ...typography.body,
    color: t.text.primary,
    fontWeight: fontWeight.semibold,
    flex: 1,
    fontVariant: ['tabular-nums' as const],
  },
  searchPlaceholder: {
    color: t.text.placeholder,
    fontWeight: fontWeight.regular,
  },
  clearButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  quickInputContainer: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    paddingHorizontal: layout.marginCompact,
    paddingBottom: space.md,
    gap: space.sm,
    justifyContent: 'center' as const,
  },
  quickInputButton: {
    minWidth: touchTarget,
    height: touchTarget,
    paddingHorizontal: space.xs,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    backgroundColor: t.surface.card,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  quickInputButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  prefixButton: {
    backgroundColor: t.brand.subtle,
    borderColor: t.brand.subtle,
  },
  prefixButtonPressed: {
    backgroundColor: t.brand.subtleStrong,
  },
  quickInputText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
  prefixText: {
    color: t.brand.tint,
  },
  prefixCount: {
    ...typography.caption2,
    color: t.brand.tint,
    fontVariant: ['tabular-nums' as const],
  },
  prefixLoadingContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    paddingVertical: space.sm,
    width: '100%' as const,
  },
  noPrefixContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.s6,
    paddingVertical: space.sm,
    width: '100%' as const,
  },
  keyboardMessage: {
    ...typography.footnote,
    color: t.text.secondary,
  },

  // GRNListItem
  grnCard: {
    height: GRN_ROW_HEIGHT,
    justifyContent: 'center' as const,
    paddingHorizontal: layout.marginCompact,
    backgroundColor: t.surface.sheet,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  grnCardLast: {
    borderBottomWidth: 0,
  },
  grnCardPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  grnCardSelected: {
    backgroundColor: t.surface.selected,
    borderLeftWidth: 4,
    borderLeftColor: t.brand.tint,
  },
  grnHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: space.sm,
  },
  grnTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  grnNumber: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  grnMeta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  metaBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    backgroundColor: t.status.neutral.background,
    borderRadius: radius.field,
    flexShrink: 1,
  },
  metaText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.status.neutral.text,
    flexShrink: 1,
  },
  viewAction: {
    backgroundColor: t.brand.fill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    width: 80,
    height: '100%' as const,
    gap: space.xs,
  },
  viewActionPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  viewText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
});

// ============================================================================
// MEMOIZED SUB-COMPONENTS (Performance optimization)
// ============================================================================

/**
 * CustomKeyboard - Manages its own state for instant keystroke response
 * Parent component only receives debounced search queries
 */
interface CustomKeyboardProps {
  prefixes: GRNPrefixWithStock[];
  isPrefixesLoading: boolean;
  onSearch: (query: string) => void;
  onClear: () => void;
}

const CustomKeyboard = memo<CustomKeyboardProps>(({
  prefixes,
  isPrefixesLoading,
  onSearch,
  onClear,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  // Local state for instant display - no parent re-render on keystroke
  const [localQuery, setLocalQuery] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle key press with local state update (instant) + debounced parent callback
  const handleKeyPress = useCallback((char: string) => {
    const newQuery = localQuery + char;
    setLocalQuery(newQuery);

    // Debounce the parent callback
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      onSearch(newQuery);
    }, 150);
  }, [localQuery, onSearch]);

  // Handle prefix tap (replaces entire query)
  const handlePrefixTap = useCallback((prefix: string) => {
    setLocalQuery(prefix);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      onSearch(prefix);
    }, 150);
  }, [onSearch]);

  // Handle backspace
  const handleBackspace = useCallback(() => {
    const newQuery = localQuery.slice(0, -1);
    setLocalQuery(newQuery);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      onSearch(newQuery);
    }, 150);
  }, [localQuery, onSearch]);

  // Handle clear
  const handleClear = useCallback(() => {
    setLocalQuery('');
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    onClear();
  }, [onClear]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Reset local query when component remounts (modal reopens)
  useEffect(() => {
    setLocalQuery('');
  }, []);


  return (
    <>
      {/* Search Input Display */}
      <View
        style={styles.searchContainer}
        accessible
        accessibilityRole="search"
        accessibilityLabel={localQuery.length > 0 ? `Search GRN number, ${localQuery}` : 'Search GRN number, empty'}
      >
        <Icon
          name="magnify"
          size={iconSize.md}
          color={t.icon.secondary}
          style={styles.searchIcon}
        />
        <Text
          style={[
            styles.searchInputText,
            localQuery.length === 0 && styles.searchPlaceholder,
          ]}
        >
          {localQuery.length > 0 ? localQuery : 'Search GRN number'}
        </Text>
        {localQuery.length > 0 && (
          <Pressable
            onPress={handleClear}
            style={styles.clearButton}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
          </Pressable>
        )}
      </View>

      {/* Quick Input Keyboard */}
      <View style={styles.quickInputContainer}>
        {isPrefixesLoading ? (
          <View style={styles.prefixLoadingContainer}>
            <ActivityIndicator size="small" color={t.brand.tint} />
            <Text style={styles.keyboardMessage}>Loading GRN prefixes…</Text>
          </View>
        ) : prefixes.length > 0 ? (
          <>
            {prefixes.map((prefixItem) => (
              <Pressable
                key={prefixItem.prefix}
                accessibilityRole="button"
                accessibilityLabel={`Use GRN prefix ${prefixItem.prefix}, ${prefixItem.grnCount} GRNs`}
                style={({ pressed }) => [
                  styles.quickInputButton,
                  styles.prefixButton,
                  pressed && styles.prefixButtonPressed,
                ]}
                onPress={() => handlePrefixTap(prefixItem.prefix)}
              >
                <Text style={[styles.quickInputText, styles.prefixText]}>{prefixItem.prefix}</Text>
                <Text style={styles.prefixCount} maxFontSizeMultiplier={1.6}>{prefixItem.grnCount}</Text>
              </Pressable>
            ))}
            {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((char) => (
              <Pressable
                key={char}
                accessibilityRole="button"
                accessibilityLabel={`Enter GRN digit ${char}`}
                style={({ pressed }) => [styles.quickInputButton, pressed && styles.quickInputButtonPressed]}
                onPress={() => handleKeyPress(char)}
              >
                <Text style={styles.quickInputText}>{char}</Text>
              </Pressable>
            ))}
          </>
        ) : (
          <View style={styles.noPrefixContainer}>
            <Icon name="information" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.keyboardMessage}>No GRNs have stock left.</Text>
          </View>
        )}
        <Pressable
          style={({ pressed }) => [styles.quickInputButton, pressed && styles.quickInputButtonPressed]}
          onPress={handleBackspace}
          accessibilityRole="button"
          accessibilityLabel="Delete last character"
        >
          <Icon name="backspace-outline" size={iconSize.md} color={t.icon.primary} />
        </Pressable>
      </View>
    </>
  );
});

CustomKeyboard.displayName = 'CustomKeyboard';

/**
 * GRNListItem - Memoized list item for virtualized FlatList
 */
interface GRNListItemProps {
  item: GRNAutocompleteItem;
  isSelected: boolean;
  isLast: boolean;
  onSelect: (grn: GRNAutocompleteItem) => void;
  onViewDetails: (grn: GRNAutocompleteItem) => void;
}

const GRNListItem = memo<GRNListItemProps>(({
  item,
  isSelected,
  isLast,
  onSelect,
  onViewDetails,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const grnDate = useMemo(() => formatDate(item.date, 'short'), [item.date]);

  const handlePress = useCallback(() => onSelect(item), [item, onSelect]);
  const handleViewDetails = useCallback(() => onViewDetails(item), [item, onViewDetails]);

  const renderRightActions = useCallback(() => (
    <Pressable
      style={({ pressed }) => [styles.viewAction, pressed && styles.viewActionPressed]}
      onPress={handleViewDetails}
      accessibilityRole="button"
      accessibilityLabel={`View GRN ${item.gr_no}`}
    >
      <Icon name="eye-outline" size={iconSize.lg} color={t.brand.onFill} />
      <Text style={styles.viewText}>View</Text>
    </Pressable>
  ), [styles, t, handleViewDetails, item.gr_no]);

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
    >
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.grnCard,
          isLast && styles.grnCardLast,
          pressed && styles.grnCardPressed,
          isSelected && styles.grnCardSelected,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`GRN ${item.gr_no}, ${grnDate}, ${item.customer_name}`}
        accessibilityState={{ selected: isSelected }}
        accessibilityActions={[{ name: 'viewGRN', label: 'View GRN' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'viewGRN') handleViewDetails();
        }}
      >
        <View style={styles.grnHeader}>
          <View style={styles.grnTitleRow}>
            <Icon name="package-down" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.grnNumber}>GRN {item.gr_no}</Text>
          </View>
          {isSelected && (
            <Icon name="check-circle" size={iconSize.lg} color={t.brand.tint} />
          )}
        </View>

        <View style={styles.grnMeta}>
          <View style={styles.metaBadge}>
            <Icon name="calendar-outline" size={iconSize.sm} color={t.status.neutral.text} />
            <Text style={styles.metaText} maxFontSizeMultiplier={1.6}>{grnDate}</Text>
          </View>
          <View style={styles.metaBadge}>
            <Icon name="account-outline" size={iconSize.sm} color={t.status.neutral.text} />
            <Text style={styles.metaText} numberOfLines={1} maxFontSizeMultiplier={1.6}>
              {item.customer_name}
            </Text>
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memo - only re-render if these change
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isLast === nextProps.isLast
  );
});

GRNListItem.displayName = 'GRNListItem';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const GRNAutocompleteBottomSheet: React.FC<GRNAutocompleteBottomSheetProps> = ({
  isVisible,
  onClose,
  onSelect,
  currentValue,
  customerId,
}) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // State - NO searchQuery state here! CustomKeyboard manages its own display state
  const [grnList, setGrnList] = useState<GRNAutocompleteItem[]>([]);
  const [defaultGrnList, setDefaultGrnList] = useState<GRNAutocompleteItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(false);
  const [prefixes, setPrefixes] = useState<GRNPrefixWithStock[]>([]);
  const [isPrefixesLoading, setIsPrefixesLoading] = useState(false);
  const [hasSearchQuery, setHasSearchQuery] = useState(false); // Track if there's a search query

  // Fetch prefixes and default GRNs when modal opens
  useEffect(() => {
    if (isVisible) {
      loadPrefixes();
      loadDefaultGRNs();
      // Reset search state when modal opens
      setHasSearchQuery(false);
      setGrnList([]);
    }
  }, [isVisible, customerId]);

  // Load default GRNs for customer
  const loadDefaultGRNs = useCallback(async () => {
    if (!customerId) {
      setDefaultGrnList([]);
      return;
    }

    setIsLoadingDefaults(true);
    try {
      const results = await getCustomerGRNsWithStock(customerId, 20, 0);
      const converted: GRNAutocompleteItem[] = results.map(item => ({
        id: item.grnId,
        gr_no: item.grNo,
        date: item.grnDate,
        customer_name: item.customerName,
      }));
      setDefaultGrnList(converted);
    } catch (error) {
      if (__DEV__) console.error('[GRNAutocompleteBottomSheet] Error loading default GRNs:', error);
      setDefaultGrnList([]);
    } finally {
      setIsLoadingDefaults(false);
    }
  }, [customerId]);

  // Load GRN prefixes with stock
  const loadPrefixes = useCallback(async () => {
    setIsPrefixesLoading(true);
    try {
      const result = await getGRNPrefixesWithStock();
      setPrefixes(result);
    } catch (error) {
      if (__DEV__) console.error('[GRNAutocompleteBottomSheet] Error loading prefixes:', error);
      setPrefixes([]);
    } finally {
      setIsPrefixesLoading(false);
    }
  }, []);

  // Handle search from CustomKeyboard - called with debounced query
  const handleSearch = useCallback(async (query: string) => {
    setHasSearchQuery(query.length > 0);

    if (query.trim().length < 1) {
      setGrnList([]);
      return;
    }

    setIsLoading(true);
    try {
      const results = await searchGRNNumbers(query);
      setGrnList(results);
    } catch (error) {
      if (__DEV__) console.error('[GRNAutocompleteBottomSheet] Search error:', error);
      setGrnList([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle clear from CustomKeyboard
  const handleClear = useCallback(() => {
    setHasSearchQuery(false);
    setGrnList([]);
  }, []);

  // Handle GRN selection
  const handleGRNSelect = useCallback((grn: GRNAutocompleteItem) => {
    onSelect(grn);
    onClose();
  }, [onSelect, onClose]);

  // Handle view GRN details
  const handleViewGRNDetails = useCallback((grn: GRNAutocompleteItem) => {
    onClose();
    router.push(`/grn-details/${grn.id}` as Href);
  }, [router, onClose]);

  // Get display list
  const displayList = useMemo(() => {
    return hasSearchQuery ? grnList : defaultGrnList;
  }, [hasSearchQuery, grnList, defaultGrnList]);

  // Handle close
  const handleClose = useCallback(() => {
    setHasSearchQuery(false);
    setGrnList([]);
    onClose();
  }, [onClose]);

  // FlatList renderItem - uses memoized GRNListItem
  const renderItem = useCallback(({ item, index }: { item: GRNAutocompleteItem; index: number }) => (
    <GRNListItem
      item={item}
      isSelected={currentValue?.id === item.id}
      isLast={index === displayList.length - 1}
      onSelect={handleGRNSelect}
      onViewDetails={handleViewGRNDetails}
    />
  ), [currentValue?.id, displayList.length, handleGRNSelect, handleViewGRNDetails]);

  // FlatList keyExtractor
  const keyExtractor = useCallback((item: GRNAutocompleteItem) => item.id, []);

  // Empty component for FlatList
  const ListEmptyComponent = useMemo(() => {
    if (isLoading || isLoadingDefaults) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.emptySubtext}>
            {isLoading ? 'Searching GRNs…' : 'Loading GRNs…'}
          </Text>
        </View>
      );
    }

    if (hasSearchQuery && grnList.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Icon name="magnify" size={iconSize.hero} color={t.icon.secondary} />
          <Text style={styles.emptyText}>No GRNs match</Text>
          <Text style={styles.emptySubtext}>Try fewer digits or another prefix.</Text>
        </View>
      );
    }

    if (defaultGrnList.length === 0 && !customerId) {
      return (
        <View style={styles.emptyContainer}>
          <Icon name="account-outline" size={iconSize.hero} color={t.icon.secondary} />
          <Text style={styles.emptyText}>No customer chosen</Text>
          <Text style={styles.emptySubtext}>
            Search by GRN number, or choose a customer in the first step.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Icon name="package-variant-closed" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyText}>No GRNs with stock</Text>
        <Text style={styles.emptySubtext}>This customer has no GRNs with stock left to dispatch.</Text>
      </View>
    );
  }, [isLoading, isLoadingDefaults, hasSearchQuery, grnList.length, defaultGrnList.length, customerId, styles, t]);

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent={true}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          {/* Backdrop */}
          <Pressable
            style={styles.backdrop}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close GRN list"
          />

          {/* Bottom Sheet Content */}
          <View style={[styles.sheetContainer, { paddingBottom: insets.bottom }]} accessibilityViewIsModal>
            {/* Header with safe area padding */}
            <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
              <Text style={styles.headerTitle} accessibilityRole="header">Choose GRN</Text>
              <Pressable
                onPress={handleClose}
                style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel="Close GRN list"
              >
                <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
              </Pressable>
            </View>

            {/* Results Count */}
            {displayList.length > 0 && (
              <View style={styles.resultsCountContainer}>
                <Text style={styles.resultsCount} accessibilityRole="header">
                  {hasSearchQuery
                    ? `${formatCount(displayList.length, 'GRN')} found`
                    : `${formatCount(displayList.length, 'GRN')} with stock`
                  }
                </Text>
              </View>
            )}

            {/* Results List - Virtualized FlatList */}
            <FlatList
              data={displayList}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              ListEmptyComponent={ListEmptyComponent}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={true}
              style={styles.scrollView}
              keyboardShouldPersistTaps="handled"
              // Performance optimizations
              removeClippedSubviews={true}
              maxToRenderPerBatch={10}
              windowSize={5}
              initialNumToRender={8}
              getItemLayout={(_, index) => ({
                length: GRN_ROW_HEIGHT,
                offset: GRN_ROW_HEIGHT * index,
                index,
              })}
            />

            {/* Hints */}
            {displayList.length > 0 && (
              <View style={styles.hintContainer}>
                <Icon name="gesture-swipe-left" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.hintText}>Tap a GRN to choose it. Swipe left to view it.</Text>
              </View>
            )}

            {/* Search field and keypad - always visible, within thumb reach */}
            <CustomKeyboard
              prefixes={prefixes}
              isPrefixesLoading={isPrefixesLoading}
              onSearch={handleSearch}
              onClear={handleClear}
            />
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};
