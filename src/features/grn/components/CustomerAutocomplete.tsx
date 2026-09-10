/**
 * CustomerAutocomplete - Customer search autocomplete
 *
 * Uses RemoteAutocompleteInput (Generic Autocomplete) for consistent UX.
 * Provides customer-specific data fetching and rendering.
 *
 * @module features/grn/components/CustomerAutocomplete
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RemoteAutocompleteInput } from '@/components/RemoteAutocompleteInput';
import { getSupabaseClient } from '@/config/supabaseConfig';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// TYPES
// ============================================================================

interface Customer {
  id: string;
  name: string;
  mobile?: string;
}

interface CustomerAutocompleteProps {
  value?: { id: string; name: string };
  onChange: (customer: { id: string; name: string }) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  helperText?: string;
  zIndex?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const CustomerAutocomplete: React.FC<CustomerAutocompleteProps> = ({
  value,
  onChange,
  placeholder = 'Search customers...',
  error,
  disabled = false,
  required = false,
  label,
  helperText,
  zIndex = 1000,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Fetch customers from Supabase
  const fetchCustomers = useCallback(async (query: string): Promise<Customer[]> => {
    if (query.length < 2) {
      return [];
    }

    try {
      const { data, error: queryError } = await getSupabaseClient()
        .from('customers')
        .select('id, name, mobile')
        .ilike('name', `%${query}%`)
        .order('name')
        .limit(10);

      if (queryError) {
        console.error('[CustomerAutocomplete] Search error:', queryError);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('[CustomerAutocomplete] Search error:', err);
      return [];
    }
  }, []);

  // Handle customer selection
  const handleSelect = useCallback(
    (customer: Customer | null) => {
      if (customer) {
        onChange({ id: customer.id, name: customer.name });
      } else {
        onChange({ id: '', name: '' });
      }
    },
    [onChange]
  );

  // Render dropdown item
  const renderItem = useCallback(
    (customer: Customer) => (
      <View style={styles.itemContainer}>
        <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
          {customer.name}
        </Text>
        {customer.mobile && (
          <Text style={[styles.itemMobile, { color: colors.textSecondary }]} numberOfLines={1}>
            {customer.mobile}
          </Text>
        )}
      </View>
    ),
    [colors]
  );

  // Key extractor
  const keyExtractor = useCallback((customer: Customer) => customer.id, []);

  return (
    <RemoteAutocompleteInput<Customer>
      value={value?.name || ''}
      label={label}
      placeholder={placeholder}
      helperText={helperText}
      error={error}
      required={required}
      fetchData={fetchCustomers}
      onSelect={handleSelect}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      zIndex={zIndex}
      editable={!disabled}
      minChars={2}
      debounceMs={300}
      emptyText="No customers found"
    />
  );
};

// ============================================================================
// STYLES (Layout only - colors applied inline)
// ============================================================================

const styles = StyleSheet.create({
  itemContainer: {},
  itemName: {
    fontSize: theme.fontSize.base,
    fontWeight: '500',
  },
  itemMobile: {
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
});

export default CustomerAutocomplete;
