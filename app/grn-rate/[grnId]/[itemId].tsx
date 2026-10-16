/**
 * "Your rate" (owner, 2026-10-16): what a customer sees on tapping a row of a GRN's Rates. Only the rate
 * their own lots of this item are invoiced at, read from get_grn_item_rates (backend migration 88), and never
 * the item's default rate or another customer's: whatever the server's source (invoice, this GRN, the
 * customer's rate or the item's), it is shown as the customer's rate, with no source named. Administrators
 * and supervisors open the item in Item pricing instead; staff rows are not links.
 *
 * One card per distinct rate of the item on this GRN (lots of different bag weights may differ), each with
 * the weight of the customer's own bags, never the band of the rate row it came from (backend migration 89
 * leaves the band out for a customer anyway). Back returns to the GRN.
 */
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyValueCell } from '@/components/fiori/KeyValueCell';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { groupRates, type RateGroup } from '@/features/grn/rates/GrnItemRates';
import { useGrnItemRates } from '@/features/grn/rates/useGrnItemRates';
import { RatesState } from '@/features/item-pricing/components/RatesState';
import { dateText, money, unitText } from '@/features/item-pricing/rateText';
import { useThemedStyles } from '@/hooks/useTheme';
import { formatIdentifier, localizeDigits, t } from '@/i18n';
import { layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { formatWeight } from '@/utils/formatters';

const TABULAR = ['tabular-nums' as const];

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
  title: { ...typography.headline, flex: 1, color: th.text.primary },
  bar: { paddingHorizontal: layout.marginCompact, paddingVertical: space.sm, backgroundColor: th.surface.header },
  barText: { ...typography.footnote, color: th.text.secondary },
  block: { gap: space.md, marginBottom: space.lg },
  card: { backgroundColor: th.surface.card, borderRadius: radius.card, marginHorizontal: layout.marginCompact, padding: space.lg, gap: space.md },
  figure: { ...typography.title3, color: th.text.primary, fontVariant: TABULAR },
  unit: { ...typography.subhead, color: th.text.secondary },
  note: { ...typography.footnote, color: th.text.secondary },
  foot: { ...typography.footnote, color: th.text.secondary, paddingHorizontal: layout.marginCompact },
  skeleton: { gap: space.md, paddingTop: space.md },
});

function YourRateCard({ group, oneTime }: { group: RateGroup; oneTime: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const { fontScale } = useWindowDimensions();
  const kv = fontScale >= 1.3 ? 'stacked' : 'inline';
  const { rate } = group;
  const weight = Number(group.weight) > 0 ? formatWeight(Number(group.weight)) : null;
  return (
    <View style={styles.card} testID={`your-rate-card-${rate.grn_item_id}`}>
      <Text accessibilityRole="header">
        <Text style={styles.figure}>{money(rate.unit_price ?? 0)}</Text>
        <Text style={styles.unit}>{`  ${unitText(oneTime ? 'one_time' : 'monthly')}`}</Text>
      </Text>
      <View>
        {weight ? <KeyValueCell layout={kv} keyLabel={t('pricing.band.weightEach')} value={weight} showDivider /> : null}
        {oneTime ? null : (
          <KeyValueCell layout={kv} keyLabel={t('pricing.item.labour')} value={t('pricing.item.labourShort', { amount: money(rate.labour_rate ?? 0) })} showDivider />
        )}
        <KeyValueCell layout={kv} keyLabel={t('pricing.item.tax')} value={t('pricing.item.taxShort', { percent: localizeDigits(String(rate.tax_percent ?? 0)) })} />
      </View>
      {rate.varies ? <Text style={styles.note}>{t('grn.rates.yourRateVaries')}</Text> : null}
    </View>
  );
}

export default function YourRatePage() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ grnId: string; itemId: string; no?: string }>();
  const grnId = String(params.grnId ?? '');
  const itemId = String(params.itemId ?? '');
  const { rates, priceType, grnDate, status, retry } = useGrnItemRates(grnId || null);
  const mine = useMemo(() => rates.filter(r => r.item_id === itemId), [rates, itemId]);
  const groups = useMemo(() => groupRates(mine.filter(r => r.source !== null)), [mine]);
  const oneTime = priceType === 'one_time';
  const ready = status === 'ready';
  const itemName = mine[0]?.item_name ?? '';
  const onInvoice = groups.some(g => g.rate.source === 'invoice');

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.headerRow}>
          <HeaderBackButton />
          <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>{itemName}</Text>
        </View>
      </View>

      {ready && grnDate ? (
        <View style={styles.bar}>
          <Text style={styles.barText} testID="your-rate-for">
            {params.no
              ? t('grn.rates.yourRateForGrn', { number: formatIdentifier(params.no), date: dateText(grnDate) })
              : t('grn.rates.yourRateOn', { date: dateText(grnDate) })}
          </Text>
        </View>
      ) : null}

      {status === 'loading' ? (
        <View style={styles.skeleton} testID="your-rate-skeleton" accessibilityLabel={t('grn.rates.loading')}>
          <ListSkeletonCard metricsCount={3} />
        </View>
      ) : null}

      {status === 'error' ? (
        <RatesState
          icon="alert-circle-outline"
          title={t('grn.rates.itemRatesLoadError')}
          actionLabel={t('grn.rates.tryAgain')}
          onAction={() => { void retry(); }}
          testID="your-rate-error"
        />
      ) : null}

      {status === 'unavailable' || (ready && groups.length === 0) ? (
        <RatesState
          icon="tag-off-outline"
          title={t('grn.rates.yourRateMissing')}
          actionLabel={t('pricing.item.back')}
          onAction={() => router.back()}
          testID="your-rate-missing"
        />
      ) : null}

      {ready && groups.length > 0 ? (
        <ScrollView contentContainerStyle={{ paddingTop: space.md, paddingBottom: space.huge + insets.bottom }}>
          <SectionHeader title={t('grn.rates.yourRateTitle')} />
          <View style={styles.block}>
            {groups.map(group => <YourRateCard key={group.key} group={group} oneTime={oneTime} />)}
          </View>
          {onInvoice ? <Text style={styles.foot}>{t('grn.rates.yourRateInvoice')}</Text> : null}
        </ScrollView>
      ) : null}
    </View>
  );
}
