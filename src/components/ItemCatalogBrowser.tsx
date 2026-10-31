import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
  Platform,
  Animated,
} from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
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
  singleLineText,
} from '@/theme/tokens';
import { formatCount, formatDate, formatNumber, formatWeightEach } from '@/utils/formatters';
import { StatusTag } from '@/components/ui';
import { OrderService } from '@/services/order-service';
import { StockService } from '@/services/stock-service';
import { SessionRecentItemsService } from '@/services/session-recent-items-service';
import { GRNItem, Catalog, EnhancedSearchFilters, SearchMetadata } from '@/types/order.types';
import RecentItemsQuickAdd, { QuickAddItem } from './RecentItemsQuickAdd';

import { askAlert, showAlert, type AlertChoice } from '@/utils/alert';
import { localizeDigits, normalizeDigits, t as tr, formatIdentifier } from '@/i18n';
import { useModalSheet } from '@/hooks/useModalSheet';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import {
  applyResults,
  changesOf,
  seedDraft,
  withQuantity,
  withoutReasons,
  type AddItemsOptions,
  type PickerChange,
  type PickerChecking,
  type PickerDraft,
  type PickerLine,
  type PickerResult,
} from '@/features/orders/pickerDraft';
type StockStatus = 'positive' | 'critical' | 'negative';

// Status words and icons per guide §3.5 (stock level: low stock is critical).
const stockLabel = (status: StockStatus): string =>
  status === 'negative' ? tr('common.outOfStock') : status === 'critical' ? tr('common.lowStock') : tr('common.inStock');
const formatBags = (n: number) => formatCount(n, 'bag');

/** The answers of the "leaving with unsaved changes" question. */
type UnsavedAnswer = 'add' | 'keep' | 'discard';

/** The answers of the question asked when the picker is left while a lot's answer is being checked. */
type CheckingLeaveAnswer = 'wait' | 'leave';

/**
 * What names a lot, in one place for the spoken label of a row and the lines of the
 * leave question: name, package mark, GRN number and the weight of one package.
 */
const lotParts = (item: GRNItem): string[] =>
  [
    item.name,
    item.package_mark ? tr('orders.catalog.rowMark', { mark: item.package_mark }) : null,
    item.grn_number ? tr('orders.catalog.grn', { number: formatIdentifier(item.grn_number) }) : null,
    formatWeightEach(item.weight),
  ].filter((part): part is string => Boolean(part));

/** A lot as the leave question names it: the parts of the row's name, set apart by dots. */
const lotLabel = (item: GRNItem): string => lotParts(item).join(' \u00B7 ');

/** What Add would do to one lot: put it on the order, change its bags, or take it off. */
const changeLine = (draft: PickerDraft, change: PickerChange): string => {
  const item = draft.selection.get(change.grnItemId)?.item ?? draft.base.get(change.grnItemId)?.item;
  const lot = item ? lotLabel(item) : '';
  if (change.quantity === 0) return tr('orders.catalog.changeRemove', { lot, count: change.expected });
  if (change.expected === 0) return tr('orders.catalog.changeAdd', { lot, count: change.quantity });
  return tr('orders.catalog.changeSet', { lot, from: change.expected, count: change.quantity });
};

/**
 * The text of the question: how many lots changed, then every change on its own line,
 * removals first, then changed quantities, then lots new to the order. When Add is not
 * offered it says what Discard does and where the lots can be taken off instead.
 */
const unsavedMessage = (draft: PickerDraft, changes: PickerChange[], canAdd: boolean): string => {
  const removals = changes.filter(change => change.quantity === 0);
  const additions = changes.filter(change => change.quantity !== 0 && change.expected === 0);
  const edits = changes.filter(change => change.quantity !== 0 && change.expected !== 0);
  const lines = [...removals, ...edits, ...additions].map(change => `\u2022 ${changeLine(draft, change)}`);
  const parts = [tr('orders.catalog.discardMessage', { count: changes.length }), lines.join('\n')];
  if (!canAdd) parts.push(tr('orders.catalog.discardOnlyNote'));
  return parts.join('\n\n');
};

/**
 * The Add items picker of one order. Mount it once per opening (OrderManagement
 * renders it only while it is shown): what the user chooses is seeded from the
 * saved lines when it mounts and then belongs to the user until it is added or
 * discarded. It is kept in memory only.
 */
interface ItemCatalogBrowserProps {
  isVisible: boolean;
  onClose: () => void;
  /**
   * Saves what the user changed (quantity 0 = take the lot off the order) and
   * answers for each lot. Must not reject. `onProgress` reports the lot being
   * saved, counted from 1. When a lot's answer is lost the save locks that lot, waits
   * for the server and reads the order again: `options.onChecking` names the lot
   * meanwhile (`null` when the check is over), and `options.signal` is aborted when
   * the person leaves the picker through X while it runs.
   */
  onAddItems: (
    changes: PickerChange[],
    onProgress: (position: number, total: number) => void,
    options?: AddItemsOptions
  ) => Promise<PickerResult[]>;
  /** The phone has no network (passed by OrderManagement): a lot being checked then adds "Waiting for the connection…". */
  offline?: boolean;
  /** Passed by OrderManagement; not read by the browser. */
  currentOrderId?: string;
  customerId: string;
  /**
   * The order's saved open lines. Read once, when the picker mounts, to seed the
   * selection; afterwards they only say which rows carry the "In order" badge.
   */
  currentOrderItems?: PickerLine[];
}

/** How the user asked to leave the picker. */
type CloseSource = 'cancel' | 'back' | 'scrim' | 'swipe';

// Rows requested per page in browse and search mode.
const CATALOG_PAGE_SIZE = 50;

// Search results are EnhancedGRNItem; the list renders plain GRNItem.
const toGRNItem = (item: GRNItem): GRNItem => ({
  id: item.id,
  name: item.name,
  packaging: item.packaging,
  package_mark: item.package_mark,
  current_stock: item.current_stock,
  original_quantity: item.original_quantity,
  catalog_id: item.catalog_id,
  catalog: item.catalog,
  rack: item.rack,
  weight: item.weight,
  gr_id: item.gr_id,
  grn_number: item.grn_number,
  grn_date: item.grn_date,
  image_url: item.image_url,
  pricing_mode: item.pricing_mode,
  created_at: item.created_at,
  updated_at: item.updated_at,
});

const appendUnique = (current: GRNItem[], page: GRNItem[]): GRNItem[] => {
  const seen = new Set(current.map(item => item.id));
  const fresh = page.filter(item => !seen.has(item.id));
  return fresh.length > 0 ? [...current, ...fresh] : current;
};

const NO_ORDER_ITEMS: PickerLine[] = [];

const ItemCatalogBrowser: React.FC<ItemCatalogBrowserProps> = ({
  isVisible,
  onClose,
  onAddItems,
  customerId,
  currentOrderItems = NO_ORDER_ITEMS,
  offline = false,
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const sheet = useModalSheet(bottomSheetModalRef);
  const snapPoints = useMemo(() => ['95%'], []);

  const [loading, setLoading] = useState(true);
  const [allItems, setAllItems] = useState<GRNItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<GRNItem[]>([]);
  const [customerAllItems, setCustomerAllItems] = useState<GRNItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [inStockOnly, setInStockOnly] = useState(true);
  // Seeded once, when the picker opens, and never from the prop again: a new
  // `currentOrderItems` array (a refresh, a return from the background, a line
  // someone else added) must not wipe what the user chose.
  const [draft, setDraft] = useState(() => seedDraft(currentOrderItems));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const selectedItems = draft.selection;
  // The lot being saved and how many there are, while Add waits for the server.
  const [saving, setSaving] = useState<{ position: number; total: number } | null>(null);
  const isSaving = saving !== null;
  const savingRef = useRef(false);
  // The lot whose answer was lost while Add was saving: it is being checked (see `onAddItems`).
  const [checking, setChecking] = useState<PickerChecking | null>(null);
  const checkingRef = useRef<PickerChecking | null>(null);
  // Stops the check of the Add that is running, when the person leaves through X.
  const addAbortRef = useRef<AbortController | null>(null);
  // The callers pass new functions on every render; handlers read the latest.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onAddItemsRef = useRef(onAddItems);
  onAddItemsRef.current = onAddItems;
  // onClose has been called for this opening; it is called once.
  const closedRef = useRef(false);
  // The leave question is on screen.
  const askingRef = useRef(false);
  // The sheet is off the screen (a swipe took it) while the picker itself is still
  // open. Set by every dismissal the library reports for an open picker, cleared
  // by `presentSheet`.
  const sheetDownRef = useRef(false);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<string | null>(null);
  const [showSelectedItems, setShowSelectedItems] = useState(false);
  const [flashingItems, setFlashingItems] = useState<Set<string>>(new Set());
  const [searchMetadata, setSearchMetadata] = useState<SearchMetadata | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [useEnhancedSearch, setUseEnhancedSearch] = useState(true);
  const [browseHasMore, setBrowseHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Every browse reload takes a new id; an older page is discarded.
  const browseRequestRef = useRef(0);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every search edit takes a new id; a response whose id is no longer current
  // is discarded so an earlier, slower search cannot overwrite a later one.
  const searchRequestRef = useRef(0);
  const sliderUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showWeightSlider, setShowWeightSlider] = useState(false);
  const [range, setRange] = useState<[number, number]>([0, 50]);
  const [tempRange, setTempRange] = useState<[number, number]>([0, 50]);
  const isUpdatingSlider = useRef(false);
  const isSlidingMin = useRef(false);
  const isSlidingMax = useRef(false);
  const [recentItemsRefreshTrigger, setRecentItemsRefreshTrigger] = useState(0);
  const [recentlyAddedItems, setRecentlyAddedItems] = useState<GRNItem[]>([]);

  // Track component mount state to prevent setState on unmounted component
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load persisted recently added items when modal opens
  useEffect(() => {
    const loadPersistedRecentItems = async () => {
      if (isVisible && customerId) {
        if (__DEV__) console.log('[ItemCatalogBrowser] Loading persisted recent items for customer:', customerId);
        const persistedItems = await SessionRecentItemsService.loadRecentlyAddedItems(customerId);

        // Guard against setState on unmounted component
        if (!isMountedRef.current) return;

        if (persistedItems.length > 0) {
          if (__DEV__) console.log('[ItemCatalogBrowser] Loaded', persistedItems.length, 'persisted recent items');
          setRecentlyAddedItems(persistedItems);
        }

        // Also run cleanup of expired items occasionally (when modal opens)
        // This happens in the background and doesn't block the UI
        // Note: cleanup doesn't update component state, so no need to check isMounted
        SessionRecentItemsService.cleanupExpiredItems()
          .then(() => {
            if (__DEV__) console.log('[ItemCatalogBrowser] Completed cleanup of expired items');
          })
          .catch(error => {
            console.error('[ItemCatalogBrowser] Error during cleanup:', error);
          });
      }
    };

    loadPersistedRecentItems();
  }, [isVisible, customerId]);

  // Puts the sheet on the screen, the first time and after a swipe took it away.
  const presentSheet = useCallback(() => {
    sheetDownRef.current = false;
    sheet.present();
  }, [sheet]);

  // Handle bottom sheet visibility
  useEffect(() => {
    if (isVisible) {
      closedRef.current = false;
      presentSheet();
    } else {
      sheet.dismiss();
    }
  }, [isVisible]);
  
  // Sync tempRange with range when weight slider is opened
  useEffect(() => {
    if (showWeightSlider) {
      setTempRange(range);
    }
  }, [showWeightSlider, range]);

  // Fetch items
  const fetchItems = useCallback(async () => {
    const requestId = ++browseRequestRef.current;
    const isCurrent = () => isMountedRef.current && requestId === browseRequestRef.current;
    try {
      setLoading(true);
      if (__DEV__) console.log('[ItemCatalogBrowser] Fetching items for customer:', customerId);
      
      const result = await OrderService.getAvailableItems({
        customer_id: customerId,
        in_stock_only: inStockOnly,
        catalog_id: selectedCatalog || undefined,
        offset: 0,
        page_size: CATALOG_PAGE_SIZE,
      });
      if (!isCurrent()) return;

      if (__DEV__) console.log('[ItemCatalogBrowser] Items fetch result:', {
        success: result.success,
        dataLength: result.data?.length,
        message: result.message,
        error: result.error
      });

      if (result.success && result.data) {
        setAllItems(result.data);
        setBrowseHasMore(result.metadata?.has_more ?? false);
        
        // Extract unique catalogs
        const uniqueCatalogs = new Map<string, Catalog>();
        result.data.forEach(item => {
          if (item.catalog) {
            uniqueCatalogs.set(item.catalog.id, item.catalog);
          }
        });
        setCatalogs(Array.from(uniqueCatalogs.values()));
        
        if (__DEV__) console.log('[ItemCatalogBrowser] Items loaded successfully:', {
          itemCount: result.data.length,
          catalogCount: uniqueCatalogs.size,
          firstItem: result.data[0] ? {
            id: result.data[0].id,
            name: result.data[0].name,
            stock: result.data[0].current_stock
          } : null
        });
      } else {
        console.error('[ItemCatalogBrowser] Failed to load items:', result.message);
        showAlert(tr('orders.catalog.couldNotLoadTitle'), tr('common.checkConnection'));
      }
    } catch (error) {
      if (!isCurrent()) return;
      console.error('[ItemCatalogBrowser] Error fetching items:', error);
      showAlert(tr('orders.catalog.couldNotLoadTitle'), tr('common.checkConnection'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [customerId, inStockOnly, selectedCatalog]);

  // Search filters for one page of a remote search.
  const buildSearchFilters = useCallback((query: string, offset: number): EnhancedSearchFilters => {
    const filters: EnhancedSearchFilters = {
      customer_id: customerId,
      // A query of numbers only (a weight or a weight range) is sent in 0-9 whatever digits were typed.
      search_query: /^[\d.\s-]+$/.test(normalizeDigits(query)) ? normalizeDigits(query) : query,
      search_type: 'auto',
      stock_filter_min: inStockOnly ? 1 : 0,
      catalog_id: selectedCatalog || undefined,
      page_size: CATALOG_PAGE_SIZE,
      offset,
    };
    // A whole-number range such as "10-20" searches by weight.
    const weightRangeMatch = normalizeDigits(query).match(/^(\d+)-(\d+)$/);
    if (weightRangeMatch) {
      filters.weight_min = parseInt(weightRangeMatch[1], 10);
      filters.weight_max = parseInt(weightRangeMatch[2], 10);
      filters.search_type = 'weight';
    }
    return filters;
  }, [customerId, inStockOnly, selectedCatalog]);

  // Fetch all customer-specific GRN items (for pills)
  const loadCustomerAllItems = useCallback(async () => {
    try {
      if (__DEV__) console.log('[ItemCatalogBrowser] Fetching all customer GRN items for pills:', customerId);

      const result = await StockService.getCustomerGRNItems(
        customerId,
        undefined, // no date filter - get all time
        undefined,
        undefined, // no filters
        'date',
        'desc',
        100, // server contract maximum; enough to populate the quick-filter pills
        0
      );

      if (result.success && result.data) {
        // Deduplicate by itemId and transform to GRNItem format
        const uniqueItemsMap = new Map<string, GRNItem>();

        result.data.items.forEach(item => {
          if (!uniqueItemsMap.has(item.item_id)) {
            // Transform CustomerGRNItem to GRNItem
            uniqueItemsMap.set(item.item_id, {
              id: item.id,
              name: item.item_name,
              packaging: item.packaging || '',
              package_mark: item.package_mark,
              current_stock: item.stock,
              original_quantity: item.qty,
              catalog_id: null,
              rack: item.rack,
              weight: item.weight,
              gr_id: item.grn_id,
              grn_number: item.gr_no,
              grn_date: item.date,
            });
          }
        });

        const uniqueItems = Array.from(uniqueItemsMap.values());
        setCustomerAllItems(uniqueItems);

        if (__DEV__) console.log('[ItemCatalogBrowser] Customer GRN items loaded for pills:', {
          totalItems: result.data.items.length,
          uniqueItems: uniqueItems.length,
        });
      } else {
        console.error('[ItemCatalogBrowser] Failed to load customer GRN items:', result.message);
      }
    } catch (error) {
      console.error('[ItemCatalogBrowser] Error fetching customer GRN items:', error);
    }
  }, [customerId]);

  // Load customer items on mount
  useEffect(() => {
    loadCustomerAllItems();
  }, [loadCustomerAllItems]);

  // Debounced search effect: remote searches wait 250 ms after the last edit
  // and only the newest request may update the list.
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    const requestId = ++searchRequestRef.current;
    const isCurrent = () => isMountedRef.current && requestId === searchRequestRef.current;

    const handleSearch = async () => {
      if (useEnhancedSearch && searchQuery.trim()) {
        setIsSearching(true);
        try {
          const searchFilters = buildSearchFilters(searchQuery, 0);

          if (__DEV__) console.log('[ItemCatalogBrowser] 🔎 SEARCH REQUEST:', {
            searchType: searchFilters.search_type,
            stockFilter: searchFilters.stock_filter_min,
          });

          const result = await OrderService.searchCustomerItemsForOrder(searchFilters);

          // A newer edit, selection or unmount superseded this request.
          if (!isCurrent()) return;

          if (__DEV__) console.log('[ItemCatalogBrowser] 📦 SEARCH RESULT:', {
            success: result.success,
            dataLength: result.data?.length,
          });

          if (result.success && result.data) {
            const mappedItems = result.data.map(toGRNItem);

            if (__DEV__) console.log('[ItemCatalogBrowser] 🎯 MAPPED ITEMS TO DISPLAY:', {
              count: mappedItems.length,
            });

            setFilteredItems(mappedItems);
            setSearchMetadata(result.metadata || null);
          } else {
            setFilteredItems([]);
            setSearchMetadata(null);
          }
        } catch (error) {
          if (!isCurrent()) return;
          console.error('[ItemCatalogBrowser] Enhanced search error:', error);
          setFilteredItems([]);
          setSearchMetadata(null);
        } finally {
          if (isCurrent()) setIsSearching(false);
        }
      } else if (!searchQuery.trim()) {
        // Clear search when query is empty - restore original items
        setFilteredItems(allItems);
        setSearchMetadata(null);
        setIsSearching(false);
      } else {
        // Fall back to basic filtering if enhanced search is disabled
        const query = searchQuery.toLowerCase();
        const filtered = allItems.filter(item =>
          item.name.toLowerCase().includes(query) ||
          item.packaging.toLowerCase().includes(query) ||
          item.package_mark?.toLowerCase().includes(query)
        );
        setFilteredItems(filtered);
        setSearchMetadata(null);
        setIsSearching(false);
      }
    };

    if (useEnhancedSearch && searchQuery.trim()) {
      // Remote search: wait for the operator to pause typing.
      searchTimeoutRef.current = setTimeout(() => {
        searchTimeoutRef.current = null;
        void handleSearch();
      }, 250);
    } else {
      // Local filtering and clearing need no network round trip.
      void handleSearch();
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      // Any response still in flight for this edit is now stale.
      searchRequestRef.current += 1;
    };
  }, [searchQuery, useEnhancedSearch, buildSearchFilters, allItems]);

  // Next page of the current search or of the browse list.
  const handleLoadMore = useCallback(async () => {
    if (loading || isLoadingMore || isSearching || showSelectedItems) return;
    const query = searchQuery.trim();
    if (query && useEnhancedSearch) {
      if (!searchMetadata?.has_more) return;
      const requestId = searchRequestRef.current;
      setIsLoadingMore(true);
      try {
        const result = await OrderService.searchCustomerItemsForOrder(
          buildSearchFilters(searchQuery, filteredItems.length)
        );
        if (!isMountedRef.current || requestId !== searchRequestRef.current) return;
        if (result.success && result.data) {
          setFilteredItems(prev => appendUnique(prev, result.data!.map(toGRNItem)));
          setSearchMetadata(result.metadata || null);
        } else {
          setSearchMetadata(prev => (prev ? { ...prev, has_more: false } : prev));
        }
      } catch (error) {
        console.error('[ItemCatalogBrowser] Load more search error:', error);
      } finally {
        if (isMountedRef.current) setIsLoadingMore(false);
      }
    } else if (!query) {
      if (!browseHasMore) return;
      const requestId = browseRequestRef.current;
      setIsLoadingMore(true);
      try {
        const result = await OrderService.getAvailableItems({
          customer_id: customerId,
          in_stock_only: inStockOnly,
          catalog_id: selectedCatalog || undefined,
          offset: allItems.length,
          page_size: CATALOG_PAGE_SIZE,
        });
        if (!isMountedRef.current || requestId !== browseRequestRef.current) return;
        if (result.success && result.data) {
          setAllItems(prev => appendUnique(prev, result.data!));
          setBrowseHasMore(result.metadata?.has_more ?? false);
        } else {
          setBrowseHasMore(false);
        }
      } catch (error) {
        console.error('[ItemCatalogBrowser] Load more items error:', error);
      } finally {
        if (isMountedRef.current) setIsLoadingMore(false);
      }
    }
  }, [loading, isLoadingMore, isSearching, showSelectedItems, searchQuery, useEnhancedSearch,
      searchMetadata, buildSearchFilters, filteredItems.length, browseHasMore, customerId,
      inStockOnly, selectedCatalog, allItems.length]);

  // Fetch items on mount and when filters change
  useEffect(() => {
    if (isVisible) {
      fetchItems();
    }
  }, [isVisible, fetchItems]);

  // Handle quantity change
  const handleQuantityChange = useCallback((item: GRNItem, requested: number) => {
    // Nothing changes while an Add is being saved.
    if (savingRef.current) return;
    // A lot the order holds above its stock (owner decision D17) may be lowered: a lower number is held at the stock at most
    // (as the order line's own stepper does), and 0 (or no stock left) takes it off. Raising a lot above its stock stays refused,
    // and nothing here changes a lot by itself.
    const chosen = draftRef.current.selection.get(item.id)?.quantity ?? 0;
    const quantity = chosen > item.current_stock && requested > 0 && requested < chosen
      ? Math.min(item.current_stock, requested)
      : requested;
    if (quantity === 0) {
      setDraft(prev => withQuantity(prev, item, 0));

      // Also remove from recently added items if it was there (by name for consistency)
      setRecentlyAddedItems(prevRecent => {
        const filtered = prevRecent.filter(i => i.name.toLowerCase() !== item.name.toLowerCase());
        if (filtered.length < prevRecent.length) {
          // Item was in the list, persist the removal
          SessionRecentItemsService.saveRecentlyAddedItems(customerId, filtered)
            .then(() => {
              if (__DEV__) console.log('[ItemCatalogBrowser] ✅ Removed item from persisted recent items');
            })
            .catch(error => {
              console.error('[ItemCatalogBrowser] ❌ Failed to update persisted recent items:', error);
            });
        }
        return filtered;
      });
    } else if (quantity > item.current_stock) {
      // Flash red background instead of showing alert
      setFlashingItems(prev => new Set([...prev, item.id]));
      // Remove from flashing set after animation completes
      setTimeout(() => {
        setFlashingItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(item.id);
          return newSet;
        });
      }, 2050); // 2000ms red background + 50ms buffer
    } else {
      // New in this opening: not chosen yet and not a saved line when the picker opened.
      const current = draftRef.current;
      const wasNew = !current.selection.has(item.id);
      const isNewInSession = wasNew && !current.base.has(item.id);
      setDraft(prev => withQuantity(prev, item, quantity));

      if (isNewInSession) {
        if (__DEV__) console.log('[ItemCatalogBrowser] 🆕 NEW ITEM ADDED IN SESSION:', item.name, 'ID:', item.id);

        // Update local state
        setRecentlyAddedItems(prevRecent => {
          // Remove if already exists BY NAME (not ID) - same item can have different IDs across GRN records
          const filtered = prevRecent.filter(i => i.name.toLowerCase() !== item.name.toLowerCase());
          const updated = [item, ...filtered];
          if (__DEV__) console.log('[ItemCatalogBrowser] 📋 Updated recentlyAddedItems:', updated.map(i => i.name));

          // Persist to AsyncStorage
          SessionRecentItemsService.saveRecentlyAddedItems(customerId, updated)
            .then(() => {
              if (__DEV__) console.log('[ItemCatalogBrowser] ✅ Persisted recently added items');
            })
            .catch(error => {
              console.error('[ItemCatalogBrowser] ❌ Failed to persist recently added items:', error);
            });

          return updated;
        });
      }
      // Trigger refresh of recent items when quantity is added/changed
      setRecentItemsRefreshTrigger(prev => prev + 1);
    }
  }, [customerId]);

  // Handle recent item selection - just search for the item
  const handleRecentItemSelected = useCallback((item: QuickAddItem) => {
    // Set search query to filter items, showing the recent item
    if (__DEV__) console.log('[ItemCatalogBrowser] 🔍 Quick search for recent item:', {
      itemName: item.name,
      itemId: item.id,
    });
    setSearchQuery(item.name);
  }, []);

  // Leaves the picker: tells the owner once per opening, whichever way it closed.
  const finishClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (isMountedRef.current) {
      setSearchQuery('');
      setSelectedCatalog(null);
      setShowWeightSlider(false);
      setShowSelectedItems(false);
    }
    onCloseRef.current();
  }, []);

  // Add: sends only what changed since the picker opened and waits for the
  // answer. Everything saved: the picker closes. Otherwise it stays open with
  // the lots that were not saved, each with its reason.
  const handleAddItems = useCallback(async () => {
    // A second tap while saving is ignored.
    if (savingRef.current || closedRef.current) return;
    const current = draftRef.current;
    const changes = changesOf(current);

    // Nothing chosen: this also holds when every saved lot was deselected. The picker does not
    // remove every line of the order without asking; a line is removed from its card, which asks.
    if (current.selection.size === 0) {
      showAlert(tr('orders.catalog.noneSelectedTitle'), tr('orders.catalog.noneSelectedMessage'));
      return;
    }
    if (changes.length === 0) {
      // Only saved lines, none of them changed: nothing to send.
      finishClose();
      return;
    }

    savingRef.current = true;
    setSaving({ position: 1, total: changes.length });
    const sent = withoutReasons(current);
    setDraft(sent);

    let answers: PickerResult[] = [];
    const controller = new AbortController();
    addAbortRef.current = controller;
    try {
      answers = await onAddItemsRef.current(changes, (position, total) => {
        if (isMountedRef.current) setSaving({ position, total });
      }, {
        signal: controller.signal,
        onChecking: lot => {
          checkingRef.current = lot;
          if (isMountedRef.current) setChecking(lot);
        },
      });
    } catch (error) {
      // The owner answers for every lot and does not reject; this is the guard for one that does.
      console.error('[ItemCatalogBrowser] Add items error:', error);
    }
    savingRef.current = false;
    checkingRef.current = null;
    addAbortRef.current = null;
    // The busy header never outlives the save, also when the picker was closed or unmounted meanwhile.
    setSaving(null);
    // Also when the person left through X while a lot was being checked: nothing is shown or presented again.
    if (!isMountedRef.current || closedRef.current) return;
    setChecking(null);

    // A lot without an answer was not saved.
    const answered = Array.isArray(answers) ? answers : [];
    const results = changes.map(change => {
      const answer = answered.find(candidate => candidate.grnItemId === change.grnItemId);
      if (answer?.ok) return answer;
      // Keep the rest of the answer (the saved quantity of a lot that changed meanwhile), so the next Add applies it knowingly.
      return { ...answer, grnItemId: change.grnItemId, ok: false, reason: answer?.reason || tr('orders.catalog.reasonNotSaved') };
    });
    const next = applyResults(sent, results);
    setDraft(next);
    setSaving(null);
    if (results.every(result => result.ok)) {
      finishClose();
      return;
    }
    // The lots that were not saved are listed first, under a summary line.
    setSearchQuery('');
    setShowSelectedItems(false);
    if (sheetDownRef.current) presentSheet();
  }, [finishClose, presentSheet]);

  // Every way out goes through here: Cancel, the Back key, a tap outside and a
  // swipe down. Nothing unsaved: the picker closes at once. Otherwise it asks
  // first, listing the changes: Add to order (only when Add would send something),
  // Keep editing, Discard selections. While an Add is being saved it does nothing.
  const requestClose = useCallback(async (source: CloseSource) => {
    // A lot's answer was lost and is being checked: the picker is locked. Only X (Cancel) leaves, after a warning;
    // Back, a tap outside and a swipe do nothing.
    if (checkingRef.current) {
      if (source !== 'cancel' || closedRef.current || askingRef.current) return;
      askingRef.current = true;
      const leave = await askAlert<CheckingLeaveAnswer>(
        tr('orders.catalog.leaveCheckingTitle'),
        tr('errors.lostAnswer.leaveWarning'),
        [
          { text: tr('orders.catalog.keepWaiting'), style: 'cancel', value: 'wait' },
          { text: tr('orders.catalog.leaveAnyway'), style: 'destructive', value: 'leave' },
        ],
        'wait'
      );
      askingRef.current = false;
      if (!isMountedRef.current) return;
      if (leave === 'leave') {
        addAbortRef.current?.abort();
        finishClose();
      }
      return;
    }
    if (savingRef.current || closedRef.current || askingRef.current) return;
    const asked = draftRef.current;
    const changes = changesOf(asked);
    if (changes.length === 0) {
      finishClose();
      return;
    }
    // Add refuses when every lot was deselected (see handleAddItems), so it is not offered then.
    const canAdd = asked.selection.size > 0;
    const choices: AlertChoice<UnsavedAnswer>[] = [];
    if (canAdd) choices.push({ text: tr('orders.catalog.addToOrder'), value: 'add' });
    choices.push(
      { text: tr('common.keepEditing'), style: 'cancel', value: 'keep' },
      { text: tr('orders.catalog.discardSelections'), style: 'destructive', value: 'discard' }
    );
    askingRef.current = true;
    const answer = await askAlert<UnsavedAnswer>(
      canAdd ? tr('orders.catalog.addChangesTitle') : tr('orders.catalog.discardTitle'),
      unsavedMessage(asked, changes, canAdd),
      choices,
      'keep'
    );
    askingRef.current = false;
    if (!isMountedRef.current) return;
    if (answer === 'discard') {
      finishClose();
      return;
    }
    // A swipe took the sheet away. That is so also when another way out asked first:
    // the sheet was flung down, Back or Cancel was pressed before it was gone, and
    // its dismissal came while the question was open (and was not asked about a second time).
    const sheetIsDown = source === 'swipe' || sheetDownRef.current;
    // Keep editing, or closing the question without an answer: show the sheet again with what was chosen.
    if (answer !== 'add') {
      if (sheetIsDown) presentSheet();
      return;
    }
    // Add to order: the same Add as the header's. The save runs first and the sheet comes back only when a lot
    // was not saved (handleAddItems presents it then); with everything saved the picker closes as after the header's Add.
    await handleAddItems();
  }, [finishClose, presentSheet, handleAddItems]);

  // Helper functions for search UI
  const getSearchPlaceholder = useCallback(() => {
    if (!searchQuery.trim()) {
      return tr('orders.catalog.searchPlaceholderHint');
    }
    return tr('orders.catalog.searchItems');
  }, [searchQuery]);

  const getSearchTypeIndicator = useCallback(() => {
    if (!searchMetadata) {
      // Client-side detection for immediate feedback
      if (/^\d+(\.\d+)?(-\d+(\.\d+)?)?$/.test(normalizeDigits(searchQuery).trim())) {
        return '🔢'; // Weight search
      }
      return '📝'; // Text search
    }
    
    switch (searchMetadata.search_type) {
      case 'weight':
      case 'weight_range':
        return '🔢';
      case 'text':
      default:
        return '📝';
    }
  }, [searchQuery, searchMetadata]);

  const getSearchResultsSummary = useCallback(() => {
    if (!searchMetadata) return '';
    
    const { current_count, total_count, search_type } = searchMetadata;
    
    return tr(search_type === 'weight' || search_type === 'weight_range' ? 'orders.catalog.resultsByWeight' : 'orders.catalog.resultsByName', {
      shown: formatNumber(current_count),
      total: formatCount(total_count, 'item'),
    });
  }, [searchMetadata]);

  // Weight range slider handlers - only update temp values during sliding
  const handleMinSliderChange = useCallback((value: number) => {
    if (!isSlidingMin.current) return; // Ignore changes when not actively sliding
    
    // Update temp range during sliding
    setTempRange(prev => [Math.min(value, prev[1]), prev[1]]);
  }, []);

  const handleMaxSliderChange = useCallback((value: number) => {
    if (!isSlidingMax.current) return; // Ignore changes when not actively sliding
    
    // Update temp range during sliding
    setTempRange(prev => [prev[0], Math.max(value, prev[0])]);
  }, []);

  // Handlers for sliding start
  const handleMinSliderStart = useCallback((value: number) => {
    isSlidingMin.current = true;
  }, []);

  const handleMaxSliderStart = useCallback((value: number) => {
    isSlidingMax.current = true;
  }, []);

  // Handlers for when sliding completes
  const handleMinSliderComplete = useCallback((value: number) => {
    isSlidingMin.current = false;
    const finalValue = Math.min(value, range[1]);
    setRange([finalValue, range[1]]);
    setTempRange([finalValue, range[1]]);
  }, [range]);

  const handleMaxSliderComplete = useCallback((value: number) => {
    isSlidingMax.current = false;
    const finalValue = Math.max(value, range[0]);
    setRange([range[0], finalValue]);
    setTempRange([range[0], finalValue]);
  }, [range]);

  const applyWeightRange = useCallback(() => {
    const [min, max] = range;
    const searchTerm = `${min}-${max}`;
    setSearchQuery(searchTerm);
    setShowWeightSlider(false);
  }, [range]);

  const resetWeightRange = useCallback(() => {
    setRange([0, 50]);
    setTempRange([0, 50]);
    setSearchQuery('');
    setShowWeightSlider(false);
  }, []);

  // The number on the Add button: what would be sent, not what is selected. An
  // order with saved lots opens its picker with "Add" and no number.
  const changeCount = useMemo(() => changesOf(draft).length, [draft]);
  const failedReasons = draft.failed;
  // What the lot being checked says: the question, and while the phone has no network, what it is waiting for.
  const checkingText = useMemo(() => {
    if (!checking) return '';
    return [
      tr(checking.removal ? 'errors.lostAnswer.checkingDelete' : 'errors.lostAnswer.checking'),
      offline ? tr('errors.lostAnswer.waiting') : '',
    ].filter(Boolean).join(' ');
  }, [checking, offline]);

  // Compute display items: merge filtered items with selected items
  // This ensures items with quantity > 0 always show, even if they don't match current filters
  const displayItems = useMemo(() => {
    if (showSelectedItems) {
      // Show only selected items when user taps summary bar
      return Array.from(selectedItems.values()).map(selected => selected.item);
    }

    // If actively searching (searchQuery exists), show ONLY search results
    if (searchQuery.trim()) {
      if (__DEV__) console.log('[ItemCatalogBrowser] 🔍 Active search, showing only filtered results:', {
        searchQuery,
        filteredCount: filteredItems.length
      });
      return filteredItems;
    }

    // When not searching, merge filtered items with selected items
    const itemMap = new Map<string, GRNItem>();

    // First, add all filtered items
    filteredItems.forEach(item => {
      itemMap.set(item.id, item);
    });

    // Then, ensure all selected items are included (even if not in filtered results)
    selectedItems.forEach((selected, itemId) => {
      if (!itemMap.has(itemId)) {
        itemMap.set(itemId, selected.item);
      }
    });

    if (failedReasons.size === 0 && !checking) return Array.from(itemMap.values());

    // Lots that were not saved, and the lot being checked, come first. One whose removal was refused is no
    // longer selected; its row comes from the saved line.
    const notSaved: GRNItem[] = [];
    const firstIds = new Set<string>(failedReasons.keys());
    if (checking) firstIds.add(checking.grnItemId);
    firstIds.forEach(itemId => {
      const item = itemMap.get(itemId) ?? draft.base.get(itemId)?.item;
      if (item) notSaved.push(item);
    });
    const first = new Set(notSaved.map(item => item.id));
    return [...notSaved, ...Array.from(itemMap.values()).filter(item => !first.has(item.id))];
  }, [filteredItems, selectedItems, showSelectedItems, searchQuery, failedReasons, checking, draft.base]);

  // Get stock status for Fiori semantic styling - memoized to prevent recreation
  // @see PO1 - FlashList renderItem Inline Function Anti-Pattern
  const getStockStatus = useCallback((currentStock: number, originalStock: number) => {
    const stockPercentage = originalStock > 0 ? (currentStock / originalStock) * 100 : 0;
    if (currentStock === 0) return 'negative';
    if (stockPercentage < 20) return 'critical';
    return 'positive';
  }, []);

  // Render item card - SAP Fiori Object Cell layout - memoized for FlashList performance
  // @see PO1 - FlashList renderItem Inline Function Anti-Pattern
  const renderItem = useCallback(({ item }: { item: GRNItem }) => {
    const selected = selectedItems.get(item.id);
    const quantity = selected?.quantity || 0;
    // Why this lot was not saved by the last Add, if it was not.
    const reason = failedReasons.get(item.id);
    // This lot's answer was lost and the server is being asked what became of it.
    const checkingHere = checking?.grnItemId === item.id;
    // Quantities stay as they are while an Add is being saved.
    const locked = isSaving;

    // Check if this item is already in the existing order
    const isInExistingOrder = currentOrderItems.some(
      orderItem => orderItem.grnItemId === item.id
    );

    // The lot is chosen above its stock (the order holds more than the lot has now, owner decision D17): a warning says so, and
    // − and −10 lower it to the stock at most (or take it off when there is none); + stays refused.
    const overStock = quantity > item.current_stock;
    const stockStatus = getStockStatus(item.current_stock, item.original_quantity);
    const status = t.status[stockStatus];
    const stockWord = stockLabel(stockStatus);
    const grnDate = item.grn_date ? formatDate(item.grn_date) : null;
    // The weight of one package, "50 kg each"; none for a lot without a weight.
    const weightText = formatWeightEach(item.weight);
    const rowLabel = [
      ...lotParts(item),
      tr('orders.catalog.rowStock', { status: stockWord, current: formatBags(item.current_stock), total: formatBags(item.original_quantity) }),
      isInExistingOrder ? tr('orders.catalog.rowAlreadyInOrder') : null,
      quantity > 0 ? tr('orders.catalog.rowSelected', { bags: formatBags(quantity) }) : null,
    ].filter(Boolean).join(', ');

    const addBags = (count: number) => tr('orders.catalog.addBags', { count, name: item.name });
    const removeBags = (count: number) => tr('orders.catalog.removeBags', { count, name: item.name });
    // What − and −10 give a lot above its stock: the quantity it is lowered to (never above the stock, never below 1; 0 when
    // there is no stock, which takes it off), and the spoken label that says so.
    const loweredTo = (amount: number) => item.current_stock <= 0 ? 0 : Math.min(item.current_stock, Math.max(1, quantity - amount));
    const lowerBags = (amount: number) => loweredTo(amount) === 0
      ? tr('orders.item.removeFromOrder', { name: item.name })
      : tr('orders.item.lowerTo', { name: item.name, quantity: formatNumber(loweredTo(amount)) });

    const preset = (amount: number, label: string, a11y: string, disabled = false) => (
      <Pressable
        key={label}
        style={({ pressed }) => [styles.presetButton, pressed && styles.secondaryPressed, (disabled || locked) && styles.disabled]}
        onPress={() => handleQuantityChange(item, amount)}
        disabled={disabled || locked}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityState={{ disabled: disabled || locked }}
      >
        <Text style={styles.presetButtonText}>{localizeDigits(label)}</Text>
      </Pressable>
    );

    const stepper = (next: number, label: string, a11y: string, disabled: boolean) => (
      <Pressable
        key={label}
        style={({ pressed }) => [styles.quantityButton, pressed && styles.secondaryPressed, (disabled || locked) && styles.disabled]}
        onPress={() => handleQuantityChange(item, next)}
        disabled={disabled || locked}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityState={{ disabled: disabled || locked }}
      >
        <Text style={label.length > 1 ? styles.smallButtonText : styles.quantityButtonText}>{localizeDigits(label)}</Text>
      </Pressable>
    );

    return (
      <View style={[styles.itemCard, isInExistingOrder && styles.itemCardInOrder]}>
        {/* SAP Fiori Object Cell Row */}
        <View style={styles.objectCellRow} accessible accessibilityLabel={rowLabel}>
          {/* Left: Status Icon */}
          <View style={[styles.statusIconContainer, { backgroundColor: status.background, borderColor: status.border }]}>
            <Icon
              name={stockStatus === 'negative' ? 'package-variant-remove' : 'package-variant'}
              size={iconSize.md}
              color={status.text}
            />
          </View>

          {/* Center: Main Content */}
          <View style={styles.mainContent}>
            {/* Title Row */}
            <View style={styles.titleRow}>
              <Text style={styles.titleText} numberOfLines={2}>{item.name}</Text>
              {isInExistingOrder && (
                <View style={styles.alreadyInOrderBadge}>
                  <Icon name="check" size={iconSize.sm} color={t.brand.tint} />
                  <Text style={styles.alreadyInOrderBadgeText} maxFontSizeMultiplier={1.6}>{tr('orders.catalog.inOrder')}</Text>
                </View>
              )}
            </View>

            {/* Subtitle Row - Package Mark */}
            <View style={styles.subtitleRow}>
              <Text style={styles.subtitleText} numberOfLines={1}>
                {item.package_mark || tr('orders.item.noMark')}
              </Text>
            </View>

            {/* Footer Row - GRN Number, Date & Weight */}
            <View style={styles.footerRow}>
              {item.grn_number ? (
                <View style={styles.footerItem}>
                  <Icon name="package-down" size={iconSize.sm} color={t.icon.secondary} />
                  <Text style={styles.footerText}>{tr('orders.catalog.grn', { number: formatIdentifier(item.grn_number) })}</Text>
                </View>
              ) : null}
              {grnDate ? <Text style={styles.footerText}>{grnDate}</Text> : null}
              {weightText ? (
                <View style={styles.footerItem}>
                  <Icon name="scale" size={iconSize.sm} color={t.icon.secondary} />
                  <Text style={styles.footerText}>{weightText}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Right: main value with its status tag under it */}
          <View style={styles.attributeStack}>
            <View style={styles.stockValueContainer}>
              <Animated.Text style={[
                styles.stockValueText,
                flashingItems.has(item.id) && styles.stockValueFlash,
              ]}>
                {formatNumber(item.current_stock)}
              </Animated.Text>
              <Text style={styles.stockLabel}>{tr('orders.catalog.ofTotal', { total: formatBags(item.original_quantity) })}</Text>
            </View>
            <StatusTag status={stockStatus} label={stockWord} style={styles.statusBadge} />
          </View>
        </View>

        {/* Why the last Add did not save this lot */}
        {reason ? (
          <View style={styles.rowReason} testID={`catalog-reason-${item.id}`}>
            <InlineValidation variant="error" message={reason} />
          </View>
        ) : null}

        {/* The lot is chosen above its stock: it can be lowered or taken off, not raised */}
        {overStock ? (
          <View style={styles.rowReason} testID={`catalog-over-stock-${item.id}`}>
            <InlineValidation variant="warning" message={tr('orders.item.onlyInStock', { stock: formatNumber(item.current_stock) })} />
          </View>
        ) : null}

        {/* The answer for this lot was lost: it is locked while the server is asked what became of it */}
        {checkingHere ? (
          <View style={styles.rowReason} testID={`catalog-checking-${item.id}`}>
            <InlineValidation variant="warning" message={checkingText} />
          </View>
        ) : null}

        {/* Quantity Section with Presets + Stepper */}
        <View style={styles.quantitySection}>
          {/* Preset Buttons Row */}
          {quantity === 0 && (
            <View style={styles.presetButtonsRow}>
              {preset(10, '+10', addBags(10), item.current_stock < 10)}
              {preset(50, '+50', addBags(50), item.current_stock < 50)}
              {preset(100, '+100', addBags(100), item.current_stock < 100)}
              {preset(1, '+1', addBags(1))}
            </View>
          )}

          {/* Stepper Controls (show when quantity > 0) */}
          {quantity > 0 && (
            <View style={styles.quantityControlsContainer}>
              <View style={styles.quantityControls}>
                {overStock
                  ? stepper(loweredTo(10), '−10', lowerBags(10), false)
                  : stepper(Math.max(0, quantity - 10), '−10', removeBags(10), quantity < 10)}
                {stepper(overStock ? loweredTo(1) : quantity - 1, '−', overStock ? lowerBags(1) : removeBags(1), quantity === 0)}
                <Text
                  style={styles.quantity}
                  accessibilityLabel={tr('orders.catalog.selectedOf', { bags: formatBags(quantity), name: item.name })}
                  accessibilityLiveRegion="polite"
                >
                  {formatNumber(quantity)}
                </Text>
                {stepper(quantity + 1, '+', addBags(1), item.current_stock === 0)}
                {stepper(
                  Math.min(item.current_stock, quantity + 10),
                  '+10',
                  addBags(10),
                  quantity + 10 > item.current_stock || item.current_stock === 0
                )}
              </View>
            </View>
          )}
        </View>
      </View>
    );
  }, [selectedItems, failedReasons, isSaving, checking, checkingText, currentOrderItems, getStockStatus, handleQuantityChange, styles, t, flashingItems]);

  // Android back asks to leave the picker before anything else (guide §13.9, §15).
  useEffect(() => {
    if (!isVisible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      void requestClose('back');
      return true;
    });
    return () => sub.remove();
  }, [isVisible, requestClose]);

  // The library dismissed the sheet by itself: a swipe down, which it gives no
  // way to refuse (@gorhom/bottom-sheet 5.2). The picker is still mounted and
  // still holds what was chosen, so with unsaved selections it asks, and "Keep
  // editing" presents the sheet again. With nothing unsaved it closes.
  const handleSheetDismissed = useCallback(() => {
    sheet.onDismissed();
    if (!isMountedRef.current || closedRef.current) return;
    // Noted before anything else, also while a question is open or an Add is being saved.
    sheetDownRef.current = true;
    // An Add is being saved: its answer decides (handleAddItems shows the sheet again for lots not saved).
    if (savingRef.current) return;
    // A question that is already open answers for this dismissal too ("Keep editing" shows the sheet again).
    void requestClose('swipe');
  }, [sheet, requestClose]);

  // Scrim behind the sheet. The library's own press handling is off: with
  // `pressBehavior="none"` it attaches no tap gesture at all (and so never calls
  // `onPress`), and any other value moves the sheet by itself. The tap is taken
  // by a pressable laid over the scrim, which asks to leave like every other way out.
  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={1}
      pressBehavior="none"
      accessible={false}
      style={[props.style, styles.backdrop]}
    >
      <Pressable
        testID="catalog-scrim"
        style={StyleSheet.absoluteFill}
        onPress={() => { void requestClose('scrim'); }}
        accessibilityRole="button"
        accessibilityLabel={tr('orders.catalog.cancelAdding')}
      />
    </BottomSheetBackdrop>
  ), [styles, requestClose]);

  // Memoized keyExtractor for FlatList performance
  const keyExtractor = useCallback((item: GRNItem) => item.id, []);

  // Memoized getItemLayout for FlatList performance (fixed item height estimation)
  const getItemLayout = useCallback((_data: ArrayLike<GRNItem> | null | undefined, index: number) => ({
    length: 180, // Approximate item height
    offset: 180 * index,
    index,
  }), []);

  // Memoized ListHeaderComponent to prevent re-renders
  const listHeaderComponent = useMemo(() => (
    <>
      {/* SAP Fiori Bottom Sheet Header */}
      <View style={styles.bottomSheetHeader}>
        <Pressable
          testID="catalog-cancel"
          onPress={() => { void requestClose('cancel'); }}
          disabled={isSaving && !checking}
          style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed, isSaving && !checking && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel={tr('orders.catalog.cancelAdding')}
          accessibilityState={{ disabled: isSaving && !checking }}
        >
          <Text style={styles.headerButtonTextCancel} {...singleLineText()}>{tr('common.cancel')}</Text>
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">{tr('orders.catalog.addItems')}</Text>
        {saving !== null ? (
          // Add waits for the server: the button shows which lot is being saved.
          <View
            testID="catalog-add"
            style={[styles.headerButton, styles.headerButtonEnd, styles.headerSaving]}
            accessible
            accessibilityRole="button"
            accessibilityState={{ disabled: true, busy: true }}
            accessibilityLabel={tr('orders.catalog.savingProgress', { done: saving.position, total: saving.total })}
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator size="small" color={t.brand.tint} />
            <Text style={styles.headerButtonTextAction} numberOfLines={1} {...singleLineText()}>
              {tr('orders.catalog.savingProgress', { done: saving.position, total: saving.total })}
            </Text>
          </View>
        ) : (
          <Pressable
            testID="catalog-add"
            onPress={() => { void handleAddItems(); }}
            style={({ pressed }) => [styles.headerButton, styles.headerButtonEnd, pressed && styles.headerButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={
              changeCount === 0
                ? tr('orders.screen.addItemsToOrder')
                : tr('orders.catalog.addCountToOrder', { items: formatCount(changeCount, 'item') })
            }
          >
            <Text style={styles.headerButtonTextAction} {...singleLineText()}>
              {changeCount > 0 ? tr('orders.catalog.addCount', { count: changeCount }) : tr('common.add')}
            </Text>
          </Pressable>
        )}
      </View>
      {/* Fiori Divider */}
      <View style={styles.headerDivider} />

      {/* Keep stock search available even when the current result is empty. */}
      <View style={styles.topSearchContainer}>
        <View style={styles.searchField}>
          <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} />
          <TextInput
            accessibilityLabel={tr('orders.catalog.searchLabel')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={getSearchPlaceholder()}
            placeholderTextColor={t.text.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.topSearchInput}
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery('')}
              hitSlop={space.md}
              style={styles.clearButton}
              accessibilityRole="button"
              accessibilityLabel={tr('common.clearSearch')}
            >
              <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Recent Items Quick Add */}
      <RecentItemsQuickAdd
        customerId={customerId}
        onItemSelected={handleRecentItemSelected}
        isLoading={loading}
        allItems={customerAllItems.map(item => ({ id: item.id, name: item.name }))}
        selectedItemName={searchQuery}
        refreshTrigger={recentItemsRefreshTrigger}
        recentlyAddedItems={recentlyAddedItems.map(item => ({ id: item.id, name: item.name }))}
      />

      {/* A lot's answer was lost: the whole picker is locked while the server is asked, and says so here. */}
      {checking ? (
        <View style={styles.notSavedSummary} testID="catalog-checking-summary">
          <InlineValidation variant="warning" message={checkingText} />
        </View>
      ) : null}

      {/* What the last Add did not save; those lots are the first rows below. */}
      {failedReasons.size > 0 ? (
        <View style={styles.notSavedSummary} testID="catalog-not-saved-summary">
          <InlineValidation
            variant="error"
            message={tr('orders.catalog.notSavedSummary', { count: failedReasons.size })}
          />
        </View>
      ) : null}
    </>
  ), [styles, t, requestClose, handleAddItems, changeCount, saving, checking, checkingText, failedReasons.size, customerId, handleRecentItemSelected, loading, customerAllItems, searchQuery, getSearchPlaceholder, recentItemsRefreshTrigger, recentlyAddedItems]);

  // Memoized ListEmptyComponent
  const listEmptyComponent = useMemo(() => {
    const searching = Boolean(searchQuery.trim()) && filteredItems.length === 0;
    return (
      <View style={styles.emptyContainer}>
        <Icon
          name={searching ? 'magnify' : 'cube-outline'}
          size={iconSize.hero}
          color={t.icon.secondary}
        />
        {searching ? (
          <>
            <Text style={styles.emptyText} accessibilityRole="header">
              {tr('orders.catalog.noStockForTitle', { search: searchQuery })}
            </Text>
            <Text style={styles.emptySubtext}>
              {tr('orders.catalog.noStockForMessage')}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.emptyText} accessibilityRole="header">
              {tr('orders.catalog.emptyTitle')}
            </Text>
            <Text style={styles.emptySubtext}>
              {tr('orders.catalog.emptyMessage')}
            </Text>
          </>
        )}
      </View>
    );
  }, [searchQuery, filteredItems.length, styles, t]);

  // Memoized ListFooterComponent
  const listFooterComponent = useMemo(() => (
    <>
      {isLoadingMore && (
        <View style={styles.loadMoreRow} accessibilityLabel={tr('items.list.loadingMoreLabel')}>
          <ActivityIndicator size="small" color={t.brand.tint} />
          <Text style={styles.loadMoreText}>{tr('orders.catalog.loadingMore')}</Text>
        </View>
      )}
      {/* Catalog Filter */}
      {catalogs.length > 0 && (
        <View style={styles.bottomCatalogFilter}>
          {[{ id: null as string | null, name: tr('common.all') }, ...catalogs].map(catalog => {
            const on = selectedCatalog === catalog.id;
            return (
              <Pressable
                key={catalog.id ?? 'all'}
                style={({ pressed }) => [
                  styles.catalogChip,
                  on && styles.catalogChipSelected,
                  pressed && styles.catalogChipPressed,
                ]}
                onPress={() => setSelectedCatalog(catalog.id)}
                hitSlop={{ top: space.s6, bottom: space.s6 }}
                accessibilityRole="button"
                accessibilityLabel={catalog.id ? tr('orders.catalog.catalogName', { name: catalog.name }) : tr('orders.catalog.allCatalogs')}
                accessibilityState={{ selected: on }}
              >
                {on && <Icon name="check" size={iconSize.sm} color={t.brand.tint} />}
                <Text style={[styles.catalogChipText, on && styles.catalogChipTextSelected]} maxFontSizeMultiplier={1.6}>
                  {catalog.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Extra padding at bottom */}
      <View style={styles.footerSpacer} />
    </>
  ), [catalogs, selectedCatalog, styles, t, isLoadingMore]);

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      snapPoints={snapPoints}
      onDismiss={handleSheetDismissed}
      // No swipe down while an Add is being saved.
      enablePanDownToClose={!isSaving}
      keyboardBehavior="extend"
      // SAP Fiori Bottom Sheet styling
      backdropComponent={renderBackdrop}
      style={styles.sheetShadow}
      backgroundStyle={styles.bottomSheetBackground}
      handleIndicatorStyle={styles.bottomSheetHandle}
      handleStyle={styles.bottomSheetHandleContainer}
    >
      {loading ? (
        <View style={styles.loadingContainer} accessibilityRole="progressbar" accessibilityLabel={tr('items.list.loadingLabel')}>
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.loadingText}>{tr('items.list.loading')}</Text>
        </View>
      ) : (
        <BottomSheetFlatList
          data={displayItems}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          // A row with a reason on it is taller than the fixed estimate.
          getItemLayout={failedReasons.size > 0 || checking ? undefined : getItemLayout}
          ListHeaderComponent={listHeaderComponent}
          ListEmptyComponent={listEmptyComponent}
          ListFooterComponent={listFooterComponent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
        />
      )}
    </BottomSheetModal>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  backdrop: { backgroundColor: t.overlay.scrim },
  sheetShadow: { ...t.shadow[4] },
  listContent: { flexGrow: 1, paddingBottom: space.xl, backgroundColor: t.background.base },
  footerSpacer: { height: 100 },
  loadMoreRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.lg,
    gap: space.sm,
  },
  loadMoreText: { ...typography.subhead, color: t.text.secondary },
  catalogChip: {
    minHeight: 32,
    flexDirection: 'row' as const,
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.s6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: t.border.button,
    backgroundColor: t.surface.card,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  catalogChipSelected: { backgroundColor: t.brand.subtle, borderColor: t.brand.subtle },
  catalogChipPressed: { backgroundColor: t.brand.subtleStrong },
  catalogChipText: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.text.primary },
  catalogChipTextSelected: { color: t.brand.tint },
  topSearchContainer: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.md,
    backgroundColor: t.surface.sheet,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  searchField: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: layout.rowMinHeight,
    paddingHorizontal: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: t.border.field,
    backgroundColor: t.surface.field,
  },
  topSearchInput: {
    ...typography.body,
    flex: 1,
    paddingVertical: space.sm,
    color: t.text.primary,
  },
  clearButton: { alignItems: 'center' as const, justifyContent: 'center' as const },
  bottomCatalogFilter: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    flexWrap: 'wrap' as const,
  },
  bottomSheetBackground: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  bottomSheetHandleContainer: { paddingTop: space.sm, paddingBottom: 0 },
  bottomSheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: t.border.separator,
    borderRadius: radius.pill,
  },
  bottomSheetHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: 56,
    paddingHorizontal: space.sm,
    backgroundColor: t.surface.sheet,
  },
  headerTitle: { ...typography.headline, color: t.text.primary, textAlign: 'center' as const, flex: 1 },
  headerButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
  },
  headerButtonEnd: { alignItems: 'flex-end' as const },
  headerSaving: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, flexShrink: 1 },
  notSavedSummary: { paddingHorizontal: layout.marginCompact, paddingTop: space.sm },
  rowReason: { paddingHorizontal: space.lg, paddingBottom: space.md },
  headerButtonPressed: { backgroundColor: t.brand.subtle },
  headerButtonTextCancel: { ...typography.body, color: t.brand.tint },
  headerButtonTextAction: { ...typography.headline, color: t.brand.tint },
  headerDivider: { height: StyleSheet.hairlineWidth, backgroundColor: t.border.divider },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.surface.sheet,
  },
  loadingText: { ...typography.subhead, marginTop: space.md, color: t.text.secondary },
  itemCard: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    marginTop: space.sm,
    marginHorizontal: layout.marginCompact,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  itemCardInOrder: {
    backgroundColor: t.brand.subtle,
    borderLeftWidth: 4,
    borderLeftColor: t.brand.tint,
  },
  objectCellRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    padding: space.lg,
    gap: space.md,
    minHeight: layout.objectCellMinHeight,
  },
  statusIconContainer: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
  },
  mainContent: { flex: 1, gap: space.xs },
  titleRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: space.sm },
  titleText: { ...typography.headline, color: t.text.primary, flex: 1 },
  subtitleRow: { marginTop: space.xxs },
  subtitleText: { ...typography.subhead, color: t.text.secondary },
  footerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: space.xs,
    flexWrap: 'wrap' as const,
    columnGap: space.md,
    rowGap: space.xs,
  },
  footerItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  footerText: { ...typography.footnote, color: t.text.secondary },
  attributeStack: { alignItems: 'flex-end' as const, gap: space.sm, minWidth: 60 },
  statusBadge: { alignSelf: 'flex-end' as const },
  stockValueContainer: { alignItems: 'flex-end' as const },
  stockValueText: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  stockValueFlash: { color: t.status.negative.text },
  stockLabel: { ...typography.caption1, color: t.text.secondary, fontVariant: ['tabular-nums' as const] },
  alreadyInOrderBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xxs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: t.brand.tint,
  },
  alreadyInOrderBadgeText: { ...typography.caption1, fontWeight: fontWeight.semibold, color: t.brand.tint },
  quantitySection: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  presetButtonsRow: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  presetButton: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  secondaryPressed: { backgroundColor: t.brand.subtle },
  disabled: { opacity: t.interaction.disabledOpacity },
  presetButtonText: {
    ...typography.callout,
    color: t.brand.tint,
    textAlign: 'center' as const,
    fontVariant: ['tabular-nums' as const],
  },
  quantityControlsContainer: { alignItems: 'center' as const },
  quantityControls: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  quantityButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: t.border.button,
  },
  quantityButtonText: { ...typography.headline, color: t.brand.tint },
  smallButtonText: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.brand.tint },
  quantity: {
    ...typography.body,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    marginHorizontal: space.sm,
    minWidth: 30,
    textAlign: 'center' as const,
    fontVariant: ['tabular-nums' as const],
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.max,
    paddingHorizontal: space.xxl,
  },
  emptyText: { ...typography.title3, color: t.text.primary, textAlign: 'center' as const },
  emptySubtext: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
});

export default ItemCatalogBrowser;
