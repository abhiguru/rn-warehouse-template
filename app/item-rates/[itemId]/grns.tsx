/**
 * Rates typed on single GRNs, for one item (backend migration 86): a row for every GRN that has a rate of its own
 * for the item and is not invoiced yet (the GRN number, the customer, the GRN day and the figures), opening that GRN.
 * Reached from "Rates typed on single GRNs" on the item page. A rate of an invoiced GRN is no longer used and is
 * listed under Old rates instead.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { dateText } from '@/features/item-pricing/rateText';
import { useItemRatesFor } from '@/features/item-pricing/useItemRates';
import { grnOnlyFigures, groupByGrn } from '@/features/item-pricing/grnOnlyText';
import { RatesState } from '@/features/item-pricing/components/RatesState';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { formatIdentifier, t } from '@/i18n';
import { getItemGrnRates } from '@/services/item-pricing-service';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemGrnRate } from '@/types/item-pricing.types';

const makeStyles = (th: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: th.background.base },
  header: {
    paddingBottom: space.sm,
    paddingHorizontal: space.sm,
    backgroundColor: th.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: th.border.divider,
  },
  headerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  titles: { flex: 1 },
  title: { ...typography.headline, color: th.text.primary },
  subtitle: { ...typography.subhead, color: th.text.secondary },
  rows: { marginHorizontal: layout.marginCompact, borderRadius: radius.card, overflow: 'hidden' as const },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: touchTarget,
    paddingVertical: space.md,
    paddingLeft: layout.marginCompact,
    paddingRight: space.sm,
    backgroundColor: th.surface.card,
  },
  pressed: { backgroundColor: th.surface.cardPressed },
  body: { flex: 1, gap: space.xxs },
  grn: { ...typography.headline, color: th.text.primary },
  line: { ...typography.subhead, color: th.text.secondary },
  figures: { ...typography.subhead, color: th.text.primary, fontVariant: ['tabular-nums' as const] },
  divider: { height: 1, marginLeft: layout.marginCompact, backgroundColor: th.border.divider },
  skeleton: { gap: space.md },
});

export default function ItemGrnRatesPage() {
  const styles = useThemedStyles(makeStyles);
  const th = useTokens();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ itemId: string }>();
  const itemId = String(params.itemId ?? '');
  const { itemRates, notFound } = useItemRatesFor(itemId);
  const [rates, setRates] = useState<ItemGrnRate[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pulling, setPulling] = useState(false);

  const load = useCallback(async () => {
    try {
      setRates(await getItemGrnRates(itemId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [itemId]);
  useEffect(() => { if (itemId) void load(); }, [itemId, load]);

  const groups = useMemo(() => groupByGrn((rates ?? []).filter(r => !r.archived)), [rates]);
  const onPull = useCallback(async () => {
    setPulling(true);
    await load();
    setPulling(false);
  }, [load]);

  const loading = rates === null && !failed;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.headerRow}>
          <HeaderBackButton />
          <View style={styles.titles}>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>{t('pricing.grnList.title')}</Text>
            {itemRates ? <Text style={styles.subtitle} numberOfLines={2}>{itemRates.item.name}</Text> : null}
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.skeleton} testID="grns-skeleton" accessibilityLabel={t('pricing.list.loadingLabel')}>
          <ListSkeletonCard metricsCount={3} />
          <ListSkeletonCard metricsCount={3} />
        </View>
      ) : null}

      {failed ? (
        <RatesState
          icon="alert-circle-outline"
          title={t('pricing.item.grnOnlyFailed')}
          text={t('pricing.list.loadErrorText')}
          actionLabel={t('pricing.list.tryAgain')}
          onAction={() => { void load(); }}
          testID="grns-load-error"
        />
      ) : null}

      {notFound ? (
        <RatesState
          icon="package-variant-closed"
          title={t('pricing.item.notFound')}
          actionLabel={t('pricing.item.back')}
          onAction={() => router.back()}
          testID="item-not-found"
        />
      ) : null}

      {rates !== null && !failed && !notFound ? (
        <ScrollView
          contentContainerStyle={{ paddingTop: space.md, paddingBottom: space.huge + insets.bottom }}
          refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} />}
        >
          {groups.length === 0 ? (
            <RatesState icon="receipt-text-outline" title={t('pricing.grnList.empty')} testID="grns-empty" />
          ) : (
            <View style={styles.rows}>
              {groups.map(bands => {
                const first = bands[0];
                const title = t('pricing.item.grnOnlyGrn', { number: formatIdentifier(first.gr_no) });
                const figures = bands.map(grnOnlyFigures);
                return (
                  <View key={first.gr_id}>
                    <Pressable
                      onPress={() => router.push({ pathname: '/grn-details/[id]', params: { id: first.gr_id } })}
                      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={[title, first.customer_name ?? '', dateText(first.grn_date), ...figures].filter(Boolean).join(', ')}
                      testID={`grn-rate-row-${first.gr_id}`}
                    >
                      <View style={styles.body}>
                        <Text style={styles.grn}>{title}</Text>
                        {first.customer_name ? <Text style={styles.line} numberOfLines={2}>{first.customer_name}</Text> : null}
                        <Text style={styles.line}>{dateText(first.grn_date)}</Text>
                        {figures.map((figure, i) => <Text key={bands[i].id} style={styles.figures}>{figure}</Text>)}
                      </View>
                      <Icon name="chevron-right" size={iconSize.md} color={th.icon.secondary} />
                    </Pressable>
                    <View style={styles.divider} />
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}
