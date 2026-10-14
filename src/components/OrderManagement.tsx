import { getSessionGeneration } from '@/config/sessionLifecycle';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useOrderLiveUpdates } from '@/hooks/useOrderLiveUpdates';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Pressable,
  TextInput,
  Modal,
} from 'react-native';
import {
  Surface,
  ActivityIndicator,
} from 'react-native-paper';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { OrderService } from '@/services/order-service';
import { Order, OrderItem, Customer } from '@/types/order.types';
import ItemCatalogBrowser from './ItemCatalogBrowser';
import OrderItemCard from './OrderItemCard';
import CustomerOrderSummary from './CustomerOrderSummary';
import RecentDispatchesSection from './RecentDispatchesSection';
import { searchService, SearchResult } from '@/services/search-service';

import { showAlert } from '@/utils/alert';
import { normalizeDigits, t as tr } from '@/i18n';
import { formatCount } from '@/utils/formatters';
import { serverText } from '@/utils/serverText';
import { cartFailureReason, isAlreadyRemoved, isBusinessInactive, isConnectionFailure } from '@/features/orders/cartFailureReason';
import type { PickerChange, PickerResult } from '@/features/orders/pickerDraft';

const NO_LINES: OrderItem[] = [];
const isOpenLine = (item: OrderItem) => (item.item_status || '').toLowerCase() !== 'fulfilled';

/** Plain JSON values (server answers) compared by content. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && sameValue(left[key], right[key]));
}

/**
 * The order the server sent, keeping the previous objects for everything whose
 * content did not change: the whole order when nothing changed, otherwise each
 * unchanged line, so the memoized line cards render only for lines that changed.
 */
function keepUnchanged(previous: Order | null, next: Order): Order {
  if (!previous || previous.id !== next.id) return next;
  if (sameValue(previous, next)) return previous;
  if (!previous.items || !next.items) return next;
  const before = new Map(previous.items.map(item => [item.id, item]));
  let sameLines = previous.items.length === next.items.length;
  const items = next.items.map((item, index) => {
    const old = before.get(item.id);
    if (old && sameValue(old, item)) {
      if (previous.items![index] !== old) sameLines = false;
      return old;
    }
    sameLines = false;
    return item;
  });
  return { ...next, items: sameLines ? previous.items : items };
}

interface OrderManagementProps {
  customerId?: string;
  onOpenItemCatalog?: () => void;
  itemCatalogOpen?: boolean;
  onCloseItemCatalog?: () => void;
  /** A warehouse login (admin, supervisor, staff), not a customer's own. */
  staffView?: boolean;
  /** The customer record says the business is turned off or deleted. */
  businessInactive?: boolean;
  /** The facility refused to open an order because the business is not active. */
  onBusinessInactive?: () => void;
}

const OrderManagement: React.FC<OrderManagementProps> = ({
  customerId,
  onOpenItemCatalog,
  itemCatalogOpen,
  onCloseItemCatalog,
  staffView = false,
  businessInactive: businessOff = false,
  onBusinessInactive,
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showItemCatalogInternal, setShowItemCatalogInternal] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<SearchResult[]>([]);
  // The facility refused to open an order because the business is no longer active.
  const [businessInactive, setBusinessInactive] = useState(false);

  // Each start of an order read is numbered; an answer that is not the latest one is dropped,
  // so a slow answer for a business the screen has left never becomes the order shown.
  const initRun = useRef(0);
  // Another business in the same editor: the previous order is cleared in this very render
  // (React renders again before anything is shown), so no quantity change, removal or Add
  // can reach it while the new order loads.
  const [orderFor, setOrderFor] = useState(customerId);
  if (orderFor !== customerId) {
    setOrderFor(customerId);
    initRun.current += 1;
    setOrder(null);
    setSelectedCustomer(null);
    setBusinessInactive(false);
    setLoading(Boolean(customerId));
  }

  // Use external control if provided, otherwise internal state
  const showItemCatalog = itemCatalogOpen !== undefined ? itemCatalogOpen : showItemCatalogInternal;
  const setShowItemCatalog = (onOpenItemCatalog || onCloseItemCatalog)
    ? (show: boolean) => {
        if (show && onOpenItemCatalog) onOpenItemCatalog();
        if (!show && onCloseItemCatalog) onCloseItemCatalog();
      }
    : setShowItemCatalogInternal;

  // Initialize order for customer
  const initializeOrder = useCallback(async (custId: string) => {
    initRun.current += 1;
    const run = initRun.current;
    try {
      setLoading(true);
      setBusinessInactive(false);
      if (__DEV__) console.log('[OrderManagement] Initializing order for customer:', custId);

      // Get or create order
      const orderResult = await OrderService.getOrCreateOrder(custId);
      if (run !== initRun.current) return;

      if (!orderResult.success) {
        if (isBusinessInactive(orderResult)) {
          setBusinessInactive(true);
          onBusinessInactive?.();
          return;
        }
        showAlert(tr('orders.manage.couldNotOpenTitle'), serverText(orderResult.message, tr('common.checkConnection')));
        return;
      }

      if (__DEV__) console.log('[OrderManagement] About to fetch order details with cart_id:', orderResult.data!.cart_id);

      // Fetch order with items
      const orderDetailsResult = await OrderService.getOrderWithItems(orderResult.data!.cart_id);
      if (run !== initRun.current) return;

      if (__DEV__) console.log('[OrderManagement] Order details result:', {
        success: orderDetailsResult.success,
        hasData: !!orderDetailsResult.data,
        error: orderDetailsResult.error,
        message: orderDetailsResult.message
      });

      if (orderDetailsResult.success && orderDetailsResult.data) {
        if (__DEV__) console.log('[OrderManagement] Setting order data:', {
          orderId: orderDetailsResult.data.id,
          customer: orderDetailsResult.data.customer?.name,
          itemCount: orderDetailsResult.data.total_items,
          totalQuantity: orderDetailsResult.data.total_quantity,
          hasItems: !!orderDetailsResult.data.items,
          itemsLength: orderDetailsResult.data.items?.length || 0,
          updated_at: orderDetailsResult.data.updated_at,
          created_at: orderDetailsResult.data.created_at,
          updated_by: orderDetailsResult.data.updated_by_display_name,
        });

        setOrder(orderDetailsResult.data);
        setSelectedCustomer(orderDetailsResult.data.customer || null);
      } else {
        console.error('[OrderManagement] Failed to load order details:', {
          success: orderDetailsResult.success,
          error: orderDetailsResult.error,
          message: orderDetailsResult.message
        });
        showAlert(tr('orders.manage.couldNotLoadTitle'), tr('common.checkConnection'));
      }
    } catch (error) {
      if (run !== initRun.current) return;
      console.error('[OrderManagement] Error initializing order:', error);
      showAlert(tr('orders.manage.couldNotOpenTitle'), tr('common.checkConnection'));
    } finally {
      if (run === initRun.current) setLoading(false);
    }
  }, []);

  // Load initial data. A change of business also closes the Add items picker of the old one.
  const loadedCustomerId = useRef(customerId);
  useEffect(() => {
    if (loadedCustomerId.current !== customerId) {
      loadedCustomerId.current = customerId;
      setShowItemCatalog(false);
    }
    if (customerId) {
      initializeOrder(customerId);
    } else {
      // Show customer search if no customerId provided
      setShowCustomerSearch(true);
    }
  }, [customerId]);

  // Search customers
  const searchCustomers = useCallback(async (query: string) => {
    try {
      const results = await searchService.searchCustomers(normalizeDigits(query));
      setCustomerSearchResults(results);
    } catch (error) {
      console.error('[OrderManagement] Customer search error:', error);
    }
  }, []);

  // Handle customer search
  useEffect(() => {
    if (customerSearchQuery.length > 2) {
      searchCustomers(customerSearchQuery);
    } else {
      setCustomerSearchResults([]);
    }
  }, [customerSearchQuery]);

  // Handle customer selection
  const handleCustomerSelect = useCallback(async (customer: SearchResult) => {
    if (__DEV__) console.log('[OrderManagement] Customer selected:', customer);

    setShowCustomerSearch(false);
    setCustomerSearchQuery('');
    setCustomerSearchResults([]);
    await initializeOrder(customer.value);
  }, [initializeOrder]);

  const activeOrderId = useRef(order?.id);
  activeOrderId.current = order?.id;
  useEffect(() => () => { activeOrderId.current = undefined; }, []);
  // The order as last rendered, for callbacks that stay the same across renders.
  const orderRef = useRef(order);
  orderRef.current = order;

  // Reads can overlap (a live update, a quantity save, the picker's read after a save). They are
  // numbered when they start; an answer older than one already applied is dropped, so a slow
  // read that started before a write never puts the lines from before the write back.
  const refreshStarted = useRef(0);
  const refreshApplied = useRef(0);
  const refreshesRunning = useRef(0);

  // Handle refresh. Stable, so the line cards keep their props while it runs.
  const onRefresh = useCallback(async () => {
    const current = orderRef.current;
    if (!current) return;

    const sessionGeneration = getSessionGeneration();
    refreshStarted.current += 1;
    const sequence = refreshStarted.current;
    refreshesRunning.current += 1;
    setRefreshing(true);
    try {
      const result = await OrderService.getOrderWithItems(current.id);
      if (sessionGeneration !== getSessionGeneration() || activeOrderId.current !== current.id) return;
      if (sequence < refreshApplied.current) return;
      if (result.success && result.data) {
        const next = result.data;
        refreshApplied.current = sequence;
        setOrder(previous => keepUnchanged(previous, next));
      }
    } catch (error) {
      console.error('[OrderManagement] Refresh error:', error);
    } finally {
      refreshesRunning.current -= 1;
      if (refreshesRunning.current === 0) setRefreshing(false);
    }
  }, []);

  useOrderLiveUpdates(onRefresh, !!order);

  // Handle quantity update for one line, by its id; one function for every card.
  // Resolves true only when the server stored the quantity.
  // `lineOrderId` is the order the line belongs to, sent by the card. It is the order the
  // write goes to even when the editor has moved on to another business meanwhile (a quantity
  // still waiting to be saved when the card goes away is saved to its own order, never to the
  // new one). Without it, the order shown now.
  const handleQuantityUpdate = useCallback(async (itemId: string, newQuantity: number, lineOrderId?: string): Promise<boolean> => {
    const orderId = lineOrderId || orderRef.current?.id;
    if (!orderId) return false;

    try {
      const result = await OrderService.updateOrderItemQuantity(
        itemId,
        orderId,
        newQuantity
      );

      if (result.success) {
        // Refresh order, while it is still the one shown
        if (activeOrderId.current === orderId) await onRefresh();
        return true;
      }
      showAlert(tr('orders.manage.couldNotChangeQuantityTitle'), serverText(result.message, tr('common.checkConnection')));
      return false;
    } catch (error) {
      console.error('[OrderManagement] Update quantity error:', error);
      showAlert(tr('orders.manage.couldNotChangeQuantityTitle'), tr('common.checkConnection'));
      return false;
    }
  }, [onRefresh]);

  // Handle removal of one line, by its id; one function for every card.
  const handleRemoveItem = useCallback((itemId: string) => {
    const current = orderRef.current;
    const item = current?.items?.find(line => line.id === itemId);
    if (!current || !item) return;

    const itemName = item.grn_item?.name;
    showAlert(
      itemName ? tr('orders.manage.removeTitle', { name: itemName }) : tr('orders.manage.removeTitleNoName'),
      itemName ? tr('orders.manage.removeMessage', { name: itemName }) : tr('orders.manage.removeMessageNoName'),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('orders.manage.removeItem'),
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await OrderService.removeItemFromOrder(item.id, current.id);
              if (result.success) {
                await onRefresh();
              } else {
                showAlert(tr('orders.manage.couldNotRemoveTitle'), serverText(result.message, tr('common.checkConnection')));
              }
            } catch (error) {
              console.error('[OrderManagement] Remove item error:', error);
              showAlert(tr('orders.manage.couldNotRemoveTitle'), tr('common.checkConnection'));
            }
          }
        }
      ]
    );
  }, [onRefresh]);

  // True while the phone reports no network at all (aeroplane mode, no Wi-Fi and
  // no mobile data). "Connected, but the internet is not reachable" does not
  // count: a facility's own server can still answer on its local network. Nor
  // does an unknown reading (the hook gives `isConnected` false and type
  // 'unknown' while NetInfo has not decided): the save is tried then.
  const { isConnected, type: networkType } = useNetworkStatus();
  const noNetworkRef = useRef(false);
  noNetworkRef.current = isConnected === false && networkType === 'none';

  // Saves what the Add items picker changed, one lot after another, and answers
  // for each lot. A lot the user did not touch is not in `changes`, so a line
  // another user added meanwhile is never removed. Each change is resolved
  // against the lines as they are saved now, not as they were when the picker
  // opened, but never over a change the user has not seen: when the open line
  // holds neither the asked-for quantity nor the one the picker expected
  // (`expected`), someone else changed it meanwhile. Nothing is sent and the lot
  // comes back with that reason and the saved quantity; the picker takes it as
  // the new base, so a second Add applies the user's number knowingly. Only open
  // lines count: a fully dispatched line is neither "already saved" nor updated.
  // Never rejects and shows no alert: the picker shows each reason on its lot.
  //
  // The picker has no way out while this runs, so it must not wait long. A lot the
  // server refuses is an answer, and the next lot is sent. A call that got no
  // answer (a timeout, no connection, a call that threw) ends the save: every
  // further write could wait its own full time limit on the same dead connection.
  // The lots not sent come back not saved and stay selected in the picker. For
  // the same reason the read after such a save is started and not waited for.
  const handleItemsAdded = useCallback(async (
    changes: PickerChange[],
    onProgress?: (position: number, total: number) => void,
  ): Promise<PickerResult[]> => {
    const notSaved = (grnItemId: string): PickerResult =>
      ({ grnItemId, ok: false, reason: tr('orders.catalog.reasonNotSaved') });
    const sessionGeneration = getSessionGeneration();
    // The order the picker was opened for. Every lot goes to it, and the save stops when the
    // editor has moved on (another business, or the screen closed: `activeOrderId` is cleared).
    const startOrderId = orderRef.current?.id;
    // Quantities first, removals last.
    const ordered = [...changes.filter(change => change.quantity > 0), ...changes.filter(change => change.quantity <= 0)];
    const results = new Map<string, PickerResult>();
    let anyCall = false;
    // The save ended for want of a connection, before its last lot.
    let noAnswer = false;

    for (let index = 0; index < ordered.length; index += 1) {
      const change = ordered[index];
      const current = orderRef.current;
      // A sign-out or a change of facility ends the save; the rest is not sent.
      if (!current || current.id !== startOrderId || activeOrderId.current !== startOrderId || sessionGeneration !== getSessionGeneration()) break;
      onProgress?.(index + 1, ordered.length);

      const line = current.items?.find(item => item.grn_item_id === change.grnItemId && isOpenLine(item));
      const savedQuantity = line?.requested_quantity ?? 0;
      try {
        if (savedQuantity === change.quantity) {
          // Already as asked (also a removal of a lot with no open line): no call.
          results.set(change.grnItemId, { grnItemId: change.grnItemId, ok: true });
          continue;
        }
        if (savedQuantity !== change.expected) {
          const bagsNow = formatCount(savedQuantity, 'bag');
          const reason = change.quantity <= 0
            ? tr('orders.catalog.reasonChangedMeanwhileRemove', { bags: bagsNow })
            : savedQuantity === 0
              ? tr('orders.catalog.reasonRemovedMeanwhile', { chosen: formatCount(change.quantity, 'bag') })
              : tr('orders.catalog.reasonChangedMeanwhile', { bags: bagsNow, chosen: formatCount(change.quantity, 'bag') });
          results.set(change.grnItemId, { grnItemId: change.grnItemId, ok: false, reason, savedQuantity });
          continue;
        }
        if (change.quantity > 0) {
          // No network: this lot and the rest are not sent.
          if (noNetworkRef.current) {
            noAnswer = true;
            break;
          }
          anyCall = true;
          const result = line
            ? await OrderService.updateOrderItemQuantity(line.id, current.id, change.quantity)
            : await OrderService.addItemToOrder(current.id, change.grnItemId, change.quantity);
          if (!result.success) console.error('[OrderManagement] Item not saved:', result.message, result.error);
          results.set(change.grnItemId, result.success
            ? { grnItemId: change.grnItemId, ok: true }
            : { grnItemId: change.grnItemId, ok: false, reason: cartFailureReason(result) });
          if (!result.success && isConnectionFailure(result)) {
            noAnswer = true;
            break;
          }
        } else {
          if (noNetworkRef.current) {
            noAnswer = true;
            break;
          }
          anyCall = true;
          // A removal that reaches here has an open line: with none, the saved quantity is 0, answered above.
          const result = await OrderService.removeItemFromOrder(line!.id, current.id);
          // "Order item not found": someone else removed it first, which is what was asked for.
          const removed = result.success || isAlreadyRemoved(result);
          if (!removed) console.error('[OrderManagement] Item not removed:', result.message, result.error);
          results.set(change.grnItemId, removed
            ? { grnItemId: change.grnItemId, ok: true }
            : { grnItemId: change.grnItemId, ok: false, reason: cartFailureReason(result) });
          if (!removed && isConnectionFailure(result)) {
            noAnswer = true;
            break;
          }
        }
      } catch (error) {
        console.error('[OrderManagement] Save item error:', error);
        results.set(change.grnItemId, notSaved(change.grnItemId));
        noAnswer = true;
        break;
      }
    }

    // The order is read again after any call, saved or not. A saved lot shows
    // before the picker closes or lists what was not saved. A lot that was not
    // saved may have failed because the lines here are out of date (a write that
    // timed out but was applied, a line someone else removed): without this read
    // the next Add would fail on it the same way.
    if (anyCall && sessionGeneration === getSessionGeneration() && activeOrderId.current === startOrderId) {
      const read = onRefresh().catch(error => {
        console.error('[OrderManagement] Refresh after save error:', error);
      });
      // A save that ended for want of a connection answers now: the read would
      // wait its own time limit on the same connection. It goes on by itself, and
      // the next Add takes the lines as they are saved by then.
      if (!noAnswer) await read;
    }

    return changes.map(change => results.get(change.grnItemId) ?? notSaved(change.grnItemId));
  }, [onRefresh]);


  // The open lines, kept while the order's lines are unchanged.
  const openItems = useMemo(() => order?.items?.filter(isOpenLine) ?? NO_LINES, [order?.items]);
  // The same lines as the picker takes them. Kept while the lines are unchanged:
  // the picker seeds its selection from them once, when it opens.
  const pickerLines = useMemo(
    () => openItems.map(item => ({
      grnItemId: item.grn_item_id,
      quantity: item.requested_quantity,
      item: item.grn_item!,
    })),
    [openItems]
  );

  if (loading && !order) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={t.brand.tint} accessibilityLabel={tr('orders.manage.loadingLabel')} />
        <Text style={styles.loadingText}>{tr('orders.manage.loading')}</Text>
      </View>
    );
  }

  if (businessInactive) {
    return (
      <View style={styles.emptyState}>
        <Icon name="store-off-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyText} accessibilityRole="header">{tr('orders.manage.couldNotOpenTitle')}</Text>
        <Text style={styles.emptySubtext}>{tr(staffView ? 'orders.manage.businessOff' : 'orders.manage.businessInactive')}</Text>
      </View>
    );
  }

  const closeCustomerSearch = () => {
    setShowCustomerSearch(false);
    if (!selectedCustomer) {
      router.back();
    }
  };

  return (
    <Surface style={styles.container} elevation={0}>

      {/* A turned-off business can still be opened by the warehouse, but takes no new items */}
      {staffView && businessOff && (
        <View style={styles.offBanner}>
          <Icon name="store-off-outline" size={iconSize.md} color={t.status.neutral.text} />
          <Text style={styles.offBannerText}>{tr('orders.manage.businessOff')}</Text>
        </View>
      )}

      {/* Order Items */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[t.brand.tint]}
            tintColor={t.brand.tint}
            progressBackgroundColor={t.surface.card}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Recent Dispatches Section - Show customer's recent dispatch history */}
        {customerId && (
          <RecentDispatchesSection customerId={customerId} />
        )}

        {/* Every card gets the same two callbacks and its own line object, so a
            refresh renders only the cards whose line changed (OrderItemCard is memoized). */}
        {openItems.length > 0 ? (
          <>
            {openItems.map((item) => (
              <OrderItemCard
                key={item.id}
                item={item}
                onQuantityChange={handleQuantityUpdate}
                onRemove={handleRemoveItem}
              />
            ))}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Icon name="clipboard-list-outline" size={iconSize.hero} color={t.icon.secondary} />
            <Text style={styles.emptyText} accessibilityRole="header">{tr('orders.manage.emptyTitle')}</Text>
            <Text style={styles.emptySubtext}>
              {tr('orders.manage.emptyMessage')}
            </Text>
            <Button
              type="primary"
              size="standalone"
              leftIcon="plus"
              disabled={businessOff}
              onPress={() => setShowItemCatalog(true)}
              accessibilityLabel={tr('orders.screen.addItemsToOrder')}
            >
              {tr('orders.catalog.addItems')}
            </Button>
          </View>
        )}
      </ScrollView>


      {/* Sticky Order Summary Card - only show if there are non-fulfilled items */}
      {order && openItems.length > 0 && (
        <CustomerOrderSummary order={order} />
      )}

      {/* Customer search dialog (style guide §13.9); Android back closes it */}
      <Modal
        visible={showCustomerSearch}
        transparent
        animationType="fade"
        onRequestClose={closeCustomerSearch}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeCustomerSearch}
            accessibilityRole="button"
            accessibilityLabel={tr('customers.search.close')}
          />
          <View style={[styles.modalContent, { marginTop: insets.top + space.xxl }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} accessibilityRole="header">{tr('customers.search.title')}</Text>
              <Pressable
                onPress={closeCustomerSearch}
                style={({ pressed }) => [styles.modalCloseButton, pressed && styles.modalCloseButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel={tr('customers.search.close')}
              >
                <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
              </Pressable>
            </View>

            <View style={styles.searchField}>
              <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} />
              <TextInput
                style={styles.searchInput}
                placeholder={tr('customers.search.placeholder')}
                value={customerSearchQuery}
                onChangeText={setCustomerSearchQuery}
                placeholderTextColor={t.text.placeholder}
                accessibilityLabel={tr('customers.search.placeholder')}
                autoCorrect={false}
                returnKeyType="search"
                autoFocus
              />
            </View>

            <ScrollView style={styles.customerList} keyboardShouldPersistTaps="handled">
              {customerSearchResults.map((customer) => (
                <Pressable
                  key={customer.value}
                  style={({ pressed }) => [styles.customerItem, pressed && styles.customerItemPressed]}
                  onPress={() => handleCustomerSelect(customer)}
                  accessibilityRole="button"
                  accessibilityLabel={customer.detail ? tr('orders.manage.labelDetail', { label: customer.label, detail: customer.detail }) : customer.label}
                >
                  <Text style={styles.customerName}>{customer.label}</Text>
                  {customer.detail && (
                    <Text style={styles.customerDetail}>{customer.detail}</Text>
                  )}
                </Pressable>
              ))}

              {customerSearchQuery.length > 2 && customerSearchResults.length === 0 && (
                <Text style={styles.noResults}>
                  {tr('customers.search.noMatchTryFewer', { search: customerSearchQuery })}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Item Catalog Modal */}
      {showItemCatalog && order && selectedCustomer && (
        <ItemCatalogBrowser
          isVisible={showItemCatalog}
          onClose={() => setShowItemCatalog(false)}
          onAddItems={handleItemsAdded}
          currentOrderId={order.id}
          customerId={selectedCustomer.id}
          currentOrderItems={pickerLines}
        />
      )}
    </Surface>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.background.base,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.md,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: space.xl,
    paddingBottom: space.max + space.lg, // Space for the sticky summary bar
  },
  // Empty state (style guide §13.6)
  offBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: t.status.neutral.background,
  },
  offBannerText: {
    ...typography.subhead,
    flex: 1,
    color: t.status.neutral.text,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: space.giant,
    paddingHorizontal: space.xxxl,
    gap: space.sm,
  },
  emptyText: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginTop: space.md,
  },
  emptySubtext: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.lg,
  },
  // Dialog over the scrim
  modalOverlay: {
    flex: 1,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'flex-start' as const,
    alignItems: 'center' as const,
    paddingHorizontal: layout.marginCompact,
  },
  modalContent: {
    backgroundColor: t.surface.sheet,
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    maxHeight: '80%' as const,
    borderRadius: radius.card,
    ...t.shadow[4],
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  modalTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  modalCloseButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  modalCloseButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  searchField: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    margin: space.lg,
    paddingHorizontal: space.md,
    minHeight: layout.rowMinHeight,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: t.border.field,
    backgroundColor: t.surface.field,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    color: t.text.primary,
    paddingVertical: space.sm,
  },
  customerList: {
    maxHeight: 400,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
  },
  customerItem: {
    minHeight: layout.rowMinHeight,
    justifyContent: 'center' as const,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  customerItemPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  customerName: {
    ...typography.headline,
    color: t.text.primary,
  },
  customerDetail: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  noResults: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginTop: space.xxxl,
  },
});

export default OrderManagement;