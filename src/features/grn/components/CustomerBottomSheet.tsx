/**
 * CustomerBottomSheet
 *
 * Bottom sheet for selecting customers with search and recent items.
 * Uses the generic SearchableBottomSheet component.
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { searchService } from '@/services/search-service';
import { SearchableBottomSheet } from '@/components/common';
import { useListColors } from '@/hooks/useListColors';

const RECENT_CUSTOMERS_KEY = 'recent_customers';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface CustomerBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onSelect: (customer: Customer) => void;
  currentValue?: {
    id: string;
    name: string;
  };
}

export const CustomerBottomSheet: React.FC<CustomerBottomSheetProps> = ({
  isVisible,
  onClose,
  onSelect,
  currentValue,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    customerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      minHeight: theme.touchTarget.minimum,
    },
    customerName: {
      fontSize: theme.fontSize.base,
      color: colors.textPrimary,
      fontWeight: theme.fontWeight.medium,
    },
    metaText: {
      fontSize: theme.fontSize.sm,
      color: colors.textSecondary,
    },
  }), [colors]);

  // Search function
  const searchCustomers = useCallback(async (query: string): Promise<Customer[]> => {
    console.log('[CustomerBottomSheet] Searching customers with query:', query);
    const results = await searchService.searchCustomers(query);

    if (results && results.length > 0) {
      return results.map((result) => ({
        id: result.value,
        name: result.label,
        phone: '',
        email: '',
        address: result.detail || '',
      }));
    }
    return [];
  }, []);

  // Render customer item
  const renderCustomerItem = useCallback(
    (item: Customer, onItemSelect: (item: Customer) => void) => (
      <TouchableOpacity
        style={dynamicStyles.customerItem}
        onPress={() => onItemSelect(item)}
        activeOpacity={0.7}
      >
        <View style={styles.customerContent}>
          <Text style={dynamicStyles.customerName}>{item.name}</Text>
          <View style={styles.customerMeta}>
            {item.address && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon
                  name="map-marker"
                  size={16}
                  color={colors.textSecondary}
                  style={{ marginRight: 4 }}
                />
                <Text style={dynamicStyles.metaText} numberOfLines={1}>
                  {item.address}
                </Text>
              </View>
            )}
          </View>
        </View>
        <Icon name="office-building" size={24} color={colors.textSecondary} />
      </TouchableOpacity>
    ),
    [dynamicStyles, colors]
  );

  // Key extractor
  const keyExtractor = useCallback((item: Customer) => item.id, []);

  return (
    <SearchableBottomSheet<Customer>
      isVisible={isVisible}
      onClose={onClose}
      onSelect={onSelect}
      title="Select Customer"
      placeholder="Search customers by name or location..."
      searchFn={searchCustomers}
      renderItem={renderCustomerItem}
      keyExtractor={keyExtractor}
      currentValue={currentValue}
      recentItemsKey={RECENT_CUSTOMERS_KEY}
      maxRecentItems={5}
      backdropOpacity={0.5}
      emptyInitialText="Search for a customer"
      emptySubText="Type at least 2 characters to find customers"
    />
  );
};

// Static styles (layout only - colors are in dynamicStyles)
const styles = StyleSheet.create({
  customerContent: {
    flex: 1,
  },
  customerMeta: {
    marginTop: theme.spacing.xs,
  },
});
