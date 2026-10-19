/**
 * One dispatch line of a group, as a row of the line table (lineColumns.ts), which scrolls sideways: the pinned Dispatch cell
 * (the dispatch number) and, in a `SidewaysViewport` shared with the heading and the other rows of the card, Date | Months |
 * Days | Qty | Charge | Labour | Tax | Amount. Date, Months, Days, Qty and Amount are read-only. The Charge is typed in its cell
 * (`EditableNumberCell`); Labour and Tax are cells too only on a card whose lines differ in them (`perLine`), else read-only
 * figures, set from the card's "All dispatches" row. A line has no + / − (those are the "All dispatches" row's, and the line cards').
 * The row is a part of the page's virtualized list, so only the rows on screen are drawn, however many lines the card has.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { EditableNumberCell } from '@/components/table/EditableNumberCell';
import { formatIdentifier, localizeDigits } from '@/i18n';
import { useTokens } from '@/hooks/useTheme';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import type { InvoiceItemData } from '@/types/invoice.types';
import { columnInset, type LineColumn, type LineTable } from './lineColumns';
import { lineDate, lineDays, lineMonths, lineQty } from './lineText';
import { SidewaysViewport, type TableScroll } from './SidewaysViewport';
import { cellKey, cellLabel, rateText, type FieldState, type ItemsActions, type RateField } from './itemsModel';
import type { ItemsStyles } from './itemsStyles';

export { lineMeta, lineSubline } from './lineText';

interface Props {
  item: InvoiceItemData;
  groupKey: string;
  /** The columns of the table: the pinned Dispatch column and the scrolling ones, with their widths. */
  table: LineTable;
  /** The card's sideways position, shared by its heading and rows. */
  scroll: TableScroll;
  /** The lines differ in labour or tax: Labour and Tax are cells of the line; otherwise read-only figures. */
  perLine: boolean;
  oneTime: boolean;
  /** The last part of the group's card: it draws the card's bottom edge. */
  last: boolean;
  charge?: FieldState;
  labour?: FieldState;
  tax?: FieldState;
  /** The last field of the page: its keyboard key is "done", every other one's is "next". */
  lastKey?: string;
  actions: ItemsActions;
  styles: ItemsStyles;
}

export const LineRow = React.memo(function LineRow({ item, groupKey, table, scroll, perLine, oneTime, last, charge, labour, tax, lastKey, actions, styles }: Props) {
  const t = useTokens();
  const number = formatIdentifier(item.dispatch_no);
  const states = { charge, labour_rate: labour, tax };
  const cell = (column: LineColumn, field: RateField, state: FieldState | undefined) => {
    const key = cellKey(item.temp_id, field);
    const shownError = state?.shown ? state.error ?? undefined : undefined;
    return (
      // The key is on this wrapper: the cell belongs to this line's field, so a recycled row gets a new one.
      // The cell stretches to the column's height (its whole height is the touch area; its own grow style centres the input).
      <View key={key} style={[styles.columnBox, styles.cellBox, { width: column.width }]}>
        <EditableNumberCell
          boxed
          // The focus ring belongs to this line's cell.
          ref={actions.refFor(key)}
          returnKeyType={key === lastKey ? 'done' : 'next'}
          value={state?.text ?? rateText(field, item[field])}
          onChangeText={(text) => actions.change(key, text)}
          onHold={(held) => actions.hold(key, held)}
          onStart={() => actions.start(key)}
          onFocus={() => actions.focus(key)}
          onBlur={() => actions.blur(key)}
          onSubmitEditing={() => actions.submit(key)}
          label={cellLabel(field, number, oneTime)}
          error={shownError}
          testID={key}
        />
      </View>
    );
  };
  const figure = (column: LineColumn, text: string, strong = false) => (
    <View key={column.id} style={[styles.columnBox, { width: column.width }]}>
      <Text style={[strong ? styles.numberStrong : styles.number, styles.figureText, { paddingRight: columnInset(column.id) }]} numberOfLines={1}>{text}</Text>
    </View>
  );
  const cells = table.scrolling.map((column) => {
    switch (column.id) {
      case 'date':
        return (
          <View key={column.id} style={[styles.columnBox, { width: column.width }]}>
            <Text style={styles.columnText} numberOfLines={1}>{lineDate(item)}</Text>
          </View>
        );
      case 'duration':
        if (!oneTime) return figure(column, lineMonths(item, oneTime));
        return (
          <View key={column.id} style={[styles.columnBox, { width: column.width }]}>
            <Text style={styles.columnText} numberOfLines={1}>{lineMonths(item, oneTime)}</Text>
          </View>
        );
      case 'days':
        return figure(column, lineDays(item));
      case 'qty':
        return figure(column, lineQty(item));
      case 'amount':
        return figure(column, formatInvoiceAmount(item.item_total), true);
      case 'charge':
        return cell(column, 'charge', charge);
      case 'labour_rate':
      case 'tax':
        return perLine ? cell(column, column.id, states[column.id]) : figure(column, localizeDigits(rateText(column.id, item[column.id])));
      default:
        return null;
    }
  });
  const errors = [charge, perLine ? labour : undefined, perLine ? tax : undefined].map((state) => (state?.shown ? state.error : null)).filter(Boolean);
  const body = (
    <>
      {/* Keyed by the card: a row the list recycles for another card gets that card's scroll. */}
      <SidewaysViewport
        key={groupKey}
        scroll={scroll}
        content={table.content}
        fill={t.surface.card}
        rowStyle={styles.tableRow}
        testID={`line-${item.temp_id}`}
        pinned={
          <View style={[styles.pinnedBox, { width: table.pinned.width }]}>
            <Text style={styles.primaryStrong} numberOfLines={1}>{item.dispatch_no}</Text>
          </View>
        }
      >
        {cells}
      </SidewaysViewport>
      {errors.length > 0 ? <Text style={styles.error} accessibilityRole="alert">{String(errors[0])}</Text> : null}
    </>
  );
  return last ? (
    <View style={styles.bottomGap}>
      <View style={styles.bottom}>{body}</View>
    </View>
  ) : (
    <View style={[styles.side, styles.rowDivider]}>{body}</View>
  );
});
