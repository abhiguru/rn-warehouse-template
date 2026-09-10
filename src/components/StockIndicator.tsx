import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';

interface StockIndicatorProps {
  currentStock: number;
  originalStock: number;
  flashRed?: boolean;
}

const StockIndicator: React.FC<StockIndicatorProps> = ({
  currentStock,
  originalStock,
  flashRed = false,
}) => {
  const colors = useListColors();
  const flashAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (flashRed) {
      flashAnim.setValue(1);
      setTimeout(() => {
        flashAnim.setValue(0);
      }, 2000);
    }
  }, [flashRed, flashAnim]);

  const backgroundColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', '#ef4444'],
  });
  // Handle undefined or invalid values
  const validCurrentStock = currentStock || 0;
  const validOriginalStock = originalStock || 0;

  const stockPercentage = validOriginalStock > 0 ? (validCurrentStock / validOriginalStock) * 100 : 0;

  // Dark mode compliant colors
  let stockColor = colors.success;
  let stockBgColor = colors.successLight;
  let stockStatus = 'In Stock';

  if (validCurrentStock === 0) {
    stockColor = colors.error;
    stockBgColor = colors.errorLight;
    stockStatus = 'Out of Stock';
  } else if (stockPercentage < 20) {
    stockColor = colors.warning;
    stockBgColor = colors.warningLight;
    stockStatus = 'Low Stock';
  }

  return (
    <Animated.View style={[styles.container, { backgroundColor }]}>
      <View style={[styles.badge, { backgroundColor: stockBgColor }]}>
        <Text style={[styles.badgeText, { color: stockColor }]}>{stockStatus}</Text>
      </View>
      <View style={styles.stockTextContainer}>
        <Text style={[styles.stockText, { color: colors.textSecondary }, flashRed && styles.stockTextFlash]}>
          {validCurrentStock}/{validOriginalStock > 0 ? validOriginalStock : 'N/A'} units
        </Text>
      </View>
    </Animated.View>
  );
};

// ============================================================================
// STYLES - SAP Fiori Tags/Badges Compliant
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  // Status Badge/Tag - Fiori spec: 20pt compact height, pill shape
  badge: {
    height: 20, // Fiori compact tag height
    paddingHorizontal: 8, // Fiori tag horizontal padding
    borderRadius: 10, // Fiori pill shape
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 11, // Fiori compact tag font size
    fontWeight: '600',
  },
  stockTextContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  stockText: {
    fontSize: 12, // Fiori caption font size
  },
  stockTextFlash: {
    color: '#ffffff',
    fontWeight: '700',
  },
});

export default StockIndicator;