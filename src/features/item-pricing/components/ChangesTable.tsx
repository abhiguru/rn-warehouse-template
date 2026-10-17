/**
 * "What changes" on the Add customer rate form, as a table (owner, 2026-10-17: the card of sentences looked thrown
 * together): a caption "What changes · from 17 Oct 2026", then Band | Rent | Labour | Tax %, one row per band of the
 * new rate. A figure that differs from the default rate's same band is bold in the accent colour, and TalkBack reads the
 * default beside it, so the difference is not carried by colour alone.
 *
 * Built on the app's TanStack Table setup (`components/table/appTable`, `useAppTable`) and drawn by the shared
 * `DataTable` (nested variant), as every detail table is (style guide §13.7).
 */
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { ONE_LINE, makeTableStyles } from '@/components/common/DetailTable';
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { DataTable } from '@/components/table/DataTable';
import { useThemedStyles } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { fontWeight, space, typography, type ThemeTokens } from '@/theme/tokens';

/** One band of the new rate, with the default's figures for the same band (null when the default has no such band). */
export interface ChangeRow {
  key: string;
  band: string;
  rent: number | null;
  labour: number | null;
  tax: number | null;
  defaultRent: number | null;
  defaultLabour: number | null;
  defaultTax: number | null;
}

const helper = createAppColumnHelper<ChangeRow>();
const NUMBER_WIDTH = 64;

const makeStyles = (th: ThemeTokens) => ({
  wrap: { gap: space.xs },
  caption: { ...typography.footnote, color: th.text.secondary },
  changed: { color: th.brand.tint, fontWeight: fontWeight.semibold },
});

const money = (n: number | null) => (n === null ? '—' : localizeDigits(n.toFixed(2)));
const percent = (n: number | null) => (n === null ? '—' : localizeDigits(String(n)));
const differs = (value: number | null, base: number | null) => value !== null && base !== null && value !== base;

interface Props {
  rows: ChangeRow[];
  /** The day the rate starts, as shown ("17 Oct 2026"). */
  from: string;
  oneTime: boolean;
}

export function ChangesTable({ rows, from, oneTime }: Props) {
  const styles = useThemedStyles(makeStyles);
  const table = useThemedStyles(makeTableStyles);

  const columns = useMemo(() => {
    const figure = (value: number | null, base: number | null, text: (n: number | null) => string) => (
      <Text style={[table.number, differs(value, base) && styles.changed]} {...ONE_LINE}>{text(value)}</Text>
    );
    return helper.columns([
      helper.accessor('band', {
        header: t('pricing.addForm.refBand'),
        meta: { width: 'grow' },
        cell: info => <Text style={table.primary} {...ONE_LINE}>{info.getValue()}</Text>,
      }),
      helper.accessor('rent', {
        header: t('pricing.addForm.refRent'),
        meta: { width: NUMBER_WIDTH, numeric: true },
        cell: info => figure(info.getValue(), info.row.original.defaultRent, money),
      }),
      ...(oneTime
        ? []
        : [
            helper.accessor('labour', {
              header: t('pricing.addForm.refLabour'),
              meta: { width: NUMBER_WIDTH, numeric: true },
              cell: info => figure(info.getValue(), info.row.original.defaultLabour, money),
            }),
          ]),
      helper.accessor('tax', {
        header: t('pricing.addForm.refTax'),
        meta: { width: NUMBER_WIDTH, numeric: true },
        cell: info => figure(info.getValue(), info.row.original.defaultTax, percent),
      }),
    ]);
  }, [oneTime, styles, table]);

  const tanstack = useAppTable({ columns, data: rows, getRowId: row => row.key });

  /** What TalkBack reads for a row: each figure, with the default beside a changed one. */
  const rowLabel = (r: ChangeRow) => {
    const part = (name: string, value: number | null, base: number | null, text: (n: number | null) => string) =>
      differs(value, base) ? t('pricing.addForm.changeFigureA11y', { name, value: text(value), dflt: text(base) }) : `${name} ${text(value)}`;
    return [
      r.band,
      part(t('pricing.addForm.refRent'), r.rent, r.defaultRent, money),
      ...(oneTime ? [] : [part(t('pricing.addForm.refLabour'), r.labour, r.defaultLabour, money)]),
      part(t('pricing.addForm.refTax'), r.tax, r.defaultTax, percent),
    ].join(', ');
  };

  return (
    <View style={styles.wrap} testID="add-rate-changes">
      <Text style={styles.caption} numberOfLines={1} accessibilityRole="header">{t('pricing.addForm.changesTitle', { date: from })}</Text>
      <DataTable
        table={tanstack}
        variant="nested"
        rowLabel={row => rowLabel(row.original)}
        rowTestID={row => `add-rate-change-${rows.indexOf(row.original)}`}
      />
    </View>
  );
}

export default ChangesTable;
