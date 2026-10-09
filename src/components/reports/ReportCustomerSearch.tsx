/**
 * ReportCustomerSearch
 *
 * Inline search input for report screens that both filters visible customer
 * cards (client-side, via parent) and shows an autocomplete dropdown for
 * customers not already in the current list (via backend search).
 *
 * Styling follows docs/STYLE_GUIDE.md §13.2 (field) and §14.6 (search): the
 * field uses `surface.field` with a `border.field` outline, suggestions sit in a
 * menu card under the field and the matched text is bold.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Keyboard,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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
import { searchService } from '@/services/search-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ReportCustomerSearchProps {
  /** Controlled search query */
  searchQuery: string;
  /** Called when search text changes */
  onSearchChange: (query: string) => void;
  /** Called when a customer is selected from the autocomplete dropdown */
  onCustomerSelect: (customer: { id: string; name: string }) => void;
  /** IDs of customers already visible in the list (excluded from dropdown) */
  visibleCustomerIds: string[];
  /** Placeholder text */
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SEARCH = {
  debounceMs: 300,
  minQueryLength: 2,
} as const;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      marginBottom: space.xs,
      zIndex: 10,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.field,
      borderWidth: 1,
      borderColor: t.border.field,
      backgroundColor: t.surface.field,
      paddingLeft: space.md,
      minHeight: layout.rowMinHeight,
    },
    searchIcon: {
      marginRight: space.sm,
    },
    searchInput: {
      ...typography.body,
      flex: 1,
      color: t.text.primary,
      paddingVertical: 0,
      ...Platform.select({
        android: { paddingVertical: space.sm },
      }),
    },
    trailing: {
      width: touchTarget,
      height: layout.rowMinHeight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dropdown: {
      marginTop: space.xs,
      borderRadius: radius.button,
      backgroundColor: t.surface.card,
      overflow: 'hidden',
      ...t.shadow[3],
    },
    dropdownLabel: {
      ...typography.footnote,
      fontWeight: fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      color: t.text.secondary,
      paddingHorizontal: space.md,
      paddingTop: space.md,
      paddingBottom: space.s6,
    },
    dropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      minHeight: layout.rowMinHeight,
      gap: space.md,
    },
    dropdownItemDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border.divider,
    },
    dropdownItemPressed: {
      backgroundColor: t.surface.cardPressed,
    },
    dropdownItemContent: {
      flex: 1,
    },
    dropdownItemName: {
      ...typography.body,
      color: t.text.primary,
    },
    match: {
      fontWeight: fontWeight.bold,
    },
    dropdownItemDetail: {
      ...typography.caption1,
      color: t.text.secondary,
      marginTop: space.xxs,
    },
  });

type Styles = ReturnType<typeof makeStyles>;

/** Renders `text` with the first case-insensitive match of `query` in bold. */
function HighlightedName({ text, query, styles }: { text: string; query: string; styles: Styles }) {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) {
    return (
      <Text style={styles.dropdownItemName} numberOfLines={1}>
        {text}
      </Text>
    );
  }
  return (
    <Text style={styles.dropdownItemName} numberOfLines={1}>
      {text.slice(0, at)}
      <Text style={styles.match}>{text.slice(at, at + q.length)}</Text>
      {text.slice(at + q.length)}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const ReportCustomerSearch: React.FC<ReportCustomerSearchProps> = ({
  searchQuery,
  onSearchChange,
  onCustomerSelect,
  visibleCustomerIds,
  placeholder = 'Search customers',
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [isSearching, setIsSearching] = useState(false);
  const [dropdownResults, setDropdownResults] = useState<
    { id: string; name: string; detail?: string }[]
  >([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleIdsRef = useRef(visibleCustomerIds);
  visibleIdsRef.current = visibleCustomerIds;

  // Debounced backend search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchQuery.trim().length < SEARCH.minQueryLength) {
      setDropdownResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchService.searchCustomers(searchQuery.trim());
        const visibleSet = new Set(visibleIdsRef.current);
        const filtered = results
          .filter((r) => !visibleSet.has(r.value))
          .map((r) => ({ id: r.value, name: r.label, detail: r.detail }));
        setDropdownResults(filtered);
        setShowDropdown(filtered.length > 0);
      } catch {
        setDropdownResults([]);
        setShowDropdown(false);
      } finally {
        setIsSearching(false);
      }
    }, SEARCH.debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const handleClear = useCallback(() => {
    onSearchChange('');
    setDropdownResults([]);
    setShowDropdown(false);
  }, [onSearchChange]);

  const handleSelect = useCallback(
    (customer: { id: string; name: string }) => {
      Keyboard.dismiss();
      setShowDropdown(false);
      setDropdownResults([]);
      onSearchChange('');
      onCustomerSelect(customer);
    },
    [onSearchChange, onCustomerSelect],
  );

  return (
    <View style={styles.container}>
      {/* Search field */}
      <View style={styles.searchBar}>
        <Icon
          name="magnify"
          size={iconSize.md}
          color={t.icon.secondary}
          style={styles.searchIcon}
        />
        <TextInput
          placeholder={placeholder}
          value={searchQuery}
          onChangeText={onSearchChange}
          style={styles.searchInput}
          placeholderTextColor={t.text.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={placeholder}
        />
        {isSearching && (
          <View style={styles.trailing}>
            <ActivityIndicator
              size="small"
              color={t.brand.tint}
              accessibilityLabel="Searching"
            />
          </View>
        )}
        {searchQuery.length > 0 && !isSearching && (
          <Pressable
            onPress={handleClear}
            style={styles.trailing}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
          </Pressable>
        )}
      </View>

      {/* Autocomplete Dropdown */}
      {showDropdown && dropdownResults.length > 0 && (
        <View style={styles.dropdown}>
          <Text style={styles.dropdownLabel} accessibilityRole="header">
            Other customers
          </Text>
          {dropdownResults.map((customer, index) => (
            <Pressable
              key={customer.id}
              style={({ pressed }) => [
                styles.dropdownItem,
                pressed && styles.dropdownItemPressed,
                index < dropdownResults.length - 1 && styles.dropdownItemDivider,
              ]}
              onPress={() => handleSelect(customer)}
              accessibilityRole="button"
              accessibilityLabel={customer.detail ? `${customer.name}, ${customer.detail}` : customer.name}
            >
              <Icon name="account-outline" size={iconSize.md} color={t.icon.secondary} />
              <View style={styles.dropdownItemContent}>
                <HighlightedName text={customer.name} query={searchQuery} styles={styles} />
                {customer.detail && (
                  <Text style={styles.dropdownItemDetail} numberOfLines={1}>
                    {customer.detail}
                  </Text>
                )}
              </View>
              <Icon name="chevron-right" size={iconSize.sm} color={t.icon.secondary} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};
