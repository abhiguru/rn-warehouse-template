/**
 * CustomerSearchBottomSheet - Reusable customer search bottom sheet
 *
 * SAP Fiori Design System - Bottom Sheet Component
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
  Platform,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetTextInput, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchService } from '@/services/search-service';
import { RecentCustomersService, RecentCustomer } from '@/services/recent-customers-service';
import { useAppSelector } from '@/store/hooks';
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

/** Shows the part of `text` that matches `query` in bold (style guide §14.6). */
function HighlightedText({ text, query, style, boldStyle }: {
  text: string;
  query: string;
  style: object;
  boldStyle: object;
}) {
  const index = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (index < 0) {
    return <Text style={style} numberOfLines={2}>{text}</Text>;
  }
  return (
    <Text style={style} numberOfLines={2}>
      {text.slice(0, index)}
      <Text style={boldStyle}>{text.slice(index, index + query.length)}</Text>
      {text.slice(index + query.length)}
    </Text>
  );
}

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
    ({ onSelect, title = 'Select customer' }, ref) => {
        const bottomSheetRef = useRef<BottomSheet>(null);
        const searchInputRef = useRef<any>(null);
        const insets = useSafeAreaInsets();
        const snapPoints = useMemo(() => ['70%', '90%'], []);

        const [searchQuery, setSearchQuery] = useState('');
        const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
        const [recentCustomers, setRecentCustomers] = useState<RecentCustomer[]>([]);
        const [isSearching, setIsSearching] = useState(false);
        const [isOpen, setIsOpen] = useState(false);

        const t = useTokens();
        const styles = useThemedStyles(makeStyles);

        // Get user ID for scoping recent customers storage
        const userId = useAppSelector((state) => state.auth.userProfile?.id);

        // Expose open/close methods to parent
        useImperativeHandle(ref, () => ({
            open: () => {
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

        // Android back closes the sheet first (style guide §15)
        useEffect(() => {
            if (!isOpen) return;
            const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
                bottomSheetRef.current?.close();
                return true;
            });
            return () => subscription.remove();
        }, [isOpen]);

        // Backdrop: the scrim token carries its own opacity
        const renderBackdrop = useCallback(
            (props: BottomSheetBackdropProps) => (
                <BottomSheetBackdrop
                    {...props}
                    disappearsOnIndex={-1}
                    appearsOnIndex={0}
                    opacity={1}
                    style={[props.style, styles.backdrop]}
                />
            ),
            [styles]
        );

        // Get display data - include detail for address/city display
        const displayData = useMemo(() => {
            if (searchQuery.length >= 1) {
                return searchResults;
            }
            // Include detail from recent customers for address display
            return recentCustomers.map(c => ({ value: c.id, label: c.name, detail: c.detail }));
        }, [searchQuery, searchResults, recentCustomers]);

        const isSearchMode = searchQuery.length >= 1;
        const emptyTitle = isSearching
            ? 'Searching…'
            : isSearchMode
                ? `No customers match "${searchQuery}"`
                : 'No recent customers';
        const emptyMessage = isSearching
            ? undefined
            : isSearchMode
                ? 'Try fewer letters or another spelling.'
                : 'Type a name to search. Customers you pick appear here.';

        return (
            <BottomSheet
                ref={bottomSheetRef}
                index={-1}
                snapPoints={snapPoints}
                enablePanDownToClose
                onChange={index => setIsOpen(index >= 0)}
                backdropComponent={renderBackdrop}
                backgroundStyle={styles.sheetBackground}
                style={styles.sheetShadow}
                handleIndicatorStyle={styles.handle}
                topInset={insets.top}
            >
                <View style={styles.content}>
                    {/* Sheet header */}
                    <View style={styles.header}>
                        <Text style={styles.title} accessibilityRole="header">{title}</Text>
                        <Pressable
                            onPress={() => bottomSheetRef.current?.close()}
                            style={({ pressed }) => [
                                styles.closeButton,
                                pressed && styles.closeButtonPressed,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel="Close customer search"
                        >
                            <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
                        </Pressable>
                    </View>

                    {/* Search field, kept at the top */}
                    <View style={styles.searchContainer}>
                        <View style={styles.searchBar}>
                            <Icon
                                name="magnify"
                                size={iconSize.md}
                                color={t.icon.secondary}
                                style={styles.searchIcon}
                            />
                            <BottomSheetTextInput
                                ref={searchInputRef}
                                placeholder="Search customers"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                style={styles.searchInput}
                                placeholderTextColor={t.text.placeholder}
                                autoCapitalize="none"
                                autoCorrect={false}
                                returnKeyType="search"
                                accessibilityLabel="Search customers"
                            />
                            {isSearching && (
                                <ActivityIndicator
                                    size="small"
                                    color={t.brand.tint}
                                    style={styles.searchLoader}
                                    accessibilityLabel="Searching"
                                />
                            )}
                            {searchQuery.length > 0 && !isSearching && (
                                <Pressable
                                    onPress={() => setSearchQuery('')}
                                    style={styles.clearButton}
                                    accessibilityRole="button"
                                    accessibilityLabel="Clear search"
                                >
                                    <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
                                </Pressable>
                            )}
                        </View>
                    </View>

                    {/* Customer List */}
                    <BottomSheetFlatList
                        data={displayData}
                        keyExtractor={(item: { value: string; label: string; detail?: string }) => item.value}
                        ListHeaderComponent={
                            !isSearchMode && displayData.length > 0 ? (
                                <Text style={styles.sectionHeader} accessibilityRole="header">RECENT CUSTOMERS</Text>
                            ) : null
                        }
                        renderItem={({ item }: { item: { value: string; label: string; detail?: string } }) => (
                            <Pressable
                                style={({ pressed }) => [
                                    styles.customerItem,
                                    pressed && styles.customerItemPressed,
                                ]}
                                onPress={() => handleSelect(item)}
                                accessibilityRole="button"
                                accessibilityLabel={item.detail ? `${item.label}, ${item.detail}` : item.label}
                            >
                                <View style={styles.customerItemContent}>
                                    <Icon
                                        name={isSearchMode ? 'account-outline' : 'history'}
                                        size={iconSize.md}
                                        color={t.icon.secondary}
                                        style={styles.customerItemIcon}
                                    />
                                    <View style={styles.customerItemTextContainer}>
                                        <HighlightedText
                                            text={item.label}
                                            query={isSearchMode ? searchQuery : ''}
                                            style={styles.customerItemText}
                                            boldStyle={styles.customerItemMatch}
                                        />
                                        {item.detail && (
                                            <Text style={styles.customerItemDetail} numberOfLines={1}>
                                                {item.detail}
                                            </Text>
                                        )}
                                    </View>
                                    <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
                                </View>
                            </Pressable>
                        )}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                {isSearching ? (
                                    <ActivityIndicator color={t.brand.tint} accessibilityLabel="Searching" />
                                ) : (
                                    <Icon
                                        name={isSearchMode ? 'magnify' : 'history'}
                                        size={iconSize.hero}
                                        color={t.icon.secondary}
                                    />
                                )}
                                <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                                {emptyMessage ? <Text style={styles.emptyText}>{emptyMessage}</Text> : null}
                            </View>
                        }
                        contentContainerStyle={[styles.customerList, { paddingBottom: insets.bottom + space.xxl }]}
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
// STYLES (style guide §13.9 bottom sheets)
// =============================================================================
const makeStyles = (t: ThemeTokens) => ({
  backdrop: {
    backgroundColor: t.overlay.scrim,
  },
  sheetBackground: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  sheetShadow: {
    ...t.shadow[4],
  },
  handle: {
    backgroundColor: t.border.separator,
    width: 36,
    height: space.xs,
  },
  content: {
    flex: 1,
    paddingHorizontal: layout.marginCompact,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  title: {
    ...typography.headline,
    color: t.text.primary,
    flex: 1,
  },
  closeButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: -space.md,
  },
  closeButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  searchContainer: {
    paddingVertical: space.md,
  },
  // Text field per §13.2
  searchBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
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
      android: {
        paddingVertical: space.sm,
      },
    }),
  },
  searchLoader: {
    marginHorizontal: space.md,
  },
  clearButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sectionHeader: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    color: t.text.secondary,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  customerList: {
    flexGrow: 1,
  },
  customerItem: {
    minHeight: layout.rowMinHeight,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
    backgroundColor: t.surface.sheet,
  },
  customerItemPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  customerItemContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  customerItemIcon: {
    marginRight: space.md,
  },
  customerItemTextContainer: {
    flex: 1,
  },
  customerItemText: {
    ...typography.body,
    color: t.text.primary,
  },
  customerItemMatch: {
    fontWeight: fontWeight.semibold,
  },
  customerItemDetail: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.max,
    gap: space.sm,
    minHeight: 200,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    paddingHorizontal: space.xxl,
  },
  emptyText: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    paddingHorizontal: space.xxl,
  },
});

export default CustomerSearchBottomSheet;
