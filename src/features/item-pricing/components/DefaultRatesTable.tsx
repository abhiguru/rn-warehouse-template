/**
 * "View default rate" on the Add customer rate form: Band | Rent | Labour | Tax %, one row per band of the item's default
 * rate in force today, set against the figures typed above it. Built on the app's TanStack Table setup
 * (`components/table/appTable`, `useAppTable`) and drawn by the shared `DataTable` (nested variant), style guide §13.7.
 */
import React, { useMemo } from 'react';
import { Text } from 'react-native';
import { ONE_LINE, makeTableStyles } from '@/components/common/DetailTable';
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { DataTable } from '@/components/table/DataTable';
import { useThemedStyles } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { bandText } from '../rateText';
import type { BandRow } from './BandList';

const defaultColumn = createAppColumnHelper<BandRow>();
/** The width of a figure column of the default rate table. */
const DEFAULT_FIGURE_WIDTH = 64;

/** "View default rate": Band | Rent | Labour | Tax %, one row per band of the item's default rate in force today. */
export function DefaultRatesTable({ bands, oneTime }: { bands: BandRow[]; oneTime: boolean }) {
  const table = useThemedStyles(makeTableStyles);
  const columns = useMemo(() => {
    const figure = (id: string, header: string, text: (b: BandRow) => string) =>
      defaultColumn.display({
        id,
        header,
        meta: { width: DEFAULT_FIGURE_WIDTH, numeric: true },
        cell: ({ row }) => <Text style={table.number} {...ONE_LINE}>{text(row.original)}</Text>,
      });
    return defaultColumn.columns([
      defaultColumn.display({
        id: 'band',
        header: t('pricing.addForm.refBand'),
        meta: { width: 'grow' },
        cell: ({ row }) => <Text style={table.primary} {...ONE_LINE}>{bandText(row.original.weight_min, row.original.weight_max)}</Text>,
      }),
      figure('rent', t('pricing.addForm.refRent'), b => localizeDigits(Number(b.unit_price).toFixed(2))),
      ...(oneTime ? [] : [figure('labour', t('pricing.addForm.refLabour'), b => localizeDigits(Number(b.labour_rate).toFixed(2)))]),
      figure('tax', t('pricing.addForm.refTax'), b => localizeDigits(String(Number(b.tax_percent)))),
    ]);
  }, [oneTime, table]);
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
