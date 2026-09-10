/**
 * CustomerSearchBottomSheet - Reusable customer search bottom sheet
 *
 * SAP Fiori Design System - Bottom Sheet Component
 * @see design/sap-fiori-specs/07-bottom-sheet.md
 *
 * Extracted from OrderListMobile.tsx to provide consistent customer selection UX
 * across the app (Orders, GRN Sender/Customer selection, etc.)
 *
 * Features:
 * - Search customers with debounce
 * - Recent customers with clock icon
 * - Clean, simple item rendering
 * - Keyboard aware
 */

import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Vibration,
  Platform,
  ActivityIndicator,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetTextInput, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchService } from '@/services/search-service';
import { RecentCustomersService, RecentCustomer } from '@/services/recent-customers-service';
import { useListColors } from '@/hooks/useListColors';
import { useAppSelector } from '@/store/hooks';

// =============================================================================
// FIORI DESIGN CONSTANTS
// =============================================================================
const FIORI = {
  // Bottom Sheet dimensions (from 07-bottom-sheet.md)
  sheet: {
    cornerRadius: 16,
    handleWidth: 36,
    handleHeight: 5,
    handleColor: '#C6C6C8',
  },
  // Header
  header: {
    height: 56,
    paddingHorizontal: 16,
  },
  // Search bar (from 04-search-bar.md)
  search: {
    height: 36,
    touchTarget: 44,
    borderRadius: 10,
    iconSize: 20,
    fontSize: 17,
    clearIconSize: 16,
    padding: 12,
    iconMargin: 8,
  },
  // Typography
  typography: {
    title: {
      fontSize: 17,
      fontWeight: '600' as const,
      lineHeight: 22,
    },
    itemTitle: {
      fontSize: 16,
      fontWeight: '400' as const,
      lineHeight: 22,
    },
    empty: {
      fontSize: 15,
      fontWeight: '400' as const,
      lineHeight: 20,
    },
  },
  // List item
  listItem: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // Touch target
  touchTarget: {
    minHeight: 44,
    minWidth: 44,
  },
  // Spacing
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
  },
  // Backdrop
  backdrop: {
    opacity: 0.4,
  },
} as const;

export interface CustomerSearchResult {
    value: string;
    label: string;
    detail?: string;
    city?: string;
    mobile?: string;
}

export interface CustomerSearchBottomSheetProps {
    onSelect: (customer: { id: string; name: string; address?: string; city?: string; mobile?: string }) => void;
    title?: string;
}

export interface CustomerSearchBottomSheetRef {
    open: () => void;
    close: () => void;
}

export const CustomerSearchBottomSheet = forwardRef<CustomerSearchBottomSheetRef, CustomerSearchBottomSheetProps>(
    ({ onSelect, title = 'Select Customer' }, ref) => {
        const bottomSheetRef = useRef<BottomSheet>(null);
        const searchInputRef = useRef<any>(null);
        const insets = useSafeAreaInsets();
        const snapPoints = useMemo(() => ['70%', '90%'], []);

        const [searchQuery, setSearchQuery] = useState('');
        const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
        const [recentCustomers, setRecentCustomers] = useState<RecentCustomer[]>([]);
        const [isSearching, setIsSearching] = useState(false);

        // Theme colors for dark mode support
        const colors = useListColors();

        // Get user ID for scoping recent customers storage
        const userId = useAppSelector((state) => state.auth.userProfile?.id);

        // Expose open/close methods to parent
        useImperativeHandle(ref, () => ({
            open: () => {
                Vibration.vibrate(10);
                setSearchQuery('');
                setSearchResults([]);
                loadRecentCustomers();
                bottomSheetRef.current?.expand();
                // Auto-focus search input after sheet animation
                setTimeout(() => {
                    searchInputRef.current?.focus();
                }, 100);
            },
            close: () => {
                bottomSheetRef.current?.close();
            },
        }), []);

        // Load recent customers (user-scoped)
        const loadRecentCustomers = useCallback(async () => {
            try {
                const recent = await RecentCustomersService.getRecentCustomers(userId);
                setRecentCustomers(recent || []);
            } catch (error) {
                console.error('[CustomerSearchBottomSheet] Error loading recent customers:', error);
                setRecentCustomers([]);
            }
        }, [userId]);

        // Search customers with debounce
        useEffect(() => {
            if (searchQuery.length >= 1) {
                setIsSearching(true);
                const timeoutId = setTimeout(async () => {
                    try {
                        const results = await searchService.searchCustomers(searchQuery);
                        setSearchResults(results || []);
                    } catch (error) {
                        console.error('[CustomerSearchBottomSheet] Search error:', error);
                        setSearchResults([]);
                    } finally {
                        setIsSearching(false);
                    }
                }, 300);
                return () => clearTimeout(timeoutId);
            } else {
                setSearchResults([]);
                setIsSearching(false);
            }
        }, [searchQuery]);

        // Handle customer selection (user-scoped)
        const handleSelect = useCallback(async (customer: CustomerSearchResult | { value: string; label: string; detail?: string; city?: string; mobile?: string }) => {
            Vibration.vibrate(10);
            // Pass detail (address/city) to recent customers for display
            const detail = 'detail' in customer ? customer.detail : undefined;
            const city = 'city' in customer ? customer.city : undefined;
            const mobile = 'mobile' in customer ? customer.mobile : undefined;
            await RecentCustomersService.addRecentCustomer(customer.value, customer.label, detail, userId);
            bottomSheetRef.current?.close();
            setSearchQuery('');
            setSearchResults([]);
            onSelect({ id: customer.value, name: customer.label, address: detail, city, mobile });
        }, [onSelect, userId]);

        // Render backdrop (Fiori 40% opacity)
        const renderBackdrop = useCallback(
            (props: BottomSheetBackdropProps) => (
                <BottomSheetBackdrop
                    {...props}
                    disappearsOnIndex={-1}
                    appearsOnIndex={0}
                    opacity={FIORI.backdrop.opacity}
                />
            ),
            []
        );

        // Get display data - include detail for address/city display
        const displayData = useMemo(() => {
            if (searchQuery.length >= 1) {
                return searchResults;
            }
            // Include detail from recent customers for address display
            return recentCustomers.map(c => ({ value: c.id, label: c.name, detail: c.detail }));
        }, [searchQuery, searchResults, recentCustomers]);

        return (
            <BottomSheet
                ref={bottomSheetRef}
                index={-1}
                snapPoints={snapPoints}
                enablePanDownToClose
                backdropComponent={renderBackdrop}
                backgroundStyle={{ backgroundColor: colors.cellBackground }}
                handleIndicatorStyle={{ backgroundColor: colors.gray300, width: 36 }}
                topInset={insets.top}
            >
                <View style={styles.content}>
                    {/* Fiori Header */}
                    <View style={[styles.header, { borderBottomColor: colors.cellDivider }]}>
                        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
                        <Pressable
                            onPress={() => bottomSheetRef.current?.close()}
                            style={({ pressed }) => [
                                styles.closeButton,
                                pressed && styles.closeButtonPressed,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                        >
                            <Icon name="close" size={24} color={colors.gray600} />
                        </Pressable>
                    </View>

                    {/* Fiori Search Input */}
                    <View style={styles.searchContainer}>
                        <View style={[styles.searchBar, { backgroundColor: colors.gray100 }]}>
                            <Icon
                                name="search-outline"
                                size={FIORI.search.iconSize}
                                color={colors.gray500}
                                style={styles.searchIcon}
                            />
                            <BottomSheetTextInput
                                ref={searchInputRef}
                                placeholder="Search customers..."
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                style={[styles.searchInput, { color: colors.textPrimary }]}
                                placeholderTextColor={colors.gray500}
                                autoCapitalize="none"
                                autoCorrect={false}
                                returnKeyType="search"
                            />
                            {isSearching && (
                                <ActivityIndicator size="small" color={colors.primary} style={styles.searchLoader} />
                            )}
                            {searchQuery.length > 0 && !isSearching && (
                                <Pressable
                                    onPress={() => setSearchQuery('')}
                                    style={styles.clearButton}
                                    hitSlop={8}
                                    accessibilityRole="button"
                                    accessibilityLabel="Clear search"
                                >
                                    <View style={[styles.clearIconContainer, { backgroundColor: colors.gray400 }]}>
                                        <Icon name="close" size={FIORI.search.clearIconSize} color="#FFFFFF" />
                                    </View>
                                </Pressable>
                            )}
                        </View>
                    </View>

                    {/* Customer List */}
                    <BottomSheetFlatList
                        data={displayData}
                        keyExtractor={(item: { value: string; label: string; detail?: string }) => item.value}
                        renderItem={({ item }: { item: { value: string; label: string; detail?: string } }) => (
                            <Pressable
                                style={({ pressed }) => [
                                    styles.customerItem,
                                    { borderBottomColor: colors.cellDivider, backgroundColor: colors.cellBackground },
                                    pressed && { backgroundColor: colors.gray100 },
                                ]}
                                onPress={() => handleSelect(item)}
                                accessibilityRole="button"
                                accessibilityLabel={item.label}
                            >
                                <View style={styles.customerItemContent}>
                                    {searchQuery.length < 1 && (
                                        <Icon
                                            name="time-outline"
                                            size={20}
                                            color={colors.gray500}
                                            style={styles.customerItemIcon}
                                        />
                                    )}
                                    <View style={styles.customerItemTextContainer}>
                                        <Text style={[styles.customerItemText, { color: colors.textPrimary }]} numberOfLines={1}>{item.label}</Text>
                                        {item.detail && (
                                            <Text style={[styles.customerItemDetail, { color: colors.textSecondary }]} numberOfLines={1}>
                                                {item.detail}
                                            </Text>
                                        )}
                                    </View>
                                    <Icon name="chevron-forward" size={20} color={colors.gray400} />
                                </View>
                            </Pressable>
                        )}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Icon
                                    name={searchQuery.length >= 1 ? 'search-outline' : 'time-outline'}
                                    size={48}
                                    color={colors.gray300}
                                />
                                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                    {isSearching
                                        ? 'Searching...'
                                        : searchQuery.length >= 1
                                            ? 'No customers found'
                                            : recentCustomers.length === 0
                                                ? 'Start typing to search'
                                                : 'Recent customers will appear here'}
                                </Text>
                            </View>
                        }
                        contentContainerStyle={styles.customerList}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    />
                </View>
            </BottomSheet>
        );
    }
);

CustomerSearchBottomSheet.displayName = 'CustomerSearchBottomSheet';

// =============================================================================
// STYLES - Layout only (colors applied inline)
// =============================================================================
const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: FIORI.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: FIORI.header.height,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: FIORI.typography.title.fontSize,
    fontWeight: FIORI.typography.title.fontWeight,
    lineHeight: FIORI.typography.title.lineHeight,
  },
  closeButton: {
    width: FIORI.touchTarget.minWidth,
    height: FIORI.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonPressed: {
    opacity: 0.7,
  },
  searchContainer: {
    paddingVertical: FIORI.spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: FIORI.search.borderRadius,
    paddingHorizontal: FIORI.search.padding,
    height: FIORI.search.height,
    minHeight: FIORI.search.touchTarget,
  },
  searchIcon: {
    marginRight: FIORI.search.iconMargin,
  },
  searchInput: {
    flex: 1,
    fontSize: FIORI.search.fontSize,
    paddingVertical: 0,
    ...Platform.select({
      android: {
        paddingVertical: 8,
      },
    }),
  },
  searchLoader: {
    marginLeft: FIORI.search.iconMargin,
  },
  clearButton: {
    marginLeft: FIORI.search.iconMargin,
    padding: 2,
  },
  clearIconContainer: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerList: {
    paddingBottom: FIORI.spacing.xl,
    flexGrow: 1,
  },
  customerItem: {
    minHeight: FIORI.listItem.minHeight,
    paddingVertical: FIORI.listItem.paddingVertical,
    borderBottomWidth: 1,
  },
  customerItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customerItemIcon: {
    marginRight: FIORI.spacing.sm,
  },
  customerItemTextContainer: {
    flex: 1,
  },
  customerItemText: {
    fontSize: FIORI.typography.itemTitle.fontSize,
    fontWeight: FIORI.typography.itemTitle.fontWeight,
    lineHeight: FIORI.typography.itemTitle.lineHeight,
  },
  customerItemDetail: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: FIORI.spacing.md,
    minHeight: 200,
  },
  emptyText: {
    fontSize: FIORI.typography.empty.fontSize,
    fontWeight: FIORI.typography.empty.fontWeight,
    lineHeight: FIORI.typography.empty.lineHeight,
    textAlign: 'center',
    paddingHorizontal: FIORI.spacing.xl,
  },
});

export default CustomerSearchBottomSheet;
