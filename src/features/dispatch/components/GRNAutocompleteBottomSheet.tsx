/**
 * GRN Autocomplete Bottom Sheet
 * Searchable bottom sheet for selecting GRN numbers
 * Used in dispatch form Step 2
 *
 * Styled to match ItemsSummaryBottomSheet:
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
  TouchableOpacity,
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
import theme from '@/theme';
import { useListColors, ListColors } from '@/hooks/useListColors';
import { searchGRNNumbers, getGRNPrefixesWithStock, getCustomerGRNsWithStock, type GRNPrefixWithStock, type CustomerGRNWithStock } from '../services/grnDetailService';
import type { GRNAutocompleteItem } from '@/types/dispatch.types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  colorValues: {
    primary: string;
    textSecondary: string;
    textTertiary: string;
    gray50: string;
    gray100: string;
    gray200: string;
    orangeLight: string;
    blueLight: string;
  };
}

const CustomKeyboard = memo<CustomKeyboardProps>(({
  prefixes,
  isPrefixesLoading,
  onSearch,
  onClear,
  colorValues,
}) => {
  // Local state for instant display - no parent re-render on keystroke
  const [localQuery, setLocalQuery] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Stable styles
  const keyboardStyles = useMemo(() => ({
    quickInputButton: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: colorValues.gray100,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    backspaceButton: {
      backgroundColor: colorValues.orangeLight,
    },
    numericButton: {
      backgroundColor: colorValues.blueLight,
    },
    quickInputText: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: colorValues.textSecondary,
    },
    prefixCount: {
      fontSize: 8,
      fontWeight: '600' as const,
      color: colorValues.primary,
      position: 'absolute' as const,
      top: 2,
      right: 4,
    },
    searchContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginHorizontal: 20,
      marginVertical: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: colorValues.gray50,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colorValues.gray200,
    },
    searchInputText: {
      fontSize: 16,
      color: colorValues.textSecondary,
      fontWeight: '600' as const,
      flex: 1,
    },
    searchPlaceholder: {
      color: colorValues.textTertiary,
      fontWeight: '400' as const,
    },
  }), [colorValues]);

  return (
    <>
      {/* Search Input Display */}
      <View style={keyboardStyles.searchContainer}>
        <Icon
          name="magnify"
          size={20}
          color={colorValues.textTertiary}
          style={styles.searchIcon}
        />
        <Text
          style={[
            keyboardStyles.searchInputText,
            localQuery.length === 0 && keyboardStyles.searchPlaceholder,
          ]}
        >
          {localQuery.length > 0 ? localQuery : 'Search GR No...'}
        </Text>
        {localQuery.length > 0 && (
          <TouchableOpacity
            onPress={handleClear}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="close-circle" size={20} color={colorValues.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Quick Input Keyboard */}
      <View style={styles.quickInputContainer}>
        {isPrefixesLoading ? (
          <View style={styles.prefixLoadingContainer}>
            <ActivityIndicator size="small" color={colorValues.primary} />
            <Text style={{ fontSize: 13, color: colorValues.textSecondary }}>Loading prefixes...</Text>
          </View>
        ) : prefixes.length > 0 ? (
          <>
            {prefixes.map((prefixItem) => (
              <TouchableOpacity
                key={prefixItem.prefix}
                style={keyboardStyles.quickInputButton}
                onPress={() => handlePrefixTap(prefixItem.prefix)}
                activeOpacity={0.7}
              >
                <Text style={keyboardStyles.quickInputText}>{prefixItem.prefix}</Text>
                <Text style={keyboardStyles.prefixCount}>{prefixItem.grnCount}</Text>
              </TouchableOpacity>
            ))}
            {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((char) => (
              <TouchableOpacity
                key={char}
                style={[keyboardStyles.quickInputButton, keyboardStyles.numericButton]}
                onPress={() => handleKeyPress(char)}
                activeOpacity={0.7}
              >
                <Text style={keyboardStyles.quickInputText}>{char}</Text>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <View style={styles.noPrefixContainer}>
            <Icon name="alert-circle-outline" size={16} color={colorValues.textTertiary} />
            <Text style={{ fontSize: 13, color: colorValues.textSecondary }}>No GRNs with stock available</Text>
          </View>
        )}
        <TouchableOpacity
          style={[keyboardStyles.quickInputButton, keyboardStyles.backspaceButton]}
          onPress={handleBackspace}
          activeOpacity={0.7}
        >
          <Icon name="backspace" size={18} color={colorValues.textSecondary} />
        </TouchableOpacity>
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
  colorValues: {
    primary: string;
    primaryLight: string;
    blue: string;
    white: string;
    success: string;
    textSecondary: string;
    cellBackground: string;
    cellDivider: string;
    gray100: string;
  };
}

const GRNListItem = memo<GRNListItemProps>(({
  item,
  isSelected,
  isLast,
  onSelect,
  onViewDetails,
  colorValues,
}) => {
  const grnDate = useMemo(() =>
    new Date(item.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }), [item.date]);

  const itemStyles = useMemo(() => ({
    grnCard: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: colorValues.cellBackground,
      borderBottomWidth: isLast ? 0 : 1,
      borderBottomColor: colorValues.cellDivider,
      ...(isSelected && {
        backgroundColor: colorValues.primaryLight,
        borderLeftWidth: 4,
        borderLeftColor: colorValues.primary,
      }),
    },
    grnNumberBadge: {
      backgroundColor: isSelected ? colorValues.blue : colorValues.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
    },
    grnNumber: {
      fontSize: 16,
      fontWeight: '700' as const,
      color: colorValues.white,
      letterSpacing: 0.5,
    },
    metaBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: colorValues.gray100,
      borderRadius: 6,
    },
    metaText: {
      fontSize: 11,
      fontWeight: '500' as const,
      color: colorValues.textSecondary,
    },
    detailText: {
      fontSize: 13,
      color: colorValues.textSecondary,
    },
    viewAction: {
      backgroundColor: colorValues.blue,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      width: 80,
      height: '100%' as const,
      gap: 4,
    },
    viewText: {
      fontSize: 12,
      fontWeight: '600' as const,
      color: colorValues.white,
    },
  }), [colorValues, isSelected, isLast]);

  const handlePress = useCallback(() => onSelect(item), [item, onSelect]);
  const handleViewDetails = useCallback(() => onViewDetails(item), [item, onViewDetails]);

  const renderRightActions = useCallback(() => (
    <TouchableOpacity
      style={itemStyles.viewAction}
      onPress={handleViewDetails}
      activeOpacity={0.7}
    >
      <Icon name="eye" size={24} color={colorValues.white} />
      <Text style={itemStyles.viewText}>View</Text>
    </TouchableOpacity>
  ), [itemStyles, handleViewDetails, colorValues.white]);

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
    >
      <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
        <View style={itemStyles.grnCard}>
          <View style={styles.grnHeader}>
            <View style={itemStyles.grnNumberBadge}>
              <Text style={itemStyles.grnNumber}>{item.gr_no}</Text>
            </View>
            {isSelected && (
              <Icon name="check-circle" size={22} color={colorValues.primary} />
            )}
          </View>

          <View style={styles.grnMeta}>
            <View style={itemStyles.metaBadge}>
              <Icon name="calendar" size={12} color={colorValues.blue} />
              <Text style={itemStyles.metaText}>{grnDate}</Text>
            </View>
            <View style={itemStyles.metaBadge}>
              <Icon name="account" size={12} color={colorValues.success} />
              <Text style={itemStyles.metaText} numberOfLines={1}>
                {item.customer_name}
              </Text>
            </View>
          </View>

          <View style={styles.grnDetails}>
            <View style={styles.detailRow}>
              <Icon name="arrow-right-bold" size={14} color={colorValues.textSecondary} />
              <Text style={itemStyles.detailText}>Tap to select</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
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

  // State - NO searchQuery state here! CustomKeyboard manages its own display state
  const [grnList, setGrnList] = useState<GRNAutocompleteItem[]>([]);
  const [defaultGrnList, setDefaultGrnList] = useState<GRNAutocompleteItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(false);
  const [prefixes, setPrefixes] = useState<GRNPrefixWithStock[]>([]);
  const [isPrefixesLoading, setIsPrefixesLoading] = useState(false);
  const [hasSearchQuery, setHasSearchQuery] = useState(false); // Track if there's a search query

  // Theme colors for dark mode support
  const colors = useListColors();

  // Extract primitive color values for stable memoization
  // This prevents dynamicStyles from being recreated on every render
  const colorValues = useMemo(() => ({
    cellBackground: colors.cellBackground,
    cellDivider: colors.cellDivider,
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textTertiary: colors.textTertiary,
    gray50: colors.gray50,
    gray100: colors.gray100,
    gray200: colors.gray200,
    gray300: colors.gray300,
    orangeLight: colors.orangeLight,
    blueLight: colors.blueLight,
    primary: colors.primary,
    primaryLight: colors.primaryLight,
    blue: colors.blue,
    white: colors.white,
    success: colors.success,
  }), [
    colors.cellBackground,
    colors.cellDivider,
    colors.textPrimary,
    colors.textSecondary,
    colors.textTertiary,
    colors.gray50,
    colors.gray100,
    colors.gray200,
    colors.gray300,
    colors.orangeLight,
    colors.blueLight,
    colors.primary,
    colors.primaryLight,
    colors.blue,
    colors.white,
    colors.success,
  ]);

  // Keyboard color values - subset for CustomKeyboard
  const keyboardColorValues = useMemo(() => ({
    primary: colorValues.primary,
    textSecondary: colorValues.textSecondary,
    textTertiary: colorValues.textTertiary,
    gray50: colorValues.gray50,
    gray100: colorValues.gray100,
    gray200: colorValues.gray200,
    orangeLight: colorValues.orangeLight,
    blueLight: colorValues.blueLight,
  }), [colorValues]);

  // List item color values - subset for GRNListItem
  const listItemColorValues = useMemo(() => ({
    primary: colorValues.primary,
    primaryLight: colorValues.primaryLight,
    blue: colorValues.blue,
    white: colorValues.white,
    success: colorValues.success,
    textSecondary: colorValues.textSecondary,
    cellBackground: colorValues.cellBackground,
    cellDivider: colorValues.cellDivider,
    gray100: colorValues.gray100,
  }), [colorValues]);

  // Dynamic styles - only for main component elements (header, container, hints, etc.)
  const dynamicStyles = useMemo(() => ({
    sheetContainer: {
      backgroundColor: colorValues.cellBackground,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: SCREEN_HEIGHT,
      flex: 1,
    },
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colorValues.cellDivider,
      gap: 12,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '600' as const,
      color: colorValues.textPrimary,
    },
    hintContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: 20,
      paddingVertical: 8,
      backgroundColor: colorValues.blueLight,
    },
    hintText: {
      fontSize: 12,
      color: colorValues.textSecondary,
    },
    resultsCountContainer: {
      paddingHorizontal: 20,
      paddingVertical: 8,
      backgroundColor: colorValues.gray50,
      borderBottomWidth: 1,
      borderBottomColor: colorValues.cellDivider,
    },
    resultsCount: {
      fontSize: 13,
      fontWeight: '500' as const,
      color: colorValues.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      paddingVertical: 60,
      paddingHorizontal: 40,
    },
    emptyText: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: colorValues.textSecondary,
      marginTop: 16,
      textAlign: 'center' as const,
    },
    emptySubtext: {
      fontSize: 14,
      color: colorValues.textTertiary,
      marginTop: 8,
      textAlign: 'center' as const,
    },
  }), [colorValues]);

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
      colorValues={listItemColorValues}
    />
  ), [currentValue?.id, displayList.length, handleGRNSelect, handleViewGRNDetails, listItemColorValues]);

  // FlatList keyExtractor
  const keyExtractor = useCallback((item: GRNAutocompleteItem) => item.id, []);

  // Empty component for FlatList
  const ListEmptyComponent = useMemo(() => {
    if (isLoading || isLoadingDefaults) {
      return (
        <View style={dynamicStyles.emptyContainer}>
          <ActivityIndicator size="large" color={colorValues.primary} />
          <Text style={dynamicStyles.emptyText}>
            {isLoading ? 'Searching GRNs...' : 'Loading GRNs...'}
          </Text>
        </View>
      );
    }

    if (hasSearchQuery && grnList.length === 0) {
      return (
        <View style={dynamicStyles.emptyContainer}>
          <Icon name="package-variant-closed" size={48} color={colorValues.gray300} />
          <Text style={dynamicStyles.emptyText}>No GRNs found</Text>
          <Text style={dynamicStyles.emptySubtext}>Try a different search term</Text>
        </View>
      );
    }

    if (defaultGrnList.length === 0 && !customerId) {
      return (
        <View style={dynamicStyles.emptyContainer}>
          <Icon name="account-alert" size={48} color={colorValues.gray300} />
          <Text style={dynamicStyles.emptyText}>No customer selected</Text>
          <Text style={dynamicStyles.emptySubtext}>Select a customer in the Info step first</Text>
        </View>
      );
    }

    return (
      <View style={dynamicStyles.emptyContainer}>
        <Icon name="package-variant-closed" size={48} color={colorValues.gray300} />
        <Text style={dynamicStyles.emptyText}>No GRNs with stock</Text>
        <Text style={dynamicStyles.emptySubtext}>This customer has no GRNs with available stock</Text>
      </View>
    );
  }, [isLoading, isLoadingDefaults, hasSearchQuery, grnList.length, defaultGrnList.length, customerId, dynamicStyles, colorValues]);

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
          <Pressable style={styles.backdrop} onPress={handleClose} />

        {/* Bottom Sheet Content */}
        <View style={[dynamicStyles.sheetContainer, { paddingBottom: insets.bottom }]}>
          {/* Header with safe area padding */}
          <View style={[dynamicStyles.header, { paddingTop: insets.top + 16 }]}>
            <Icon name="clipboard-text" size={24} color={colorValues.primary} />
            <Text style={dynamicStyles.headerTitle}>Select GRN</Text>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close" size={24} color={colorValues.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Results Count */}
          {displayList.length > 0 && (
            <View style={dynamicStyles.resultsCountContainer}>
              <Text style={dynamicStyles.resultsCount}>
                {hasSearchQuery
                  ? `${displayList.length} GRN${displayList.length !== 1 ? 's' : ''} found`
                  : `${displayList.length} GRN${displayList.length !== 1 ? 's' : ''} available`
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
              length: 100, // Approximate item height
              offset: 100 * index,
              index,
            })}
          />

          {/* Hints */}
          {displayList.length > 0 && (
            <View style={dynamicStyles.hintContainer}>
              <Icon name="hand-pointing-up" size={16} color={colorValues.primary} />
              <Text style={dynamicStyles.hintText}>Tap to select • </Text>
              <Icon name="gesture-swipe-left" size={16} color={colorValues.textSecondary} />
              <Text style={dynamicStyles.hintText}>Swipe left for details</Text>
            </View>
          )}

          {/* Custom Keyboard - manages its own state for instant response */}
          <CustomKeyboard
            prefixes={prefixes}
            isPrefixesLoading={isPrefixesLoading}
            onSearch={handleSearch}
            onClear={handleClear}
            colorValues={keyboardColorValues}
          />
        </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

// Static styles (layout only - colors are in dynamicStyles or sub-components)
const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  scrollView: {
    flex: 1,
  },
  // Used by CustomKeyboard
  searchIcon: {
    marginRight: 8,
  },
  quickInputContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    justifyContent: 'center',
  },
  prefixLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    width: '100%',
  },
  noPrefixContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    width: '100%',
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  // Used by GRNListItem
  grnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  grnMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  grnDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginLeft: 0,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
