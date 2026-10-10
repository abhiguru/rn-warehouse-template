/**
 * ItemSearchField - Item name autocomplete field
 *
 * Extracted from HorizontalItemForm.tsx for better maintainability.
 * Wraps RemoteAutocompleteInput with item-specific search logic.
 *
 * @module features/grn/components/item-form/ItemSearchField
 */

import React, { useCallback } from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RemoteAutocompleteInput } from '@/components/RemoteAutocompleteInput';
import { searchItems } from '@/services/item-search-service';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space, typography } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import type { ThemeTokens } from '@/theme/tokens';

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
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Render dropdown item
  const renderItem = useCallback(
    (item: ItemSearchResult) => (
      <View>
        <Text style={styles.dropdownText}>{item.name}</Text>
        {!!item.packaging && <Text style={styles.dropdownSubtext}>{item.packaging}</Text>}
      </View>
    ),
    [styles]
  );

  // Key extractor
  const keyExtractor = useCallback((item: ItemSearchResult) => item.id, []);

  return (
    <View>
      <View style={styles.labelRow}>
        <Icon name="cube-outline" size={iconSize.sm} color={t.icon.secondary} />
        <Text style={styles.label}>
          {tr('common.item')}<Text style={styles.required}> *</Text>
        </Text>
      </View>

      <RemoteAutocompleteInput<ItemSearchResult>
        value={value}
        placeholder={tr('grn.item.searchPlaceholder')}
        fetchData={searchItems}
        onSelect={onSelect}
        renderItem={renderItem}
        getItemAccessibilityLabel={(item) => tr('grn.item.selectItemLabel', { name: item.name })}
        keyExtractor={keyExtractor}
        zIndex={zIndex}
      />

      {!!error && (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  labelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: space.xs,
    gap: space.xs,
  },
  label: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  required: {
    color: t.text.required,
  },
  dropdownText: {
    ...typography.body,
    color: t.text.primary,
  },
  dropdownSubtext: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  errorRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.xs,
    marginTop: space.xs,
  },
  errorText: {
    ...typography.footnote,
    color: t.status.negative.text,
    flexShrink: 1,
  },
});

export default ItemSearchField;
