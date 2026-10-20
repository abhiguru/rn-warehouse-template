/**
 * "View default rate" on the Add customer rate form: Band | Rent | Labour | Tax %, one row per band of the item's default
 * rate in force today, set against the figures typed above it. Built on the app's TanStack Table setup
 * (`components/table/appTable`, `useAppTable`) and drawn by the shared `DataTable` (nested variant), style guide §13.7.
 */
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { ONE_LINE, crowded, makeTableStyles, nb, nestedRowWidth, numberColumnWidth, useStackedWhen, useTableLayout } from '@/components/common/DetailTable';
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { DataTable } from '@/components/table/DataTable';
import { useThemedStyles } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { typography } from '@/theme/tokens';
import { bandText } from '../rateText';
import type { BandRow } from './BandList';

const defaultColumn = createAppColumnHelper<BandRow>();
/** The width of a figure column of the default rate table. */
const DEFAULT_FIGURE_WIDTH = 64;

/** "View default rate": Band | Rent | Labour | Tax %, one row per band of the item's default rate in force today. */
export function DefaultRatesTable({ bands, oneTime }: { bands: BandRow[]; oneTime: boolean }) {
  const table = useThemedStyles(makeTableStyles);
  const screen = useTableLayout();
  // Each figure column is as wide as its widest value or its heading at the current text size (rents go to 9999.99).
  const headingSize = typography.footnote.fontSize ?? 13;
  const widthOf = (heading: string, values: string[]) =>
    Math.max(numberColumnWidth(screen, DEFAULT_FIGURE_WIDTH, values), numberColumnWidth(screen, 0, [heading], [], headingSize));
  const rentText = (b: BandRow) => localizeDigits(Number(b.unit_price).toFixed(2));
  const labourText = (b: BandRow) => localizeDigits(Number(b.labour_rate).toFixed(2));
  const taxText = (b: BandRow) => localizeDigits(String(Number(b.tax_percent)));
  const rentWidth = widthOf(t('pricing.addForm.refRent'), bands.map(rentText));
  const labourWidth = widthOf(t('pricing.addForm.refLabour'), bands.map(labourText));
  const taxWidth = widthOf(t('pricing.addForm.refTax'), bands.map(taxText));
  // At large text the columns no longer fit: Rent stays the one figure column, labour and tax go under the band.
  const stacked = useStackedWhen(
    screen,
    crowded(nestedRowWidth(screen), [rentWidth, ...(oneTime ? [] : [labourWidth]), taxWidth], 0, screen.scale),
  ).stacked;
  const columns = useMemo(() => {
    const figure = (id: string, header: string, width: number, text: (b: BandRow) => string) =>
      defaultColumn.display({
        id,
        header,
        meta: { width, numeric: true },
        cell: ({ row }) => <Text style={table.number} {...ONE_LINE}>{text(row.original)}</Text>,
      });
    return defaultColumn.columns([
      defaultColumn.display({
        id: 'band',
        header: t('pricing.addForm.refBand'),
        meta: { width: 'grow' },
        cell: ({ row }) => {
          const under = stacked
            ? [
                oneTime ? null : t('pricing.row.labour', { amount: labourText(row.original) }),
                t('pricing.row.tax', { percent: taxText(row.original) }),
              ].filter(Boolean).join(' · ')
            : '';
          return (
            <View>
              <Text style={table.primary} {...(stacked ? {} : ONE_LINE)}>{bandText(row.original.weight_min, row.original.weight_max)}</Text>
              {under ? <Text style={table.secondary}>{nb(under)}</Text> : null}
            </View>
          );
        },
      }),
      figure('rent', t('pricing.addForm.refRent'), rentWidth, rentText),
      ...(oneTime || stacked ? [] : [figure('labour', t('pricing.addForm.refLabour'), labourWidth, labourText)]),
      ...(stacked ? [] : [figure('tax', t('pricing.addForm.refTax'), taxWidth, taxText)]),
    ]);
    // The texts are functions of the bands; the widths say when they change.
  }, [oneTime, stacked, table, rentWidth, labourWidth, taxWidth]);
  const tanstack = useAppTable({ columns, data: bands, getRowId: b => b.id });

  return (
    <DataTable
      table={tanstack}
      variant="nested"
      rowLabel={row =>
        t(oneTime ? 'pricing.addForm.refA11yOneTime' : 'pricing.addForm.refA11y', {
          band: bandText(row.original.weight_min, row.original.weight_max),
          rent: Number(row.original.unit_price).toFixed(2),
          labour: Number(row.original.labour_rate).toFixed(2),
          tax: localizeDigits(String(Number(row.original.tax_percent))),
        })
      }
      rowTestID={row => `add-rate-default-${row.index}`}
    />
  );
}

export default DefaultRatesTable;
