/**
 * ItemAutocomplete - Item search autocomplete
 *
 * Uses RemoteAutocompleteInput (Generic Autocomplete) for consistent UX.
 * Provides item-specific data fetching and rendering with packaging badges.
 *
 * @module features/grn/components/ItemAutocomplete
 */

import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RemoteAutocompleteInput } from '@/components/RemoteAutocompleteInput';
import { searchService } from '@/services/search-service';
import theme from '@/theme';

// ============================================================================
// TYPES
// ============================================================================

interface Item {
  id: string;
  name: string;
  packaging?: string;
  description?: string;
}

interface ItemAutocompleteProps {
  value?: { id: string; name: string; packaging?: string };
  onChange: (item: { id: string; name: string; packaging?: string }) => void;
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

export const ItemAutocomplete: React.FC<ItemAutocompleteProps> = ({
  value,
  onChange,
  placeholder = 'Search items...',
  error,
  disabled = false,
  required = false,
  label,
  helperText,
  zIndex = 1000,
}) => {
  // Fetch items using searchService RPC
  const fetchItems = useCallback(async (query: string): Promise<Item[]> => {
    if (query.length < 2) {
      return [];
    }

    try {
      console.log('[ItemAutocomplete] Searching for:', query);

      // Use searchService RPC instead of direct table query
      const results = await searchService.searchGRNItems(query);

      console.log('[ItemAutocomplete] Search result:', {
        count: results?.length || 0,
      });

      if (!results || results.length === 0) {
        console.log('[ItemAutocomplete] No items found for query:', query);
        return [];
      }

      // Map SearchResult to Item format
      const mappedItems: Item[] = results.map((result) => ({
        id: result.value,
        name: result.label,
        packaging: result.detail || '',
        description: '',
      }));

      console.log('[ItemAutocomplete] Mapped items:', mappedItems.length);
      return mappedItems;
    } catch (err) {
      console.error('[ItemAutocomplete] Search error:', err);
      return [];
    }
  }, []);

  // Handle item selection
  const handleSelect = useCallback(
    (item: Item | null) => {
      if (item) {
        onChange({
          id: item.id,
          name: item.name,
          packaging: item.packaging || '',
        });
      } else {
        onChange({ id: '', name: '', packaging: '' });
      }
    },
    [onChange]
  );

  // Render dropdown item with packaging badge
  const renderItem = useCallback((item: Item) => (
    <View style={styles.itemContainer}>
      <View style={styles.itemRow}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        {item.packaging && (
          <View style={styles.packagingBadge}>
            <Text style={styles.packagingText}>{item.packaging}</Text>
          </View>
        )}
      </View>
      {item.description && (
        <Text style={styles.itemDescription} numberOfLines={1}>
          {item.description}
        </Text>
      )}
    </View>
  ), []);

  // Key extractor
  const keyExtractor = useCallback((item: Item) => item.id, []);

  return (
    <RemoteAutocompleteInput<Item>
      value={value?.name || ''}
      label={label}
      placeholder={placeholder}
      helperText={helperText}
      error={error}
      required={required}
      fetchData={fetchItems}
      onSelect={handleSelect}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      zIndex={zIndex}
      editable={!disabled}
      minChars={2}
      debounceMs={300}
      emptyText="No items found"
    />
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  itemContainer: {},
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemName: {
    fontSize: theme.fontSize.base,
    color: theme.colors.gray[900],
    fontWeight: '500',
    flex: 1,
  },
  packagingBadge: {
    backgroundColor: theme.colors.gray[100],
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    marginLeft: theme.spacing.sm,
  },
  packagingText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[600],
  },
  itemDescription: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[600],
    marginTop: 2,
  },
});

export default ItemAutocomplete;
