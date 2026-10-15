/**
 * The Rates section of the GRN Review step (between Items and Summary): one row per item and bag weight
 * with the rate it is priced with and where the rate comes from, Change / Add rate / Undo change, and the
 * loading and error states. The rate sheet is opened from here.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { StatusTag } from '@/components/ui';
import { useThemedStyles } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { bandText, dateText, money } from '@/features/item-pricing/rateText';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import type { GrnRatesStatus } from './useGrnRates';
import type { PricedRow, RowRate } from './grnRateModel';

export interface GrnRatesSectionProps {
  rows: PricedRow[];
  status: GrnRatesStatus;
  offline: boolean;
  oneTime: boolean;
  /** The GRN's day: a pending change starts on it. */
  day: string;
  /** The GRN is invoiced: its rates are shown, nothing can be added, changed or undone. */
  invoiced?: boolean;
  onChange: (row: PricedRow) => void;
  onAdd: (row: PricedRow) => void;
  onUndo: (row: PricedRow) => void;
  onRetry: () => void;
}

const makeStyles = (th: ThemeTokens) => ({
  empty: { padding: space.lg, gap: space.sm },
  text: { ...typography.subhead, color: th.text.secondary },
  title: { ...typography.headline, color: th.text.primary },
  cell: { padding: space.lg, gap: space.xs, borderBottomWidth: 1, borderBottomColor: th.border.divider },
  figures: { ...typography.subhead, color: th.text.secondary },
  tags: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.s6, marginTop: space.xs },
  note: { ...typography.footnote, color: th.text.secondary, padding: space.lg, paddingBottom: 0 },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.sm, marginTop: space.sm },
});

export const figuresText = (rate: Pick<RowRate, 'weight_min' | 'weight_max' | 'unit_price' | 'labour_rate' | 'tax_percent'>, oneTime: boolean): string =>
  t(oneTime ? 'grn.rates.figuresOneTime' : 'grn.rates.figures', {
    band: bandText(rate.weight_min, rate.weight_max),
    rent: money(rate.unit_price),
    labour: money(rate.labour_rate),
    tax: localizeDigits(String(rate.tax_percent)),
  });

export const rowWeightText = (weight: number): string =>
  weight > 0 ? `${localizeDigits(String(weight))} ${t('pricing.kg')}` : t('grn.rates.noWeight');

export function GrnRatesSection({ rows, status, offline, oneTime, day, invoiced = false, onChange, onAdd, onUndo, onRetry }: GrnRatesSectionProps) {
  const styles = useThemedStyles(makeStyles);

  if (status === 'loading') {
    return (
      <View style={styles.empty} testID="grn-rates-loading">
        <Text style={styles.text}>{t('grn.rates.loading')}</Text>
      </View>
    );
  }
  if (status === 'error') {
    return (
      <View style={styles.empty} testID="grn-rates-error">
        <Text style={styles.title}>{t('grn.rates.loadErrorTitle')}</Text>
        <Text style={styles.text}>{offline ? t('grn.rates.offline') : t('pricing.list.loadErrorText')}</Text>
        <Button type="secondary" onPress={onRetry} testID="grn-rates-retry">{t('grn.rates.tryAgain')}</Button>
      </View>
    );
  }
  return (
    <View>
      {invoiced ? <Text style={styles.note} testID="grn-rates-invoiced">{t('grn.rates.invoicedNote')}</Text> : null}
      {rows.map((row, index) => {
        const rate = row.rate;
        const name = t('grn.rates.rowName', { item: row.item_name, weight: rowWeightText(row.weight) });
        return (
          <View key={row.key} style={[styles.cell, index === rows.length - 1 && { borderBottomWidth: 0 }]} testID={`grn-rate-row-${index}`}>
            <Text style={styles.title}>{name}</Text>
            {rate ? <Text style={styles.figures}>{figuresText(rate, oneTime)}{rate.source === 'change' ? ` · ${t('grn.rates.fromDate', { date: dateText(day) })}` : ''}</Text> : null}
            <View style={styles.tags}>
              {!rate ? <StatusTag status="critical" label={t('grn.rates.noRate')} /> : null}
              {rate?.source === 'customer' ? <StatusTag status="neutral" label={t('grn.rates.tagCustomer')} /> : null}
              {rate?.source === 'item' ? <StatusTag status="neutral" label={t('grn.rates.tagItem')} /> : null}
              {rate?.source === 'grn' ? <StatusTag status="informative" label={t('grn.rates.tagGrn')} /> : null}
              {rate?.entry && 'scope' in rate.entry ? (
                <StatusTag status="informative" label={t(rate.entry.scope === 'customer' ? 'grn.rates.changedCustomer' : 'grn.rates.changedEveryone')} />
              ) : null}
            </View>
            {invoiced ? null : (
            <View style={styles.actions}>
              {rate ? (
                <Button type="secondary" onPress={() => onChange(row)} accessibilityLabel={t('grn.rates.changeFor', { item: row.item_name, weight: rowWeightText(row.weight) })} testID={`grn-rate-change-${index}`}>
                  {t('grn.rates.change')}
                </Button>
              ) : (
                <Button type="secondary" onPress={() => onAdd(row)} accessibilityLabel={t('grn.rates.addFor', { item: row.item_name, weight: rowWeightText(row.weight) })} testID={`grn-rate-add-${index}`}>
                  {t('grn.rates.addRate')}
                </Button>
              )}
              {rate?.entry ? (
                <Button type="tertiary" onPress={() => onUndo(row)} accessibilityLabel={t('grn.rates.undoFor', { item: row.item_name, weight: rowWeightText(row.weight) })} testID={`grn-rate-undo-${index}`}>
                  {t(rate.source === 'grn' && rate.entry?.saved === true ? 'grn.rates.remove' : 'grn.rates.undo')}
                </Button>
              ) : null}
            </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default GrnRatesSection;
