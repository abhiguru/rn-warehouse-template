/**
 * Customers screen: list report (style guide §14.1).
 *
 * Object cells with an avatar, contact details and an Inactive status tag,
 * an A–Z rail for quick navigation, pull to refresh, and loading, empty and
 * error states. Colours come from the semantic tokens.
 *
 * The count line reads "120 customers · 4 deactivated" (two head counts), and the
 * "Deactivated" chip shows only the deactivated ones. The search is empty each time
 * the screen is opened (it is this screen's own state); Back from a customer keeps it.
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
  type LayoutChangeEvent,
} from 'react-native';
import { useIsFocused } from 'expo-router';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { customerService } from '@/services/customer-service';
import {
  CustomerListItem,
  CustomerFilters,
  DEFAULT_CUSTOMER_FILTERS,
} from '@/types/customer.types';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { ChoiceChips } from '@/features/filters/components/ChoiceChips';
import { MasterListHeader } from '@/components/common/MasterListHeader';
import { useHaptics } from '@/hooks/useHaptics';
import { railKey, railLetters, sortForRail } from '@/features/customer/railKey';
import { AlphabeticalRail } from '@/features/customer/AlphabeticalRail';
import { matchesSearch, searchTerms } from '@/features/filters/searchMatch';
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
import { formatCount, formatMobile, formatTime, nationalMobileDigits } from '@/utils/formatters';
import { normalizeDigits, t as tr } from '@/i18n';
import { serverText, transportText } from '@/utils/serverText';
import { showToast } from '@/utils/toast';
import { createLogger, loggableError } from '@/utils/logger';

const log = createLogger('Customers');

/** The list loads this many customers at once (so every row can be reached from the A–Z rail). */
const LIST_LIMIT = 10000;
const SKELETON_ROWS = [0, 1, 2, 3];
// =============================================================================
// TYPES
// =============================================================================

interface ListState {
  data: CustomerListItem[];
  loading: boolean;
  refreshing: boolean;
  filters: CustomerFilters;
  /** The first load failed and there are no rows to show instead. */
  error: boolean;
  /** A refresh failed while rows were on the screen: they are older than they look. */
  refreshFailed: boolean;
  /** When the rows on the screen were loaded. */
  loadedAt: Date | null;
  /** Active and deactivated customers on the server (head counts); null until they were read. */
  counts: { active: number; inactive: number } | null;
  /** How many customers the server has in all; more than `data.length` when the list was capped. */
  total: number;
}

/** A row's active flag as the last toggle left it, and when. A list answer older than that must not undo it. */
interface Toggled {
  active: boolean;
  at: number;
}

// =============================================================================
// SCREEN COMPONENT
// =============================================================================

/**
 * A load that failed. With rows on the screen they stay, and the list says they
 * are older (refreshFailed); with none, the error takes the place of the list.
 */
function failed(prev: ListState): ListState {
  return prev.data.length > 0
    ? { ...prev, loading: false, refreshFailed: true }
    : { ...prev, loading: false, error: true };
}

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
    error: false,
    refreshFailed: false,
    loadedAt: null,
    counts: null,
    total: 0,
  });
  const [search, setSearch] = useState('');
  const [showOnlyDeactivated, setShowOnlyDeactivated] = useState(false);
  // Rows whose Deactivate / Activate is running: a second tap on one of them is ignored.
  const togglingRef = useRef(new Set<string>());
  const [togglingIds, setTogglingIds] = useState<string[]>([]);
  const toggled = useRef(new Map<string, Toggled>());

  // ===========================================================================
  // FETCH LOGIC
  // ===========================================================================

  // Load ALL customers at once for smooth alphabetical rail navigation
  const fetchCustomers = useCallback(
    async (filters: CustomerFilters) => {
      setState((prev) => ({ ...prev, loading: true, error: false }));
      const startedAt = Date.now();

      try {
        // Load all customers (the limit covers any realistic customer count; past it the list says so).
        const [response, counts] = await Promise.all([
          customerService.getCustomerList(filters, LIST_LIMIT, 0),
          customerService.getCustomerCounts(),
        ]);

        if (response.success) {
          // An answer that was asked for before a Deactivate / Activate finished must not flip that row back.
          let inactiveShift = 0;
          const rows = response.data.map((customer) => {
            const change = toggled.current.get(customer.id);
            if (!change || change.at < startedAt || change.active === customer.active) return customer;
            inactiveShift += change.active ? -1 : 1;
            return { ...customer, active: change.active };
          });
          setState((prev) => ({
            ...prev,
            // Sorted by rail group so every row can be reached from the A–Z rail.
            data: sortForRail(rows),
            loading: false,
            error: false,
            refreshFailed: false,
            loadedAt: new Date(),
            counts: counts
              ? { active: counts.active - inactiveShift, inactive: counts.inactive + inactiveShift }
              : null,
            total: response.pagination?.total_count ?? rows.length,
          }));
        } else {
          setState((prev) => failed(prev));
        }
      } catch (error) {
        log.error('Customer list load failed', loggableError(error));
        setState((prev) => failed(prev));
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

  const handleOpenCustomer = useCallback((customerId: string) => {
    router.push({
      pathname: '/customer/[id]',
      params: { id: customerId },
    });
  }, []);

  const handleInactivateCustomer = useCallback(
    async (customer: CustomerListItem, currentActive: boolean) => {
      const customerId = customer.id;
      // One change per row at a time: a second tap while the first is running does nothing.
      if (togglingRef.current.has(customerId)) return;
      togglingRef.current.add(customerId);
      setTogglingIds([...togglingRef.current]);
      try {
        const result = currentActive
          ? await customerService.inactivateCustomer(customerId)
          : await customerService.restoreCustomer(customerId);

        if (result.success) {
          toggled.current.set(customerId, { active: !currentActive, at: Date.now() });
          // Update local state to reflect the change
          setState((prev) => ({
            ...prev,
            data: prev.data.map((row) =>
              row.id === customerId
                ? { ...row, active: !currentActive }
                : row
            ),
          }));
          // The head counts are read again, never shifted by hand (a refresh in between would count the row twice).
          void customerService.getCustomerCounts().then((counts) => {
            if (counts) setState((prev) => ({ ...prev, counts }));
          });
          showToast(tr(currentActive ? 'customers.list.deactivatedToast' : 'customers.list.activatedToast', { name: customer.name }));
        } else if (!currentActive && result.code === 'DUPLICATE_MOBILE' && result.details?.name) {
          // Another active customer uses the number: the row stays deactivated.
          const other = result.details;
          showAlert(
            tr('customers.list.couldNotActivateNamed', { name: customer.name }),
            tr('customers.list.mobileInUse', { other: other.name }),
            [
              { text: tr('common.ok') },
              ...(other.customer_id
                ? [{ text: tr('customers.list.openOther', { other: other.name }), onPress: () => handleOpenCustomer(other.customer_id as string) }]
                : []),
            ]
          );
        } else {
          // Show error to user
          showAlert(
            currentActive ? tr('customers.list.couldNotDeactivateTitle') : tr('customers.list.couldNotActivateTitle'),
            serverText(result, tr('customers.list.tryAgainInAMoment'), { write: true, code: result.code }),
            [{ text: tr('common.ok') }]
          );
        }
      } catch (error) {
        log.error('Toggle active failed', loggableError(error));
        showAlert(
          tr('customers.list.couldNotUpdateTitle'),
          transportText(error, { write: true }) ?? tr('common.checkConnection'),
          [{ text: tr('common.ok') }]
        );
      } finally {
        togglingRef.current.delete(customerId);
        setTogglingIds([...togglingRef.current]);
      }
    },
    [handleOpenCustomer]
  );

  // Deactivating hides the customer from new orders, so it asks first;
  // activating again is harmless and happens straight away.
  const handleToggleActive = useCallback(
    (customer: CustomerListItem) => {
      if (togglingRef.current.has(customer.id)) return;
      if (!customer.active) {
        handleInactivateCustomer(customer, false);
        return;
      }
      showAlert(tr('customers.list.deactivateConfirmTitle', { name: customer.name }), tr('customers.list.deactivateConfirmMessage'), [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('customers.list.deactivateCustomer'),
          style: 'destructive',
          onPress: () => handleInactivateCustomer(customer, true),
        },
      ]);
    },
    [handleInactivateCustomer]
  );

  // The Deactivated filter. When the list was capped (more customers than rows loaded) the deactivated ones may
  // not all be loaded, so the server is asked for only those; otherwise the loaded rows are filtered.
  const serverFiltered = useRef(false);
  const applyDeactivatedFilter = useCallback(
    (on: boolean) => {
      setShowOnlyDeactivated(on);
      const capped = state.total > state.data.length;
      if (on ? capped : serverFiltered.current) {
        serverFiltered.current = on;
        const filters = { ...DEFAULT_CUSTOMER_FILTERS, active: on ? false : DEFAULT_CUSTOMER_FILTERS.active };
        setState((prev) => ({ ...prev, filters }));
        void fetchCustomers(filters);
      }
    },
    [state.total, state.data.length, fetchCustomers]
  );

  const handleAddCustomer = useCallback(() => {
    router.push('/customer-form');
  }, []);

  // ===========================================================================
  // ALPHABETICAL RAIL LOGIC
  // ===========================================================================

  // The rows shown: every typed word must be in the name, the mobile digits or the city (§14.6).
  // Gujarati digits typed in the search are read as 0-9, the way the stored numbers are written.
  const terms = useMemo(() => searchTerms(normalizeDigits(search)), [search]);
  const pool = useMemo(
    () => (showOnlyDeactivated ? state.data.filter((customer) => !customer.active) : state.data),
    [state.data, showOnlyDeactivated]
  );
  const visible = useMemo(
    () =>
      terms.length === 0
        ? pool
        : pool.filter((customer) =>
            matchesSearch(terms, [customer.name, nationalMobileDigits(customer.mobile), customer.mobile, customer.city])
          ),
    [pool, terms]
  );
  const searching = search.trim().length > 0;

  // "120 customers · 4 deactivated": the head counts, or the rows when the counts could not be read.
  const deactivatedTotal = state.counts ? state.counts.inactive : state.data.filter((customer) => !customer.active).length;
  const customerTotal = state.counts ? state.counts.active + state.counts.inactive : state.data.length;
  let countText: string | undefined;
  if (state.data.length > 0) {
    countText =
      searching || showOnlyDeactivated || deactivatedTotal === 0
        ? formatCount(visible.length, 'customer')
        : `${formatCount(customerTotal, 'customer')} · ${tr('customers.list.deactivatedCount', { count: deactivatedTotal })}`;
  }
  // The pills are offered while there is a deactivated customer to show, and while the filter is on.
  const showFilter = deactivatedTotal > 0 || showOnlyDeactivated;

  // Build a map of rail keys to their first customer index (the same key sorts the list)
  const letterIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    visible.forEach((customer, index) => {
      const letter = railKey(customer.name);
      if (!(letter in map)) {
        map[letter] = index;
      }
    });
    return map;
  }, [visible]);

  // Set of available letters (that have customers)
  const availableLetters = useMemo(() => new Set(Object.keys(letterIndexMap)), [letterIndexMap]);

  // Track active letter timeout to clear properly
  const activeLetterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll to a specific letter
  const scrollToLetter = useCallback((letter: string) => {
    const index = letterIndexMap[letter];
    if (index === undefined || !flatListRef.current) return;

    // Clear any pending timeout
    if (activeLetterTimeoutRef.current) {
      clearTimeout(activeLetterTimeoutRef.current);
    }

    setActiveLetter(letter);

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
        busy={togglingIds.includes(item.id)}
        onPress={() => handleOpenCustomer(item.id)}
        onToggleActive={() => handleToggleActive(item)}
      />
    ),
    [handleOpenCustomer, handleToggleActive, togglingIds]
  );

  const keyExtractor = useCallback((item: CustomerListItem) => item.id, []);

  const renderEmpty = useCallback(() => {
    if (state.loading) {
      return (
        <View accessibilityRole="progressbar" accessibilityLabel={tr('customers.list.loadingLabel')} style={styles.skeletonList}>
          {SKELETON_ROWS.map((row) => (
            <ListSkeletonCard key={row} metricsCount={2} showFooter={false} />
          ))}
        </View>
      );
    }

    // A failed load is not an empty warehouse: never offer "Create one" for it.
    if (state.error) {
      return (
        <View style={styles.emptyContainer} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.emptyTitle} accessibilityRole="header">
            {tr('customers.list.loadErrorTitle')}
          </Text>
          <Text style={styles.emptyText}>{tr('common.checkConnection')}</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => fetchCustomers(state.filters)}
            accessibilityRole="button"
          >
            <Icon name="refresh" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.secondaryButtonText}>{tr('common.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    // No deactivated customer is not an empty warehouse either (the search, if any, is handled below).
    if (showOnlyDeactivated && !searching) {
      return (
        <View style={styles.emptyContainer}>
          <Icon name="account-check-outline" size={iconSize.hero} color={t.icon.secondary} />
          <Text style={styles.emptyTitle} accessibilityRole="header">
            {tr('customers.list.noDeactivatedTitle')}
          </Text>
          <Text style={styles.emptyText}>{tr('customers.list.noDeactivatedMessage')}</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => applyDeactivatedFilter(false)}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>{tr('customers.list.showAll')}</Text>
          </Pressable>
        </View>
      );
    }

    // A search that finds nothing is not an empty warehouse either.
    if (state.data.length > 0) {
      return (
        <View style={styles.emptyContainer}>
          <Icon name="magnify" size={iconSize.hero} color={t.icon.secondary} />
          <Text style={styles.emptyText}>{tr('customers.search.noMatchTryFewer', { search: search.trim() })}</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => {
              setSearch('');
              if (showOnlyDeactivated) applyDeactivatedFilter(false);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>
              {tr(showOnlyDeactivated ? 'filters.empty.clearSearchAndFilters' : 'common.clearSearch')}
            </Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Icon name="account-group-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle} accessibilityRole="header">
          {tr('customers.list.emptyTitle')}
        </Text>
        <Text style={styles.emptyText}>{tr('customers.list.emptyMessage')}</Text>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={handleAddCustomer}
          accessibilityRole="button"
        >
          <Icon name="plus" size={iconSize.md} color={t.brand.onFill} />
          <Text style={styles.primaryButtonText}>{tr('customers.list.addCustomer')}</Text>
        </Pressable>
      </View>
    );
  }, [state.loading, state.error, state.data.length, state.filters, search, searching, showOnlyDeactivated, applyDeactivatedFilter, fetchCustomers, handleAddCustomer, styles, t]);

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
            <Text style={styles.headerTitle} accessibilityRole="header">
              {tr('common.customers')}
            </Text>
          ),
          headerRight: () => (
            <Pressable
              onPress={handleAddCustomer}
              style={styles.addButton}
              hitSlop={space.sm}
              accessibilityRole="button"
              accessibilityLabel={tr('customers.list.addCustomer')}
            >
              <Icon name="plus" size={iconSize.lg} color={t.brand.tint} />
            </Pressable>
          ),
        }}
      />

      <View style={styles.container}>
        <MasterListHeader
          listKey="customers"
          search={search}
          onSearch={setSearch}
          placeholder={tr('customers.search.placeholder')}
          countText={countText}
          refreshError={
            state.refreshFailed
              ? { message: tr('customers.list.refreshFailed', { time: formatTime(state.loadedAt) }), onRetry: handleRefresh }
              : undefined
          }
        />
        {showFilter ? (
          <View style={styles.filterRow}>
            <ChoiceChips
              accessibilityLabel={tr('customers.list.filterLabel')}
              options={[
                { value: 'all', label: tr('customers.list.filterAll') },
                { value: 'deactivated', label: tr('customers.list.filterDeactivated') },
              ]}
              value={showOnlyDeactivated ? 'deactivated' : 'all'}
              onChange={(value) => applyDeactivatedFilter(value === 'deactivated')}
            />
          </View>
        ) : null}
        <View style={styles.listWithRail}>
          <FlatList
            ref={flatListRef}
            data={visible}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: space.xl + insets.bottom },
              visible.length === 0 && styles.listContentEmpty,
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
            extraData={togglingIds}
            ListEmptyComponent={renderEmpty}
            ListFooterComponent={
              !state.loading && state.total > state.data.length && state.data.length > 0 ? (
                <Text style={styles.cappedFooter}>
                  {tr('customers.list.cappedFooter', { shown: state.data.length, total: state.total })}
                </Text>
              ) : null
            }
            showsVerticalScrollIndicator={false}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            style={styles.flatList}
          />

          {/* Alphabetical Rail: hidden while a search is typed */}
          {visible.length > 0 && !searching && (
            <AlphabeticalRail
              letters={railLetters(availableLetters)}
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
// FIORI CUSTOMER CARD COMPONENT (Object Cell Layout)
// =============================================================================

interface FioriCustomerCardProps {
  customer: CustomerListItem;
  /** Its Deactivate / Activate is running. */
  busy: boolean;
  onPress: () => void;
  onToggleActive: () => void;
}

function FioriCustomerCard({ customer, busy, onPress, onToggleActive }: FioriCustomerCardProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const swipeableRef = useRef<Swipeable | null>(null);
  const mobile = customer.mobile ? formatMobile(customer.mobile) : null;
  const actionLabel = customer.active ? tr('customers.list.deactivate') : tr('customers.list.activate');
  const rowLabel = [
    customer.name,
    customer.active ? null : tr('customers.list.statusDeactivated'),
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
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        accessibilityLabel={tr(customer.active ? 'customers.list.deactivateName' : 'customers.list.activateName', { name: customer.name })}
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
        accessibilityHint={tr('customers.list.rowHint')}
        accessibilityState={{ busy }}
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
          {!customer.active && <StatusTag status="neutral" label={tr('customers.list.statusDeactivated')} />}

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

        {/* Fiori Object Cell: Chevron, or a spinner while Deactivate / Activate runs on this row */}
        {busy ? (
          <ActivityIndicator size="small" color={t.brand.tint} accessibilityLabel={tr('customers.list.updating', { name: customer.name })} />
        ) : (
          <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
        )}
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
  skeletonList: {
    gap: space.md,
    paddingRight: 0,
  },
  // MasterListHeader above draws the hairline; the chips bring their own touch targets.
  filterRow: {
    paddingHorizontal: layout.marginCompact,
    backgroundColor: t.surface.header,
  },
  cappedFooter: {
    ...typography.footnote,
    color: t.text.secondary,
    textAlign: 'center' as const,
    padding: space.md,
  },
  listContent: {
    paddingTop: space.md,
    paddingRight: 44, // Make room for the rail
  },
  listContentEmpty: {
    flex: 1,
  },

  // Alphabetical Rail
  // Header styles
  headerTitle: {
    ...typography.headline,
    color: t.text.primary,
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
