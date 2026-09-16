/**
 * ItemSearchField - Item name autocomplete field
 *
 * Extracted from HorizontalItemForm.tsx for better maintainability.
 * Wraps RemoteAutocompleteInput with item-specific search logic.
 *
 * @module features/grn/components/item-form/ItemSearchField
 */

import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RemoteAutocompleteInput } from '@/components/RemoteAutocompleteInput';
import { searchItems } from '@/services/item-search-service';
import theme from '@/theme';

// ============================================================================
// TYPES
// ============================================================================

export interface ItemSearchResult {
  id: string;
  name: string;
  packaging?: string;
}

export interface ItemSearchFieldProps {
  value: string;
  onSelect: (item: ItemSearchResult | null) => void;
  error?: string;
  zIndex?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ItemSearchField: React.FC<ItemSearchFieldProps> = ({
  value,
  onSelect,
  error,
  zIndex = 3000,
}) => {
  // Render dropdown item
  const renderItem = useCallback(
    (item: ItemSearchResult) => (
      <View>
        <Text style={styles.dropdownText}>{item.name}</Text>
        {item.packaging && (
          <Text style={styles.dropdownSubtext}>{item.packaging}</Text>
        )}
      </View>
    ),
    []
  );

  // Key extractor
  const keyExtractor = useCallback((item: ItemSearchResult) => item.id, []);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Icon name="package-variant" size={16} color={theme.colors.primary} />
        <Text style={styles.label}>
          ITEM<Text style={styles.required}> *</Text>
        </Text>
      </View>

      <RemoteAutocompleteInput<ItemSearchResult>
        value={value}
        placeholder="Type to search..."
        fetchData={searchItems}
        onSelect={onSelect}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        zIndex={zIndex}
      />

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {},
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '400',
    color: theme.colors.fiori.text.secondary,
    letterSpacing: 0.5,
    lineHeight: 18,
  },
  required: {
    color: theme.colors.fiori.semantic.negative,
  },
  dropdownText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[900],
  },
  dropdownSubtext: {
    fontSize: 12,
    color: theme.colors.gray[500],
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.fiori.semantic.negative,
    marginTop: 4,
    lineHeight: 18,
  },
});

export default ItemSearchField;
