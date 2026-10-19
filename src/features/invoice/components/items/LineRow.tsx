/** One dispatch line of a group, as a row of the table: Dispatch | Qty | Charge | (Labour | Tax) | Amount. */
import React from 'react';
import { Text, View } from 'react-native';
import { EditableNumberCell } from '@/components/table/EditableNumberCell';
import { nb } from '@/components/common/DetailTable';
import { formatIdentifier, t as tr } from '@/i18n';
import { formatCount, formatDate, formatNumber } from '@/utils/formatters';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import type { InvoiceItemData } from '@/types/invoice.types';
import type { ItemsWidths } from './itemsLayout';
import { cellKey, cellLabel, rateText, type FieldState, type ItemsActions, type RateField } from './itemsModel';
import type { ItemsStyles } from './itemsStyles';
import { responderLog } from './responderLog';

/** "9 Oct · 1.6 months · 48 days", or "9 Oct · One-time". */
export const lineMeta = (item: InvoiceItemData, oneTime: boolean): string => {
  const date = formatDate(item.dispatch_date, 'short');
  if (oneTime) return nb(`${date} · ${tr('invoice.items.oneTime')}`);
  return nb(`${date} · ${formatCount(Math.round(item.duration * 10) / 10, 'month')} · ${formatCount(item.no_of_days, 'day')}`);
};

interface Props {
  item: InvoiceItemData;
  widths: ItemsWidths;
  perLine: boolean;
  oneTime: boolean;
  charge?: FieldState;
  labour?: FieldState;
  tax?: FieldState;
  /** The last field of the page: its keyboard key is "done", every other one's is "next". */
  lastKey?: string;
  actions: ItemsActions;
  styles: ItemsStyles;
}

export const LineRow = React.memo(function LineRow({ item, widths, perLine, oneTime, charge, labour, tax, lastKey, actions, styles }: Props) {
  const number = formatIdentifier(item.dispatch_no);
  const cell = (field: RateField, state: FieldState | undefined, width: number) => {
    const key = cellKey(item.temp_id, field);
    const shownError = state?.shown ? state.error ?? undefined : undefined;
    return (
      <EditableNumberCell
        // The focus ring belongs to this line's cell: a recycled row gets a new cell, never a carried one.
        key={key}
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
        width={width}
        testID={key}
      />
    );
  };
  const errors = [charge, labour, tax].map((state) => (state?.shown ? state.error : null)).filter(Boolean);
  return (
    <View style={[styles.side, styles.rowDivider]}>
      <View style={styles.row} testID={`line-${item.temp_id}`} {...responderLog('line')}>
        <View style={styles.grow}>
          <Text style={styles.primaryStrong} numberOfLines={1}>{item.dispatch_no}</Text>
          <Text style={styles.secondary}>{lineMeta(item, oneTime)}</Text>
        </View>
        <Text style={[styles.number, { width: widths.qty }]} numberOfLines={1}>{formatNumber(item.qty)}</Text>
        {cell('charge', charge, widths.charge)}
        {perLine && !oneTime ? cell('labour_rate', labour, widths.labour) : null}
        {perLine ? cell('tax', tax, widths.tax) : null}
        <Text style={[styles.numberStrong, { width: widths.amount }]} numberOfLines={1}>{formatInvoiceAmount(item.item_total)}</Text>
      </View>
      {errors.length > 0 ? <Text style={styles.error} accessibilityRole="alert">{String(errors[0])}</Text> : null}
    </View>
  );
});
