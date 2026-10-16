/**
 * "Rates" on the Overview tab of the GRN details screen (backend migration 88): for every item and bag
 * weight, the rate this GRN is invoiced at and where it comes from, as a table in the object-page style
 * (docs/STYLE_GUIDE.md §13.7, common/DetailTable): Item | Rent (₹) | Labour (₹) | Tax (%), the units in
 * the headings and a note under the rows. A one-time GRN has no Labour column. At large text, or when
 * the numbers would crowd the item column, labour and tax move under the item. Lots with the same item,
 * weight and figures share a row. Falls back to the GRN-only rates when the server lacks the function.
 *
 * Owner, 2026-10-16: the item cell holds only the name (the weight of one bag only when an item has
 * more than one row, to tell them apart); a row opens the item's rate card read-only, on the GRN's day,
 * for those who may open Item pricing, and Back lands on the GRN again.
 */
import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SectionHeader } from '@/components/common/overview-tab';
import {
  HeaderCell,
  ONE_LINE,
  crowded,
  makeTableStyles,
  nb,
  numberColumnWidth,
  rowWidth,
  useStackedWhen,
  useTableLayout,
} from '@/components/common/DetailTable';
import { Button } from '@/components/ui/Button';
import { StatusTag } from '@/components/ui';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { canOpenScreen } from '@/config/roles';
import { itemRatesPath } from '@/features/item-pricing/contract';
import { useAppSelector } from '@/store/hooks';
import { localizeDigits, t } from '@/i18n';
import { money } from '@/features/item-pricing/rateText';
import { space, type ThemeTokens } from '@/theme/tokens';
import { formatNumber, formatWeightEach } from '@/utils/formatters';
import type { RpcGrnItemRate, RpcGrnRate } from '@/types/rpc-canonical.types';
import { GrnOnlyRates } from './GrnOnlyRates';
import { useGrnItemRates } from './useGrnItemRates';

/** Column widths at font scale 1; each grows with its widest value. */
const RENT_WIDTH = 56;
const LABOUR_WIDTH = 56;
const TAX_WIDTH = 40;

const makeStyles = (th: ThemeTokens) => ({
  /** The table card inside the Overview's padded content: no margins of its own. */
  card: { marginHorizontal: 0, marginTop: 0, marginBottom: space.md },
  tags: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.xs, alignItems: 'center' as const, marginTop: space.xs },
  state: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, padding: space.md },
  error: { gap: space.sm, padding: space.md },
  note: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md },
  missing: { color: th.text.secondary },
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

/** A money cell: "88.00" (the ₹ is in the heading); "—" without a rate. */
const amountText = (value: number | null): string => (value === null ? '—' : formatNumber(value, 2));
/** A tax cell: "18" or "12.5" (the % is in the heading); "—" without a rate. */
const taxText = (value: number | null): string => (value === null ? '—' : localizeDigits(String(value)));

/** The items that have more than one row: their rows show the weight of one bag to tell them apart. */
export function repeatedItems(groups: RateGroup[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const group of groups) {
    if (seen.has(group.rate.item_id)) repeated.add(group.rate.item_id);
    seen.add(group.rate.item_id);
  }
  return repeated;
}

export function GrnItemRates({ grnId, fallbackRates }: { grnId?: string | null; fallbackRates?: RpcGrnRate[] | null }) {
  const table = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const th = useTokens();
  const screen = useTableLayout();
  const { rates, priceType, grnDate, status, retry } = useGrnItemRates(grnId);
  const role = useAppSelector(state => state.auth?.userProfile?.role);
  // Customers cannot open Item pricing (roles.ts): for them the rows are not links.
  const canOpen = canOpenScreen(role, 'itemPricing');
  const oneTime = priceType === 'one_time';
  const groups = useMemo(() => groupRates(rates), [rates]);
  const repeated = useMemo(() => repeatedItems(groups), [groups]);

  const rentWidth = numberColumnWidth(screen, RENT_WIDTH, groups.map(g => amountText(g.rate.unit_price)));
  const labourWidth = numberColumnWidth(screen, LABOUR_WIDTH, groups.map(g => amountText(g.rate.labour_rate)));
  const taxWidth = numberColumnWidth(screen, TAX_WIDTH, groups.map(g => taxText(g.rate.tax_percent)));
  // The table has no chevron column: the item column starts at the row's edge.
  const layout = useStackedWhen(screen, crowded(rowWidth(screen), oneTime ? [rentWidth, taxWidth] : [rentWidth, labourWidth, taxWidth], 0, screen.scale));
  const stacked = layout.stacked;

  if (status === 'unavailable') {
    return fallbackRates && fallbackRates.length > 0 ? <GrnOnlyRates rates={fallbackRates} /> : null;
  }
  if (status === 'ready' && rates.length === 0) return null;

  return (
    <>
      <SectionHeader title={t('grn.rates.title')} />
      <View style={[table.card, own.card]} testID="grn-item-rates">
        {status === 'loading' ? (
          <View style={own.state} testID="grn-item-rates-loading">
            <ActivityIndicator size="small" color={th.brand.tint} />
            <Text style={table.secondary}>{t('grn.rates.loading')}</Text>
          </View>
        ) : null}
        {status === 'error' ? (
          <View style={own.error} testID="grn-item-rates-error">
            <Text style={table.secondary}>{t('grn.rates.itemRatesLoadError')}</Text>
            <Button type="secondary" onPress={() => void retry()} testID="grn-item-rates-retry">{t('grn.rates.tryAgain')}</Button>
          </View>
        ) : null}
        {status === 'ready' ? (
          <>
            <View style={table.headerRow} testID="grn-item-rates-header">
              <HeaderCell style={table.grow}>{t('grn.rates.colItem')}</HeaderCell>
              <HeaderCell numeric style={{ width: rentWidth }}>{t('grn.rates.colRent')}</HeaderCell>
              {!stacked && !oneTime ? <HeaderCell numeric style={{ width: labourWidth }}>{t('grn.rates.colLabour')}</HeaderCell> : null}
              {!stacked ? <HeaderCell numeric style={{ width: taxWidth }}>{t('grn.rates.colTax')}</HeaderCell> : null}
            </View>
            {groups.map(group => {
              const { rate } = group;
              const priced = rate.source !== null;
              const details = repeated.has(rate.item_id) ? formatWeightEach(group.weight) : null;
              // Stacked, labour and tax go under the item.
              const extra =
                stacked && priced
                  ? [oneTime ? null : t('pricing.row.labour', { amount: money(rate.labour_rate ?? 0) }), t('pricing.row.tax', { percent: taxText(rate.tax_percent) })]
                      .filter(Boolean)
                      .join(' · ')
                  : null;
              const under = [details, extra].filter(Boolean).join(' · ');
              const label = [
                group.item_name,
                details,
                priced ? t(SOURCE_LABEL[rate.source!]) : t('grn.rates.noRateSet'),
                rate.varies ? t('grn.rates.tagVaries') : null,
                priced ? t('grn.rates.rentAmount', { amount: money(rate.unit_price ?? 0) }) : null,
                priced && !oneTime ? t('pricing.row.labour', { amount: money(rate.labour_rate ?? 0) }) : null,
                priced ? t('pricing.row.tax', { percent: taxText(rate.tax_percent) }) : null,
              ]
                .filter(Boolean)
                .join(', ');
              const cells = (
                <>
                  <View style={table.grow}>
                    <Text style={canOpen ? table.link : table.primary}>{group.item_name}</Text>
                    {under ? <Text style={table.secondary}>{nb(under)}</Text> : null}
                    {!priced ? (
                      <View style={own.tags}>
                        <StatusTag status="critical" label={t('grn.rates.noRateSet')} />
                      </View>
                    ) : null}
                  </View>
                  <Text style={[table.number, { width: rentWidth }, !priced && own.missing]} {...ONE_LINE}>{amountText(rate.unit_price)}</Text>
                  {!stacked && !oneTime ? (
                    <Text style={[table.number, { width: labourWidth }, !priced && own.missing]} {...ONE_LINE}>{amountText(rate.labour_rate)}</Text>
                  ) : null}
                  {!stacked ? (
                    <Text style={[table.number, { width: taxWidth }, !priced && own.missing]} {...ONE_LINE}>{taxText(rate.tax_percent)}</Text>
                  ) : null}
                </>
              );
              return canOpen ? (
                <Pressable
                  key={group.key}
                  onPress={() => router.push(itemRatesPath(rate.item_id, grnDate ?? undefined, true))}
                  style={({ pressed }) => [table.row, pressed && table.rowPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityHint={t('grn.rates.opensItemRates')}
                  testID="grn-item-rate-row"
                >
                  {cells}
                </Pressable>
              ) : (
                <View key={group.key} style={table.row} accessible accessibilityLabel={label} testID="grn-item-rate-row">
                  {cells}
                </View>
              );
            })}
            <View style={own.note}>
              <Text style={table.secondary} testID="grn-item-rates-note">
                {t(oneTime ? 'grn.rates.tableNoteOneTime' : 'grn.rates.tableNoteMonthly')}
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </>
  );
}

export default GrnItemRates;
