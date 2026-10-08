import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { OrderItem } from '@/types/order.types';
import StockIndicator from './StockIndicator';

interface OrderItemCardProps {
  item: OrderItem;
  onQuantityChange: (newQuantity: number) => void;
  onRemove: () => void;
}

const OrderItemCardComponent: React.FC<OrderItemCardProps> = ({
  item,
  onQuantityChange,
  onRemove,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

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
          onQuantityChangeRef.current(currentLocalQty);
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
    debounceTimerRef.current = setTimeout(() => {
      // Only send update if quantity actually changed from last saved value
      if (newQuantity !== lastSavedQuantityRef.current) {
        if (__DEV__) console.log(`[OrderItemCard] Sending debounced update: ${lastSavedQuantityRef.current} → ${newQuantity}`);
        onQuantityChange(newQuantity);
        lastSavedQuantityRef.current = newQuantity;
      }
      setIsPending(false);

      // Show saved confirmation
      setShowSaved(true);
      setTimeout(() => {
        setShowSaved(false);
      }, 2000); // Show "Saved" for 2 seconds

      debounceTimerRef.current = null;
    }, 2000); // 2 second delay
  }, [onQuantityChange]);
  
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

  return (
    <View style={[styles.container, { backgroundColor: colors.cellBackground }]}>
      <View style={styles.itemInfo}>
        {/* Line 1: Item Name + GRN Date */}
        <View style={styles.itemHeader}>
          <View style={styles.itemNameRow}>
            <Text style={[styles.itemName, { color: colors.gray900 }]}>{item.grn_item.name}</Text>
          </View>
          {item.grn_item.grn_date && (
            <Text style={[styles.grnDate, { color: colors.gray500 }]}>
              {new Date(item.grn_item.grn_date).toLocaleDateString()}
            </Text>
          )}
        </View>

        {/* Line 2: Package Mark + Weight */}
        <View style={styles.packageWeightRow}>
          <View style={styles.packageMarkRow}>
            <Icon name="package-variant" size={14} color={colors.gray500} />
            <Text style={[styles.itemDetails, { color: colors.gray600 }]}>
              {item.grn_item.package_mark || 'No mark'}
            </Text>
          </View>
          {item.grn_item.weight && item.grn_item.weight > 0 && (
            <View style={styles.weightRow}>
              <Icon name="weight-kilogram" size={16} color={colors.gray500} />
              <Text style={[styles.weightText, { color: colors.gray600 }]}>{item.grn_item.weight}kg</Text>
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

      {/* Quantity Section */}
      <View style={styles.quantitySection}>
        {/* -10 Button */}
        <TouchableOpacity
          style={[styles.quickButton, { backgroundColor: colors.gray100, borderColor: colors.gray200 }]}
          onPress={() => handleQuantityDecrease(10)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.quickButtonText, { color: colors.gray600 }]}>-10</Text>
        </TouchableOpacity>

        <View style={[styles.quantityContainer, { backgroundColor: colors.gray100 }]}>
          <TouchableOpacity
            style={[styles.quantityButton, { backgroundColor: colors.cellBackground }]}
            onPress={() => handleQuantityDecrease(1)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.quantityButtonText, { color: colors.gray700 }]}>−</Text>
          </TouchableOpacity>

          <View style={styles.quantityWrapper}>
            <Text style={[
              styles.quantityLabel,
              { color: colors.gray500 },
              showSaved && { color: colors.success }
            ]}>
              {isPending ? 'SAVING...' : showSaved ? 'SAVED' : 'QTY'}
            </Text>
            <View style={styles.quantityValueContainer}>
              <Text style={[
                styles.quantity,
                { color: colors.gray900 },
                isPending && { color: colors.warning },
                showSaved && { color: colors.success }
              ]}>
                {localQuantity}
              </Text>
              {isPending && (
                <ActivityIndicator
                  size="small"
                  color={colors.warning}
                  style={styles.pendingIndicator}
                />
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.quantityButton, { backgroundColor: colors.cellBackground }]}
            onPress={() => handleQuantityIncrease(1)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.quantityButtonText, { color: colors.gray700 }]}>+</Text>
          </TouchableOpacity>
        </View>

        {/* +10 Button */}
        <TouchableOpacity
          style={[styles.quickButton, { backgroundColor: colors.gray100, borderColor: colors.gray200 }]}
          onPress={() => handleQuantityIncrease(10)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.quickButtonText, { color: colors.gray600 }]}>+10</Text>
        </TouchableOpacity>

        {/* Remove Button */}
        <TouchableOpacity onPress={onRemove} style={[styles.removeButton, { backgroundColor: colors.errorLight, borderColor: colors.error }]}>
          <Icon name="trash-can-outline" size={18} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ============================================================================
// STYLES - SAP Fiori Object Cell & Stepper Compliant
// ============================================================================

const styles = StyleSheet.create({
  // Object Cell Container - Fiori spec: 12pt corner radius
  container: {
    borderRadius: 12, // Fiori card corner radius
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  // Main Content Area - Fiori object cell body
  itemInfo: {
    flex: 1,
    padding: 12,
    paddingTop: 16,
  },
  // Header Row - Fiori spec: title + attributes
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  // Title - Fiori spec: 17pt semibold
  itemName: {
    fontSize: 17, // Fiori object cell title
    fontWeight: '600',
    letterSpacing: -0.41,
    marginRight: 8,
  },
  // Caption/Date - Fiori spec: 12pt
  grnDate: {
    fontSize: 12, // Fiori caption font size
    fontWeight: '500',
  },
  // Subtitle Row - Fiori spec: 13pt
  packageWeightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  packageMarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemDetails: {
    fontSize: 13, // Fiori subtitle font size
    marginRight: 4,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weightText: {
    fontSize: 13, // Fiori subtitle font size
  },
  // Footnote Row - Stock Status
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  stockStatusContainer: {
    flex: 1,
  },
  // Stepper Form Cell Area - Fiori spec: 44pt touch targets
  quantitySection: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    flexDirection: 'row',
    gap: 8,
  },
  // Quick Adjust Buttons - Fiori icon button style
  quickButton: {
    width: 44, // Fiori touch target
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  quickButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Stepper Container - Fiori stepper form cell
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    padding: 4,
  },
  // Stepper Buttons - Fiori spec: 44pt touch target
  quantityButton: {
    width: 44, // Fiori touch target
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  quantityButtonText: {
    fontSize: 20, // Fiori stepper button icon size
    fontWeight: '600',
    lineHeight: 24,
  },
  // Value Display - Fiori stepper value area
  quantityWrapper: {
    alignItems: 'center',
    marginHorizontal: 16,
    minWidth: 48,
  },
  quantityLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  quantityValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  quantity: {
    fontSize: 20, // Fiori large value display
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'center',
  },
  pendingIndicator: {
    position: 'absolute',
    right: -24,
  },
  // Delete Button - Fiori secondary negative style
  removeButton: {
    width: 44, // Fiori touch target
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
});

// Export memoized component for performance
const OrderItemCard = React.memo(OrderItemCardComponent);
export default OrderItemCard;