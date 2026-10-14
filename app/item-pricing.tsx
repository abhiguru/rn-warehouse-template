/**
 * Item pricing: the list (screen A of the item rate card).
 *
 * One row per active item with the rent in force on the chosen goods-received day. A row opens
 * the item page, where rates are read and changed. Search, the Customer / Type / Needs a rate
 * chips and the day are applied on the phone over the rates already loaded. There is no swipe,
 * no Add button and no Settings cog.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { MasterListHeader } from '@/components/common/MasterListHeader';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { Button } from '@/components/ui/Button';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { canOpenScreen } from '@/config/roles';
import { FilterBar } from '@/features/filters/components/FilterBar';
import { searchWords } from '@/features/filters/components/HighlightedText';
import { matchesSearch, searchTerms } from '@/features/filters/searchMatch';
import { useListFilters } from '@/features/filters/useListFilters';
import { itemRatesPath, historyPath } from '@/features/item-pricing/contract';
import { ITEM_RATES_CONFIG, ITEM_RATES_FILTERS } from '@/features/item-pricing/itemRatesFilters';
import { groupByItem, itemSummary, rateState, type ItemSummary } from '@/features/item-pricing/rateModel';
import { dateText, todayDay } from '@/features/item-pricing/rateText';
import { RatesOnBar } from '@/features/item-pricing/components/RatesOnBar';
import { ItemRateRow } from '@/features/item-pricing/components/ItemRateRow';
import { RatesState } from '@/features/item-pricing/components/RatesState';
import { useItemRates } from '@/features/item-pricing/useItemRates';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { formatCount, formatTime } from '@/utils/formatters';
import { t } from '@/i18n';
import { useAppSelector } from '@/store/hooks';
import { iconSize, layout, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

interface ListRow {
  summary: ItemSummary;
  matchedCustomer: { name: string; amount: number } | null;
}

const makeStyles = (th: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: th.background.base },
  header: {
    paddingBottom: space.sm,
    paddingHorizontal: space.sm,
    backgroundColor: th.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: th.border.divider,
  },
  headerContent: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, flex: 1, gap: space.xs },
  title: { ...typography.title2, color: th.text.primary, flexShrink: 1 },
  iconButton: { width: touchTarget, height: touchTarget, alignItems: 'center' as const, justifyContent: 'center' as const },
  note: { ...typography.footnote, color: th.text.secondary, paddingHorizontal: layout.marginCompact, paddingVertical: space.xs },
  strip: { paddingHorizontal: layout.marginCompact, paddingVertical: space.sm },
});

export default function ItemPricingScreen() {
  const th = useTokens();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const offline = useIsOffline();
  const canSeeChanges = canOpenScreen(role, 'itemPriceHistory');
  const canOpenItems = canOpenScreen(role, 'masterData');

  const filters = useListFilters(ITEM_RATES_FILTERS);
  const request = filters.request;
  const { items, rates, status, refreshError, lastUpdated, refresh } = useItemRates();

  const today = todayDay();
  const [day, setDay] = useState(today);
  const [pulling, setPulling] = useState(false);

  const groups = useMemo(() => groupByItem(rates, items), [rates, items]);
  // One summary per item for the day and the chips; the count of items that need a rate comes from the same ones.
  const summaries = useMemo(
    () => groups.map(group => itemSummary(group, day, { customerIds: request.customerIds, priceType: request.priceType })),
    [groups, day, request.customerIds, request.priceType],
  );
  const needRateCount = useMemo(() => summaries.filter(s => s.noRateToday).length, [summaries]);

  const terms = useMemo(() => searchTerms(filters.search), [filters.search]);
  const words = useMemo(() => searchWords(filters.search), [filters.search]);

  const rows = useMemo<ListRow[]>(() => {
    const result: ListRow[] = [];
    for (const [index, group] of groups.entries()) {
      const summary = summaries[index];
      if (request.needsRate && !summary.noRateToday) continue;
      if (request.customerIds.length > 0 && !group.rows.some(r => r.customer_id && request.customerIds.includes(r.customer_id) && rateState(r, day) !== 'ended')) continue;
      if (request.priceType !== 'all' && summary.bands.length === 0 && !(request.needsRate && summary.noRateToday)) continue;

      // Search: the item name, and the names of customers who have their own rate on this item.
      let matchedCustomer: ListRow['matchedCustomer'] = null;
      if (terms.length > 0) {
        const ownCustomers = [...new Set(group.rows.filter(r => r.customer_id && rateState(r, day) !== 'ended').map(r => r.customer_name ?? ''))];
        if (!matchesSearch(terms, [group.item.name])) {
          if (!matchesSearch(terms, [group.item.name, ...ownCustomers])) continue;
          const name = ownCustomers.find(n => terms.some(term => n.toLowerCase().includes(term)));
          const row = group.rows.find(r => r.customer_name === name && rateState(r, day) === 'inForce');
          if (name && row) matchedCustomer = { name, amount: row.unit_price };
        }
      }
      result.push({ summary, matchedCustomer });
    }
    if (terms.length > 0) {
      const starts = (r: ListRow) => (r.summary.name.toLowerCase().startsWith(terms[0]) ? 0 : 1);
      return result.map((r, i) => ({ r, i })).sort((a, b) => starts(a.r) - starts(b.r) || a.i - b.i).map(x => x.r);
    }
    return result;
  }, [groups, summaries, day, request, terms]);

  const openItem = useCallback(
    (itemId: string) => router.push(itemRatesPath(itemId, day !== today ? day : undefined)),
    [day, today],
  );
  const onPullRefresh = useCallback(async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  }, [refresh]);

  // Coming back to the list (from an item page, or from Items after adding items) shows what is on the server now.
  const seenOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!seenOnce.current) {
        seenOnce.current = true;
        return;
      }
      void refresh();
    }, [refresh]),
  );

  const renderRow = useCallback(
    ({ item }: { item: ListRow }) => (
      <ItemRateRow summary={item.summary} onPress={openItem} words={words} matchedCustomer={item.matchedCustomer} />
    ),
    [openItem, words],
  );

  const body = (() => {
    if (status === 'loading') {
      return (
        <View accessibilityLabel={t('pricing.list.loadingLabel')} testID="rates-skeleton">
          {SKELETON_ROWS.map(i => <ListSkeletonCard key={i} metricsCount={2} showFooter={false} />)}
        </View>
      );
    }
    if (status === 'error') {
      return (
        <RatesState
          icon="alert-circle-outline"
          title={t('pricing.list.loadErrorTitle')}
          text={t('pricing.list.loadErrorText')}
          actionLabel={t('pricing.list.tryAgain')}
          onAction={() => { void refresh(); }}
          testID="rates-load-error"
        />
      );
    }
    if (items.length === 0) {
      return (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={pulling} onRefresh={onPullRefresh} colors={[th.brand.tint]} tintColor={th.brand.tint} progressBackgroundColor={th.surface.card} />
          }
        >
          <RatesState
            icon="package-variant-closed"
            title={t('pricing.list.emptyTitle')}
            text={t('pricing.list.emptyText')}
            actionLabel={canOpenItems ? t('pricing.list.emptyAction') : undefined}
            onAction={canOpenItems ? () => router.push('/items') : undefined}
            testID="rates-empty"
          />
        </ScrollView>
      );
    }
    return null;
  })();

  const showList = status === 'ready' && items.length > 0;
  const noMatch = showList && rows.length === 0;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.headerContent}>
          <View style={styles.titleRow}>
            <HeaderBackButton />
            <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>{t('pricing.list.title')}</Text>
          </View>
          {canSeeChanges ? (
            <Pressable
              style={styles.iconButton}
              onPress={() => router.push(historyPath())}
              accessibilityRole="button"
              accessibilityLabel={t('pricing.list.allChanges')}
              testID="item-pricing-history"
            >
              <Icon name="history" size={iconSize.lg} color={th.brand.tint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <MasterListHeader
        listKey="item-pricing"
        search={filters.search}
        onSearch={filters.setSearch}
        placeholder={t('pricing.list.search')}
        countText={showList ? formatCount(rows.length, 'item') : undefined}
        refreshError={
          refreshError && status === 'ready'
            ? { message: t('pricing.list.refreshFailed', { time: lastUpdated ? formatTime(new Date(lastUpdated)) : '' }), onRetry: () => { void refresh(); } }
            : undefined
        }
      />
      <FilterBar config={ITEM_RATES_CONFIG} filters={filters} />
      <RatesOnBar
        text={t(request.priceType === 'one_time' ? 'pricing.list.statusOneTime' : request.priceType === 'monthly' ? 'pricing.list.status' : 'pricing.list.statusAll', { date: dateText(day) })}
        day={day}
        today={today}
        onChangeDay={setDay}
        needRate={
          showList && !request.needsRate && needRateCount > 0
            ? { text: t('pricing.list.needRate', { count: needRateCount }), onPress: () => filters.setField('needsRate', true) }
            : null
        }
      />
      {offline && lastUpdated ? <Text style={styles.note}>{t('pricing.list.lastUpdated', { time: formatTime(new Date(lastUpdated)) })}</Text> : null}

      {body}
      {showList ? (
        <FlatList
          data={rows}
          renderItem={renderRow}
          keyExtractor={row => row.summary.itemId}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={pulling} onRefresh={onPullRefresh} colors={[th.brand.tint]} tintColor={th.brand.tint} progressBackgroundColor={th.surface.card} />
          }
          ListEmptyComponent={
            noMatch ? (
              <RatesState
                icon="magnify"
                title={filters.search.length > 0 && filters.activeCount === 0 ? t('pricing.list.noMatchSearch', { search: filters.search }) : t('pricing.list.noMatchFilters')}
                actionLabel={t('pricing.list.clearAll')}
                onAction={filters.clear}
                testID="rates-no-match"
              />
            ) : null
          }
          contentContainerStyle={{ paddingBottom: space.huge + insets.bottom }}
          initialNumToRender={12}
          windowSize={9}
          removeClippedSubviews={false}
        />
      ) : null}
    </View>
  );
}
