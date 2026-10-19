/** The column headings (with the hint under them) and the total row of a group's card. */
import React from 'react';
import { Text, View } from 'react-native';
import { t as tr } from '@/i18n';
import { formatCount } from '@/utils/formatters';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { CELL_CHROME, type ItemsWidths } from './itemsLayout';
import { fieldHeading } from './itemsModel';
import type { ItemsStyles } from './itemsStyles';

interface ColumnsProps {
  groupKey: string;
  widths: ItemsWidths;
  perLine: boolean;
  oneTime: boolean;
  styles: ItemsStyles;
}

export const ColumnHeadings = React.memo(function ColumnHeadings({ groupKey, widths, perLine, oneTime, styles }: ColumnsProps) {
  const cell = (text: string, width: number, chrome = 0) => (
    <Text style={[styles.headerNumber, { width, paddingRight: chrome }]} numberOfLines={1}>{text}</Text>
  );
  return (
    <View style={styles.side} testID={`cols-${groupKey}`}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerText, styles.grow]} numberOfLines={1}>{tr('common.dispatch')}</Text>
        {cell(tr('invoice.lineItem.colQty'), widths.qty)}
        {cell(fieldHeading('charge'), widths.charge, CELL_CHROME / 2)}
        {perLine && !oneTime ? cell(fieldHeading('labour_rate'), widths.labour, CELL_CHROME / 2) : null}
        {perLine ? cell(fieldHeading('tax'), widths.tax, CELL_CHROME / 2) : null}
        {cell(tr('invoice.items.colAmount'), widths.amount)}
      </View>
      <Text style={styles.hint}>{tr('invoice.items.hint')}</Text>
    </View>
  );
});

interface TotalProps {
  groupKey: string;
  lines: number;
  total: number;
  styles: ItemsStyles;
}

export const GroupTotal = React.memo(function GroupTotal({ groupKey, lines, total, styles }: TotalProps) {
  const dispatches = formatCount(lines, 'dispatch', 'dispatches');
  const totalText = formatInvoiceAmount(total);
  return (
    <View style={styles.bottomGap} testID={`group-total-${groupKey}`}>
      <View
        style={[styles.bottom, styles.totalRow]}
        accessible
        accessibilityLabel={tr('invoice.items.groupTotalA11y', { dispatches, total: totalText })}
      >
        <Text style={styles.totalLabel}>{tr('invoice.items.groupTotal', { dispatches })}</Text>
        <Text style={styles.totalValue} numberOfLines={1}>{totalText}</Text>
      </View>
    </View>
  );
});
