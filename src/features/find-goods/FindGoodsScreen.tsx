/**
 * Find goods (WH-300, Design Part 3): one search over every lot, answered from the phone copy. It never calls the server,
 * so offline and online it is the same screen. Contract product/tech/app-offline-find-goods.md section 6.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ListSkeleton } from '@/components/skeletons';
import { ListSearchField } from '@/features/filters/components/ListSearchField';
import { searchWords } from '@/features/filters/components/HighlightedText';
import type { EntityName } from '@/features/phone-copy/copySchema';
import { syncNow } from '@/features/phone-copy/syncEngine';
import { useQuietReread } from '@/features/phone-copy/useQuietReread';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as translate } from '@/i18n';
import type { GRNItem } from '@/services/grn-service';
import { iconSize, layout, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { FindGoodsRow } from './FindGoodsRow';
import { findGoods, FIND_GOODS_PAGE } from './findGoodsService';
import { useFindGoodsState } from './findGoodsGate';
import { setFindGoodsText, useFindGoodsSession } from './findGoodsSession';

/** A sync that changed these records may have changed a lot on screen. */
const LOT_KINDS: ReadonlySet<EntityName> = new Set<EntityName>(['goodsreceived', 'goodsreceived_trl']);

/** What one search has shown. `query` is the text it answers. */
type Outcome =
  | { kind: 'rows'; query: string; rows: GRNItem[]; total: number; copyId: string }
  | { kind: 'failed'; query: string }
  /** The copy was not readable yet (it is loading again): the skeleton stays. */
  | { kind: 'waiting'; query: string };

/** Asks for the first page of a search and reports it, unless a newer search began meanwhile. */
async function searchFirstPage(
  asked: string,
  latest: { current: number },
  report: (outcome: Outcome) => void
): Promise<void> {
  const mine = ++latest.current;
  const answer = await findGoods(asked, 0);
  if (mine !== latest.current) return;
  if (answer.kind === 'page') {
    report({ kind: 'rows', query: asked, rows: answer.page.data, total: answer.page.total_count, copyId: answer.copyId });
  } else {
    report({ kind: answer.kind === 'failed' ? 'failed' : 'waiting', query: asked });
  }
}

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingLeft: layout.marginCompact,
    paddingRight: space.sm,
    paddingVertical: space.xs,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  title: { ...typography.largeTitle, color: t.text.primary, flexShrink: 1 },
  settings: { width: touchTarget, height: touchTarget, alignItems: 'center' as const, justifyContent: 'center' as const },
  count: {
    ...typography.footnote,
    color: t.text.secondary,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
  },
  fill: { flex: 1 },
});

interface FindGoodsScreenProps {
  /** The "GRN | Find goods" switch, drawn under the title. */
  switcher: React.ReactNode;
}

export function FindGoodsScreen({ switcher }: FindGoodsScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const gate = useFindGoodsState();
  const { text } = useFindGoodsSession();
  const query = text.trim();
  const words = useMemo(() => searchWords(query), [query]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [retries, setRetries] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  /** Grows with each new search, so the list starts at the top for it and not after a quiet re-read. */
  const [listEpoch, setListEpoch] = useState(0);
  /** The latest request: an answer to an older one is dropped. */
  const sequence = useRef(0);
  const loadingMore = useRef(false);
  /** The quiet re-read's own controls, for the read that is declared before them. */
  const atRest = useRef<() => boolean>(() => false);
  const markDue = useRef<() => void>(() => undefined);
  const shown = useRef<Outcome | null>(null);
  const queryRef = useRef(query);
  useEffect(() => {
    shown.current = outcome;
    queryRef.current = query;
  });

  const report = useCallback((next: Outcome) => {
    setOutcome(next);
    // A new search starts at the top of the list; a quiet re-read does not come through here.
    setListEpoch(epoch => epoch + 1);
  }, []);

  useEffect(() => {
    if (gate !== 'ready') return;
    if (query === '') {
      // Nothing typed: an answer still on its way is dropped.
      sequence.current += 1;
      return;
    }
    void searchFirstPage(query, sequence, report);
  }, [gate, query, retries, report]);

  const loadMore = useCallback(async () => {
    const current = shown.current;
    if (current?.kind !== 'rows' || current.query !== queryRef.current || loadingMore.current) return;
    if (current.rows.length >= current.total) return;
    loadingMore.current = true;
    const mine = sequence.current;
    try {
      const answer = await findGoods(current.query, current.rows.length);
      if (mine !== sequence.current) return;
      if (answer.kind !== 'page') return;
      // Another copy than the first page's: never a mixed list, ask for the first page again.
      if (answer.copyId !== current.copyId) {
        void searchFirstPage(current.query, sequence, report);
        return;
      }
      setOutcome({ ...current, rows: [...current.rows, ...answer.page.data], total: answer.page.total_count });
    } finally {
      loadingMore.current = false;
    }
  }, [report]);

  // After a sync that changed a lot: the loaded rows are read again from the top, once, with nothing on screen saying so.
  const readQuietly = useCallback(async () => {
    const current = shown.current;
    if (current?.kind !== 'rows' || current.query !== queryRef.current) return;
    const mine = sequence.current;
    const loaded = current.rows.length;
    const rows: GRNItem[] = [];
    let total = current.total;
    let copyId = current.copyId;
    while (rows.length < Math.max(loaded, 1)) {
      const answer = await findGoods(current.query, rows.length);
      if (mine !== sequence.current || answer.kind !== 'page') return;
      rows.push(...answer.page.data);
      total = answer.page.total_count;
      copyId = answer.copyId;
      if (answer.page.data.length < FIND_GOODS_PAGE || rows.length >= total) break;
    }
    // A finger came down, or the list changed, since the read: read again later.
    if (!atRest.current() || shown.current !== current) {
      markDue.current();
      return;
    }
    setOutcome({ kind: 'rows', query: current.query, rows, total, copyId });
  }, []);
  const quiet = useQuietReread({
    kinds: LOT_KINDS,
    active: () => shown.current?.kind === 'rows',
    idle: () => true,
    read: readQuietly,
  });
  useEffect(() => {
    atRest.current = quiet.atRest;
    markDue.current = quiet.markDue;
  }, [quiet]);

  useFocusEffect(
    useCallback(() => {
      quiet.setFocused(true);
      return () => quiet.setFocused(false);
    }, [quiet])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // The copy is brought up to date; the lots on screen are read again when it changed.
    void syncNow('pull-to-refresh')
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, []);

  const openGrn = useCallback((item: GRNItem) => {
    router.push(`/grn-details/${item.id}`);
  }, []);

  const retry = useCallback(() => {
    setOutcome(null);
    setRetries(count => count + 1);
  }, []);

  const current = outcome?.query === query ? outcome : null;
  const searching = query !== '' && current === null;

  let content: React.ReactNode;
  if (gate === 'loading' || current?.kind === 'waiting' || (searching && outcome === null)) {
    content = (
      <View style={styles.fill} testID="find-goods-loading">
        <ListSkeleton count={5} metricsCount={3} />
      </View>
    );
  } else if (query === '') {
    content = (
      <View style={styles.fill} testID="find-goods-intro">
        <ListEmptyState
          activeFilterCount={0}
          emptyIcon="magnify"
          emptyTitle={translate('findGoods.introTitle')}
          emptySubtitle={translate('findGoods.introText')}
        />
      </View>
    );
  } else if (current?.kind === 'failed') {
    content = (
      <View style={styles.fill} testID="find-goods-failed">
        <ListEmptyState
          activeFilterCount={1}
          filteredIcon="alert-circle-outline"
          filteredTitle={translate('findGoods.copyReadFailed')}
          filteredSubtitle={translate('findGoods.copyReadFailedHint')}
          clearFiltersLabel={translate('common.retry')}
          clearTestID="find-goods-retry"
          onClearFilters={retry}
        />
      </View>
    );
  } else {
    // The rows of the latest answer stay on screen while the next search is on its way.
    const answer = current ?? (outcome?.kind === 'rows' ? outcome : null);
    if (answer?.kind !== 'rows' || answer.rows.length === 0) {
      content = (
        <View style={styles.fill} testID="find-goods-no-match" accessibilityLiveRegion="polite">
          <ListEmptyState
            activeFilterCount={1}
            filteredIcon="magnify"
            filteredTitle={translate('findGoods.noMatchTitle', { text: query })}
            filteredSubtitle={translate('findGoods.noMatchText')}
            clearFiltersLabel={translate('common.clearSearch')}
            clearTestID="find-goods-clear-search"
            onClearFilters={() => setFindGoodsText('')}
          />
        </View>
      );
    } else {
      content = (
        <View style={styles.fill} {...quiet.touchHandlers}>
          <Text style={styles.count} testID="find-goods-count" accessibilityLiveRegion="polite">
            {translate('dispatch.count.lots', { count: answer.total })}
          </Text>
          <FlashList
            key={listEpoch}
            testID="find-goods-list"
            data={answer.rows}
            keyExtractor={(item: GRNItem) => String(item.grn_item_id)}
            renderItem={({ item, index }: { item: GRNItem; index: number }) => (
              <FindGoodsRow item={item} words={words} onPress={openGrn} divider={index < answer.rows.length - 1} />
            )}
            extraData={words}
            onEndReached={() => void loadMore()}
            onEndReachedThreshold={0.5}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[t.brand.tint]}
                tintColor={t.brand.tint}
                progressBackgroundColor={t.surface.card}
              />
            }
            showsVerticalScrollIndicator={false}
            {...quiet.scrollHandlers}
          />
        </View>
      );
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {translate('lists.grn.title')}
        </Text>
        <Pressable
          style={styles.settings}
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel={translate('common.toolsAndSettings')}
        >
          <Icon name="cog-outline" size={iconSize.lg} color={t.icon.primary} />
        </Pressable>
      </View>
      {switcher}
      <ListSearchField
        listKey="find-goods"
        testID="find-goods-search"
        value={text}
        onSearch={setFindGoodsText}
        placeholder={translate('findGoods.searchPlaceholder')}
        loading={searching}
        minLength={1}
      />
      {content}
    </View>
  );
}
