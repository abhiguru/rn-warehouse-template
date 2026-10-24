/**
 * Items screen: list report (style guide §14.1).
 *
 * Object cells with a cube glyph, packaging and description, a Deactivated status
 * tag, swipe to delete, pull to refresh, infinite scroll, and loading, empty
 * and error states. Colours come from the semantic tokens. A row opens the item
 * page (app/item/[id].tsx).
 *
 * For a role that may see pricing, a strip above the list counts the active items
 * with no default rate in force today ("2 items have no rate.") and its button
 * turns on the "No rate" filter; the rows are tagged "No rate". The filter is
 * worked out on the phone: get_items cannot ask for it, so the filtered list is built
 * from the cached active items (useItemRates) that the cached rates say have no rate,
 * and the search is applied to them here. The cache is read again on focus only when
 * it is older than a few minutes, on pull to refresh, and after a deactivate or delete.
 *
 * Coming back to the list (Back from an item, Edit, or Add) does not read the list again from the first row:
 * the item that was opened is read alone and its row is changed in place (or dropped when it is gone), so the
 * rows loaded further down and the scroll position stay. Only Add reads the list again, to show the new item.
 * The search is screen state: it starts empty each time Items is opened from Settings and stays while an item is open.
 */

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useIsFocused } from 'expo-router';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { itemService } from '@/services/item-service';
import {
  ItemListItem,
  ItemFilters,
  DEFAULT_ITEM_FILTERS,
} from '@/types/item.types';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { MasterListHeader } from '@/components/common/MasterListHeader';
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

import { showAlert } from '@/utils/alert';
import { StatusTag } from '@/components/ui';
import { formatCount, formatTime } from '@/utils/formatters';
import { deleteItemFlow } from '@/features/items/deleteItemFlow';
import { showActivatedToast, showDeactivatedToast } from '@/features/items/activationToast';
import { LoadMoreErrorFooter } from '@/components/lists/ListLoadErrors';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { itemPagePath } from '@/features/item-pricing/contract';
import { itemIdsWithoutRate } from '@/features/item-pricing/noRate';
import { todayDay } from '@/features/item-pricing/rateText';
import { RateStrip } from '@/features/item-pricing/components/RateStrip';
import type { ActiveItem } from '@/types/item-pricing.types';
import { itemRatesLoadedAt, reloadItemRatesCache, useItemRates } from '@/features/item-pricing/useItemRates';
import { canOpenScreen } from '@/config/roles';
import { useAppSelector } from '@/store/hooks';
import { t as tr } from '@/i18n';
import { serverText } from '@/utils/serverText';
// =============================================================================
// TYPES
// =============================================================================

interface ListState {
  data: ItemListItem[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  filters: ItemFilters;
  offset: number;
  totalCount: number;
  error: string | null;
  /** The search the rows on screen answer (the filters' search once a load succeeds). */
  loadedSearch: string;
  /** When the rows on screen were loaded. */
  loadedAt: Date | null;
  /** A reload failed while rows were on screen: they are older than they look. */
  refreshFailed: boolean;
  /** The next page failed to load; the rows on screen stay. */
  loadMoreFailed: boolean;
}

/** The cached active items that match the search text (name, packaging or description), as list rows. */
function matchingItems(items: ActiveItem[], search: string): ItemListItem[] {
  const needle = search.trim().toLowerCase();
  return items
    .filter(item => !needle || [item.name, item.packaging, item.description].some(v => v?.toLowerCase().includes(needle)))
    .map(item => ({ id: item.id, name: item.name, packaging: item.packaging ?? undefined, description: item.description ?? undefined, active: true }));
}

// =============================================================================
// SCREEN COMPONENT
// =============================================================================

export default function ItemsScreen() {
  const isFocused = useIsFocused();
  const role = useAppSelector((s) => s.auth.userProfile?.role);
  // The strip, the tag and the filter are for the roles that may see pricing.
  const canSeeRates = canOpenScreen(role, 'itemPricing');
  const { items: rateItems, rates, status: ratesStatus, refresh: refreshRates, refreshIfStale: refreshRatesIfStale } = useItemRates();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [state, setState] = useState<ListState>({
    data: [],
    loading: true,
    refreshing: false,
    loadingMore: false,
    filters: DEFAULT_ITEM_FILTERS,
    offset: 0,
    totalCount: 0,
    error: null,
    loadedSearch: '',
    loadedAt: null,
    refreshFailed: false,
    loadMoreFailed: false,
  });
  const offline = useIsOffline();
  // The row of this item is read again when the list comes back into focus; Add reads the whole list again.
  const openedItemId = useRef<string | null>(null);
  const reloadOnFocus = useRef(false);
  // When the item was opened: a rates read after that was done by the item page, and is not repeated here.
  const openedAt = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  // The row being deleted, from the tap until Cancel or the server's answer: it is dimmed and takes no other action.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // The same, as refs: a second tap in the same moment finds the first one already taken (state is not yet updated).
  const deletingRef = useRef(false);
  const togglingRef = useRef(new Set<string>());
  // The ready cache items and when they were read, for the comparison on return from an item.
  const rateItemsRef = useRef<ActiveItem[]>([]);
  rateItemsRef.current = rateItems;
  // Counts the loads from the first row: an answer for an older search is ignored.
  const requestRef = useRef(0);

  // ===========================================================================
  // FETCH LOGIC
  // ===========================================================================

  const fetchItems = useCallback(
    async (filters: ItemFilters, offset: number = 0) => {
      const request = offset === 0 ? ++requestRef.current : requestRef.current;
      const search = filters.search ?? '';
      if (offset === 0) {
        setState((prev) => ({ ...prev, loading: true, error: null, loadMoreFailed: false }));
      } else {
        setState((prev) => ({ ...prev, loadingMore: true, loadMoreFailed: false }));
      }

      const fail = (message: string) => {
        setState((prev) => {
          // Rows for the same search stay, marked as older; rows for another search would mislead.
          const keepRows = offset === 0 ? prev.data.length > 0 && prev.loadedSearch === search : true;
          if (keepRows && prev.data.length > 0) {
            return { ...prev, loading: false, loadingMore: false, refreshFailed: offset === 0, loadMoreFailed: offset > 0 };
          }
          return { ...prev, data: [], totalCount: 0, loading: false, loadingMore: false, error: message };
        });
      };

      try {
        const response = await itemService.getItemList(filters, 20, offset);
        if (request !== requestRef.current) return;

        if (response.success) {
          setState((prev) => ({
            ...prev,
            // The next page starts at the rows held; a row that moved into it (a change elsewhere) is not shown twice.
            data: offset === 0 ? response.data : [...prev.data, ...response.data.filter((row) => !prev.data.some((held) => held.id === row.id))],
            totalCount: response.pagination?.total_count || 0,
            offset,
            loading: false,
            loadingMore: false,
            error: null,
            loadedSearch: offset === 0 ? search : prev.loadedSearch,
            loadedAt: offset === 0 ? new Date() : prev.loadedAt,
            refreshFailed: offset === 0 ? false : prev.refreshFailed,
          }));
        } else {
          fail(response.message || 'Failed to fetch items');
        }
      } catch (error) {
        if (request !== requestRef.current) return;
        fail(error instanceof Error ? error.message : 'Unknown error');
      }
    },
    []
  );

  // ===========================================================================
  // EFFECTS
  // ===========================================================================

  // The item that was opened is read alone and its row is changed in place: name, packaging, description and
  // active state. A name that has changed is also changed in the cached items the No rate list is built from.
  const refreshOpenedItem = useCallback(
    async (itemId: string) => {
      let result;
      try {
        result = await itemService.getItemById(itemId);
      } catch {
        return;
      }
      if (result.success && result.data) {
        const fresh = result.data;
        // Compared with the cached active items, which the No rate list is built from (the plain list may not hold the item).
        const cached = rateItemsRef.current.find((row) => row.id === itemId);
        setState((prev) => ({
          ...prev,
          data: prev.data.map((row) =>
            row.id === itemId
              ? { ...row, name: fresh.name, packaging: fresh.packaging ?? undefined, description: fresh.description ?? undefined, active: fresh.active ?? true }
              : row
          ),
        }));
        // The cached active items carry the name; they follow a rename or an activate / deactivate. Not read again
        // when the item page already did (its own change) after this item was opened.
        const active = fresh.active ?? true;
        const differs = cached ? !active || cached.name !== fresh.name : active;
        if (canSeeRates && differs && itemRatesLoadedAt() < openedAt.current) void reloadItemRatesCache();
      } else if (result.code === 'NOT_FOUND') {
        // Deleted (here or by someone else): the row goes.
        setState((prev) =>
          prev.data.some((row) => row.id === itemId)
            ? { ...prev, data: prev.data.filter((row) => row.id !== itemId), totalCount: Math.max(0, prev.totalCount - 1) }
            : prev
        );
        if (canSeeRates) void reloadItemRatesCache();
      }
      // A failed read leaves the row as it is; pull to refresh reads the list again.
    },
    [canSeeRates]
  );

  // Load items on initial mount; when the screen comes back into focus only the opened item's row is read.
  useEffect(() => {
    if (!isFocused) return;
    const current = stateRef.current;
    const neverLoaded = current.loadedAt === null || !!current.error;
    if (neverLoaded || reloadOnFocus.current) {
      // Coming back from Add item: the new item may have got a rate.
      if (reloadOnFocus.current && canSeeRates) void refreshRates();
      reloadOnFocus.current = false;
      // The No rate list comes from the cached items, not from get_items.
      if (!current.filters.noRate) fetchItems(current.filters, 0);
    } else if (openedItemId.current) {
      void refreshOpenedItem(openedItemId.current);
    }
    openedItemId.current = null;
    // Saves in the app merge into the rates held; read them all again only when they are old.
    if (canSeeRates) void refreshRatesIfStale();
  }, [isFocused]);

  // The active items with no default rate today, from the rates the phone holds.
  const noRateIds = useMemo(
    () => (canSeeRates && ratesStatus === 'ready' ? itemIdsWithoutRate(rateItems, rates, todayDay()) : new Set<string>()),
    [canSeeRates, ratesStatus, rateItems, rates]
  );
  const noRateFilter = canSeeRates && !!state.filters.noRate;
  const listData = useMemo(
    () => (noRateFilter ? matchingItems(rateItems.filter((item) => noRateIds.has(item.id)), state.filters.search ?? '') : state.data),
    [noRateFilter, rateItems, noRateIds, state.filters.search, state.data]
  );
  // The plain list's own load and error do not apply while the No rate list shows.
  const listLoading = !noRateFilter && state.loading;

  // ===========================================================================
  // HANDLERS
  // ===========================================================================

  const handleRefresh = useCallback(() => {
    setState((prev) => ({ ...prev, refreshing: true, offset: 0 }));
    Promise.all([
      state.filters.noRate ? Promise.resolve() : fetchItems(state.filters, 0),
      canSeeRates ? refreshRates() : Promise.resolve(),
    ]).finally(() => {
      setState((prev) => ({ ...prev, refreshing: false }));
    });
  }, [state.filters, fetchItems, canSeeRates, refreshRates]);

  const handleSearch = useCallback(
    (text: string) => {
      const filters = { ...state.filters, search: text };
      setState((prev) => ({ ...prev, filters, offset: 0 }));
      if (!filters.noRate) fetchItems(filters, 0);
    },
    [state.filters, fetchItems]
  );

  const handleEndReached = useCallback(() => {
    const hasMore =
      !state.filters.noRate && state.totalCount > state.data.length && !state.loadingMore && !state.loading && !state.loadMoreFailed;
    if (hasMore) {
      fetchItems(state.filters, state.data.length);
    }
  }, [state, fetchItems]);

  const handleOpenItem = useCallback((itemId: string) => {
    openedItemId.current = itemId;
    openedAt.current = Date.now();
    router.push(itemPagePath(itemId));
  }, []);

  // The strip's button and the empty state's: the No rate filter on or off, the search kept.
  const setNoRateFilter = useCallback(
    (on: boolean) => {
      const filters = { ...state.filters, noRate: on };
      setState((prev) => ({ ...prev, filters, offset: 0 }));
      // On, the list is the cached items; off, the plain list is read again for the search.
      if (!on) fetchItems(filters, 0);
    },
    [state.filters, fetchItems]
  );

  const handleToggleActive = useCallback(
    async (item: ItemListItem, currentActive: boolean) => {
      const itemId = item.id;
      const failTitle = currentActive ? tr('items.list.couldNotDeactivateTitle') : tr('items.list.couldNotActivateTitle');
      if (offline) {
        showAlert(failTitle, tr('items.offline.connectToSave'), [{ text: tr('common.ok') }]);
        return;
      }
      // One change per item at a time (a ref: a second tap in the same moment finds it taken).
      if (togglingRef.current.has(itemId)) return;
      togglingRef.current.add(itemId);
      try {
        const result = await itemService.toggleItemActive(itemId, !currentActive);

        if (result.success) {
          if (currentActive) showDeactivatedToast(item.name);
          else showActivatedToast(item.name, result.rateSource);
          // Update local state to reflect the change
          setState((prev) => ({
            ...prev,
            data: prev.data.map((item) =>
              item.id === itemId
                ? { ...item, active: !currentActive }
                : item
            ),
          }));
          // The strip's count and the cached items follow the change.
          if (canSeeRates) void reloadItemRatesCache();
        } else if (result.code === 'NOT_FOUND') {
          // Deleted by someone else: the row goes.
          showAlert(failTitle, tr('items.form.someoneDeleted'), [{ text: tr('common.ok') }]);
          setState((prev) => ({ ...prev, data: prev.data.filter((row) => row.id !== itemId), totalCount: Math.max(0, prev.totalCount - 1) }));
          if (canSeeRates) void reloadItemRatesCache();
        } else {
          // Show error to user
          showAlert(failTitle, serverText(result, tr('items.list.tryAgainInAMoment'), { write: true }), [{ text: tr('common.ok') }]);
        }
      } catch (error) {
        console.error('[Items] Toggle active error:', error);
        showAlert(tr('items.list.couldNotUpdateTitle'), tr('common.checkConnection'), [{ text: tr('common.ok') }]);
      } finally {
        togglingRef.current.delete(itemId);
      }
    },
    [canSeeRates, offline]
  );

  // Deactivating asks first (like customers); activating again happens straight away.
  const handleToggleActiveRequest = useCallback(
    (item: ItemListItem) => {
      if (!item.active) {
        void handleToggleActive(item, false);
        return;
      }
      // Offline: say so now, not after a question that could only end in that message.
      if (offline) {
        showAlert(tr('items.list.couldNotDeactivateTitle'), tr('items.offline.connectToSave'), [{ text: tr('common.ok') }]);
        return;
      }
      showAlert(tr('items.list.deactivateConfirmTitle', { name: item.name }), tr('items.list.deactivateConfirmMessage'), [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('items.list.deactivateItem'),
          style: 'destructive',
          onPress: () => void handleToggleActive(item, true),
        },
      ]);
    },
    [handleToggleActive, offline]
  );

  const handleAddItem = useCallback(() => {
    // The new item shows in the list when the form closes: the list is read again from the first row.
    reloadOnFocus.current = true;
    router.push('/item-form');
  }, []);

  const handleDeleteItem = useCallback(
    async (item: ItemListItem) => {
      // One delete at a time; the row is dimmed from the tap until the person cancels or the server has answered.
      if (deletingRef.current) return;
      deletingRef.current = true;
      setDeletingId(item.id);
      try {
        await deleteItemFlow(item, {
          onDeleted: () => {
            setState((prev) => ({
              ...prev,
              data: prev.data.filter((i) => i.id !== item.id),
              totalCount: Math.max(0, prev.totalCount - 1),
            }));
            if (canSeeRates) void reloadItemRatesCache();
          },
          onDeactivate: () => handleToggleActive(item, true),
          offline,
        });
      } finally {
        deletingRef.current = false;
        setDeletingId(null);
      }
    },
    [handleToggleActive, canSeeRates, offline]
  );

  // ===========================================================================
  // RENDER
  // ===========================================================================

  const renderItem = useCallback(
    ({ item }: { item: ItemListItem }) => (
      <FioriItemCard
        item={item}
        noRate={canSeeRates && item.active && noRateIds.has(item.id)}
        busy={deletingId === item.id}
        onPress={() => handleOpenItem(item.id)}
        onToggleActive={() => handleToggleActiveRequest(item)}
        onDelete={() => handleDeleteItem(item)}
      />
    ),
    [handleOpenItem, handleToggleActiveRequest, handleDeleteItem, canSeeRates, noRateIds, deletingId]
  );

  const keyExtractor = useCallback((item: ItemListItem) => item.id, []);

  const renderEmpty = useCallback(() => {
    if (listLoading || (noRateFilter && ratesStatus === 'loading')) {
      return (
        <View style={styles.emptyContainer} accessibilityRole="progressbar" accessibilityLabel={tr('items.list.loadingLabel')}>
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.emptyText}>{tr('items.list.loading')}</Text>
        </View>
      );
    }

    // A failed load is not an empty catalogue: never offer "Add item" for it.
    if (!noRateFilter && state.error) {
      return (
        <View style={styles.emptyContainer} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.emptyTitle} accessibilityRole="header">
            {tr('items.list.loadErrorTitle')}
          </Text>
          <Text style={styles.emptyText}>{tr('common.checkConnection')}</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => fetchItems(state.filters, 0)}
            accessibilityRole="button"
          >
            <Icon name="refresh" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.secondaryButtonText}>{tr('common.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    // The rates the filter needs did not load: not "every item has a rate".
    if (noRateFilter && ratesStatus === 'error') {
      return (
        <View style={styles.emptyContainer} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.emptyTitle} accessibilityRole="header">
            {tr('pricing.list.loadErrorTitle')}
          </Text>
          <Text style={styles.emptyText}>{tr('common.checkConnection')}</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => void refreshRates()}
            accessibilityRole="button"
          >
            <Icon name="refresh" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.secondaryButtonText}>{tr('common.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    // Nothing is without a rate (any more): say so and go back to all the items.
    if (noRateFilter && !state.filters.search) {
      return (
        <View style={styles.emptyContainer}>
          <Icon name="tag-outline" size={iconSize.hero} color={t.icon.secondary} />
          <Text style={styles.emptyText}>{tr('items.list.noRateNone')}</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => setNoRateFilter(false)}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>{tr('items.list.noRateShowAll')}</Text>
          </Pressable>
        </View>
      );
    }

    // A search that matches no item without a rate (the filter on): say so and offer to clear the search.
    if (noRateFilter && state.filters.search) {
      return (
        <View style={styles.emptyContainer}>
          <Icon name="magnify" size={iconSize.hero} color={t.icon.secondary} />
          <Text style={styles.emptyText}>{tr('items.list.noRateNoMatch', { search: state.filters.search })}</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => handleSearch('')}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>{tr('common.clearSearch')}</Text>
          </Pressable>
        </View>
      );
    }

    // A search with no match is not an empty catalogue: say so and offer to clear it.
    if (state.filters.search) {
      return (
        <View style={styles.emptyContainer}>
          <Icon name="magnify" size={iconSize.hero} color={t.icon.secondary} />
          <Text style={styles.emptyText}>{tr('items.list.noMatch', { search: state.filters.search })}</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => handleSearch('')}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>{tr('common.clearSearch')}</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Icon name="cube-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle} accessibilityRole="header">
          {tr('items.list.emptyTitle')}
        </Text>
        <Text style={styles.emptyText}>{tr('items.list.emptyMessage')}</Text>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={handleAddItem}
          accessibilityRole="button"
        >
          <Icon name="plus" size={iconSize.md} color={t.brand.onFill} />
          <Text style={styles.primaryButtonText}>{tr('items.list.addItem')}</Text>
        </Pressable>
      </View>
    );
  }, [listLoading, state.error, state.filters, noRateFilter, ratesStatus, refreshRates, setNoRateFilter, fetchItems, handleAddItem, handleSearch, styles, t]);

  const renderFooter = useCallback(() => {
    if (state.loadMoreFailed && !state.loadingMore) {
      return (
        <LoadMoreErrorFooter
          message={tr('items.list.loadMoreFailed')}
          retryLabel={tr('items.list.retryMore')}
          onRetry={() => fetchItems(state.filters, state.data.length)}
          testID="items-load-more-error"
        />
      );
    }
    if (!state.loadingMore) return null;

    return (
      <View style={styles.footerContainer} accessibilityRole="progressbar" accessibilityLabel={tr('items.list.loadingMoreLabel')}>
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerText}>{tr('common.loadingMore')}</Text>
      </View>
    );
  }, [state.loadingMore, state.loadMoreFailed, state.filters, state.data.length, fetchItems, styles, t]);

  return (
    <>
      {/* Fiori Navigation Bar */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: t.surface.header },
          headerShadowVisible: false,
          headerTintColor: t.brand.tint,
          headerTitleAlign: 'center',
          headerLeft: () => (
            <HeaderBackButton />
          ),
          headerTitle: () => (
            <View style={styles.titleContainer} accessible accessibilityRole="header">
              <Text style={styles.headerTitle}>{tr('common.items')}</Text>
            </View>
          ),
          headerRight: () => (
            <Pressable
              onPress={handleAddItem}
              style={styles.addButton}
              hitSlop={space.sm}
              accessibilityRole="button"
              accessibilityLabel={tr('items.list.addItem')}
            >
              <Icon name="plus" size={iconSize.lg} color={t.brand.tint} />
            </Pressable>
          ),
        }}
      />

      <View style={styles.container} testID="items-screen">
        <MasterListHeader
          listKey="items"
          search={state.filters.search ?? ''}
          onSearch={handleSearch}
          placeholder={tr('items.list.searchPlaceholder')}
          loading={listLoading}
          countText={(noRateFilter ? listData.length : state.totalCount) > 0 ? formatCount(noRateFilter ? listData.length : state.totalCount, 'item') : undefined}
          refreshError={
            state.refreshFailed
              ? {
                  message: tr('items.list.refreshFailed', { time: formatTime(state.loadedAt) }),
                  onRetry: () => fetchItems(state.filters, 0),
                }
              : undefined
          }
        />
        {canSeeRates && ratesStatus === 'ready' && noRateIds.size > 0 ? (
          <View style={styles.noRateStrip}>
            <RateStrip
              variant="warning"
              message={noRateFilter ? tr('items.list.noRateShowing') : tr('items.list.noRateStrip', { count: noRateIds.size })}
              actions={[
                noRateFilter
                  ? { label: tr('items.list.noRateShowAll'), onPress: () => setNoRateFilter(false), testID: 'no-rate-show-all' }
                  : { label: tr('items.list.noRateShow'), onPress: () => setNoRateFilter(true), testID: 'no-rate-show' },
              ]}
              testID="no-rate-strip"
            />
          </View>
        ) : null}
        <FlatList
          style={styles.flatList}
          data={listData}
          extraData={noRateIds}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            // Android: app/_layout.tsx already pads the screen by the navigation bar.
            Platform.OS === 'ios' && { paddingBottom: space.xl + insets.bottom },
            listData.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={state.refreshing}
              onRefresh={handleRefresh}
              colors={[t.brand.tint]}
              tintColor={t.brand.tint}
              progressBackgroundColor={t.surface.card}
            />
          }
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </>
  );
}

// =============================================================================
// FIORI ITEM CARD COMPONENT (Object Cell Layout)
// =============================================================================

interface FioriItemCardProps {
  item: ItemListItem;
  /** An active item with no default rate in force today (a role that may see pricing). */
  noRate: boolean;
  /** Delete is under way (counting, asking or sending): the row is dimmed and its actions do nothing. */
  busy?: boolean;
  onPress: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

function FioriItemCard({ item, noRate, busy = false, onPress, onToggleActive, onDelete }: FioriItemCardProps) {
  const swipeableRef = useRef<Swipeable | null>(null);
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const actionLabel = item.active ? tr('items.list.deactivate') : tr('items.list.activate');
  const rowLabel = [item.name, item.active ? null : tr('common.deactivated'), noRate ? tr('items.list.noRateTag') : null, item.packaging, item.description]
    .filter(Boolean)
    .join(', ');

  const handleDelete = () => {
    swipeableRef.current?.close();
    if (!busy) onDelete();
  };

  const handleToggle = () => {
    swipeableRef.current?.close();
    if (!busy) onToggleActive();
  };

  const renderRightActions = () => (
    <View style={styles.swipeActionsContainer}>
      <Pressable
        style={({ pressed }) => [
          styles.swipeAction,
          item.active ? styles.swipeDeactivate : styles.swipeActivate,
          pressed && (item.active ? styles.swipeActionPressed : styles.swipeActivatePressed),
        ]}
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={tr(item.active ? 'items.list.deactivateName' : 'items.list.activateName', { name: item.name })}
      >
        <Icon
          name={item.active ? 'archive-arrow-down-outline' : 'archive-arrow-up-outline'}
          size={iconSize.lg}
          color={item.active ? t.destructive.onFill : t.brand.onFill}
        />
        <Text
          style={[styles.swipeActionText, !item.active && styles.swipeActivateText]}
          maxFontSizeMultiplier={1.4}
        >
          {actionLabel}
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.swipeAction, pressed && styles.swipeActionPressed]}
        onPress={handleDelete}
        accessibilityRole="button"
        accessibilityLabel={tr('items.list.deleteName', { name: item.name })}
      >
        <Icon name="trash-can-outline" size={iconSize.lg} color={t.destructive.onFill} />
        <Text style={styles.swipeActionText}>{tr('common.delete')}</Text>
      </Pressable>
    </View>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
    >
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed, busy && styles.cardBusy]}
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ busy }}
        accessibilityLabel={rowLabel}
        accessibilityHint={item.active ? tr('items.list.rowHintDeactivate') : tr('items.list.rowHintActivate')}
        accessibilityActions={[
          { name: 'toggleActive', label: actionLabel },
          { name: 'delete', label: tr('common.delete') },
        ]}
        onAccessibilityAction={(event) => {
          if (busy) return;
          if (event.nativeEvent.actionName === 'toggleActive') onToggleActive();
          if (event.nativeEvent.actionName === 'delete') onDelete();
        }}
      >
        {/* Leading glyph: the same cube on every item (style guide §8); a person's avatar is not an item's */}
        <View
          style={styles.itemIcon}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Icon name="cube-outline" size={iconSize.lg} color={t.brand.tint} />
        </View>

        {/* Fiori Object Cell: Main Content */}
        <View style={styles.cardContent}>
          <Text style={[styles.headline, !item.active && styles.textInactive]} numberOfLines={2}>
            {item.name}
          </Text>
          {!item.active && <StatusTag status="neutral" label={tr('common.deactivated')} />}
          {noRate && <StatusTag status="critical" label={tr('items.list.noRateTag')} testID={`no-rate-tag-${item.id}`} />}

          {/* Subheadline - Item Details */}
          <View style={styles.attributeStack}>
            {item.packaging && (
              <Text style={styles.attributeText}>{item.packaging}</Text>
            )}
            {item.description && (
              <View style={styles.attributeRow}>
                <Icon name="text-box-outline" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.attributeText} numberOfLines={1}>
                  {item.description}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Fiori Object Cell: Chevron */}
        <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
      </Pressable>
    </Swipeable>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  // The strip of items with no rate, between the search and the list.
  noRateStrip: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.sm,
  },
  listContent: {
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  // The list fills the space under the search field, so the empty state has a box to centre in.
  flatList: {
    flex: 1,
  },
  listContentEmpty: {
    flexGrow: 1,
  },

  // Header
  titleContainer: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerTitle: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  addButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // Object cell
  card: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: radius.card,
    padding: space.lg,
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    minHeight: layout.objectCellMinHeight,
    backgroundColor: t.surface.card,
    ...t.shadow[2],
  },
  // While Delete counts where the item is used (the row is not tappable).
  cardBusy: {
    opacity: 0.5,
  },
  cardPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  itemIcon: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtle,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: space.md,
  },
  cardContent: {
    flex: 1,
    marginRight: space.sm,
    gap: space.xs,
  },
  headline: {
    ...typography.headline,
    color: t.text.primary,
  },
  textInactive: {
    color: t.text.secondary,
  },
  attributeStack: {
    gap: space.xs,
  },
  attributeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  attributeText: {
    ...typography.subhead,
    color: t.text.secondary,
    flex: 1,
  },

  // Empty / error / loading states
  emptyContainer: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.xxl,
    paddingVertical: space.giant,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginTop: space.sm,
  },
  emptyText: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.md,
  },
  primaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: touchTarget,
    borderRadius: radius.button,
    paddingHorizontal: space.xl,
    gap: space.sm,
    backgroundColor: t.brand.fill,
  },
  primaryButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  primaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  secondaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: touchTarget,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  secondaryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  secondaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },

  // Footer
  footerContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.lg,
    gap: space.sm,
  },
  footerText: {
    ...typography.footnote,
    color: t.text.secondary,
  },

  // Swipe Actions
  swipeActionsContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingRight: layout.marginCompact,
    paddingLeft: space.sm,
    marginBottom: space.sm,
    gap: space.sm,
  },
  swipeAction: {
    minWidth: 72,
    height: '100%' as const,
    minHeight: layout.objectCellMinHeight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.sm,
    borderRadius: radius.card,
    gap: space.xs,
    backgroundColor: t.destructive.fill,
  },
  swipeDeactivate: {
    backgroundColor: t.destructive.fill,
  },
  swipeActivate: {
    backgroundColor: t.brand.fill,
  },
  swipeActivatePressed: {
    backgroundColor: t.brand.fillPressed,
  },
  swipeActivateText: {
    color: t.brand.onFill,
  },
  swipeActionPressed: {
    backgroundColor: t.destructive.fillPressed,
  },
  swipeActionText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.destructive.onFill,
  },
});
