/**
 * One dispatch line as a small card (large text or a narrow screen), in the style of the rate box's band cards.
 * Each field is a row: the input takes the rest of the width and its + above − (LineStepper) sits at its right.
 */
import React, { useCallback, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { formatIdentifier, t as tr } from '@/i18n';
import { space, touchTarget } from '@/theme/tokens';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import type { InvoiceItemData } from '@/types/invoice.types';
import { RateInput } from './RateInput';
import { LineStepper } from './LineStepper';
import { lineSubline } from './LineRow';
import { cellKey, cellLabel, fieldHeading, rateText, type FieldState, type ItemsActions, type RateField } from './itemsModel';
import type { ItemsStyles } from './itemsStyles';

interface Props {
  item: InvoiceItemData;
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

/** The text input itself is at least a touch target tall (the field's frame alone is not what a finger meets). */
const FIELD_INPUT = { minHeight: touchTarget };
/** The input and its + above − in one row: the input takes the rest of the width, the pair keeps one touch target. */
const FIELD_ROW = { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: space.xs, marginBottom: space.lg };
const FIELD_CONTAINER = { flex: 1, minWidth: 0, marginBottom: 0 };
/** The pair is two touch targets tall; the input is one. */
const PAIR_OVERHANG = touchTarget / 2;

/**
 * The row of one field: the input (its label above it, drawn by the field) and the pair at its right. The label is taller
 * at large text, so the pair is moved down by the label's measured height (and up by the half the pair is taller than the
 * input), which keeps it centred on the input and not beside the label. The field's label, spoken label, error line and hint are the field's own.
 */
function FieldRow({ stepper, children }: { stepper: React.ReactNode; children: (onLabelLayout: (event: LayoutChangeEvent) => void) => React.ReactNode }) {
  const [labelBlock, setLabelBlock] = useState(0);
  const onLabelLayout = useCallback((event: LayoutChangeEvent) => {
    // The label's height plus the gap the field leaves under it.
    const next = Math.round(event.nativeEvent.layout.height + space.xs);
    setLabelBlock((old) => (old === next ? old : next));
  }, []);
  return (
    <View style={FIELD_ROW}>
      {children(onLabelLayout)}
      <View style={{ marginTop: Math.max(0, labelBlock - PAIR_OVERHANG) }}>{stepper}</View>
    </View>
  );
}

export const LineCard = React.memo(function LineCard({ item, perLine, oneTime, last, charge, labour, tax, lastKey, actions, styles }: Props) {
  const number = formatIdentifier(item.dispatch_no);
  const field = (name: RateField, state: FieldState | undefined) => {
    const key = cellKey(item.temp_id, name);
    return (
      // The key is on this wrapper (line and field): a recycled row gets a new input, with no focus ring or clear icon carried over.
      <FieldRow
        key={key}
        stepper={<LineStepper tempId={item.temp_id} dispatchNo={item.dispatch_no} field={name} rate={item[name]} state={state} actions={actions} />}
      >
        {(onLabelLayout) => (
        <RateInput
          ref={actions.refFor(key)}
          label={fieldHeading(name)}
          numeric
          selectTextOnFocus
          keyboardType="decimal-pad"
          returnKeyType={key === lastKey ? 'done' : 'next'}
          inputStyle={FIELD_INPUT}
          containerStyle={FIELD_CONTAINER}
          onLabelLayout={onLabelLayout}
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
        )}
      </FieldRow>
    );
  };
  const names: RateField[] = perLine ? (oneTime ? ['charge', 'tax'] : ['charge', 'labour_rate', 'tax']) : ['charge'];
  const states = { charge, labour_rate: labour, tax };
  const card = (
    <View style={styles.card} testID={`card-${item.temp_id}`}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{tr('invoice.label.dispatchNumber', { number: formatIdentifier(item.dispatch_no) })}</Text>
        <Text style={styles.totalValue} numberOfLines={1}>{formatInvoiceAmount(item.item_total)}</Text>
      </View>
      <Text style={styles.secondary}>{lineSubline(item, oneTime)}</Text>
      {names.map((name) => field(name, states[name]))}
    </View>
  );
  return last ? (
    <View style={styles.bottomGap}>
      <View style={styles.bottom}>{card}</View>
    </View>
  ) : (
    <View style={[styles.side, styles.rowDivider]}>{card}</View>
  );
});
