import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { OrderItem } from '@/types/order.types';
import { parseLocalISODate } from '@/utils/formatters';
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

/** "2026-10-09" -> "9 Oct 2026" (style guide §12.3). */
const formatGrnDate = (value: string) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseLocalISODate(value) : new Date(value);
  return isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Up to two decimals, Indian grouping, unit kg (style guide §12.3). */
const formatKg = (weight: number) =>
  `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(weight)} kg`;

interface OrderItemCardProps {
  item: OrderItem;
  /** Resolves true once the server stored the quantity. */
  onQuantityChange: (newQuantity: number) => Promise<boolean> | boolean | void;
  onRemove: () => void;
}

const OrderItemCardComponent: React.FC<OrderItemCardProps> = ({
  item,
  onQuantityChange,
  onRemove,
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  // Local state for optimistic UI updates
  const [localQuantity, setLocalQuantity] = useState(item.requested_quantity);
  const [isPending, setIsPending] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [flashRed, setFlashRed] = useState(false);

  // Animation for red flash
  const flashAnim = useRef(new Animated.Value(0)).current;
  
  // Refs for debouncing
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedQuantityRef = useRef(item.requested_quantity);
  
  // Update local quantity when item prop changes
  useEffect(() => {
    setLocalQuantity(item.requested_quantity);
    lastSavedQuantityRef.current = item.requested_quantity;
  }, [item.requested_quantity]);

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

  // Track if item is being removed (to skip force-save on unmount)
  const isRemovingRef = useRef(false);

  // Async saves finish after unmount when the list refreshes.
  const isMountedRef = useRef(true);
  useEffect(() => () => { isMountedRef.current = false; }, []);

  // Cleanup on unmount - force save if pending
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        // Force save if there's a pending update (but not if being removed)
        const currentLocalQty = localQuantityRef.current;
        const lastSavedQty = lastSavedQuantityRef.current;
        if (currentLocalQty !== lastSavedQty && !isRemovingRef.current) {
          if (__DEV__) console.log(`[OrderItemCard] Force saving on unmount: ${lastSavedQty} → ${currentLocalQty}`);
          void onQuantityChangeRef.current(currentLocalQty);
        }
      }
    };
  }, []); // Empty dependency array - only run on mount/unmount
  
  // Debounced quantity update
  const debouncedQuantityUpdate = useCallback((newQuantity: number) => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Show pending state
    setIsPending(true);
    
    // Set new timer
    debounceTimerRef.current = setTimeout(async () => {
      debounceTimerRef.current = null;
      // Only send update if quantity actually changed from last saved value
      if (newQuantity === lastSavedQuantityRef.current) {
        if (isMountedRef.current) setIsPending(false);
        return;
      }
      if (__DEV__) console.log(`[OrderItemCard] Sending debounced update: ${lastSavedQuantityRef.current} → ${newQuantity}`);
      let saved = false;
      try {
        saved = (await onQuantityChange(newQuantity)) !== false;
      } catch {
        saved = false;
      }
      if (!isMountedRef.current) return;
      // A newer edit started while this one was saving; it owns the indicator.
      const superseded = debounceTimerRef.current !== null;
      if (saved) {
        lastSavedQuantityRef.current = newQuantity;
      } else if (!superseded) {
        // The server refused the change: show the stored quantity again.
        setLocalQuantity(lastSavedQuantityRef.current);
        triggerStockError();
      }
      if (superseded) return;
      setIsPending(false);
      if (saved) {
        setShowSaved(true);
        setTimeout(() => {
          if (isMountedRef.current) setShowSaved(false);
        }, 2000); // Show "Saved" for 2 seconds
      }
    }, 2000); // 2 second delay
  }, [onQuantityChange, triggerStockError]);
  
  const handleQuantityDecrease = (amount: number = 1) => {
    if (localQuantity > amount) {
      const newQuantity = localQuantity - amount;
      setLocalQuantity(newQuantity);
      debouncedQuantityUpdate(newQuantity);
    } else if (localQuantity > 1 && amount > 1) {
      // If trying to decrease by 10 but would go below 1, set to 1
      setLocalQuantity(1);
      debouncedQuantityUpdate(1);
    } else if (localQuantity === 1 && amount === 1) {
      // At quantity 1, tapping minus removes the item from order
      // Clear any pending debounce and mark as removing to prevent force-save on unmount
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      isRemovingRef.current = true;
      onRemove();
    } else if (localQuantity <= amount && amount > 1) {
      // If trying to decrease by 10 and quantity is <= 10, remove the item
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      isRemovingRef.current = true;
      onRemove();
    }
  };

  const handleQuantityIncrease = (amount: number = 1) => {
    if (!item.grn_item) return;

    const currentStock = item.grn_item.current_stock;
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
  const quantityStatus = isPending ? 'Saving…' : showSaved ? 'Saved' : 'Qty';

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
              {formatGrnDate(item.grn_item.grn_date)}
            </Text>
          )}
        </View>

        {/* Line 2: Package Mark + Weight */}
        <View style={styles.packageWeightRow}>
          <View style={styles.packageMarkRow}>
            <Icon name="package-variant" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.itemDetails}>
              {item.grn_item.package_mark || 'No mark'}
            </Text>
          </View>
          {item.grn_item.weight && item.grn_item.weight > 0 && (
            <View style={styles.weightRow}>
              <Icon name="weight-kilogram" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.weightText}>{formatKg(item.grn_item.weight)}</Text>
            </View>
          )}
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
      </View>

      {/* Quantity Section: stepper per style guide §13.3 */}
      <View style={styles.quantitySection}>
        {/* -10 Button */}
        <Pressable
          style={({ pressed }) => [styles.quickButton, pressed && styles.stepPressed]}
          onPress={() => handleQuantityDecrease(10)}
          accessibilityRole="button"
          accessibilityLabel={`Remove 10 from ${itemName}`}
        >
          <Text style={styles.quickButtonText} maxFontSizeMultiplier={1.6}>−10</Text>
        </Pressable>

        <View style={styles.quantityContainer}>
          <Pressable
            style={({ pressed }) => [styles.quantityButton, pressed && styles.stepPressed]}
            onPress={() => handleQuantityDecrease(1)}
            accessibilityRole="button"
            accessibilityLabel={localQuantity <= 1 ? `Remove ${itemName} from order` : `Decrease ${itemName} by 1`}
          >
            <Icon name="minus" size={iconSize.md} color={t.brand.tint} />
          </Pressable>

          <View
            style={styles.quantityWrapper}
            accessible
            accessibilityLabel={`Quantity ${localQuantity}${isPending ? ', saving' : showSaved ? ', saved' : ''}`}
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
                {localQuantity}
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
            style={({ pressed }) => [styles.quantityButton, pressed && styles.stepPressed]}
            onPress={() => handleQuantityIncrease(1)}
            accessibilityRole="button"
            accessibilityLabel={`Increase ${itemName} by 1`}
          >
            <Icon name="plus" size={iconSize.md} color={t.brand.tint} />
          </Pressable>
        </View>

        {/* +10 Button */}
        <Pressable
          style={({ pressed }) => [styles.quickButton, pressed && styles.stepPressed]}
          onPress={() => handleQuantityIncrease(10)}
          accessibilityRole="button"
          accessibilityLabel={`Add 10 to ${itemName}`}
        >
          <Text style={styles.quickButtonText} maxFontSizeMultiplier={1.6}>+10</Text>
        </Pressable>

        {/* Remove Button: secondary negative, last in the row */}
        <Pressable
          onPress={onRemove}
          style={({ pressed }) => [styles.removeButton, pressed && styles.removeButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${itemName} from order`}
        >
          <Icon name="trash-can-outline" size={iconSize.md} color={t.status.negative.text} />
        </Pressable>
      </View>
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
  itemDetails: {
    ...typography.footnote,
    color: t.text.secondary,
    marginRight: space.xs,
  },
  weightRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
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