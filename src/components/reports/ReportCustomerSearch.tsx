/**
 * ReportCustomerSearch
 *
 * Inline search input for report screens that both filters visible customer
 * cards (client-side, via parent) and shows an autocomplete dropdown for
 * customers not already in the current list (via backend search).
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
import { useFioriColors } from '@/theme/fioriColors';
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
// Constants (Fiori-aligned)
// ---------------------------------------------------------------------------
const SEARCH = {
  height: 40,
  borderRadius: 10,
  padding: 12,
  iconSize: 20,
  iconMargin: 8,
  clearIconSize: 14,
  fontSize: 15,
  touchTarget: 44,
  debounceMs: 300,
  minQueryLength: 2,
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const ReportCustomerSearch: React.FC<ReportCustomerSearchProps> = ({
  searchQuery,
  onSearchChange,
  onCustomerSelect,
  visibleCustomerIds,
  placeholder = 'Search customers...',
}) => {
  const fiori = useFioriColors();
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
      {/* Search Bar */}
      <View style={[styles.searchBar, { backgroundColor: fiori.colors.backgroundSecondary }]}>
        <Icon
          name="magnify"
          size={SEARCH.iconSize}
          color={fiori.colors.textSecondary}
          style={styles.searchIcon}
        />
        <TextInput
          placeholder={placeholder}
          value={searchQuery}
          onChangeText={onSearchChange}
          style={[styles.searchInput, { color: fiori.colors.textPrimary }]}
          placeholderTextColor={fiori.colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {isSearching && (
          <ActivityIndicator
            size="small"
            color={fiori.colors.tint}
            style={styles.loader}
          />
        )}
        {searchQuery.length > 0 && !isSearching && (
          <Pressable
            onPress={handleClear}
            style={styles.clearButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <View
              style={[
                styles.clearIconContainer,
                { backgroundColor: fiori.colors.textSecondary },
              ]}
            >
              <Icon name="close" size={SEARCH.clearIconSize} color="#FFFFFF" />
            </View>
          </Pressable>
        )}
      </View>

      {/* Autocomplete Dropdown */}
      {showDropdown && dropdownResults.length > 0 && (
        <View
          style={[
            styles.dropdown,
            {
              backgroundColor: fiori.colors.cardBackground,
              borderColor: fiori.colors.divider,
            },
          ]}
        >
          <Text
            style={[styles.dropdownLabel, { color: fiori.colors.textSecondary }]}
          >
            OTHER CUSTOMERS
          </Text>
          {dropdownResults.map((customer, index) => (
            <Pressable
              key={customer.id}
              style={({ pressed }) => [
                styles.dropdownItem,
                pressed && { backgroundColor: fiori.colors.backgroundSecondary },
                index < dropdownResults.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: fiori.colors.divider,
                },
              ]}
              onPress={() => handleSelect(customer)}
              accessibilityRole="button"
              accessibilityLabel={customer.name}
            >
              <Icon
                name="account-outline"
                size={20}
                color={fiori.colors.tint}
              />
              <View style={styles.dropdownItemContent}>
                <Text
                  style={[
                    styles.dropdownItemName,
                    { color: fiori.colors.textPrimary },
                  ]}
                  numberOfLines={1}
                >
                  {customer.name}
                </Text>
                {customer.detail && (
                  <Text
                    style={[
                      styles.dropdownItemDetail,
                      { color: fiori.colors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {customer.detail}
                  </Text>
                )}
              </View>
              <Icon
                name="chevron-right"
                size={16}
                color={fiori.colors.textSecondary}
              />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles (layout only — colors applied inline for dark mode support)
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    marginBottom: 4,
    zIndex: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: SEARCH.borderRadius,
    paddingHorizontal: SEARCH.padding,
    height: SEARCH.height,
    minHeight: SEARCH.touchTarget,
  },
  searchIcon: {
    marginRight: SEARCH.iconMargin,
  },
  searchInput: {
    flex: 1,
    fontSize: SEARCH.fontSize,
    paddingVertical: 0,
    ...Platform.select({
      android: { paddingVertical: 8 },
    }),
  },
  loader: {
    marginLeft: SEARCH.iconMargin,
  },
  clearButton: {
    marginLeft: SEARCH.iconMargin,
    padding: 2,
  },
  clearIconContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdown: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  dropdownItemContent: {
    flex: 1,
  },
  dropdownItemName: {
    fontSize: 15,
    fontWeight: '500',
  },
  dropdownItemDetail: {
    fontSize: 12,
    marginTop: 1,
  },
});
