/**
 * ItemAutocomplete - Item search autocomplete
 *
 * Uses RemoteAutocompleteInput (Generic Autocomplete) for consistent UX.
 * Provides item-specific data fetching and rendering with packaging badges.
 *
 * @module features/grn/components/ItemAutocomplete
 */

import React, { useCallback } from 'react';
import { View, Text } from 'react-native';
import { RemoteAutocompleteInput } from '@/components/RemoteAutocompleteInput';
import { searchService } from '@/services/search-service';
import { useThemedStyles } from '@/hooks/useTheme';
import { fontWeight, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { StatusTag } from '@/components/ui';

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
  placeholder = 'Search items',
  error,
  disabled = false,
  required = false,
  label,
  helperText,
  zIndex = 1000,
}) => {
  const styles = useThemedStyles(makeStyles);

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
        {item.packaging ? (
          <StatusTag status="neutral" label={item.packaging} icon={null} style={styles.packagingBadge} />
        ) : null}
      </View>
      {item.description ? (
        <Text style={styles.itemDescription} numberOfLines={1}>
          {item.description}
        </Text>
      ) : null}
    </View>
  ), [styles]);

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
      emptyText="No matches"
    />
  );
};

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  itemContainer: {},
  itemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  itemName: { ...typography.headline, color: t.text.primary, flex: 1 },
  packagingBadge: { marginLeft: space.sm, alignSelf: 'center' as const },
  itemDescription: { ...typography.subhead, color: t.text.secondary, marginTop: space.xxs },
});

export default ItemAutocomplete;
