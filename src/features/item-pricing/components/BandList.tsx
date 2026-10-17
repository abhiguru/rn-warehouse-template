/** The weight bands of a rate: "Weight each" and the rent, with labour only when the bands differ in it. */
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { makeTableStyles, numberColumnWidth, useTableLayout } from '@/components/common/DetailTable';
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { DataTable } from '@/components/table/DataTable';
import { StatusTag } from '@/components/ui/StatusTag';
import { useThemedStyles } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import { bandText, money } from '../rateText';
import type { TierTag } from '../standardRate';

/** What a band row shows: a rate in force, or a rate set for one GRN only. */
export type BandRow = Pick<ItemStoragePrice, 'id' | 'weight_min' | 'weight_max' | 'unit_price' | 'labour_rate' | 'tax_percent'>;

export interface BandListProps {
  bands: BandRow[];
  priceType: PriceType;
  /** One tag per band ('Standard' or 'This item'), or none. Only a default monthly rate is tagged. */
  tags?: TierTag[] | null;
}

const bandColumn = createAppColumnHelper<BandRow>();

const makeStyles = (_th: ThemeTokens) => ({
  first: { gap: space.xxs },
});

/** 'Standard' (the tier equals one of the standard rate) or 'This item'. */
export function TierTagView({ tag, testID }: { tag: TierTag; testID?: string }) {
  return (
    <StatusTag
      status={tag === 'standard' ? 'informative' : 'neutral'}
      icon={null}
      label={tag === 'standard' ? t('pricing.standard.tagStandard') : t('pricing.standard.tagThisItem')}
      testID={testID}
    />
  );
}

export function BandList({ bands, priceType, tags }: BandListProps) {
  const styles = useThemedStyles(makeStyles);
  const table = useThemedStyles(makeTableStyles);
  const screen = useTableLayout();
  const showLabour = new Set(bands.map(b => b.labour_rate)).size > 1;
  const showTax = new Set(bands.map(b => b.tax_percent)).size > 1;
  const rentHeader = priceType === 'one_time' ? t('pricing.band.rentOnce') : t('pricing.band.rentMonthly');
  const labourHeader = t('pricing.item.labour');
  const taxHeader = t('pricing.item.tax');
  const taxText = (b: BandRow) => `${localizeDigits(String(b.tax_percent))}%`;

  // Each figure column is as wide as its widest value or its heading, at the current text size.
  const headingSize = typography.footnote.fontSize ?? 13;
  const widthOf = (heading: string, values: string[]) =>
    Math.max(numberColumnWidth(screen, 0, values), numberColumnWidth(screen, 0, [heading], [], headingSize));
  const rentWidth = widthOf(rentHeader, bands.map(b => money(b.unit_price)));
  const labourWidth = widthOf(labourHeader, bands.map(b => money(b.labour_rate)));
  const taxWidth = widthOf(taxHeader, bands.map(taxText));

  const columns = useMemo(
    () =>
      bandColumn.columns([
        bandColumn.display({
          id: 'band',
          header: t('pricing.band.weightEach'),
          meta: { width: 'grow' },
          cell: ({ row }) => {
            const tag = tags?.[row.index];
            return (
              <View style={styles.first}>
                <Text style={table.primary}>{bandText(row.original.weight_min, row.original.weight_max)}</Text>
                {tag ? <TierTagView tag={tag} testID={`band-tag-${row.index}`} /> : null}
              </View>
            );
          },
        }),
        bandColumn.display({
          id: 'rent',
          header: rentHeader,
          meta: { width: rentWidth, numeric: true },
          cell: ({ row }) => <Text style={table.numberStrong}>{money(row.original.unit_price)}</Text>,
        }),
        ...(showLabour
          ? [
              bandColumn.display({
                id: 'labour',
                header: labourHeader,
                meta: { width: labourWidth, numeric: true },
                cell: ({ row }) => <Text style={table.number}>{money(row.original.labour_rate)}</Text>,
              }),
            ]
          : []),
        ...(showTax
          ? [
              bandColumn.display({
                id: 'tax',
                header: taxHeader,
                meta: { width: taxWidth, numeric: true },
                cell: ({ row }) => <Text style={table.number}>{taxText(row.original)}</Text>,
              }),
            ]
          : []),
      ]),
    [tags, table, styles, rentHeader, labourHeader, taxHeader, showLabour, showTax, rentWidth, labourWidth, taxWidth]
  );
  const tanstack = useAppTable({ columns, data: bands, getRowId: b => b.id });

  /** What a screen reader says for a band: its weights, each figure under its name, and its tag. */
  const rowLabel = (b: BandRow, index: number) => {
    const tag = tags?.[index];
    return [
      bandText(b.weight_min, b.weight_max),
      `${rentHeader} ${money(b.unit_price)}`,
      showLabour ? t('pricing.row.labour', { amount: money(b.labour_rate) }) : null,
      showTax ? t('pricing.row.tax', { percent: localizeDigits(String(b.tax_percent)) }) : null,
      tag ? (tag === 'standard' ? t('pricing.standard.tagStandard') : t('pricing.standard.tagThisItem')) : null,
    ]
      .filter(Boolean)
      .join(', ');
  };

  return <DataTable table={tanstack} variant="nested" testID="band-list" rowLabel={row => rowLabel(row.original, row.index)} />;
}
