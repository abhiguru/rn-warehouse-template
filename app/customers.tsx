/**
 * Customers screen: list report (style guide §14.1).
 *
 * Object cells with an avatar, contact details and an Inactive status tag,
 * an A–Z rail for quick navigation, pull to refresh, and loading, empty and
 * error states. Colours come from the semantic tokens.
 */

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { Swipeable } from 'react-native-gesture-handler';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
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
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
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

import { Avatar, StatusTag } from '@/components/ui';
import { showAlert } from '@/utils/alert';
import { formatCount, formatMobile } from '@/utils/formatters';
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
          showAlert(
            currentActive ? "Couldn't deactivate the customer" : "Couldn't activate the customer",
            result.message || 'Try again in a moment.',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('[Customers] Toggle active error:', error);
        showAlert("Couldn't update the customer", 'Check your connection and try again.', [{ text: 'OK' }]);
      }
    },
    []
  );

  // Deactivating hides the customer from new orders, so it asks first;
  // activating again is harmless and happens straight away.
  const handleToggleActive = useCallback(
    (customer: CustomerListItem) => {
      if (!customer.active) {
        handleInactivateCustomer(customer.id, false);
        return;
      }
      showAlert(`Deactivate ${customer.name}?`, undefined, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate customer',
          style: 'destructive',
          onPress: () => handleInactivateCustomer(customer.id, true),
        },
      ]);
    },
    [handleInactivateCustomer]
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
        onToggleActive={() => handleToggleActive(item)}
      />
    ),
    [handleEditCustomer, handleToggleActive]
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
            <HeaderBackButton />
          ),
          headerTitle: () => (
            <View style={styles.titleContainer} accessible accessibilityRole="header">
              <Text style={styles.headerTitle}>Customers</Text>
              {state.totalCount > 0 && (
                <Text style={styles.headerSubtitle}>
                  {formatCount(state.totalCount, 'customer')}
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
  const swipeableRef = useRef<Swipeable | null>(null);
  const mobile = customer.mobile ? formatMobile(customer.mobile) : null;
  const actionLabel = customer.active ? 'Deactivate' : 'Activate';
  const rowLabel = [
    customer.name,
    customer.active ? null : 'Inactive',
    mobile,
    customer.city,
    customer.email,
  ]
    .filter(Boolean)
    .join(', ');

  const handleAction = () => {
    swipeableRef.current?.close();
    onToggleActive();
  };

  const renderRightActions = () => (
    <View style={styles.swipeActionsContainer}>
      <Pressable
        style={({ pressed }) => [
          styles.swipeAction,
          customer.active ? styles.swipeDeactivate : styles.swipeActivate,
          pressed && (customer.active ? styles.swipeDeactivatePressed : styles.swipeActivatePressed),
        ]}
        onPress={handleAction}
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel} ${customer.name}`}
      >
        <Icon
          name={customer.active ? 'account-off-outline' : 'account-check-outline'}
          size={iconSize.lg}
          color={customer.active ? t.destructive.onFill : t.brand.onFill}
        />
        <Text
          style={[styles.swipeActionText, { color: customer.active ? t.destructive.onFill : t.brand.onFill }]}
          maxFontSizeMultiplier={1.4}
        >
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
    >
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={rowLabel}
        accessibilityHint={`Opens the customer for editing. Swipe left to ${actionLabel.toLowerCase()}.`}
        accessibilityActions={[{ name: 'toggleActive', label: actionLabel }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'toggleActive') onToggleActive();
        }}
      >
        {/* Fiori Object Cell: Leading Avatar */}
        <Avatar name={customer.name} id={customer.id} style={styles.avatar} />

        {/* Fiori Object Cell: Main Content */}
        <View style={styles.cardContent}>
          {/* Headline - Customer Name */}
          <Text style={[styles.headline, !customer.active && styles.textInactive]} numberOfLines={2}>
            {customer.name}
          </Text>
          {!customer.active && <StatusTag status="neutral" label="Inactive" />}

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

        {/* Fiori Object Cell: Chevron */}
        <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
      </Pressable>
    </Swipeable>
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
    marginRight: space.md,
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

  // Swipe action: labelled, same shape as the item list's swipe actions
  swipeActionsContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingLeft: space.sm,
    paddingRight: space.xs,
    marginBottom: space.sm,
  },
  swipeAction: {
    minWidth: 72,
    height: '100%' as const,
    minHeight: layout.objectCellMinHeight,
    paddingHorizontal: space.sm,
    borderRadius: radius.card,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.xs,
  },
  swipeDeactivate: {
    backgroundColor: t.destructive.fill,
  },
  swipeDeactivatePressed: {
    backgroundColor: t.destructive.fillPressed,
  },
  swipeActivate: {
    backgroundColor: t.brand.fill,
  },
  swipeActivatePressed: {
    backgroundColor: t.brand.fillPressed,
  },
  swipeActionText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
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
