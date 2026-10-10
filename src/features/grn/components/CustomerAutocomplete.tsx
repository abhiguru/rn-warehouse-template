/**
 * CustomerAutocomplete - Customer search autocomplete
 *
 * Uses RemoteAutocompleteInput (Generic Autocomplete) for consistent UX.
 * Provides customer-specific data fetching and rendering.
 *
 * @module features/grn/components/CustomerAutocomplete
 */

import React, { useCallback } from 'react';
import { View, Text } from 'react-native';
import { RemoteAutocompleteInput } from '@/components/RemoteAutocompleteInput';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { formatMobile } from '@/utils/formatters';
import { useThemedStyles } from '@/hooks/useTheme';
import { space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

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
  placeholder = tr('grn.pickers.searchCustomers'),
  error,
  disabled = false,
  required = false,
  label,
  helperText,
  zIndex = 1000,
}) => {
  const styles = useThemedStyles(makeStyles);

  // Fetch customers from Supabase
  const fetchCustomers = useCallback(async (query: string): Promise<Customer[]> => {
    if (query.length < 2) {
      return [];
    }

    try {
      const { data, error: queryError } = await (await getAuthenticatedClient())
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
        <Text style={styles.itemName} numberOfLines={1}>
          {customer.name}
        </Text>
        {customer.mobile ? (
          <Text style={styles.itemMobile} numberOfLines={1}>
            {formatMobile(customer.mobile)}
          </Text>
        ) : null}
      </View>
    ),
    [styles]
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
      emptyText={tr('grn.pickers.noMatches')}
    />
  );
};

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  itemContainer: {},
  itemName: { ...typography.headline, color: t.text.primary },
  itemMobile: {
    ...typography.subhead,
    color: t.text.secondary,
    fontVariant: ['tabular-nums' as const],
    marginTop: space.xxs,
  },
});

export default CustomerAutocomplete;
