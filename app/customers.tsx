/**
 * Customers screen: list report (style guide §14.1).
 *
 * Object cells with an avatar, contact details and an Inactive status tag,
 * an A–Z rail for quick navigation, pull to refresh, and loading, empty and
 * error states. Colours come from the semantic tokens.
 */

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Alert,
  Vibration,
} from 'react-native';
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
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
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
            currentActive ? "Couldn't deactivate the customer" : "Couldn't activate the customer",
            result.message || 'Try again in a moment.',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('[Customers] Toggle active error:', error);
        Alert.alert("Couldn't update the customer", 'Check your connection and try again.', [{ text: 'OK' }]);
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
      />
    ),
    [handleEditCustomer, handleInactivateCustomer]
  );

  const keyExtractor = useCallback((item: CustomerListItem) => item.id, []);

  const renderEmpty = useCallback(() => {
    if (state.loading) {
      return (
        <View style={styles.emptyContainer} accessibilityRole="progressbar" accessibilityLabel="Loading customers">
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.emptyText}>Loading customers…</Text>
        </View>
      );
    }

    // A failed load is not an empty warehouse: never offer "Create one" for it.
    if (state.error) {
      return (
        <View style={styles.emptyContainer} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.emptyTitle} accessibilityRole="header">
            Couldn't load customers
          </Text>
          <Text style={styles.emptyText}>Check your connection and try again.</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => fetchCustomers(state.filters)}
            accessibilityRole="button"
          >
            <Icon name="refresh" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Icon name="account-group-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle} accessibilityRole="header">
          No customers yet
        </Text>
        <Text style={styles.emptyText}>Customers you add appear here.</Text>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={handleAddCustomer}
          accessibilityRole="button"
        >
          <Icon name="plus" size={iconSize.md} color={t.brand.onFill} />
          <Text style={styles.primaryButtonText}>Add customer</Text>
        </Pressable>
      </View>
    );
  }, [state.loading, state.error, state.filters, fetchCustomers, handleAddCustomer, styles, t]);

  return (
    <>
      {/* Fiori Navigation Bar */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: {
            backgroundColor: t.surface.header,
          },
          headerShadowVisible: false,
          headerTintColor: t.brand.tint,
          headerTitleAlign: 'center',
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              hitSlop={space.sm}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Icon name="chevron-left" size={iconSize.xl} color={t.brand.tint} />
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          ),
          headerTitle: () => (
            <View style={styles.titleContainer} accessible accessibilityRole="header">
              <Text style={styles.headerTitle}>Customers</Text>
              {state.totalCount > 0 && (
                <Text style={styles.headerSubtitle}>
                  {formatCount(state.totalCount)} total
                </Text>
              )}
            </View>
          ),
          headerRight: () => (
            <Pressable
              onPress={handleAddCustomer}
              style={styles.addButton}
              hitSlop={space.sm}
              accessibilityRole="button"
              accessibilityLabel="Add customer"
            >
              <Icon name="plus" size={iconSize.lg} color={t.brand.tint} />
            </Pressable>
          ),
        }}
      />

      <View style={styles.container}>
        <View style={styles.listWithRail}>
          <FlatList
            ref={flatListRef}
            data={state.data}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: space.xl + insets.bottom },
              state.data.length === 0 && styles.listContentEmpty,
            ]}
            refreshControl={
              <RefreshControl
                refreshing={state.refreshing}
                onRefresh={handleRefresh}
                colors={[t.brand.tint]}
                tintColor={t.brand.tint}
                progressBackgroundColor={t.surface.card}
              />
            }
            ListEmptyComponent={renderEmpty}
            showsVerticalScrollIndicator={false}
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
            />
          )}
        </View>
      </View>
    </>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

const countFormat = new Intl.NumberFormat('en-IN');
const formatCount = (n: number) => countFormat.format(n);

/** "+91 98765 43210" for a stored 10-digit (or 91-prefixed) number. */
function formatMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (digits.length !== 10) return `+91 ${digits}`;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

/** Stable avatar colour index for an id (style guide §3.2). */
function avatarIndex(id: string, count: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % count;
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
}

function AlphabeticalRail({
  letters,
  availableLetters,
  activeLetter,
  onLetterPress,
}: AlphabeticalRailProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.alphabetRail}>
      {letters.map((letter) => {
        const hasLoadedCustomers = availableLetters.has(letter);
        const isActive = activeLetter === letter;

        return (
          <Pressable
            key={letter}
            onPress={() => onLetterPress(letter)}
            style={[styles.letterItem, isActive && styles.letterItemActive]}
            accessibilityRole="button"
            accessibilityLabel={`Jump to ${letter}`}
            accessibilityState={{ disabled: !hasLoadedCustomers, selected: isActive }}
          >
            <Text
              style={[
                styles.letterText,
                !hasLoadedCustomers && styles.letterTextDisabled,
                isActive && styles.letterTextActive,
              ]}
              maxFontSizeMultiplier={1.2}
            >
              {letter}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// =============================================================================
// FIORI CUSTOMER CARD COMPONENT (Object Cell Layout)
// =============================================================================

interface FioriCustomerCardProps {
  customer: CustomerListItem;
  onPress: () => void;
  onToggleActive: () => void;
}

function FioriCustomerCard({ customer, onPress, onToggleActive }: FioriCustomerCardProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const avatarColor = t.avatar[avatarIndex(customer.id, t.avatar.length)];
  const mobile = customer.mobile ? formatMobile(customer.mobile) : null;
  const rowLabel = [
    customer.name,
    customer.active ? null : 'Inactive',
    mobile,
    customer.city,
    customer.email,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rowLabel}
      accessibilityHint="Opens the customer for editing"
    >
      {/* Fiori Object Cell: Leading Avatar */}
      <View
        style={[styles.avatar, { backgroundColor: avatarColor }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={styles.avatarText}>{(customer.name || 'C').charAt(0).toUpperCase()}</Text>
      </View>

      {/* Fiori Object Cell: Main Content */}
      <View style={styles.cardContent}>
        {/* Headline - Customer Name */}
        <Text style={[styles.headline, !customer.active && styles.textInactive]} numberOfLines={2}>
          {customer.name}
        </Text>
        {!customer.active && (
          <View style={styles.statusBadge}>
            <Icon name="circle-outline" size={iconSize.sm - 4} color={t.status.neutral.text} />
            <Text style={styles.statusBadgeText} maxFontSizeMultiplier={1.6}>
              Inactive
            </Text>
          </View>
        )}

        {/* Subheadline - Contact Details */}
        <View style={styles.attributeStack}>
          {mobile && (
            <View style={styles.attributeRow}>
              <Icon name="phone-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.attributeText}>{mobile}</Text>
            </View>
          )}
          {customer.city && (
            <View style={styles.attributeRow}>
              <Icon name="map-marker-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.attributeText}>{customer.city}</Text>
            </View>
          )}
          {customer.email && (
            <View style={styles.attributeRow}>
              <Icon name="email-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.attributeText} numberOfLines={1}>
                {customer.email}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Fiori Object Cell: Trailing Actions */}
      <View style={styles.trailingActions}>
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
          onPress={onToggleActive}
          accessibilityRole="button"
          accessibilityLabel={
            customer.active ? `Deactivate ${customer.name}` : `Activate ${customer.name}`
          }
        >
          <Icon
            name={customer.active ? 'eye-off-outline' : 'eye-outline'}
            size={iconSize.md}
            color={customer.active ? t.icon.primary : t.status.positive.text}
          />
        </Pressable>
        <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
      </View>
    </Pressable>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  listWithRail: {
    flex: 1,
    flexDirection: 'row' as const,
  },
  flatList: {
    flex: 1,
  },
  listContent: {
    paddingTop: space.md,
    paddingRight: 44, // Make room for the rail
  },
  listContentEmpty: {
    flex: 1,
  },

  // Alphabetical Rail
  alphabetRail: {
    position: 'absolute' as const,
    right: space.xxs,
    top: 0,
    bottom: 0,
    width: 40,
    justifyContent: 'space-evenly' as const,
    alignItems: 'center' as const,
  },
  letterItem: {
    width: 40,
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  letterItemActive: {
    backgroundColor: t.brand.fill,
    borderRadius: radius.button,
  },
  letterText: {
    ...typography.footnote,
    fontWeight: fontWeight.bold,
    textAlign: 'center' as const,
    color: t.brand.tint,
  },
  letterTextDisabled: {
    color: t.text.disabled,
  },
  letterTextActive: {
    color: t.brand.onFill,
  },

  // Header styles
  backButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    paddingRight: space.sm,
    marginLeft: -space.sm,
  },
  backButtonText: {
    ...typography.body,
    color: t.brand.tint,
    marginLeft: -space.xs,
  },
  titleContainer: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerTitle: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  headerSubtitle: {
    ...typography.caption1,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  addButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // Object cell
  card: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: radius.card,
    padding: space.lg,
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    minHeight: layout.objectCellMinHeight,
    backgroundColor: t.surface.card,
    ...t.shadow[2],
  },
  cardPressed: {
    backgroundColor: t.surface.cardPressed,
  },

  // Avatar
  avatar: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: space.md,
  },
  avatarText: {
    ...typography.headline,
    color: t.mode === 'light' ? t.text.primary : t.overlay.onImage,
  },

  // Card Content
  cardContent: {
    flex: 1,
    marginRight: space.sm,
    gap: space.xs,
  },
  headline: {
    ...typography.headline,
    color: t.text.primary,
  },
  textInactive: {
    color: t.text.secondary,
  },

  // Status tag
  statusBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: space.xs,
    paddingHorizontal: space.s6,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
    backgroundColor: t.status.neutral.background,
  },
  statusBadgeText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.status.neutral.text,
  },

  // Attribute Stack
  attributeStack: {
    gap: space.xs,
  },
  attributeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  attributeText: {
    ...typography.subhead,
    color: t.text.secondary,
    flex: 1,
  },

  // Trailing Actions
  trailingActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  actionButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  actionButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },

  // Empty / error / loading states
  emptyContainer: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.xxl,
    paddingVertical: space.giant,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginTop: space.sm,
  },
  emptyText: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.md,
  },

  // Buttons
  primaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: touchTarget,
    borderRadius: radius.button,
    paddingHorizontal: space.xl,
    gap: space.sm,
    backgroundColor: t.brand.fill,
  },
  primaryButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  primaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  secondaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: touchTarget,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  secondaryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  secondaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
});
