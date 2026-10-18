/** One dispatch line as a small card (large text or a narrow screen), in the style of the rate box's band cards. */
import React from 'react';
import { Text, View } from 'react-native';
import { formatIdentifier, t as tr } from '@/i18n';
import { touchTarget } from '@/theme/tokens';
import { formatNumber } from '@/utils/formatters';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import type { InvoiceItemData } from '@/types/invoice.types';
import { RateInput } from './RateInput';
import { lineMeta } from './LineRow';
import { cellKey, cellLabel, fieldHeading, rateText, type FieldState, type ItemsActions, type RateField } from './itemsModel';
import type { ItemsStyles } from './itemsStyles';

interface Props {
  item: InvoiceItemData;
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

/** The text input itself is at least a touch target tall (the field's frame alone is not what a finger meets). */
const FIELD_INPUT = { minHeight: touchTarget };

export const LineCard = React.memo(function LineCard({ item, perLine, oneTime, charge, labour, tax, lastKey, actions, styles }: Props) {
  const number = formatIdentifier(item.dispatch_no);
  const field = (name: RateField, state: FieldState | undefined) => {
    const key = cellKey(item.temp_id, name);
    return (
      <RateInput
        // Keyed by line and field: a recycled row gets a new input, with no focus ring or clear icon carried over.
        key={key}
        ref={actions.refFor(key)}
        label={fieldHeading(name)}
        numeric
        selectTextOnFocus
        keyboardType="decimal-pad"
        returnKeyType={key === lastKey ? 'done' : 'next'}
        inputStyle={FIELD_INPUT}
        value={state?.text ?? rateText(name, item[name])}
        onChangeText={(text) => actions.change(key, text)}
        onFocus={() => actions.focus(key)}
        onBlur={() => actions.blur(key)}
        onSubmitEditing={() => actions.submit(key)}
        blurOnSubmit={false}
        error={state?.shown ? state.error ?? undefined : undefined}
        accessibilityLabel={cellLabel(name, number, oneTime)}
        testID={key}
      />
    );
  };
  const names: RateField[] = perLine ? (oneTime ? ['charge', 'tax'] : ['charge', 'labour_rate', 'tax']) : ['charge'];
  const states = { charge, labour_rate: labour, tax };
  return (
    <View style={[styles.side, styles.rowDivider]}>
      <View style={styles.card} testID={`card-${item.temp_id}`}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{tr('invoice.label.dispatchNumber', { number: formatIdentifier(item.dispatch_no) })}</Text>
          <Text style={styles.totalValue} numberOfLines={1}>{formatInvoiceAmount(item.item_total)}</Text>
        </View>
        <Text style={styles.secondary}>{`${lineMeta(item, oneTime)} · ${tr('invoice.items.qtyOf', { qty: formatNumber(item.qty) })}`}</Text>
        {names.map((name) => field(name, states[name]))}
      </View>
    </View>
  );
});
