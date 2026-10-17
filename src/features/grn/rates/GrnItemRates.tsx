/**
 * "Rates" on the Overview tab of the GRN details screen (backend migration 88): for every item and bag
 * weight, the rate this GRN is invoiced at and where it comes from, as a table in the object-page style
 * (docs/STYLE_GUIDE.md §13.7, common/DetailTable): Item | Rent (₹) | Labour (₹) | Tax (%), the units in
 * the headings and a note under the rows. A one-time GRN has no Labour column. At large text, or when
 * the numbers would crowd the item column, labour and tax move under the item. Lots with the same item,
 * weight and figures share a row. Falls back to the GRN-only rates when the server lacks the function.
 *
 * Owner, 2026-10-16: the item cell holds only the name (the weight of one bag only when an item has
 * more than one row, to tell them apart). The table is the GRN's applicable rates; for more, an
 * administrator or supervisor taps a row and lands where that rate lives (owner, 2026-10-16), by the
 * row's source: 'item' (the item's default rate) opens the item's page in Item pricing, today's rates
 * (no day, so no "You're looking at..." section); 'customer' (the customer's own rate) opens the
 * customer's Pricing tab on that item's box; 'grn' (typed on this GRN only) opens the GRN's edit on its
 * Review step, scrolled to the Rates block where that rate is set (owner, 2026-10-17; only when the person
 * may edit the GRN); 'invoice' (taken from an invoice) and a row without a rate are plain rows, not links.
 * Back returns to the GRN. Staff get the table only (no link to the price list). A customer's row opens
 * "Your rate" (app/grn-rate): only the rate their lots are invoiced at, never the item's default or
 * anyone else's, and their screen-reader label names no source either.
 *
 * Built on the app's TanStack Table setup (`components/table/appTable`, `useAppTable`). The rows are drawn here and not by
 * `DataTable`: this table is the card itself (loading and error states, the note under the rows), a row is a link
 * with its own press target, and the card sits in the Overview's padding with no margins of its own.
 */
import React, { useCallback, useMemo } from 'react';
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
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { Button } from '@/components/ui/Button';
import { StatusTag } from '@/components/ui';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { isManager } from '@/config/roles';
import { customerPricingPath, itemRatesPath } from '@/features/item-pricing/contract';
import { useAppSelector } from '@/store/hooks';
import { localizeDigits, t } from '@/i18n';
import { money } from '@/features/item-pricing/rateText';
import { space, type ThemeTokens } from '@/theme/tokens';
import { formatNumber, formatWeightEach } from '@/utils/formatters';
import type { RpcGrnItemRate, RpcGrnRate } from '@/types/rpc-canonical.types';
import { GrnOnlyRates } from './GrnOnlyRates';
import { useGrnItemRates } from './useGrnItemRates';
import { grnRatesStepPath, yourRatePath } from './paths';

/** Column widths at font scale 1; each grows with its widest value. */
export const RENT_WIDTH = 56;
export const LABOUR_WIDTH = 56;
export const TAX_WIDTH = 40;

const makeStyles = (th: ThemeTokens) => ({
  /** The table card inside the Overview's padded content: no margins of its own. */
  card: { marginHorizontal: 0, marginTop: 0, marginBottom: space.md },
  tags: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.xs, alignItems: 'center' as const, marginTop: space.xs },
  state: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, padding: space.md },
  error: { gap: space.sm, padding: space.md },
  note: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md },
  missing: { color: th.text.secondary },
});

const rateColumn = createAppColumnHelper<RateGroup>();

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
export const amountText = (value: number | null): string => (value === null ? '—' : formatNumber(value, 2));
/** A tax cell: "18" or "12.5" (the % is in the heading); "—" without a rate. */
export const taxText = (value: number | null): string => (value === null ? '—' : localizeDigits(String(value)));

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

export interface GrnItemRatesProps {
  grnId?: string | null;
  grnNumber?: string | null;
  /** The GRN's customer: where a manager's tap on a 'customer' rate goes (its Pricing tab). */
  customerId?: string | null;
  /** The customer's name, for the hint of that tap. */
  customerName?: string | null;
  /** The person may edit this GRN: a manager's tap on a rate typed on this GRN opens its Rates block. */
  canEdit?: boolean;
  fallbackRates?: RpcGrnRate[] | null;
}

export function GrnItemRates({ grnId, grnNumber, customerId, customerName, canEdit = false, fallbackRates }: GrnItemRatesProps) {
  const table = useThemedStyles(makeTableStyles);
  const own = useThemedStyles(makeStyles);
  const th = useTokens();
  const screen = useTableLayout();
  const { rates, priceType, status, retry } = useGrnItemRates(grnId);
  const role = useAppSelector(state => state.auth?.userProfile?.role);
  // Administrators and supervisors open the rate's home (see the header); staff get no link to the
  // price list; a customer's priced rows open "Your rate".
  const manager = isManager(role);
  const isCustomer = role === 'customer';
  const oneTime = priceType === 'one_time';
  const groups = useMemo(() => groupRates(rates), [rates]);
  const repeated = useMemo(() => repeatedItems(groups), [groups]);

  const rentWidth = numberColumnWidth(screen, RENT_WIDTH, groups.map(g => amountText(g.rate.unit_price)));
  const labourWidth = numberColumnWidth(screen, LABOUR_WIDTH, groups.map(g => amountText(g.rate.labour_rate)));
  const taxWidth = numberColumnWidth(screen, TAX_WIDTH, groups.map(g => taxText(g.rate.tax_percent)));
  // The table has no chevron column: the item column starts at the row's edge.
  const layout = useStackedWhen(screen, crowded(rowWidth(screen), oneTime ? [rentWidth, taxWidth] : [rentWidth, labourWidth, taxWidth], 0, screen.scale));
  const stacked = layout.stacked;

  /** What a row shows and does: where a tap goes, the text under the item, and what a screen reader says. */
  const describe = useCallback(
    (group: RateGroup) => {
      const { rate } = group;
      const priced = rate.source !== null;
      const opensYourRate = isCustomer && priced && !!grnId;
      const managerTarget: 'item' | 'customer' | 'grn' | null = !manager
        ? null
        : rate.source === 'item'
          ? 'item'
          : rate.source === 'customer' && customerId
            ? 'customer'
            : rate.source === 'grn' && canEdit && grnId
              ? 'grn'
              : null;
      const link = managerTarget !== null || opensYourRate;
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
        // A customer is never told where the rate comes from (default, customer or GRN rate).
        priced ? (isCustomer ? null : t(SOURCE_LABEL[rate.source!])) : t('grn.rates.noRateSet'),
        rate.varies ? t('grn.rates.tagVaries') : null,
        priced ? t('grn.rates.rentAmount', { amount: money(rate.unit_price ?? 0) }) : null,
        priced && !oneTime ? t('pricing.row.labour', { amount: money(rate.labour_rate ?? 0) }) : null,
        priced ? t('pricing.row.tax', { percent: taxText(rate.tax_percent) }) : null,
      ]
        .filter(Boolean)
        .join(', ');
      return { priced, managerTarget, link, under, label };
    },
    [isCustomer, manager, grnId, customerId, canEdit, repeated, stacked, oneTime],
  );

  const columns = useMemo(
    () =>
      rateColumn.columns([
        rateColumn.display({
          id: 'item',
          header: t('grn.rates.colItem'),
          meta: { width: 'grow' },
          cell: ({ row }) => {
            const { priced, link, under } = describe(row.original);
            return (
              <View style={table.grow}>
                <Text style={link ? table.link : table.primary}>{row.original.item_name}</Text>
                {under ? <Text style={table.secondary}>{nb(under)}</Text> : null}
                {!priced ? (
                  <View style={own.tags}>
                    <StatusTag status="critical" label={t('grn.rates.noRateSet')} />
                  </View>
                ) : null}
              </View>
            );
          },
        }),
        rateColumn.display({
          id: 'rent',
          header: t('grn.rates.colRent'),
          meta: { width: rentWidth, numeric: true },
          cell: ({ row }) => (
            <Text style={[table.number, { width: rentWidth }, row.original.rate.source === null && own.missing]} {...ONE_LINE}>{amountText(row.original.rate.unit_price)}</Text>
          ),
        }),
        ...(!stacked && !oneTime
          ? [
              rateColumn.display({
                id: 'labour',
                header: t('grn.rates.colLabour'),
                meta: { width: labourWidth, numeric: true },
                cell: ({ row }) => (
                  <Text style={[table.number, { width: labourWidth }, row.original.rate.source === null && own.missing]} {...ONE_LINE}>{amountText(row.original.rate.labour_rate)}</Text>
                ),
              }),
            ]
          : []),
        ...(!stacked
          ? [
              rateColumn.display({
                id: 'tax',
                header: t('grn.rates.colTax'),
                meta: { width: taxWidth, numeric: true },
                cell: ({ row }) => (
                  <Text style={[table.number, { width: taxWidth }, row.original.rate.source === null && own.missing]} {...ONE_LINE}>{taxText(row.original.rate.tax_percent)}</Text>
                ),
              }),
            ]
          : []),
      ]),
    [describe, table, own, stacked, oneTime, rentWidth, labourWidth, taxWidth],
  );
  const tanstack = useAppTable({ columns, data: groups, getRowId: group => group.key });

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
            {tanstack.getHeaderGroups().map(group => (
              <View key={group.id} style={table.headerRow} testID="grn-item-rates-header">
                {group.headers.map(h => {
                  const meta = h.column.columnDef.meta;
                  return (
                    <HeaderCell key={h.id} numeric={meta?.numeric} style={meta?.width === 'grow' ? table.grow : { width: meta?.width }}>
                      {h.column.columnDef.header as string}
                    </HeaderCell>
                  );
                })}
              </View>
            ))}
            {tanstack.getRowModel().rows.map(row => {
              const group = row.original;
              const { rate } = group;
              const { managerTarget, link, label } = describe(group);
              const cells = row.getAllCells().map(cell => <tanstack.FlexRender key={cell.id} cell={cell} />);
              return link ? (
                <Pressable
                  key={row.id}
                  onPress={() =>
                    router.push(
                      managerTarget === 'item'
                        ? itemRatesPath(rate.item_id)
                        : managerTarget === 'customer'
                          ? customerPricingPath(customerId as string, rate.item_id)
                          : managerTarget === 'grn'
                            ? grnRatesStepPath(grnId as string)
                            : yourRatePath(grnId as string, rate.item_id, grnNumber ?? undefined),
                    )
                  }
                  style={({ pressed }) => [table.row, pressed && table.rowPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityHint={
                    managerTarget === 'item'
                      ? t('grn.rates.opensItemPricing')
                      : managerTarget === 'customer'
                        ? t('grn.rates.opensCustomerPricing', { customer: customerName ?? t('common.customer') })
                        : managerTarget === 'grn'
                          ? t('grn.rates.opensGrnRates')
                          : t('grn.rates.opensYourRate')
                  }
                  testID="grn-item-rate-row"
                >
                  {cells}
                </Pressable>
              ) : (
                <View key={row.id} style={table.row} accessible accessibilityLabel={label} testID="grn-item-rate-row">
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
