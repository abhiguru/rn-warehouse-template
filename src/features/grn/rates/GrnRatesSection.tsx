/**
 * The Rates section of the GRN Review step: a nested table (docs/STYLE_GUIDE.md §13.7, the table inside an open
 * row's details) in the step's open RATES panel (owner, 2026-10-17): Item | Rent (₹) | Labour (₹) | Tax (%), one
 * row per item and bag weight with the rate it is priced with. Under the item: the weight of one bag (no weight band:
 * the Overview shows none either, owner 2026-10-17), the source and pending-change tags, the rent a pending change replaces (struck through), and the
 * row's actions (Change / Add rate / Undo change / Remove, which asks first; after it, a "Removed when you save" tag and Undo remove). A row without a rate shows "—" in its number cells and
 * a "No rate" tag. A one-time GRN has no Labour column; when the numbers would crowd the item column, labour and
 * tax move under the item. The loading and error states sit in the same table card. The rate sheet is opened
 * from here.
 */
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { StatusTag } from '@/components/ui';
import { HeaderCell, ONE_LINE, crowded, makeTableStyles, nb, nestedRowWidth, numberColumnWidth, useStackedWhen, useTableLayout } from '@/components/common/DetailTable';
import { RateStrip } from '@/features/item-pricing/components/RateStrip';
import { LABOUR_WIDTH, RENT_WIDTH, TAX_WIDTH, amountText, taxText } from './GrnItemRates';
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
  /** The row's saved rate for this GRN only was removed in this form and can be put back (Undo remove). */
  canRestore?: (row: PricedRow) => boolean;
  onRestore?: (row: PricedRow) => void;
  onRetry: () => void;
}

const TABULAR = ['tabular-nums' as const];

const makeStyles = (th: ThemeTokens) => ({
  empty: { padding: space.md, gap: space.sm },
  loading: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, padding: space.md },
  text: { ...typography.subhead, color: th.text.secondary },
  title: { ...typography.headline, color: th.text.primary },
  wrap: { gap: space.sm },
  row: { paddingHorizontal: space.sm, paddingVertical: space.sm, gap: space.sm },
  top: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: space.sm },
  name: { ...typography.subhead, fontWeight: '600' as const, color: th.text.primary },
  tags: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.s6, marginTop: space.xxs },
  was: { ...typography.caption1, color: th.text.secondary, fontVariant: TABULAR, textDecorationLine: 'line-through' as const, textAlign: 'right' as const },
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

export function GrnRatesSection({ rows, status, offline, oneTime, day, invoiced = false, onChange, onAdd, onUndo, canRestore, onRestore, onRetry }: GrnRatesSectionProps) {
  const styles = useThemedStyles(makeStyles);
  const table = useThemedStyles(makeTableStyles);
  const th = useTokens();
  const screen = useTableLayout();
  const rentWidth = numberColumnWidth(screen, RENT_WIDTH, rows.map(r => amountText(r.rate?.unit_price ?? null)));
  const labourWidth = numberColumnWidth(screen, LABOUR_WIDTH, rows.map(r => amountText(r.rate?.labour_rate ?? null)));
  const taxWidth = numberColumnWidth(screen, TAX_WIDTH, rows.map(r => taxText(r.rate?.tax_percent ?? null)));
  const stacked = useStackedWhen(screen, crowded(nestedRowWidth(screen), oneTime ? [rentWidth, taxWidth] : [rentWidth, labourWidth, taxWidth], 0, screen.scale)).stacked;

  if (status === 'loading') {
    return (
      <View style={table.nested}>
        <View style={styles.loading} testID="grn-rates-loading">
          <ActivityIndicator size="small" color={th.brand.tint} />
          <Text style={styles.text}>{t('grn.rates.loading')}</Text>
        </View>
      </View>
    );
  }
  if (status === 'error') {
    return (
      <View style={table.nested}>
        <View style={styles.empty} testID="grn-rates-error">
          <Text style={styles.title}>{t('grn.rates.loadErrorTitle')}</Text>
          <Text style={styles.text}>{offline ? t('grn.rates.offline') : t('pricing.list.loadErrorText')}</Text>
          <Button type="secondary" onPress={onRetry} testID="grn-rates-retry">{t('grn.rates.tryAgain')}</Button>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      {invoiced ? <RateStrip variant="info" message={t('grn.rates.invoicedNote')} testID="grn-rates-invoiced" /> : null}
      <View style={table.nested} testID="grn-rates-table">
        <View style={table.nestedHeader}>
          <HeaderCell style={table.grow}>{t('grn.rates.colItem')}</HeaderCell>
          <HeaderCell numeric style={{ width: rentWidth }}>{t('grn.rates.colRent')}</HeaderCell>
          {!stacked && !oneTime ? <HeaderCell numeric style={{ width: labourWidth }}>{t('grn.rates.colLabour')}</HeaderCell> : null}
          {!stacked ? <HeaderCell numeric style={{ width: taxWidth }}>{t('grn.rates.colTax')}</HeaderCell> : null}
        </View>
        {rows.map((row, index) => {
          const rate = row.rate;
          const was = replacedRent(rate);
          const a11yName = { item: row.item_name, weight: rowWeightText(row.weight) };
          // Only while nothing else prices the row from the form: a new rate typed after Remove comes first.
          const restorable = !invoiced && !rate?.entry && canRestore?.(row) === true;
          const under = [
            formatWeightEach(row.weight) ?? t('grn.rates.noWeightTag'),
            rate && stacked && !oneTime ? t('pricing.row.labour', { amount: money(rate.labour_rate) }) : null,
            rate && stacked ? t('pricing.row.tax', { percent: localizeDigits(String(rate.tax_percent)) }) : null,
            rate?.source === 'change' ? t('grn.rates.fromDate', { date: dateText(day) }) : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <View key={row.key} style={[styles.row, index > 0 && table.nestedDivider]} testID={`grn-rate-row-${index}`}>
              <View style={styles.top} accessible accessibilityLabel={restorable ? `${rowA11y(row, oneTime, day)}, ${t('grn.rates.removedTag')}` : rowA11y(row, oneTime, day)}>
                <View style={table.grow}>
                  <Text style={styles.name}>{row.item_name}</Text>
                  <Text style={table.secondary}>{nb(under)}</Text>
                  <View style={styles.tags}>
                    {rate ? null : <StatusTag wrap status="critical" label={t('grn.rates.noRate')} />}
                    {tagsOf(rate).map(tag => <StatusTag wrap key={tag.label} status={tag.status} icon={tag.icon} label={tag.label} />)}
                    {restorable ? <StatusTag wrap status="informative" label={t('grn.rates.removedTag')} /> : null}
                  </View>
                </View>
                <View style={{ width: rentWidth }}>
                  <Text style={table.number} {...ONE_LINE} testID={rate ? `grn-rate-rent-${index}` : undefined}>{amountText(rate?.unit_price ?? null)}</Text>
                  {was !== null ? <Text style={styles.was} {...ONE_LINE} testID={`grn-rate-was-${index}`}>{amountText(was)}</Text> : null}
                </View>
                {!stacked && !oneTime ? <Text style={[table.number, { width: labourWidth }]} {...ONE_LINE}>{amountText(rate?.labour_rate ?? null)}</Text> : null}
                {!stacked ? <Text style={[table.number, { width: taxWidth }]} {...ONE_LINE}>{taxText(rate?.tax_percent ?? null)}</Text> : null}
              </View>
              {invoiced ? null : (
                <View style={styles.actions}>
                  {restorable ? (
                    <Button
                      type="tertiary"
                      size="compact"
                      leftIcon="undo-variant"
                      onPress={() => onRestore?.(row)}
                      accessibilityLabel={t('grn.rates.restoreFor', a11yName)}
                      testID={`grn-rate-restore-${index}`}
                    >
                      {t('grn.rates.restore')}
                    </Button>
                  ) : null}
                  {rate?.entry ? (
                    <Button
                      type="tertiary"
                      size="compact"
                      leftIcon={rate.source === 'grn' && rate.entry.saved === true ? 'close' : 'undo-variant'}
                      onPress={() => onUndo(row)}
                      accessibilityLabel={t(rate.source === 'grn' && rate.entry.saved === true ? 'grn.rates.removeFor' : 'grn.rates.undoFor', a11yName)}
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
    </View>
  );
}

export default GrnRatesSection;
