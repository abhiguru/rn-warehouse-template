/**
 * "Rates" on the Overview tab of the GRN details screen (backend migration 88): for every item and bag
 * weight, the rate this GRN is invoiced at and where it comes from. Lots with the same item, weight and
 * figures share a row. Falls back to the GRN-only rates when the server lacks the function.
 */
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SectionHeader, useOverviewStyles } from '@/components/common/overview-tab';
import { nb } from '@/components/common/DetailTable';
import { Button } from '@/components/ui/Button';
import { StatusTag } from '@/components/ui';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { money, bandText } from '@/features/item-pricing/rateText';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import { formatWeightEach } from '@/utils/formatters';
import type { RpcGrnItemRate, RpcGrnRate } from '@/types/rpc-canonical.types';
import { figuresText } from './GrnRatesSection';
import { GrnOnlyRates } from './GrnOnlyRates';
import { useGrnItemRates } from './useGrnItemRates';

const TABULAR = ['tabular-nums' as const];

const makeStyles = (th: ThemeTokens) => ({
  row: { gap: space.xs, paddingVertical: space.sm },
  name: { ...typography.headline, color: th.text.primary },
  weight: { ...typography.subhead, color: th.text.secondary, fontVariant: TABULAR },
  figures: { ...typography.subhead, color: th.text.secondary, fontVariant: TABULAR },
  tags: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.xs, alignItems: 'center' as const },
  loading: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, paddingVertical: space.sm },
  error: { gap: space.sm, paddingVertical: space.sm },
  text: { ...typography.subhead, color: th.text.secondary },
});

export interface RateGroup {
  key: string;
  item_name: string;
  weight: number;
  rate: RpcGrnItemRate;
}

/** One row per item, bag weight and figures, in the order of the GRN's items. */
export function groupRates(rates: RpcGrnItemRate[]): RateGroup[] {
  const groups = new Map<string, RateGroup>();
  for (const rate of rates) {
    const key = [rate.item_id, rate.weight, rate.source, rate.unit_price, rate.labour_rate, rate.tax_percent, rate.weight_min, rate.weight_max, rate.varies].join('|');
    if (!groups.has(key)) groups.set(key, { key, item_name: rate.item_name, weight: rate.weight, rate });
  }
  return [...groups.values()];
}

const SOURCE_LABEL = {
  invoice: 'grn.rates.tagInvoice',
  grn: 'grn.rates.tagGrn',
  customer: 'grn.rates.tagCustomer',
  item: 'grn.rates.tagItem',
} as const;

/** "₹4.50 rent · ₹1.50 labour · 5% tax", with the weight band in front when the rate has one. */
export function itemRateFigures(rate: RpcGrnItemRate, oneTime: boolean): string {
  if (rate.unit_price === null || rate.tax_percent === null) return '';
  const hasBand = rate.weight_min !== null && rate.weight_max !== null;
  if (hasBand) {
    return figuresText(
      { weight_min: rate.weight_min!, weight_max: rate.weight_max!, unit_price: rate.unit_price, labour_rate: rate.labour_rate ?? 0, tax_percent: rate.tax_percent },
      oneTime,
    );
  }
  return t(oneTime ? 'grn.rates.figuresOneTimeNoBand' : 'grn.rates.figuresNoBand', {
    rent: money(rate.unit_price),
    labour: money(rate.labour_rate ?? 0),
    tax: localizeDigits(String(rate.tax_percent)),
  });
}

export function GrnItemRates({ grnId, fallbackRates }: { grnId?: string | null; fallbackRates?: RpcGrnRate[] | null }) {
  const styles = useThemedStyles(makeStyles);
  const overview = useOverviewStyles();
  const th = useTokens();
  const { rates, priceType, status, retry } = useGrnItemRates(grnId);

  if (status === 'unavailable') {
    return fallbackRates && fallbackRates.length > 0 ? <GrnOnlyRates rates={fallbackRates} /> : null;
  }
  if (status === 'ready' && rates.length === 0) return null;

  const oneTime = priceType === 'one_time';
  return (
    <>
      <SectionHeader title={t('grn.rates.title')} />
      <View style={overview.chipsCard} testID="grn-item-rates">
        {status === 'loading' ? (
          <View style={styles.loading} testID="grn-item-rates-loading">
            <ActivityIndicator size="small" color={th.brand.tint} />
            <Text style={styles.text}>{t('grn.rates.loading')}</Text>
          </View>
        ) : null}
        {status === 'error' ? (
          <View style={styles.error} testID="grn-item-rates-error">
            <Text style={styles.text}>{t('grn.rates.itemRatesLoadError')}</Text>
            <Button type="secondary" onPress={() => void retry()} testID="grn-item-rates-retry">{t('grn.rates.tryAgain')}</Button>
          </View>
        ) : null}
        {status === 'ready'
          ? groupRates(rates).map(group => {
              const { rate } = group;
              const each = formatWeightEach(group.weight);
              return (
                <View key={group.key} style={styles.row} testID="grn-item-rate-row">
                  <Text style={styles.name}>{group.item_name}</Text>
                  {each ? <Text style={styles.weight}>{nb(each)}</Text> : null}
                  {rate.source === null ? (
                    <View style={styles.tags}>
                      <StatusTag status="critical" label={t('grn.rates.noRateSet')} />
                    </View>
                  ) : (
                    <>
                      <Text style={styles.figures}>{nb(itemRateFigures(rate, oneTime))}</Text>
                      <View style={styles.tags}>
                        <StatusTag status="neutral" label={t(SOURCE_LABEL[rate.source])} />
                        {rate.varies ? <StatusTag status="neutral" label={t('grn.rates.tagVaries')} /> : null}
                      </View>
                    </>
                  )}
                </View>
              );
            })
          : null}
      </View>
    </>
  );
}

export default GrnItemRates;
