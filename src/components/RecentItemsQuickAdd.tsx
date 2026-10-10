import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Pressable,
  Text,
  ActivityIndicator,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
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
import { RecentItemsService, RecentItem } from '@/services/recent-items-service';
import { t as tr } from '@/i18n';

/**
 * Minimal item interface for quick add display
 * Works with both GRNItem (item_name) and RecentItem (name) through mapping
 */
export interface QuickAddItem {
  id: string;
  name: string;
}

interface RecentItemsQuickAddProps {
  customerId: string;
  onItemSelected: (item: QuickAddItem) => void;
  isLoading?: boolean;
  allItems?: QuickAddItem[]; // All available items to show as pills
  selectedItemName?: string; // Currently selected item name
  refreshTrigger?: number; // Trigger to force refresh recent items
  recentlyAddedItems?: QuickAddItem[]; // Items just added in current session
}

const RecentItemsQuickAdd: React.FC<RecentItemsQuickAddProps> = ({
  customerId,
  onItemSelected,
  isLoading: externalIsLoading = false,
  allItems = [],
  selectedItemName = '',
  refreshTrigger = 0,
  recentlyAddedItems = [],
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecentItems = useCallback(async () => {
    try {
      setLoading(true);
      const items = await RecentItemsService.getRecentItemsForCustomer(customerId);
      if (__DEV__) console.log('[RecentItemsQuickAdd] Loaded items:', items.length);
      setRecentItems(items);
    } catch (error) {
      console.error('[RecentItemsQuickAdd] Error loading recent items:', error);
      setRecentItems([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadRecentItems();
  }, [loadRecentItems, refreshTrigger]);

  // Combine recently added (session), recent items (history), then all other items
  const displayItems = useMemo((): QuickAddItem[] => {
    if (__DEV__) console.log('[RecentItemsQuickAdd] 🔄 Computing displayItems...');
    if (__DEV__) console.log('[RecentItemsQuickAdd] 📥 Input recentlyAddedItems:', recentlyAddedItems.map(i => i.name));
    if (__DEV__) console.log('[RecentItemsQuickAdd] 📥 Input recentItems:', recentItems.map(i => i.name));
    if (__DEV__) console.log('[RecentItemsQuickAdd] 📥 Input allItems count:', allItems.length);

    // Filter out items with undefined/null names
    const validRecentlyAdded = recentlyAddedItems.filter(item => item.name);
    const validRecentItems = recentItems.filter(item => item.name);
    const validAllItems = allItems.filter(item => item.name);

    // Start with recently added items from current session (most recent first)
    const recentlyAddedNames = new Set(validRecentlyAdded.map(item => item.name.toLowerCase()));

    // Then add recent items from history, excluding those already in recently added
    // Map RecentItem to QuickAddItem
    const recentNames = new Set(validRecentItems.map(item => item.name.toLowerCase()));
    const recentHistoryOnly: QuickAddItem[] = validRecentItems
      .filter(item => !recentlyAddedNames.has(item.name.toLowerCase()))
      .map(item => ({ id: item.id, name: item.name }));

    // Finally add all other items, excluding those already shown
    const allShownNames = new Set([...recentlyAddedNames, ...recentNames]);
    const otherItems = validAllItems.filter(item => !allShownNames.has(item.name.toLowerCase()));

    const combined: QuickAddItem[] = [...validRecentlyAdded, ...recentHistoryOnly, ...otherItems];
    if (__DEV__) console.log('[RecentItemsQuickAdd] 📊 Display items:', {
      recentlyAddedCount: recentlyAddedItems.length,
      recentHistoryCount: recentHistoryOnly.length,
      allItemsCount: allItems.length,
      otherItemsCount: otherItems.length,
      totalDisplayItems: combined.length,
      firstFew: combined.slice(0, 5).map(i => i.name)
    });
    if (__DEV__) console.log('[RecentItemsQuickAdd] ✅ Final combined array:', combined.map(i => i.name));
    return combined;
  }, [recentlyAddedItems, recentItems, allItems]);

  // Memoized scroll event handler to prevent allocations on every render
  // Must be declared before early returns to follow React's rules of hooks
  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { x: number; y: number } } }) => {
    if (__DEV__) console.log('[RecentItemsQuickAdd] 🔄 Scroll event:', {
      x: event.nativeEvent.contentOffset.x,
      y: event.nativeEvent.contentOffset.y
    });
  }, []);

  // Memoized scroll drag handlers
  const handleScrollBeginDrag = useCallback(() => {
    if (__DEV__) console.log('[RecentItemsQuickAdd] 🖐️ Scroll begin drag');
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    if (__DEV__) console.log('[RecentItemsQuickAdd] 🖐️ Scroll end drag');
  }, []);

  // Memoized item press handler
  const handleItemPress = useCallback((item: QuickAddItem) => {
    if (__DEV__) console.log('[RecentItemsQuickAdd] 👆 Item pressed:', item.name);
    onItemSelected(item);
  }, [onItemSelected]);

  // Memoized renderItem for chip list
  const renderChipItem = useCallback((item: QuickAddItem, index: number) => {
    const isSelected = (item.name || '').toLowerCase() === (selectedItemName || '').toLowerCase();
    // Use index + id for unique key since same item can appear from different sources
    const uniqueKey = `${index}-${item.id || item.name}`;
    return (
      <Pressable
        key={uniqueKey}
        style={({ pressed }) => [
          styles.itemChip,
          (pressed || isSelected) && styles.itemChipActive,
        ]}
        onPress={() => handleItemPress(item)}
        hitSlop={CHIP_HIT_SLOP}
        accessibilityLabel={tr('orders.quickAdd.select', { name: item.name })}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
      >
        {isSelected && <Icon name="check" size={iconSize.sm} color={t.brand.tint} />}
        <Text
          style={[styles.itemName, isSelected && styles.itemNameSelected]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.6}
        >
          {item.name}
        </Text>
      </Pressable>
    );
  }, [selectedItemName, styles, t, handleItemPress]);

  // Early returns after all hooks are declared
  if (loading || externalIsLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={t.brand.tint} accessibilityLabel={tr('orders.quickAdd.loadingRecent')} />
      </View>
    );
  }

  if (displayItems.length === 0) {
    return null; // Don't show if no items
  }

  if (__DEV__) console.log('[RecentItemsQuickAdd] 🔄 Rendering component with', displayItems.length, 'items');

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={true}
        waitFor={undefined}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
      >
        {displayItems.map(renderChipItem)}
      </ScrollView>
    </View>
  );
};

// =========================================================================
// Quick-add tiles (style guide §13.13): brand.subtle with brand.tint text
// =========================================================================
const CHIP_HEIGHT = 32;
// Pads the 32 px chip to the 44/48 touch target.
const CHIP_HIT_SLOP = {
  top: (touchTarget - CHIP_HEIGHT) / 2,
  bottom: (touchTarget - CHIP_HEIGHT) / 2,
  left: 0,
  right: 0,
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
    backgroundColor: t.surface.card,
  },
  scrollContent: {
    paddingHorizontal: layout.marginCompact,
    gap: space.sm,
  },
  itemChip: {
    flexDirection: 'row' as const,
    gap: space.xs,
    minHeight: CHIP_HEIGHT,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.s6,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.brand.subtle,
  },
  // Pressed and selected: the stronger subtle; selection also gets a check
  itemChipActive: {
    backgroundColor: t.brand.subtleStrong,
  },
  itemName: {
    ...typography.footnote,
    fontWeight: fontWeight.medium,
    color: t.brand.tint,
  },
  itemNameSelected: {
    fontWeight: fontWeight.semibold,
  },
});

export default RecentItemsQuickAdd;
