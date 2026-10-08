/**
 * Customers Screen - 100% SAP Fiori Compliant
 *
 * Based on SAP Fiori for iOS Design Guidelines
 * Features:
 * - Fiori Navigation Bar with back button
 * - Object Cell layout pattern for customer cards
 * - Semantic colors and typography
 * - Platform-specific shadows
 * - 44pt minimum touch targets
 * - Dark mode support via useFioriColors hook
 */

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Platform,
  Pressable,
  ActivityIndicator,
  Alert,
  Vibration,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useIsFocused } from '@react-navigation/native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { customerService } from '@/services/customer-service';
import {
  CustomerListItem,
  CustomerFilters,
  DEFAULT_CUSTOMER_FILTERS,
} from '@/types/customer.types';
import { useFioriColors, type FioriColors } from '@/theme/fioriColors';

// Static design tokens (non-color)
const FIORI_STATIC = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  typography: {
    headline: { fontSize: 17, fontWeight: '600' as const },
    body: { fontSize: 15, fontWeight: '400' as const },
    caption: { fontSize: 13, fontWeight: '400' as const },
    button: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.41 },
  },
  dimensions: {
    cardRadius: 12,
    cardPadding: 16,
    buttonHeight: 44,
    buttonRadius: 8,
    touchTarget: 44,
    avatarSize: 48,
  },
  shadows: {
    card: Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
};

// =============================================================================
// TYPES
// =============================================================================

interface ListState {
  data: CustomerListItem[];
  loading: boolean;
  refreshing: boolean;
  filters: CustomerFilters;
  totalCount: number;
  error: string | null;
}

// =============================================================================
// SCREEN COMPONENT
// =============================================================================

// Alphabet for the rail - common letters only to fit on screen
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function CustomersScreen() {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const FIORI = useFioriColors();
  const flatListRef = useRef<FlatList<CustomerListItem>>(null);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [state, setState] = useState<ListState>({
    data: [],
    loading: true,
    refreshing: false,
    filters: DEFAULT_CUSTOMER_FILTERS,
    totalCount: 0,
    error: null,
  });

  // ===========================================================================
  // FETCH LOGIC
  // ===========================================================================

  // Load ALL customers at once for smooth alphabetical rail navigation
  const fetchCustomers = useCallback(
    async (filters: CustomerFilters) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        // Load all customers (limit 10000 should cover any realistic customer count)
        const response = await customerService.getCustomerList(filters, 10000, 0);

        if (response.success) {
          setState((prev) => ({
            ...prev,
            data: response.data,
            totalCount: response.pagination?.total_count || response.data.length,
            loading: false,
            error: null,
          }));
        } else {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: response.message || 'Failed to fetch customers',
          }));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));
      }
    },
    []
  );

  // ===========================================================================
  // EFFECTS
  // ===========================================================================

  // Load customers on initial mount and when screen is focused
  useEffect(() => {
    if (isFocused) {
      fetchCustomers(state.filters);
    }
  }, [isFocused]);

  // ===========================================================================
  // HANDLERS
  // ===========================================================================

  const handleRefresh = useCallback(() => {
    setState((prev) => ({ ...prev, refreshing: true }));
    fetchCustomers(state.filters).finally(() => {
      setState((prev) => ({ ...prev, refreshing: false }));
    });
  }, [state.filters, fetchCustomers]);

  const handleEditCustomer = useCallback((customerId: string) => {
    router.push({
      pathname: '/customer-edit/[id]/step1',
      params: { id: customerId },
    });
  }, []);

  const handleInactivateCustomer = useCallback(
    async (customerId: string, currentActive: boolean) => {
      try {
        const result = currentActive
          ? await customerService.inactivateCustomer(customerId)
          : await customerService.restoreCustomer(customerId);

        if (result.success) {
          // Update local state to reflect the change
          setState((prev) => ({
            ...prev,
            data: prev.data.map((customer) =>
              customer.id === customerId
                ? { ...customer, active: !currentActive }
                : customer
            ),
          }));
        } else {
          // Show error to user
          Alert.alert(
            currentActive ? 'Cannot Deactivate' : 'Cannot Activate',
            result.message || 'Operation failed',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('[Customers] Toggle active error:', error);
        Alert.alert('Error', 'An unexpected error occurred', [{ text: 'OK' }]);
      }
    },
    []
  );

  const handleAddCustomer = useCallback(() => {
    router.push('/customer-form/step1');
  }, []);

  // ===========================================================================
  // ALPHABETICAL RAIL LOGIC
  // ===========================================================================

  // Build a map of first letters to their first customer index
  const letterIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    state.data.forEach((customer, index) => {
      const firstChar = (customer.name || '').charAt(0).toUpperCase();
      const letter = /[A-Z]/.test(firstChar) ? firstChar : '#';
      if (!(letter in map)) {
        map[letter] = index;
      }
    });
    return map;
  }, [state.data]);

  // Set of available letters (that have customers)
  const availableLetters = useMemo(() => new Set(Object.keys(letterIndexMap)), [letterIndexMap]);

  // Track active letter timeout to clear properly
  const activeLetterTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll to a specific letter
  const scrollToLetter = useCallback((letter: string) => {
    const index = letterIndexMap[letter];
    if (index === undefined || !flatListRef.current) return;

    // Clear any pending timeout
    if (activeLetterTimeoutRef.current) {
      clearTimeout(activeLetterTimeoutRef.current);
    }

    setActiveLetter(letter);
    Vibration.vibrate(5);

    flatListRef.current.scrollToIndex({
      index,
      animated: true,
      viewPosition: 0,
    });

    // Clear active letter after animation
    activeLetterTimeoutRef.current = setTimeout(() => {
      setActiveLetter(null);
      activeLetterTimeoutRef.current = null;
    }, 300);
  }, [letterIndexMap]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (activeLetterTimeoutRef.current) {
        clearTimeout(activeLetterTimeoutRef.current);
      }
    };
  }, []);

  // Handle scroll failures (when item is not rendered yet)
  const handleScrollToIndexFailed = useCallback((info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
    // Scroll to the closest rendered item first, then try again
    flatListRef.current?.scrollToIndex({
      index: info.highestMeasuredFrameIndex,
      animated: false,
    });
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({
        index: info.index,
        animated: true,
        viewPosition: 0,
      });
    }, 100);
  }, []);

  // ===========================================================================
  // RENDER
  // ===========================================================================

  const renderItem = useCallback(
    ({ item }: { item: CustomerListItem }) => (
      <FioriCustomerCard
        customer={item}
        onPress={() => handleEditCustomer(item.id)}
        onToggleActive={() => handleInactivateCustomer(item.id, item.active)}
        fipiColors={FIORI}
      />
    ),
    [handleEditCustomer, handleInactivateCustomer, FIORI]
  );

  const keyExtractor = useCallback((item: CustomerListItem) => item.id, []);

  const renderEmpty = useCallback(() => {
    if (state.loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={FIORI.colors.tint} />
          <Text style={[styles.emptyText, { color: FIORI.colors.textSecondary }]}>
            Loading customers...
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconContainer, { backgroundColor: FIORI.colors.backgroundSecondary }]}>
          <Icon name="account-group-outline" size={64} color={FIORI.colors.textTertiary} />
        </View>
        <Text style={[styles.emptyTitle, { color: FIORI.colors.textPrimary }]}>No Customers</Text>
        <Text style={[styles.emptyText, { color: FIORI.colors.textSecondary }]}>
          No customers found. Create one to get started.
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: FIORI.colors.tint },
            pressed && { backgroundColor: '#dd8200' },
          ]}
          onPress={handleAddCustomer}
        >
          <Icon name="plus" size={20} color={FIORI.colors.iconOnPrimary} />
          <Text style={[styles.primaryButtonText, { color: FIORI.colors.iconOnPrimary }]}>
            Add Customer
          </Text>
        </Pressable>
      </View>
    );
  }, [state.loading, handleAddCustomer, FIORI]);

  return (
    <>
      {/* Fiori Navigation Bar */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: {
            backgroundColor: FIORI.colors.cardBackground,
          },
          headerTintColor: FIORI.colors.tint,
          headerTitleAlign: 'center',
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Icon name="chevron-left" size={28} color={FIORI.colors.tint} />
              <Text style={[styles.backButtonText, { color: FIORI.colors.tint }]}>Back</Text>
            </Pressable>
          ),
          headerTitle: () => (
            <View style={styles.titleContainer}>
              <Text style={[styles.headerTitle, { color: FIORI.colors.textPrimary }]}>
                Customers
              </Text>
              {state.totalCount > 0 && (
                <Text style={[styles.headerSubtitle, { color: FIORI.colors.textSecondary }]}>
                  {state.totalCount} total
                </Text>
              )}
            </View>
          ),
          headerRight: () => (
            <Pressable
              onPress={handleAddCustomer}
              style={styles.addButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Add customer"
            >
              <Icon name="plus" size={24} color={FIORI.colors.tint} />
            </Pressable>
          ),
        }}
      />

      <View style={[styles.container, { backgroundColor: FIORI.colors.background }]}>
        <View style={styles.listWithRail}>
          <FlatList
            ref={flatListRef}
            data={state.data}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: FIORI_STATIC.spacing.xl + insets.bottom },
              state.data.length === 0 && styles.listContentEmpty,
            ]}
            refreshControl={
              <RefreshControl
                refreshing={state.refreshing}
                onRefresh={handleRefresh}
                colors={[FIORI.colors.tint]}
                tintColor={FIORI.colors.tint}
              />
            }
            ListEmptyComponent={renderEmpty}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            style={styles.flatList}
          />

          {/* Alphabetical Rail */}
          {state.data.length > 0 && (
            <AlphabeticalRail
              letters={ALPHABET}
              availableLetters={availableLetters}
              activeLetter={activeLetter}
              onLetterPress={scrollToLetter}
              fioriColors={FIORI}
            />
          )}
        </View>
      </View>
    </>
  );
}

// =============================================================================
// FIORI CUSTOMER CARD COMPONENT (Object Cell Layout)
// Based on SAP Fiori for iOS Design Guidelines
// =============================================================================

interface FioriCustomerCardProps {
  customer: CustomerListItem;
  onPress: () => void;
  onToggleActive: () => void;
  fipiColors: FioriColors;
}

// =============================================================================
// ALPHABETICAL RAIL COMPONENT
// Vertical A-Z rail for quick navigation
// =============================================================================

interface AlphabeticalRailProps {
  letters: string[];
  availableLetters: Set<string>;
  activeLetter: string | null;
  onLetterPress: (letter: string) => void;
  fioriColors: FioriColors;
}

function AlphabeticalRail({
  letters,
  availableLetters,
  activeLetter,
  onLetterPress,
  fioriColors: FIORI,
}: AlphabeticalRailProps) {
  return (
    <View style={styles.alphabetRail}>
      {letters.map((letter) => {
        const hasLoadedCustomers = availableLetters.has(letter);
        const isActive = activeLetter === letter;

        return (
          <Pressable
            key={letter}
            onPress={() => onLetterPress(letter)}
            style={[
              styles.letterItem,
              isActive && { backgroundColor: FIORI.colors.tint, borderRadius: 8 },
            ]}
          >
            <Text
              style={[
                styles.letterText,
                { color: FIORI.colors.tint },
                !hasLoadedCustomers && styles.letterTextDisabled,
                isActive && { color: FIORI.colors.iconOnPrimary },
              ]}
            >
              {letter}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FioriCustomerCard({
  customer,
  onPress,
  onToggleActive,
  fipiColors: FIORI,
}: FioriCustomerCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: FIORI.colors.cardBackground,
          borderColor: FIORI.colors.divider,
        },
        !customer.active && { backgroundColor: FIORI.colors.backgroundSecondary },
        pressed && { backgroundColor: FIORI.colors.cardBackgroundPressed },
      ]}
      onPress={onPress}
    >
      {/* Fiori Object Cell: Leading Avatar */}
      <View
        style={[
          styles.avatar,
          { backgroundColor: FIORI.colors.tintLight },
          !customer.active && { backgroundColor: FIORI.colors.divider },
        ]}
      >
        <Text
          style={[
            styles.avatarText,
            { color: FIORI.colors.tint },
            !customer.active && { color: FIORI.colors.textTertiary },
          ]}
        >
          {(customer.name || 'C').charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Fiori Object Cell: Main Content */}
      <View style={styles.cardContent}>
        {/* Headline - Customer Name */}
        <View style={styles.headlineRow}>
          <Text
            style={[
              styles.headline,
              { color: FIORI.colors.textPrimary },
              !customer.active && { color: FIORI.colors.textTertiary },
            ]}
            numberOfLines={1}
          >
            {customer.name}
          </Text>
          {!customer.active && (
            <View style={[styles.statusBadge, { backgroundColor: FIORI.colors.destructiveLight }]}>
              <Text style={[styles.statusBadgeText, { color: FIORI.colors.destructive }]}>
                Inactive
              </Text>
            </View>
          )}
        </View>

        {/* Subheadline - Contact Details */}
        <View style={styles.attributeStack}>
          {customer.mobile && (
            <View style={styles.attributeRow}>
              <Icon name="phone" size={14} color={FIORI.colors.textTertiary} />
              <Text
                style={[
                  styles.attributeText,
                  { color: FIORI.colors.textSecondary },
                  !customer.active && { color: FIORI.colors.textTertiary },
                ]}
              >
                +91 {customer.mobile}
              </Text>
            </View>
          )}
          {customer.city && (
            <View style={styles.attributeRow}>
              <Icon name="map-marker" size={14} color={FIORI.colors.textTertiary} />
              <Text
                style={[
                  styles.attributeText,
                  { color: FIORI.colors.textSecondary },
                  !customer.active && { color: FIORI.colors.textTertiary },
                ]}
              >
                {customer.city}
              </Text>
            </View>
          )}
          {customer.email && (
            <View style={styles.attributeRow}>
              <Icon name="email-outline" size={14} color={FIORI.colors.textTertiary} />
              <Text
                style={[
                  styles.attributeText,
                  { color: FIORI.colors.textSecondary },
                  !customer.active && { color: FIORI.colors.textTertiary },
                ]}
                numberOfLines={1}
              >
                {customer.email}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Fiori Object Cell: Trailing Actions */}
      <View style={styles.trailingActions}>
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: FIORI.colors.backgroundSecondary },
            pressed && { backgroundColor: FIORI.colors.divider },
          ]}
          onPress={onToggleActive}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={customer.active ? 'Deactivate customer' : 'Activate customer'}
        >
          <Icon
            name={customer.active ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={customer.active ? FIORI.colors.textTertiary : FIORI.colors.success}
          />
        </Pressable>
        <Icon name="chevron-right" size={20} color={FIORI.colors.textTertiary} />
      </View>
    </Pressable>
  );
}


// =============================================================================
// FIORI MAIN STYLES
// Based on SAP Fiori for iOS Design Guidelines
// Colors applied inline for dark mode support
// =============================================================================

const styles = StyleSheet.create({
  // Container (colors applied inline)
  container: {
    flex: 1,
  },
  listWithRail: {
    flex: 1,
    flexDirection: 'row',
  },
  flatList: {
    flex: 1,
  },
  listContent: {
    paddingTop: FIORI_STATIC.spacing.md,
    paddingRight: 44, // Make room for the rail
  },
  listContentEmpty: {
    flex: 1,
  },
  separator: {
    height: 0,
  },

  // Alphabetical Rail
  alphabetRail: {
    position: 'absolute',
    right: 2,
    top: 0,
    bottom: 0,
    width: 40,
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  letterItem: {
    width: 40,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  letterText: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  letterTextDisabled: {
    opacity: 0.3,
  },

  // Header styles
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIORI_STATIC.dimensions.touchTarget,
    paddingRight: FIORI_STATIC.spacing.sm,
    marginLeft: -FIORI_STATIC.spacing.sm,
  },
  backButtonText: {
    ...FIORI_STATIC.typography.body,
    marginLeft: -4,
  },
  titleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...FIORI_STATIC.typography.headline,
    letterSpacing: -0.41,
    textAlign: 'center',
  },
  headerSubtitle: {
    ...FIORI_STATIC.typography.caption,
    textAlign: 'center',
    marginTop: 2,
  },
  addButton: {
    minWidth: FIORI_STATIC.dimensions.touchTarget,
    minHeight: FIORI_STATIC.dimensions.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Fiori Object Cell Card (colors applied inline)
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: FIORI_STATIC.dimensions.cardRadius,
    padding: FIORI_STATIC.dimensions.cardPadding,
    marginHorizontal: FIORI_STATIC.spacing.lg,
    marginBottom: FIORI_STATIC.spacing.md,
    borderWidth: 1,
    minHeight: FIORI_STATIC.dimensions.touchTarget * 2,
    ...FIORI_STATIC.shadows.card,
  },

  // Avatar (colors applied inline)
  avatar: {
    width: FIORI_STATIC.dimensions.avatarSize,
    height: FIORI_STATIC.dimensions.avatarSize,
    borderRadius: FIORI_STATIC.dimensions.avatarSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: FIORI_STATIC.spacing.md,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
  },

  // Card Content
  cardContent: {
    flex: 1,
    marginRight: FIORI_STATIC.spacing.sm,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI_STATIC.spacing.sm,
    marginBottom: FIORI_STATIC.spacing.xs,
  },
  headline: {
    ...FIORI_STATIC.typography.headline,
    flex: 1,
  },

  // Status Badge (colors applied inline)
  statusBadge: {
    paddingHorizontal: FIORI_STATIC.spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // Attribute Stack
  attributeStack: {
    gap: FIORI_STATIC.spacing.xs,
  },
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI_STATIC.spacing.xs,
  },
  attributeText: {
    ...FIORI_STATIC.typography.caption,
    flex: 1,
  },

  // Trailing Actions (colors applied inline)
  trailingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI_STATIC.spacing.sm,
  },
  actionButton: {
    width: FIORI_STATIC.dimensions.touchTarget,
    height: FIORI_STATIC.dimensions.touchTarget,
    borderRadius: FIORI_STATIC.dimensions.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty State (colors applied inline)
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: FIORI_STATIC.spacing.xxl,
    paddingVertical: FIORI_STATIC.spacing.xxl * 2,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: FIORI_STATIC.spacing.lg,
  },
  emptyTitle: {
    ...FIORI_STATIC.typography.headline,
    fontSize: 20,
    marginBottom: FIORI_STATIC.spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    ...FIORI_STATIC.typography.body,
    textAlign: 'center',
    marginBottom: FIORI_STATIC.spacing.xl,
  },

  // Primary Button (colors applied inline)
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: FIORI_STATIC.dimensions.buttonHeight,
    borderRadius: FIORI_STATIC.dimensions.buttonRadius,
    paddingHorizontal: FIORI_STATIC.spacing.xl,
    gap: FIORI_STATIC.spacing.sm,
  },
  primaryButtonText: {
    ...FIORI_STATIC.typography.button,
  },
});
