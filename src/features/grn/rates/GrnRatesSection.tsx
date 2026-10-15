/**
 * The Rates section of the GRN Review step (between Items and Summary): one row per item and bag weight
 * with the rate it is priced with and where the rate comes from, Change / Add rate / Undo change, and the
 * loading and error states. The rate sheet is opened from here.
 *
 * A row reads like the Items card above it and the Item pricing list: the name with its weight and source
 * tags on the left, the rent as the row's main value on the right (struck through under it, the rent a
 * pending change replaces), the band, labour and tax on one line, and small actions at the end of the row.
 * A row without a rate shows "No rate" where the rent would be. At large text the rent drops under the name.
 */
import React from 'react';
import { ActivityIndicator, Text, View, useWindowDimensions } from 'react-native';
import { Button } from '@/components/ui/Button';
import { StatusTag } from '@/components/ui';
import { STACK_RENT_SCALE } from '@/features/item-pricing/components/ItemRateRow';
import { RateStrip } from '@/features/item-pricing/components/RateStrip';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { bandText, dateText, money, unitText } from '@/features/item-pricing/rateText';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import { formatWeightEach } from '@/utils/formatters';
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

const TABULAR = ['tabular-nums' as const];

const makeStyles = (th: ThemeTokens) => ({
  empty: { padding: space.lg, gap: space.sm },
  loading: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, padding: space.lg },
  text: { ...typography.subhead, color: th.text.secondary },
  title: { ...typography.headline, color: th.text.primary },
  note: { paddingHorizontal: space.lg, paddingTop: space.lg },
  row: { paddingVertical: space.md, paddingHorizontal: space.lg, gap: space.sm, minHeight: 72 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: th.border.divider },
  info: { gap: space.xs },
  top: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: space.md },
  topStacked: { flexDirection: 'column' as const, gap: space.xs },
  main: { flex: 1, gap: space.xs },
  name: { ...typography.headline, color: th.text.primary },
  tags: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.s6 },
  figure: { alignItems: 'flex-end' as const, gap: space.xxs },
  figureStacked: { alignItems: 'flex-start' as const },
  rent: { ...typography.headline, color: th.text.primary, fontVariant: TABULAR },
  unit: { ...typography.caption1, color: th.text.secondary },
  was: { ...typography.caption1, color: th.text.secondary, fontVariant: TABULAR, textDecorationLine: 'line-through' as const },
  facts: { ...typography.subhead, color: th.text.secondary, fontVariant: TABULAR },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, justifyContent: 'flex-end' as const, gap: space.sm },
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

/** The line under the name: "Weight band 0–50 kg · Labour ₹1.50 · Tax 5%" (the rent is the row's main value). */
export function factsText(rate: Pick<RowRate, 'weight_min' | 'weight_max' | 'labour_rate' | 'tax_percent'>, oneTime: boolean): string {
  return [
    t('grn.rates.band', { band: bandText(rate.weight_min, rate.weight_max) }),
    ...(oneTime ? [] : [t('pricing.row.labour', { amount: money(rate.labour_rate) })]),
    t('pricing.row.tax', { percent: localizeDigits(String(rate.tax_percent)) }),
  ].join(' · ');
}

/** The rent a change waiting in the form replaces, when it differs; null for a stored rate or a saved GRN-only one. */
export function replacedRent(rate: RowRate | null): number | null {
  if (!rate?.entry || rate.entry.saved === true || rate.keptOwn || !rate.stored) return null;
  const before = Number(rate.stored.unit_price);
  return before === rate.unit_price ? null : before;
}

/** The tags of a row, in the order they are drawn: source, then a pending change. */
function tagsOf(rate: RowRate | null): { label: string; status: 'neutral' | 'informative'; icon: string | null }[] {
  if (!rate) return [];
  const tags: { label: string; status: 'neutral' | 'informative'; icon: string | null }[] = [];
  if (rate.source === 'customer') tags.push({ label: t('grn.rates.tagCustomer'), status: 'neutral', icon: null });
  if (rate.source === 'item') tags.push({ label: t('grn.rates.tagItem'), status: 'neutral', icon: null });
  if (rate.source === 'grn') tags.push({ label: t('grn.rates.tagGrn'), status: 'informative', icon: null });
  if (rate.entry && 'scope' in rate.entry) {
    tags.push({ label: t(rate.entry.scope === 'customer' ? 'grn.rates.changedCustomer' : 'grn.rates.changedEveryone'), status: 'informative', icon: 'pencil-outline' });
  }
  return tags;
}

/** What a screen reader says for the row's facts (the actions are read on their own). */
export function rowA11y(row: PricedRow, oneTime: boolean, day: string): string {
  const name = t('grn.rates.rowName', { item: row.item_name, weight: rowWeightText(row.weight) });
  const rate = row.rate;
  if (!rate) return `${name}, ${t('grn.rates.noRate')}`;
  const parts = [
    t(oneTime ? 'pricing.row.a11yOneTime' : 'pricing.row.a11y', {
      item: name,
      amount: money(rate.unit_price),
      unit: unitText(oneTime ? 'one_time' : 'monthly'),
      band: bandText(rate.weight_min, rate.weight_max),
      labour: money(rate.labour_rate),
      percent: localizeDigits(String(rate.tax_percent)),
    }),
    ...tagsOf(rate).map(tag => tag.label),
  ];
  if (rate.source === 'change') parts.push(t('grn.rates.fromDate', { date: dateText(day) }));
  const was = replacedRent(rate);
  if (was !== null) parts.push(t('grn.rates.wasA11y', { amount: money(was) }));
  return parts.join(', ');
}

export function GrnRatesSection({ rows, status, offline, oneTime, day, invoiced = false, onChange, onAdd, onUndo, onRetry }: GrnRatesSectionProps) {
  const styles = useThemedStyles(makeStyles);
  const th = useTokens();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= STACK_RENT_SCALE;

  if (status === 'loading') {
    return (
      <View style={styles.loading} testID="grn-rates-loading">
        <ActivityIndicator size="small" color={th.brand.tint} />
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
      {invoiced ? (
        <View style={styles.note}>
          <RateStrip variant="info" message={t('grn.rates.invoicedNote')} testID="grn-rates-invoiced" />
        </View>
      ) : null}
      {rows.map((row, index) => {
        const rate = row.rate;
        const weightLabel = formatWeightEach(row.weight);
        const was = replacedRent(rate);
        const a11yName = { item: row.item_name, weight: rowWeightText(row.weight) };
        const facts = rate ? factsText(rate, oneTime) + (rate.source === 'change' ? ` · ${t('grn.rates.fromDate', { date: dateText(day) })}` : '') : null;
        return (
          <View key={row.key} style={[styles.row, index < rows.length - 1 && styles.rowDivider]} testID={`grn-rate-row-${index}`}>
            <View style={styles.info} accessible accessibilityLabel={rowA11y(row, oneTime, day)}>
              <View style={stacked ? styles.topStacked : styles.top}>
                <View style={styles.main}>
                  <Text style={styles.name} numberOfLines={2}>{row.item_name}</Text>
                  <View style={styles.tags}>
                    <StatusTag status="neutral" icon="weight-kilogram" label={weightLabel ?? t('grn.rates.noWeightTag')} />
                    {tagsOf(rate).map(tag => <StatusTag key={tag.label} status={tag.status} icon={tag.icon} label={tag.label} />)}
                  </View>
                </View>
                <View style={[styles.figure, stacked && styles.figureStacked]}>
                  {rate ? (
                    <>
                      <Text style={styles.rent} testID={`grn-rate-rent-${index}`}>{money(rate.unit_price)}</Text>
                      <Text style={styles.unit}>{oneTime ? t('pricing.band.rentOnce') : t('pricing.band.rentMonthly')}</Text>
                      {was !== null ? <Text style={styles.was} testID={`grn-rate-was-${index}`}>{money(was)}</Text> : null}
                    </>
                  ) : (
                    <StatusTag status="critical" label={t('grn.rates.noRate')} />
                  )}
                </View>
              </View>
              {facts ? <Text style={styles.facts}>{facts}</Text> : null}
            </View>
            {invoiced ? null : (
              <View style={styles.actions}>
                {rate?.entry ? (
                  <Button
                    type="tertiary"
                    size="compact"
                    leftIcon={rate.source === 'grn' && rate.entry.saved === true ? 'close' : 'undo-variant'}
                    onPress={() => onUndo(row)}
                    accessibilityLabel={t('grn.rates.undoFor', a11yName)}
                    testID={`grn-rate-undo-${index}`}
                  >
                    {t(rate.source === 'grn' && rate.entry.saved === true ? 'grn.rates.remove' : 'grn.rates.undo')}
                  </Button>
                ) : null}
                {rate ? (
                  <Button type="secondary" size="compact" leftIcon="pencil-outline" onPress={() => onChange(row)} accessibilityLabel={t('grn.rates.changeFor', a11yName)} testID={`grn-rate-change-${index}`}>
                    {t('grn.rates.change')}
                  </Button>
                ) : (
                  <Button type="secondary" size="compact" leftIcon="plus" onPress={() => onAdd(row)} accessibilityLabel={t('grn.rates.addFor', a11yName)} testID={`grn-rate-add-${index}`}>
                    {t('grn.rates.addRate')}
                  </Button>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default GrnRatesSection;
