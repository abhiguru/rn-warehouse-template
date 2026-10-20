import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { LineSaved, OrderItem } from '@/types/order.types';
import { formatDate, formatWeightEach } from '@/utils/formatters';
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
import StockIndicator from './StockIndicator';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { localizeDigits, t as tr } from '@/i18n';

/** A count as it is stored (no grouping), in the digits of the language. */
const digits = (n: number) => localizeDigits(String(n));

/** The change as the parent takes it: the line's version goes along only when the card holds one. */
const sendChange = (
  onChange: OrderItemCardProps['onQuantityChange'],
  itemId: string,
  quantity: number,
  orderId: string | undefined,
  version: string | undefined
) => (version === undefined ? onChange(itemId, quantity, orderId) : onChange(itemId, quantity, orderId, version));

/**
 * What − (amount 1) and −10 do to a line above its stock (owner decision D17): the quantity it is lowered to, never above
 * the stock and never below 1; 0 when no stock is left, which asks to remove the line.
 */
const loweredAboveStock = (quantity: number, stock: number, amount: number): number =>
  stock <= 0 ? 0 : Math.min(stock, Math.max(1, quantity - amount));

/**
 * What a change of the quantity answers: true (or `{ updatedAt }`, which also names the line's new version) once the
 * server stored it, false when it did not, and 'stale' when it refused because someone else changed the line since this
 * card read it (owner decision D1): nothing was written, and the order was read again. 'checked' means the answer was
 * lost, the server was asked and the change is not applied: the person was told, so the card shows the stored quantity
 * without flashing the stock red.
 */
type QuantityAnswer = boolean | LineSaved | 'stale' | 'checked' | void;

interface OrderItemCardProps {
  item: OrderItem;
  /**
   * Called with this card's line id, so the parent can pass one stable function to
   * every card and the memoized card skips renders. Resolves true once the server
   * stored the quantity.
   *
   * `expectedUpdatedAt` is the version of the line the change is based on (owner decision D1): the `updated_at` the
   * card read with the line, or the one the card's own last save answered with. It is passed only when the card holds
   * one, so a server that sends none gets the call as before. The server refuses the change when the line was changed
   * by someone else since. A save that answers `{ updatedAt }` names the line's new version, and the card's next
   * change starts from it. A save that answers 'stale' was refused for that reason: the card drops what was waiting,
   * shows the quantity the line holds and starts from the line's latest version.
   */
  onQuantityChange: (
    itemId: string,
    newQuantity: number,
    orderId?: string,
    expectedUpdatedAt?: string
  ) => Promise<QuantityAnswer> | QuantityAnswer;
  /**
   * Called with this card's line id and a function that gives the version of the line the removal is based on (as
   * above; undefined when the card holds none). The caller asks for it when the removal is actually sent, after the
   * question "Remove …?" and after the card's own running save has finished, because that save leaves a new version of
   * the line and a removal sent with the old one would be refused as stale.
   * Resolves true when the line was removed (or was already gone), false when
   * the person said no or the removal was refused, and 'unknown' when no answer came and the line may be gone.
   * While it runs the card's buttons are off, and no change of the quantity is sent; after 'unknown' the quantity
   * that was waiting is dropped too (a change of a line that may be gone), and the card shows the stored one.
   */
  onRemove: (
    itemId: string,
    getExpectedUpdatedAt?: () => Promise<string | undefined>
  ) => Promise<boolean | 'unknown'> | boolean | 'unknown' | void;
  /**
   * The answer to a change of this line (`save`) or to its removal (`remove`) was lost and the server is being
   * asked what became of it: the card is locked (no tap on it does anything) and says so, until the order has
   * been read again and the card shows what the server has. Nothing is sent again by itself.
   */
  checking?: 'save' | 'remove';
  /** The phone has no network: a card that is checking then adds "Waiting for the connection…". */
  offline?: boolean;
}

const OrderItemCardComponent: React.FC<OrderItemCardProps> = ({
  item,
  onQuantityChange,
  onRemove,
  checking,
  offline = false,
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  // Local state for optimistic UI updates
  const [localQuantity, setLocalQuantity] = useState(item.requested_quantity);
  const [isPending, setIsPending] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [flashRed, setFlashRed] = useState(false);
  // The question "Remove …?" is open, or the removal is running: the card's buttons are off.
  const [isRemoving, setIsRemoving] = useState(false);
  // The card's buttons are off while the question or the removal is open, and while a lost answer is being checked.
  const locked = isRemoving || checking !== undefined;

  // Animation for red flash
  const flashAnim = useRef(new Animated.Value(0)).current;
  
  // Refs for debouncing
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedQuantityRef = useRef(item.requested_quantity);
  // The version of the line (`updated_at`) this card's changes are based on (owner decision D1): the one it read with
  // the line, then the one each of its own saves answered with. It is sent with a change or a removal, and the server
  // refuses the call when the line was changed by someone else since. It follows the line's version only while the card
  // has nothing waiting or running (see adoptLatestVersion): a change made against an older version must be refused,
  // not sent again with a version the person never saw.
  const baseVersionRef = useRef<string | undefined>(item.updated_at || undefined);
  // The version of the line as the last read of the order has it.
  const latestVersionRef = useRef<string | undefined>(item.updated_at || undefined);
  latestVersionRef.current = item.updated_at || undefined;
  // A save of this card is running; a change that comes due meanwhile waits for it (`queuedRef`), so it starts from
  // the version that save leaves and is not refused as stale.
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  // The running save, until it is done: a removal and the save on unmount wait for it (see settleSaves).
  const savePromiseRef = useRef<Promise<void> | null>(null);

  // Handle red flash animation for stock errors
  useEffect(() => {
    if (flashRed) {
      flashAnim.setValue(1);
      setTimeout(() => {
        flashAnim.setValue(0);
        setFlashRed(false);
      }, 2000);
    }
  }, [flashRed, flashAnim]);

  // Trigger red flash on stock error
  const triggerStockError = useCallback(() => {
    setFlashRed(true);
  }, []);
  
  // Store refs to avoid stale closures
  const localQuantityRef = useRef(localQuantity);
  localQuantityRef.current = localQuantity;

  const onQuantityChangeRef = useRef(onQuantityChange);
  onQuantityChangeRef.current = onQuantityChange;
  const itemIdRef = useRef(item.id);
  itemIdRef.current = item.id;
  // The order this line belongs to: a save that runs after the editor moved on still goes there.
  const orderIdRef = useRef(item.order_id);
  orderIdRef.current = item.order_id;

  // The answer to a change of this line was lost and is being checked: nothing is sent for the line meanwhile.
  const checkingRef = useRef(false);
  checkingRef.current = checking !== undefined;
  // A "Remove …?" question is open or a removal is running for this line. Nothing is written for the line
  // meanwhile (no change of the quantity could be applied to a line that is going), and when the person does
  // not remove it the flag is lowered again (see handleRemove).
  const removalRef = useRef(false);
  // The change waiting to be saved came due while the removal was open: it is sent when the line stays.
  const deferredSaveRef = useRef(false);
  // The removal answered "gone" and the card waits for the read that takes it off the screen. If the line comes
  // back changed instead (a read that still has it), the buttons come back on (see the effect on `item`).
  const lineGoneRef = useRef(false);

  useEffect(() => {
    if (!lineGoneRef.current) return;
    lineGoneRef.current = false;
    removalRef.current = false;
    setIsRemoving(false);
  }, [item]);

  // The card starts from the line's version as the last read has it, but only while nothing of the card's is waiting
  // or running. A change that is still waiting (or held back) was made against the version it was based on; if the
  // line moved on meanwhile, the server refuses it as stale and the person is told, instead of the card sending it
  // again over someone else's change.
  const adoptLatestVersion = useCallback(() => {
    const idle = debounceTimerRef.current === null && !savingRef.current && !queuedRef.current
      && !deferredSaveRef.current && !removalRef.current;
    if (idle) baseVersionRef.current = latestVersionRef.current;
  }, []);
  // Update local quantity when item prop changes (a read of the order brought another quantity).
  useEffect(() => {
    // The read replaces the number shown while a change of the person's is still waiting for its 2 s (and no save of
    // the card runs, and no removal is asked): the number they tapped is out of date, so it is not sent later over
    // what the line holds now, and the card starts from the version of this read. Without that, the person's next tap
    // on the number they now see would be sent with the old version and refused as stale.
    const replacedWhileWaiting = debounceTimerRef.current !== null && !savingRef.current && !removalRef.current
      && item.requested_quantity !== lastSavedQuantityRef.current;
    setLocalQuantity(item.requested_quantity);
    lastSavedQuantityRef.current = item.requested_quantity;
    if (replacedWhileWaiting) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      deferredSaveRef.current = false;
      setIsPending(false);
      baseVersionRef.current = latestVersionRef.current;
    }
  }, [item.requested_quantity]);
  useEffect(() => {
    adoptLatestVersion();
  }, [item.updated_at, adoptLatestVersion]);

  // Resolves when no save of this card is running (also one that starts from the one that ended).
  const settleSaves = useCallback(async (): Promise<void> => {
    while (savePromiseRef.current) await savePromiseRef.current;
  }, []);
  // The version a removal is based on, asked for when it is actually sent: after the card's own running save, which leaves
  // a new version of the line.
  const versionForRemoval = useCallback(async (): Promise<string | undefined> => {
    await settleSaves();
    return baseVersionRef.current;
  }, [settleSaves]);

  // Async saves finish after unmount when the list refreshes.
  const isMountedRef = useRef(true);
  useEffect(() => () => { isMountedRef.current = false; }, []);

  // Cleanup on unmount - force save if pending
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        // Force save if there's a pending update, but not while a removal is asked or running: that one covers the line.
        if (removalRef.current) return;
        // A save of the card may still be running: this one goes out when it is done, so it starts from the version
        // that save leaves (sent at once it would be refused as stale). What is sent is read then, from refs only.
        const forceSave = () => {
          const currentLocalQty = localQuantityRef.current;
          const lastSavedQty = lastSavedQuantityRef.current;
          if (currentLocalQty === lastSavedQty || removalRef.current) return;
          if (__DEV__) console.log(`[OrderItemCard] Force saving on unmount: ${lastSavedQty} → ${currentLocalQty}`);
          void sendChange(onQuantityChangeRef.current, itemIdRef.current, currentLocalQty, orderIdRef.current || undefined, baseVersionRef.current);
        };
        if (savePromiseRef.current) void settleSaves().then(forceSave);
        else forceSave();
      }
    };
  }, [settleSaves]);

  // Sends the quantity to the server, unless it is the one the server has. One save at a time: a change that comes due while
  // one runs waits for it (`queuedRef`) and goes out when it is done, from the version that save leaves, so it is not
  // refused as stale. Every way to a save (the timer, the end of a check, Cancel after "Remove …?", the end of a save)
  // comes through here.
  const saveQuantity = useCallback((newQuantity: number): Promise<void> => {
    if (savingRef.current) {
      queuedRef.current = true;
      return savePromiseRef.current ?? Promise.resolve();
    }
    // Only send update if quantity actually changed from last saved value
    if (newQuantity === lastSavedQuantityRef.current) {
      if (isMountedRef.current) setIsPending(false);
      return Promise.resolve();
    }
    if (__DEV__) console.log(`[OrderItemCard] Sending debounced update: ${lastSavedQuantityRef.current} → ${newQuantity}`);
    savingRef.current = true;
    const run: Promise<void> = (async () => {
      let answer: QuantityAnswer;
      try {
        answer = await sendChange(onQuantityChange, itemIdRef.current, newQuantity, orderIdRef.current || undefined, baseVersionRef.current);
      } catch {
        answer = false;
      }
      savingRef.current = false;
      const stale = answer === 'stale';
      const checked = answer === 'checked';
      const saved = !stale && !checked && answer !== false;
      if (saved) {
        // The save leaves a new version of the line: the card's next change is based on it. An answer that names none (an
        // older server) leaves the card without one until the next read of the order brings it.
        baseVersionRef.current = answer && typeof answer === 'object' && answer.updatedAt ? answer.updatedAt : undefined;
        lastSavedQuantityRef.current = newQuantity;
      }
      if (stale) {
        // Someone else changed the line since this card read it (owner decision D1): nothing was written and the order was
        // read again. What the person meant (this change, and any made meanwhile on top of the old number) is dropped:
        // nothing is sent again by itself. The card shows the quantity the server has (a read that brought another one
        // replaces it, see the effect on `item`), starts from the line's latest version, and does not flash the stock red.
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        queuedRef.current = false;
        deferredSaveRef.current = false;
        localQuantityRef.current = lastSavedQuantityRef.current;
        adoptLatestVersion();
        if (isMountedRef.current) {
          setLocalQuantity(lastSavedQuantityRef.current);
          setIsPending(false);
        }
        return;
      }
      // A change that came due while this one was running (see queuedRef). It is handled before anything that needs the
      // card on the screen, so that a change made while the last save ran is not lost when the card has gone: the quantity
      // shown last goes out, from the version this save left (after a question or a check, when one is open).
      const queued = queuedRef.current;
      queuedRef.current = false;
      if (queued) {
        if (removalRef.current || checkingRef.current) deferredSaveRef.current = true;
        else void saveQuantity(localQuantityRef.current);
      }
      if (!isMountedRef.current) return;
      // A newer edit started while this one was saving; it owns the indicator.
      const superseded = debounceTimerRef.current !== null || queued;
      if (!saved && !superseded) {
        // The server refused the change: show the stored quantity again.
        setLocalQuantity(lastSavedQuantityRef.current);
        // A change the check found not applied was told already; it is not a stock refusal.
        if (!checked) triggerStockError();
      }
      if (queued) return;
      // A refused change leaves the line as it was: the card follows the line's version again (a read made after the
      // refusal may have brought a newer one).
      if (!saved) adoptLatestVersion();
      if (superseded) return;
      setIsPending(false);
      if (saved) {
        setShowSaved(true);
        setTimeout(() => {
          if (isMountedRef.current) setShowSaved(false);
        }, 2000); // Show "Saved" for 2 seconds
      }
    })().finally(() => {
      if (savePromiseRef.current === run) savePromiseRef.current = null;
    });
    savePromiseRef.current = run;
    return run;
  }, [onQuantityChange, triggerStockError, adoptLatestVersion]);

  // Debounced quantity update
  const debouncedQuantityUpdate = useCallback((newQuantity: number) => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Show pending state
    setIsPending(true);
    
    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      // The question "Remove …?" is open, or the answer to an earlier change is being checked: nothing is sent now.
      // If the line stays, the quantity shown is sent then (after the check, once the server's state is known).
      if (removalRef.current || checkingRef.current) {
        deferredSaveRef.current = true;
        return;
      }
      // If the last save of this card is still running, this change goes out when it is done (see saveQuantity).
      void saveQuantity(newQuantity);
    }, 2000); // 2 second delay
  }, [saveQuantity]);

  // A change that came due while the answer to the last one was being checked goes out when the check is over.
  useEffect(() => {
    if (checking !== undefined || !deferredSaveRef.current || removalRef.current) return;
    deferredSaveRef.current = false;
    void saveQuantity(localQuantityRef.current);
  }, [checking, saveQuantity]);

  // Asks the parent to remove the line. Only one question or removal at a time; while it runs the buttons are
  // off. The change waiting to be saved is not dropped: if the line is not removed (Cancel, or the removal
  // failed) the flag goes down and that change is saved, so the card shows what the server has.
  const handleRemove = async () => {
    if (removalRef.current || checkingRef.current) return;
    removalRef.current = true;
    setIsRemoving(true);
    let outcome: boolean | 'unknown';
    try {
      const answer = await onRemove(item.id, versionForRemoval);
      outcome = answer === true || answer === 'unknown' ? answer : false;
    } catch {
      outcome = false;
    }
    if (outcome === true || outcome === 'unknown') {
      // A change that was still waiting has nothing left to change (the line is gone), or must not be sent (the
      // line may be gone and the removal got no answer).
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      deferredSaveRef.current = false;
      if (isMountedRef.current) setIsPending(false);
    }
    if (outcome === true) {
      // The line is gone: this card goes with the next read of the order and stays off until then.
      lineGoneRef.current = true;
      return;
    }
    removalRef.current = false;
    if (!isMountedRef.current) return;
    setIsRemoving(false);
    // The line stays: the card follows its version again (a read made after a refusal may have brought a newer one).
    adoptLatestVersion();
    if (outcome === 'unknown') {
      // The card shows the stored quantity until the read that follows says more.
      setLocalQuantity(lastSavedQuantityRef.current);
      return;
    }
    if (deferredSaveRef.current) {
      deferredSaveRef.current = false;
      void saveQuantity(localQuantityRef.current);
    }
  };

  const handleQuantityDecrease = (amount: number = 1) => {
    if (removalRef.current || checkingRef.current) return;
    // A line above the stock (owner decision D17) can be lowered to the stock or less, or removed: the server refuses any
    // quantity above the stock, so a step that would still end above it is not offered. The tap lowers the quantity by
    // the step, to the stock at most; with no stock left only the removal remains and the tap asks for it.
    const available = item.grn_item?.current_stock;
    if (available !== undefined && localQuantity > available) {
      const lowered = loweredAboveStock(localQuantity, available, amount);
      if (lowered === 0) {
        void handleRemove();
        return;
      }
      setLocalQuantity(lowered);
      debouncedQuantityUpdate(lowered);
      return;
    }
    if (localQuantity > amount) {
      const newQuantity = localQuantity - amount;
      setLocalQuantity(newQuantity);
      debouncedQuantityUpdate(newQuantity);
    } else if (localQuantity > 1 && amount > 1) {
      // If trying to decrease by 10 but would go below 1, set to 1
      setLocalQuantity(1);
      debouncedQuantityUpdate(1);
    } else if (localQuantity === 1 && amount === 1) {
      // At quantity 1, tapping minus asks to remove the item from the order
      void handleRemove();
    } else if (localQuantity <= amount && amount > 1) {
      // If trying to decrease by 10 and quantity is <= 10, ask to remove the item
      void handleRemove();
    }
  };

  const handleQuantityIncrease = (amount: number = 1) => {
    if (removalRef.current || checkingRef.current) return;
    if (!item.grn_item) return;

    const currentStock = item.grn_item.current_stock;
    // A line above the stock is not raised (D17): + and +10 are off for it, and nothing here changes it.
    if (localQuantity > currentStock) return;
    const newQuantity = localQuantity + amount;

    if (newQuantity > currentStock) {
      if (amount > 1 && localQuantity < currentStock) {
        // If trying to add 10 but would exceed stock, set to max stock
        setLocalQuantity(currentStock);
        debouncedQuantityUpdate(currentStock);
      } else {
        // Flash red instead of showing alert
        triggerStockError();
      }
      return;
    }

    setLocalQuantity(newQuantity);
    debouncedQuantityUpdate(newQuantity);
  };

  if (!item.grn_item) {
    return null;
  }

  const itemName = item.grn_item.name;
  // The line asks for more than the lot has (owner decision D17): a warning says so, + and +10 are off, and the line
  // can be lowered to the stock or removed. Nothing here changes the order by itself.
  const stock = item.grn_item.current_stock;
  const overStock = localQuantity > stock;
  const raiseOff = locked || overStock;
  // − and −10 on a line above its stock lower it to the stock (the removal question when there is none): the spoken labels say so.
  const lowerLabel = (amount: number): string | undefined => {
    if (!overStock) return undefined;
    const lowered = loweredAboveStock(localQuantity, stock, amount);
    return lowered === 0
      ? tr('orders.item.removeFromOrder', { name: itemName })
      : tr('orders.item.lowerTo', { name: itemName, quantity: digits(lowered) });
  };
  // The lot's weight is the weight of one bag, box or crate; a lot without one shows no weight.
  const weightEach = formatWeightEach(item.grn_item.weight);
  const quantityStatus = isPending ? tr('common.saving') : showSaved ? tr('orders.item.saved') : tr('orders.item.qty');
  // What is being checked, and, while the phone has no network, what it is waiting for.
  const checkingText = checking === undefined
    ? ''
    : [tr(checking === 'remove' ? 'errors.lostAnswer.checkingDelete' : 'errors.lostAnswer.checking'), offline ? tr('errors.lostAnswer.waiting') : '']
        .filter(Boolean)
        .join(' ');

  return (
    <View style={styles.container}>
      <View style={styles.itemInfo}>
        {/* Line 1: Item Name + GRN Date */}
        <View style={styles.itemHeader}>
          <View style={styles.itemNameRow}>
            <Text style={styles.itemName} numberOfLines={2}>{itemName}</Text>
          </View>
          {item.grn_item.grn_date && (
            <Text style={styles.grnDate}>
              {formatDate(item.grn_item.grn_date, 'short')}
            </Text>
          )}
        </View>

        {/* Line 2: Package Mark + Weight */}
        <View style={styles.packageWeightRow}>
          <View style={styles.packageMarkRow}>
            <Icon name="package-variant" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.itemDetails}>
              {item.grn_item.package_mark || tr('orders.item.noMark')}
            </Text>
          </View>
          {weightEach ? (
            <View style={styles.weightRow}>
              <Icon name="weight-kilogram" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.weightText}>{weightEach}</Text>
            </View>
          ) : null}
        </View>

        {/* Line 3: Stock Status */}
        <View style={styles.stockRow}>
          <View style={styles.stockStatusContainer}>
            <StockIndicator
              currentStock={item.grn_item.current_stock}
              originalStock={item.grn_item.original_quantity}
              flashRed={flashRed}
            />
          </View>
        </View>

        {overStock ? (
          <View style={styles.overStockRow} testID="order-line-over-stock">
            <InlineValidation variant="warning" message={tr('orders.item.overStock', { stock: digits(stock) })} />
          </View>
        ) : null}
      </View>

      {/* Quantity Section: stepper per style guide §13.3 */}
      <View style={styles.quantitySection}>
        {/* -10 Button */}
        <Pressable
          style={({ pressed }) => [styles.quickButton, pressed && styles.stepPressed, locked && styles.controlOff]}
          onPress={() => handleQuantityDecrease(10)}
          disabled={locked}
          accessibilityRole="button"
          accessibilityState={{ disabled: locked }}
          accessibilityLabel={lowerLabel(10) ?? tr('orders.item.removeAmount', { amount: 10, name: itemName })}
        >
          <Text style={styles.quickButtonText} maxFontSizeMultiplier={1.6}>{localizeDigits('−10')}</Text>
        </Pressable>

        <View style={styles.quantityContainer}>
          <Pressable
            style={({ pressed }) => [styles.quantityButton, pressed && styles.stepPressed, locked && styles.controlOff]}
            onPress={() => handleQuantityDecrease(1)}
            disabled={locked}
            accessibilityRole="button"
            accessibilityState={{ disabled: locked }}
            accessibilityLabel={lowerLabel(1) ?? (localQuantity <= 1 ? tr('orders.item.removeFromOrder', { name: itemName }) : tr('orders.item.decrease', { name: itemName, amount: 1 }))}
          >
            <Icon name="minus" size={iconSize.md} color={t.brand.tint} />
          </Pressable>

          <View
            style={styles.quantityWrapper}
            accessible
            accessibilityLabel={tr(isPending ? 'orders.item.quantitySaving' : showSaved ? 'orders.item.quantitySaved' : 'orders.item.quantity', { quantity: digits(localQuantity) })}
            accessibilityLiveRegion="polite"
          >
            <View style={styles.quantityLabelRow}>
              {showSaved && !isPending && (
                <Icon name="check-circle" size={iconSize.sm} color={t.status.positive.text} />
              )}
              <Text
                style={[
                  styles.quantityLabel,
                  isPending && styles.quantityLabelPending,
                  showSaved && !isPending && styles.quantityLabelSaved,
                ]}
                maxFontSizeMultiplier={1.6}
              >
                {quantityStatus}
              </Text>
            </View>
            <View style={styles.quantityValueContainer}>
              <Text style={styles.quantity}>
                {digits(localQuantity)}
              </Text>
              {isPending && (
                <ActivityIndicator
                  size="small"
                  color={t.status.informative.text}
                  style={styles.pendingIndicator}
                />
              )}
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.quantityButton, pressed && styles.stepPressed, raiseOff && styles.controlOff]}
            onPress={() => handleQuantityIncrease(1)}
            disabled={raiseOff}
            accessibilityRole="button"
            accessibilityState={{ disabled: raiseOff }}
            accessibilityLabel={tr('orders.item.increase', { name: itemName, amount: 1 })}
          >
            <Icon name="plus" size={iconSize.md} color={t.brand.tint} />
          </Pressable>
        </View>

        {/* +10 Button */}
        <Pressable
          style={({ pressed }) => [styles.quickButton, pressed && styles.stepPressed, raiseOff && styles.controlOff]}
          onPress={() => handleQuantityIncrease(10)}
          disabled={raiseOff}
          accessibilityRole="button"
          accessibilityState={{ disabled: raiseOff }}
          accessibilityLabel={tr('orders.item.addAmount', { amount: 10, name: itemName })}
        >
          <Text style={styles.quickButtonText} maxFontSizeMultiplier={1.6}>{localizeDigits('+10')}</Text>
        </Pressable>

        {/* Remove Button: secondary negative, last in the row */}
        <Pressable
          onPress={() => void handleRemove()}
          style={({ pressed }) => [styles.removeButton, pressed && styles.removeButtonPressed, locked && styles.controlOff]}
          disabled={locked}
          accessibilityRole="button"
          accessibilityState={{ disabled: locked }}
          accessibilityLabel={tr('orders.item.removeFromOrder', { name: itemName })}
        >
          <Icon name="trash-can-outline" size={iconSize.md} color={t.status.negative.text} />
        </Pressable>
      </View>

      {/* The answer to a change of this line was lost: the server is being asked what became of it. */}
      {checking !== undefined ? (
        <View style={styles.checkingRow} testID="order-line-checking">
          <InlineValidation variant="warning" message={checkingText} />
        </View>
      ) : null}
    </View>
  );
};

// ============================================================================
// STYLES - SAP Fiori Object Cell & Stepper (style guide §13.3, §13.6)
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  // Object Cell Container
  container: {
    borderRadius: radius.card,
    marginHorizontal: layout.marginCompact,
    marginBottom: space.md,
    backgroundColor: t.surface.card,
    ...t.shadow[1],
  },
  // Main Content Area - Fiori object cell body
  itemInfo: {
    flex: 1,
    padding: space.md,
    paddingTop: space.lg,
  },
  // Header Row - title + attributes
  itemHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: space.sm,
    paddingHorizontal: space.xs,
  },
  itemNameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
  },
  itemName: {
    ...typography.headline,
    color: t.text.primary,
    marginRight: space.sm,
  },
  grnDate: {
    ...typography.caption1,
    color: t.text.secondary,
  },
  // Subtitle Row
  packageWeightRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: space.sm,
    paddingVertical: space.xs,
    paddingHorizontal: space.xs,
  },
  packageMarkRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.s6,
    flexShrink: 1,
  },
  // A long mark wraps; it does not push the weight ("50 kg each") off the card.
  itemDetails: {
    ...typography.footnote,
    color: t.text.secondary,
    marginRight: space.xs,
    flexShrink: 1,
  },
  weightRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    flexShrink: 0,
  },
  weightText: {
    ...typography.footnote,
    color: t.text.secondary,
    fontVariant: ['tabular-nums' as const],
  },
  // Footnote Row - Stock Status
  stockRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
  },
  stockStatusContainer: {
    flex: 1,
  },
  // Stepper area, separated from the cell body by a divider
  quantitySection: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: space.md,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: t.border.divider,
  },
  // Quick adjust buttons: secondary style (border.button, brand.tint)
  quickButton: {
    minWidth: touchTarget,
    height: touchTarget,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: t.border.button,
  },
  quickButtonText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
    fontVariant: ['tabular-nums' as const],
  },
  stepPressed: {
    backgroundColor: t.brand.subtle,
  },
  // Stepper container
  quantityContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  // Stepper buttons: border.button outline, brand.tint icon
  quantityButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: t.border.button,
  },
  // Value Display
  quantityWrapper: {
    alignItems: 'center' as const,
    marginHorizontal: space.md,
    minWidth: 56,
  },
  quantityLabelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xxs,
    marginBottom: space.xxs,
  },
  quantityLabel: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
  },
  quantityLabelPending: {
    color: t.status.informative.text,
  },
  quantityLabelSaved: {
    color: t.status.positive.text,
  },
  quantityValueContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    position: 'relative' as const,
  },
  quantity: {
    ...typography.title3,
    color: t.text.primary,
    minWidth: 36,
    textAlign: 'center' as const,
    fontVariant: ['tabular-nums' as const],
  },
  pendingIndicator: {
    position: 'absolute' as const,
    right: -space.xxl,
  },
  // A button while the line is being removed or checked
  controlOff: {
    opacity: t.interaction.disabledOpacity,
  },
  // The "only N in stock" warning under the stock indicator
  overStockRow: {
    paddingHorizontal: space.xs,
    paddingTop: space.xs,
  },
  // The "checking" strip under the stepper
  checkingRow: {
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  // Delete button - secondary negative style
  removeButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: t.status.negative.border,
  },
  removeButtonPressed: {
    backgroundColor: t.status.negative.background,
  },
});

// Export memoized component for performance
const OrderItemCard = React.memo(OrderItemCardComponent);
export default OrderItemCard;