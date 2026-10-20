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
import { Order, OrderItem, Customer, LineSaved } from '@/types/order.types';
import ItemCatalogBrowser from './ItemCatalogBrowser';
import OrderItemCard from './OrderItemCard';
import CustomerOrderSummary from './CustomerOrderSummary';
import RecentDispatchesSection from './RecentDispatchesSection';
import { searchService, SearchResult } from '@/services/search-service';

import { askAlert, showAlert } from '@/utils/alert';
import { normalizeDigits, t as tr } from '@/i18n';
import { formatCount } from '@/utils/formatters';
import { serverText } from '@/utils/serverText';
import {
  accessRefusalText,
  cartFailureReason,
  isAlreadyRemoved,
  isBusinessInactive,
  isConnectionFailure,
  isCustomerAccessDenied,
  mayHaveBeenSaved,
} from '@/features/orders/cartFailureReason';
import type { AddItemsOptions, PickerChange, PickerResult } from '@/features/orders/pickerDraft';
import { abortedError, isAbortError, readUntilAnswered, waitForServer } from '@/utils/lostAnswer';
import { REFUSAL } from '@/utils/serverRefusal';

const NO_LINES: OrderItem[] = [];
/** What a line whose answer was lost is being checked for: a change of its quantity, or its removal. */
type LineCheck = 'save' | 'remove';
const NO_CHECKS: ReadonlyMap<string, LineCheck> = new Map();
const isOpenLine = (item: OrderItem) => (item.item_status || '').toLowerCase() !== 'fulfilled';

/**
 * True when a read of the order, made after a failed call, no longer has the open line: it is gone for certain.
 * False when the line is still there, or when the read gave no answer (null) or no lines to look at.
 */
const isLineMissing = (read: Order | null, lineId: string): boolean =>
  read !== null && Array.isArray(read.items) && !read.items.some(line => line.id === lineId && isOpenLine(line));

/**
 * The cart calls for a line the screen has read. The line's version (`updated_at`, owner decision D1) goes along only when
 * the caller holds one, so a server that sends none gets the same call as before.
 */
const changeLine = (lineId: string, orderId: string, quantity: number, version?: string) =>
  version ? OrderService.updateOrderItemQuantity(lineId, orderId, quantity, version) : OrderService.updateOrderItemQuantity(lineId, orderId, quantity);
const dropLine = (lineId: string, orderId: string, version?: string) =>
  version ? OrderService.removeItemFromOrder(lineId, orderId, version) : OrderService.removeItemFromOrder(lineId, orderId);

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
  /** The customer record says the business is deactivated in Customers (it can still order its goods out). */
  businessDeactivated?: boolean;
  /** The customer record could not be read, so the refusal screen cannot tell deleted from deactivated. */
  businessRecordUnread?: boolean;
  /** The facility refused to open an order because the business was deleted. */
  onBusinessDeleted?: () => void;
}

const OrderManagement: React.FC<OrderManagementProps> = ({
  customerId,
  onOpenItemCatalog,
  itemCatalogOpen,
  onCloseItemCatalog,
  staffView = false,
  businessDeactivated = false,
  businessRecordUnread = false,
  onBusinessDeleted,
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
  // The facility refused to open an order because the business was deleted.
  const [businessRefused, setBusinessRefused] = useState(false);
  const businessDeleted = businessRefused;

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
    setBusinessRefused(false);
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
      setBusinessRefused(false);
      if (__DEV__) console.log('[OrderManagement] Initializing order for customer:', custId);

      // Get or create order
      const orderResult = await OrderService.getOrCreateOrder(custId);
      if (run !== initRun.current) return;

      if (!orderResult.success) {
        if (isBusinessInactive(orderResult)) {
          setBusinessRefused(true);
          onBusinessDeleted?.();
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
      // Always the server's answer: on an older facility a deactivated business has `deleted_at`
      // set, and the server still lets an existing order be opened there.
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

  // Reads the order again. Stable, so the line cards keep their props while it runs. Resolves the order that was
  // read, also when a newer read has been applied meanwhile (it still says what the order held after the call that
  // asked for it); null when nothing was read (no order, a failed read, the screen has moved on).
  const rereadOrder = useCallback(async (showSpinner: boolean = true): Promise<Order | null> => {
    const current = orderRef.current;
    if (!current) return null;

    const sessionGeneration = getSessionGeneration();
    refreshStarted.current += 1;
    const sequence = refreshStarted.current;
    refreshesRunning.current += 1;
    // Pull-to-refresh shows the spinner; the timed read is silent (as the lists' `isSilent`).
    if (showSpinner !== false) setRefreshing(true);
    try {
      const result = await OrderService.getOrderWithItems(current.id);
      if (sessionGeneration !== getSessionGeneration() || activeOrderId.current !== current.id) return null;
      if (!result.success || !result.data) return null;
      const next = result.data;
      if (sequence < refreshApplied.current) return next;
      refreshApplied.current = sequence;
      setOrder(previous => keepUnchanged(previous, next));
      return next;
    } catch (error) {
      console.error('[OrderManagement] Refresh error:', error);
      return null;
    } finally {
      refreshesRunning.current -= 1;
      if (refreshesRunning.current === 0) setRefreshing(false);
    }
  }, []);

  // Handle refresh (pull to refresh, the timed read, after a save).
  const onRefresh = useCallback(async (showSpinner: boolean = true): Promise<void> => {
    await rereadOrder(showSpinner);
  }, [rereadOrder]);

  useOrderLiveUpdates(() => onRefresh(false), !!order);

  // The lines this screen is taking off the order, or has taken off (from the question "Remove ...?" on). A save of such a
  // line that finds it gone is the screen's own doing: nobody is told "someone else removed it". A removal that is
  // not made (Cancel, or refused) takes the line out again.
  const ownRemovals = useRef(new Set<string>());

  // The lines (by id) whose answer was lost and which are being checked: locked, shown as checking, and no
  // change or removal of them is sent meanwhile. `checkingRef` is the one the handlers read; the state is
  // what the cards are drawn from.
  const [checkingLines, setCheckingLines] = useState<ReadonlyMap<string, LineCheck>>(NO_CHECKS);
  const checkingRef = useRef<ReadonlyMap<string, LineCheck>>(NO_CHECKS);
  // Aborted when the screen is left: it stops the waits and the reads of every check that is running.
  const screenAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    screenAbort.current = controller;
    return () => controller.abort();
  }, []);
  const setLineChecks = useCallback((ids: string[], kind: LineCheck | null) => {
    if (ids.length === 0) return;
    const next = new Map(checkingRef.current);
    ids.forEach(id => (kind ? next.set(id, kind) : next.delete(id)));
    checkingRef.current = next;
    if (!screenAbort.current?.signal.aborted) setCheckingLines(next);
  }, []);

  // After a change or a removal whose answer was lost (the request may have reached the server, no answer came):
  // locks `ids` (the lines it concerns), waits until the phone is online and 10 s have passed since `sentAt`, then
  // reads the order until the server answers, and resolves that order: the server's state, shown on the screen too.
  // Resolves null when the check was stopped (the screen was left, the editor moved on to another order or a
  // session, or `signal` was aborted). Nothing is sent again.
  const checkAfterLostAnswer = useCallback(async (
    ids: string[],
    kind: LineCheck,
    orderId: string,
    sentAt: number,
    signal?: AbortSignal,
  ): Promise<Order | null> => {
    const sessionGeneration = getSessionGeneration();
    // One signal for the check: the screen's and the caller's both stop it.
    const stop = new AbortController();
    const abort = () => stop.abort();
    const sources = [screenAbort.current?.signal, signal].filter((source): source is AbortSignal => source !== undefined);
    sources.forEach(source => {
      if (source.aborted) abort();
      else source.addEventListener('abort', abort);
    });
    setLineChecks(ids, kind);
    try {
      await waitForServer(sentAt, stop.signal);
      return await readUntilAnswered<Order>(() => {
        // The screen moved on while it waited: nothing is read for an order that is no longer here.
        if (sessionGeneration !== getSessionGeneration() || activeOrderId.current !== orderId) throw abortedError();
        return rereadOrder(false);
      }, stop.signal);
    } catch (error) {
      if (isAbortError(error)) return null;
      throw error;
    } finally {
      sources.forEach(source => source.removeEventListener('abort', abort));
      setLineChecks(ids, null);
    }
  }, [rereadOrder, setLineChecks]);

  // Handle quantity update for one line, by its id; one function for every card.
  // Resolves true only when the server stored the quantity.
  // `lineOrderId` is the order the line belongs to, sent by the card. It is the order the
  // write goes to even when the editor has moved on to another business meanwhile (a quantity
  // still waiting to be saved when the card goes away is saved to its own order, never to the
  // new one). Without it, the order shown now.
  //
  // A failed save is followed by a silent read of the order, so the card shows what is stored now
  // (a change that timed out may have been applied; a line may have been taken off meanwhile).
  //
  // `expectedUpdatedAt` is the version of the line the card's change is based on (owner decision D1). When the server
  // refuses with STALE_RECORD (someone else changed the line since), nothing was written: the order is read again, the
  // person is told so, and this resolves 'stale': the card drops what it was waiting to send, shows the quantity the line
  // holds now and starts from its latest version (a plain false would make it flash the stock red and ask again). Resolves
  // `{ updatedAt }` instead of true when the line's new version is known (the server named it, or the read that follows the
  // save has the line with the quantity that was saved), so the card's next change starts from it.
  const handleQuantityUpdate = useCallback(async (
    itemId: string,
    newQuantity: number,
    lineOrderId?: string,
    expectedUpdatedAt?: string,
  ): Promise<boolean | LineSaved | 'stale'> => {
    const orderId = lineOrderId || orderRef.current?.id;
    if (!orderId) return false;
    // The answer to an earlier call for this line was lost and is being checked: nothing is sent for it meanwhile.
    if (checkingRef.current.has(itemId)) return false;

    try {
      const sentAt = Date.now();
      const result = await changeLine(itemId, orderId, newQuantity, expectedUpdatedAt);

      if (result.success) {
        // Refresh order, while it is still the one shown
        const read = activeOrderId.current === orderId ? await rereadOrder() : null;
        if (result.updatedAt) return { updatedAt: result.updatedAt };
        // The server named no new version (an older one): the read that was just made has it, when the line holds the
        // quantity that was saved (another quantity means someone else changed it since, and the card must not take
        // over a version it has not seen).
        const saved = read?.items?.find(line => line.id === itemId && isOpenLine(line));
        return saved?.updated_at && saved.requested_quantity === newQuantity ? { updatedAt: saved.updated_at } : true;
      }
      // Someone else changed the line after this card read it: the server refused and wrote nothing. The order is read
      // again, and the card shows what the line holds now.
      if (result.refusal?.reason === REFUSAL.STALE_RECORD) {
        const read = activeOrderId.current === orderId ? await rereadOrder(false) : null;
        // The order is no longer the one shown (the editor moved on to another business, or the screen was left): there
        // is nothing to tell about it, and no connection problem to report.
        if (activeOrderId.current !== orderId) return 'stale';
        const stored = read?.items?.find(line => line.id === itemId && isOpenLine(line));
        // The line already holds the quantity that was asked (only something else on it changed): nothing is left to do.
        if (stored && stored.requested_quantity === newQuantity) return stored.updated_at ? { updatedAt: stored.updated_at } : true;
        if (stored) {
          showAlert(
            tr('orders.refusal.staleTitle'),
            tr('orders.refusal.stale', {
              current: formatCount(stored.requested_quantity, 'bag'),
              chosen: formatCount(newQuantity, 'bag'),
            })
          );
        } else if (read) {
          // Taken off the order (or dispatched) meanwhile; not news when this screen is taking it off itself.
          if (!ownRemovals.current.has(itemId)) showAlert(tr('orders.manage.lineGoneTitle'), tr('orders.manage.lineGoneMessage'));
        } else {
          // The read behind the refusal did not answer, so the quantity it holds now is not known.
          showAlert(tr('orders.refusal.staleTitle'), tr('common.checkConnection'));
        }
        return 'stale';
      }
      // No answer after the request went out: the line is locked, the server is asked what became of the change (the
      // order is read again once the phone is online and 10 s have passed) and the card shows the server's state.
      // Nothing is sent again by itself.
      if (mayHaveBeenSaved(result)) {
        const read = await checkAfterLostAnswer([itemId], 'save', orderId, sentAt);
        if (read === null) return false;
        const stored = read.items?.find(line => line.id === itemId && isOpenLine(line));
        // The change is on the server after all; the line's version is the one the read has, so the card's next change starts from it.
        if (stored?.requested_quantity === newQuantity) return stored.updated_at ? { updatedAt: stored.updated_at } : true;
        if (!stored) {
          // Taken off the order (or dispatched) meanwhile; not news when this screen is taking it off itself.
          if (!ownRemovals.current.has(itemId)) showAlert(tr('orders.manage.lineGoneTitle'), tr('orders.manage.lineGoneMessage'));
        } else {
          showAlert(tr('orders.manage.couldNotChangeQuantityTitle'), tr('orders.manage.lostAnswerNotSaved'));
        }
        return false;
      }
      // The order is read again behind the alert, so the card shows what is stored now.
      const read = activeOrderId.current === orderId ? rereadOrder(false) : Promise.resolve<Order | null>(null);
      // "Order item not found": taken off the order, or used up by a dispatch, since this screen read it. A customer
      // login on an older facility is answered "Customer access denied" for such a line, and also for a real
      // refusal: only the read that no longer has the line says which.
      const gone = isAlreadyRemoved(result) || (isCustomerAccessDenied(result) && isLineMissing(await read, itemId));
      if (gone) {
        // Not while this screen is taking the line off the order itself: that is why the save found no line.
        if (!ownRemovals.current.has(itemId)) showAlert(tr('orders.manage.lineGoneTitle'), tr('orders.manage.lineGoneMessage'));
      } else {
        showAlert(
          tr('orders.manage.couldNotChangeQuantityTitle'),
          accessRefusalText(result) ?? serverText(result.message, tr('common.checkConnection'), { write: true })
        );
      }
      return false;
    } catch (error) {
      console.error('[OrderManagement] Update quantity error:', error);
      showAlert(tr('orders.manage.couldNotChangeQuantityTitle'), tr('common.checkConnection'));
      return false;
    }
  }, [rereadOrder, checkAfterLostAnswer]);

  // Handle removal of one line, by its id; one function for every card. Asks first, then removes.
  // Resolves true when the line is gone (removed, or already gone), false when it stays (the person said no, or
  // the removal was refused), and 'unknown' when no answer came and the line may be gone. The card keeps its
  // buttons off while this runs and, on false or 'unknown', takes them back (and on 'unknown' sends no change
  // of the quantity that was waiting).
  //
  // `getExpectedUpdatedAt` gives the version of the line the card holds (owner decision D1). It is asked for when the
  // removal is actually sent, after the question above and after the card's own running save has finished (that save leaves
  // a new version, and a removal sent with the old one would be refused as stale). A STALE_RECORD answer means someone
  // else changed the line since: it was not removed, the order is read again, and the person is told to check it.
  const handleRemoveItem = useCallback(async (
    itemId: string,
    getExpectedUpdatedAt?: () => Promise<string | undefined>,
  ): Promise<boolean | 'unknown'> => {
    const current = orderRef.current;
    const item = current?.items?.find(line => line.id === itemId);
    if (!current || !item) return false;

    // The answer to an earlier call for this line was lost and is being checked: nothing is sent for it meanwhile.
    if (checkingRef.current.has(itemId)) return false;

    const itemName = item.grn_item?.name;
    // From the question on, a save of this line that finds it gone is not news (see ownRemovals).
    ownRemovals.current.add(itemId);
    const answer = await askAlert<'cancel' | 'remove'>(
      itemName ? tr('orders.manage.removeTitle', { name: itemName }) : tr('orders.manage.removeTitleNoName'),
      itemName ? tr('orders.manage.removeMessage', { name: itemName }) : tr('orders.manage.removeMessageNoName'),
      [
        { text: tr('common.cancel'), style: 'cancel', value: 'cancel' },
        { text: tr('orders.manage.removeItem'), style: 'destructive', value: 'remove' },
      ],
      'cancel'
    );
    if (answer !== 'remove') {
      ownRemovals.current.delete(itemId);
      return false;
    }

    try {
      const expectedUpdatedAt = await getExpectedUpdatedAt?.();
      // The answer to a change of this line was lost meanwhile and is being checked: nothing is sent for it until then.
      if (checkingRef.current.has(itemId)) {
        ownRemovals.current.delete(itemId);
        return false;
      }
      const sentAt = Date.now();
      const result = await dropLine(item.id, current.id, expectedUpdatedAt);
      if (result.success) {
        const read = await rereadOrder();
        // The line is off the order but the read that should show it failed: take it off the screen here, so the
        // card does not wait for a read that may not come.
        if (read === null && activeOrderId.current === current.id) {
          setOrder(previous =>
            previous && previous.id === current.id && previous.items
              ? { ...previous, items: previous.items.filter(line => line.id !== itemId) }
              : previous
          );
        }
        return true;
      }
      if (isAlreadyRemoved(result)) {
        // Off the order already, which is what was asked for; the person is told why nothing was removed now.
        showAlert(tr('orders.manage.lineGoneTitle'), tr('orders.manage.lineGoneMessage'));
        void rereadOrder(false);
        return true;
      }
      if (result.refusal?.reason === REFUSAL.STALE_RECORD) {
        // Changed by someone else since this card read the line: nothing was removed. A read that no longer has the line
        // open says it is off the order already, which is what was asked for.
        if (isLineMissing(await rereadOrder(false), itemId)) {
          showAlert(tr('orders.manage.lineGoneTitle'), tr('orders.manage.lineGoneMessage'));
          return true;
        }
        showAlert(tr('orders.manage.couldNotRemoveTitle'), tr('orders.refusal.staleRemove'));
        ownRemovals.current.delete(itemId);
        return false;
      }
      if (isCustomerAccessDenied(result)) {
        // A customer login on an older facility is answered "access denied" for a line that is gone, and also for a
        // real refusal: only the read that no longer has the line says which.
        if (isLineMissing(await rereadOrder(false), itemId)) {
          showAlert(tr('orders.manage.lineGoneTitle'), tr('orders.manage.lineGoneMessage'));
          return true;
        }
        showAlert(tr('orders.manage.couldNotRemoveTitle'), accessRefusalText(result) ?? tr('common.checkConnection'));
        ownRemovals.current.delete(itemId);
        return false;
      }
      // No answer after the request went out: the line is locked and the server is asked whether it is gone (the order
      // is read again once the phone is online and 10 s have passed). Nothing is sent again by itself.
      if (mayHaveBeenSaved(result)) {
        const read = await checkAfterLostAnswer([itemId], 'remove', current.id, sentAt);
        // Stopped (the screen was left, the editor moved on): nothing more is known, and a save for the line would not be safe.
        if (read === null) return 'unknown';
        // Gone: removed, which is what was asked for. The card goes with the read that has just been applied.
        if (isLineMissing(read, itemId)) return true;
        ownRemovals.current.delete(itemId);
        showAlert(tr('orders.manage.couldNotRemoveTitle'), tr('orders.manage.lostAnswerNotRemoved'));
        return false;
      }
      showAlert(tr('orders.manage.couldNotRemoveTitle'), serverText(result.message, tr('common.checkConnection'), { write: true, delete: true }));
      void rereadOrder(false);
      ownRemovals.current.delete(itemId);
      return false;
    } catch (error) {
      console.error('[OrderManagement] Remove item error:', error);
      showAlert(tr('orders.manage.couldNotRemoveTitle'), tr('common.checkConnection'));
      return 'unknown';
    }
  }, [rereadOrder, checkAfterLostAnswer]);

  // True while the phone reports no network at all (aeroplane mode, no Wi-Fi and
  // no mobile data). "Connected, but the internet is not reachable" does not
  // count: a facility's own server can still answer on its local network. Nor
  // does an unknown reading (the hook gives `isConnected` false and type
  // 'unknown' while NetInfo has not decided): the save is tried then.
  const { isConnected, type: networkType } = useNetworkStatus();
  const noNetworkRef = useRef(false);
  const noNetwork = isConnected === false && networkType === 'none';
  noNetworkRef.current = noNetwork;

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
  // A lot the server refuses is an answer, and the next lot is sent. A call that
  // failed before the request left the phone, or that threw, ends the save: every
  // further write could wait its own full time limit on the same dead connection.
  // The lots not sent come back not saved and stay selected in the picker. For the
  // same reason the read after such a save is started and not waited for.
  //
  // A call whose answer was lost (the request may have reached the server) is not
  // an answer and not a failure: the lot is locked and named to the picker
  // (`onChecking`), the save waits until the phone is online and 10 s have passed
  // since the request was sent, then reads the order until the server answers and
  // gives the lot the server's state. Nothing is sent again for it. The read has
  // proved the connection, so the next lot is sent. The picker may stop the check
  // (`signal`, from X after a warning): the lots not sent then come back not saved.
  const handleItemsAdded = useCallback(async (
    changes: PickerChange[],
    onProgress?: (position: number, total: number) => void,
    options?: AddItemsOptions,
  ): Promise<PickerResult[]> => {
    const notSaved = (grnItemId: string): PickerResult =>
      ({ grnItemId, ok: false, reason: tr('orders.catalog.reasonNotSaved') });
    // A lot whose answer was lost: locked, named to the picker, checked, and answered with the server's state.
    // `stopped` is true when the check could not finish (the picker was left, the screen moved on).
    const checkLot = async (
      change: PickerChange,
      line: OrderItem | undefined,
      orderId: string,
      sentAt: number,
    ): Promise<{ result: PickerResult; stopped: boolean }> => {
      const removal = change.quantity <= 0;
      options?.onChecking?.({ grnItemId: change.grnItemId, removal });
      let read: Order | null;
      try {
        read = await checkAfterLostAnswer(line ? [line.id] : [], removal ? 'remove' : 'save', orderId, sentAt, options?.signal);
      } finally {
        options?.onChecking?.(null);
      }
      if (!read) {
        // Not known: the picker was left, or the editor moved on.
        return { stopped: true, result: { grnItemId: change.grnItemId, ok: false, reason: tr('errors.lostAnswer.leaveWarning') } };
      }
      const stored = read.items?.find(item => item.grn_item_id === change.grnItemId && isOpenLine(item))?.requested_quantity ?? 0;
      // The server has what was asked: the lost answer was a saved lot after all.
      if (stored === change.quantity || (removal && stored === 0)) {
        return { stopped: false, result: { grnItemId: change.grnItemId, ok: true } };
      }
      // Not applied: the lot shows what the server has, and the person decides whether to tap Add again.
      const reason = removal
        ? tr('orders.catalog.reasonCheckedNotRemoved')
        : stored === 0
          ? tr('orders.catalog.reasonCheckedNotSaved', { chosen: formatCount(change.quantity, 'bag') })
          : tr('orders.catalog.reasonCheckedOther', { bags: formatCount(stored, 'bag'), chosen: formatCount(change.quantity, 'bag') });
      return { stopped: false, result: { grnItemId: change.grnItemId, ok: false, reason, savedQuantity: stored } };
    };
    // What a lot says when the order holds another quantity than the one the picker started from: someone else changed
    // it, nothing was overwritten, and the person taps Add again to apply their number knowingly.
    const changedMeanwhile = (change: PickerChange, savedQuantity: number): string => {
      const bagsNow = formatCount(savedQuantity, 'bag');
      return change.quantity <= 0
        ? tr('orders.catalog.reasonChangedMeanwhileRemove', { bags: bagsNow })
        : savedQuantity === 0
          ? tr('orders.catalog.reasonRemovedMeanwhile', { chosen: formatCount(change.quantity, 'bag') })
          : tr('orders.catalog.reasonChangedMeanwhile', { bags: bagsNow, chosen: formatCount(change.quantity, 'bag') });
    };
    // The server refused a change or removal of a line with STALE_RECORD (owner decision D1): the line was changed by
    // someone else after the order was last read, and nothing was written. The order is read again and the lot says what
    // the order holds now, as it does for a change found before the call. Nothing is sent again by itself.
    const staleLot = async (change: PickerChange): Promise<PickerResult> => {
      const read = await rereadOrder(false);
      if (read === null) return notSaved(change.grnItemId);
      const stored = read.items?.find(item => item.grn_item_id === change.grnItemId && isOpenLine(item))?.requested_quantity ?? 0;
      // The line holds what was asked after all (only something else on it changed).
      if (stored === change.quantity || (change.quantity <= 0 && stored === 0)) return { grnItemId: change.grnItemId, ok: true };
      return { grnItemId: change.grnItemId, ok: false, reason: changedMeanwhile(change, stored), savedQuantity: stored };
    };
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
      // The person chose "Leave anyway" (the picker's X, after its warning): no further lot is sent. The lots not sent
      // come back not saved.
      if (options?.signal?.aborted) break;
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
          results.set(change.grnItemId, { grnItemId: change.grnItemId, ok: false, reason: changedMeanwhile(change, savedQuantity), savedQuantity });
          continue;
        }
        if (change.quantity > 0) {
          // No network: this lot and the rest are not sent.
          if (noNetworkRef.current) {
            noAnswer = true;
            break;
          }
          // The line is being checked after an answer of its own card was lost: nothing is sent for it meanwhile.
          if (line && checkingRef.current.has(line.id)) {
            results.set(change.grnItemId, { grnItemId: change.grnItemId, ok: false, reason: tr('orders.catalog.reasonLineChecking') });
            continue;
          }
          anyCall = true;
          const sentAt = Date.now();
          const result = line
            ? await changeLine(line.id, current.id, change.quantity, line.updated_at || undefined)
            : await OrderService.addItemToOrder(current.id, change.grnItemId, change.quantity);
          if (!result.success) console.error('[OrderManagement] Item not saved:', result.message, result.error);
          if (!result.success && mayHaveBeenSaved(result)) {
            const checked = await checkLot(change, line, current.id, sentAt);
            results.set(change.grnItemId, checked.result);
            if (checked.stopped) {
              noAnswer = true;
              break;
            }
            continue;
          }
          // Changed by someone else since the order was last read (STALE_RECORD): nothing was written.
          if (!result.success && line && result.refusal?.reason === REFUSAL.STALE_RECORD) {
            results.set(change.grnItemId, await staleLot(change));
            continue;
          }
          // A change of a line that is gone is read as removed by someone else, and the lot goes back to "not in
          // the order". "Order item not found" says so for certain. A customer login on an older facility is answered
          // "Customer access denied" for such a line, and also for a real refusal: only a read of the order that no
          // longer has the line says which, and without one the sentence is a refusal (a permission text).
          let lineConfirmedGone = false;
          if (!result.success && line && isCustomerAccessDenied(result)) {
            lineConfirmedGone = isLineMissing(await rereadOrder(false), line.id);
          }
          const lineGone = !result.success && !!line && (isAlreadyRemoved(result) || lineConfirmedGone);
          results.set(change.grnItemId, result.success
            ? { grnItemId: change.grnItemId, ok: true }
            : {
                grnItemId: change.grnItemId,
                ok: false,
                reason: cartFailureReason(result, line ? { lineKnown: true, lineConfirmedGone, chosen: change.quantity } : undefined),
                ...(lineGone ? { savedQuantity: 0 } : {}),
              });
          if (!result.success && isConnectionFailure(result)) {
            noAnswer = true;
            break;
          }
        } else {
          if (noNetworkRef.current) {
            noAnswer = true;
            break;
          }
          if (checkingRef.current.has(line!.id)) {
            results.set(change.grnItemId, { grnItemId: change.grnItemId, ok: false, reason: tr('orders.catalog.reasonLineChecking') });
            continue;
          }
          anyCall = true;
          const sentAt = Date.now();
          // A removal that reaches here has an open line: with none, the saved quantity is 0, answered above.
          const result = await dropLine(line!.id, current.id, line!.updated_at || undefined);
          if (!result.success && mayHaveBeenSaved(result)) {
            const checked = await checkLot(change, line, current.id, sentAt);
            results.set(change.grnItemId, checked.result);
            if (checked.stopped) {
              noAnswer = true;
              break;
            }
            continue;
          }
          // Changed by someone else since the order was last read (STALE_RECORD): nothing was removed.
          if (!result.success && result.refusal?.reason === REFUSAL.STALE_RECORD) {
            results.set(change.grnItemId, await staleLot(change));
            continue;
          }
          // "Order item not found": someone else removed it first, which is what was asked for. "Customer access
          // denied" (a customer login on an older facility) is not counted: it may be a real refusal, and the lot
          // is then shown with the permission text.
          const removed = result.success || isAlreadyRemoved(result);
          if (!removed) console.error('[OrderManagement] Item not removed:', result.message, result.error);
          results.set(change.grnItemId, removed
            ? { grnItemId: change.grnItemId, ok: true }
            : { grnItemId: change.grnItemId, ok: false, reason: cartFailureReason(result, { removal: true }) });
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
  }, [onRefresh, rereadOrder, checkAfterLostAnswer]);


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

  if (businessDeleted) {
    return (
      <View style={styles.emptyState}>
        <Icon name="store-off-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyText} accessibilityRole="header">{tr('orders.manage.couldNotOpenTitle')}</Text>
        <Text style={styles.emptySubtext}>{tr(!staffView || businessRecordUnread ? 'orders.manage.businessInactive' : 'orders.manage.businessDeactivatedStaff')}</Text>
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

      {/* A deactivated business only drops out of new GRNs and staff pickers; its orders work as before */}
      {businessDeactivated && (
        <View style={styles.offBanner} accessible accessibilityRole="summary">
          <Icon name="store-off-outline" size={iconSize.md} color={t.status.neutral.text} />
          <View style={styles.offBannerBody}>
            <Text style={styles.offBannerTitle}>{tr('orders.manage.deactivatedTitle')}</Text>
            <Text style={styles.offBannerText}>{tr(staffView ? 'orders.manage.deactivatedStaff' : 'orders.manage.deactivatedCustomer')}</Text>
          </View>
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
                checking={checkingLines.get(item.id)}
                offline={noNetwork && checkingLines.has(item.id)}
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
          offline={noNetwork}
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
  offBannerBody: {
    flex: 1,
  },
  offBannerTitle: {
    ...typography.subhead,
    fontWeight: '600' as const,
    color: t.status.neutral.text,
  },
  offBannerText: {
    ...typography.subhead,
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