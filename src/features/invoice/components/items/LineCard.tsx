/**
 * One dispatch line as a small card, shown only while a screen reader (TalkBack) is on (the lines are otherwise the sideways-scrolling table, LineRow.tsx), in the style of the rate box's band cards.
 * Each editable figure (Charge, and Labour except in a one-time GRN; there is no Tax here, tax is set in "All dispatches") is its label, then one row: a short input sized for the largest figure expected (itemsLayout's
 * `lineInputs`, no clear button) and, right after it, + then − side by side (LineStepper, inline). The rest of the row is empty.
 */
import React, { useCallback, useState } from 'react';
import { Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { INLINE_PAIR_WIDTH } from '@/components/fiori/StepperInput';
import { formatIdentifier, t as tr } from '@/i18n';
import { space, touchTarget, typography } from '@/theme/tokens';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import type { InvoiceItemData } from '@/types/invoice.types';
import { RateInput } from './RateInput';
import { LineStepper } from './LineStepper';
import { lineSubline } from './lineText';
import { cellKey, cellLabel, fieldHeading, rateText, type FieldState, type ItemsActions } from './itemsModel';
import type { ItemsStyles } from './itemsStyles';
import type { LineInputWidths } from './itemsLayout';

/** The fields of a line card: tax has none (it is set in "All dispatches"). */
type LineCardField = 'charge' | 'labour_rate';

interface Props {
  item: InvoiceItemData;
  oneTime: boolean;
  /** The last part of the group's card: it draws the card's bottom edge. */
  last: boolean;
  charge?: FieldState;
  labour?: FieldState;
  /** The last field of the page: its keyboard key is "done", every other one's is "next". */
  lastKey?: string;
  /** The widths of the short inputs (the step's layout). */
  inputWidths: LineInputWidths;
  actions: ItemsActions;
  styles: ItemsStyles;
}

/** The text input itself is at least a touch target tall (the field's frame alone is not what a finger meets). */
const FIELD_INPUT = { minHeight: touchTarget };
/** The label above, then the input and its pair in one row; the row keeps the full width for the error line and hint. */
const FIELD_ROW = { marginBottom: space.lg };
const FIELD_CONTAINER = { marginBottom: 0 };
/** The input's frame is as wide as its figure (set per field); it stays at the left. */
const FIELD_BOX = { alignSelf: 'flex-start' as const };

/**
 * The row of one field: the input (its label above it, drawn by the field) and the pair right after it, placed
 * absolutely so the label, error line and hint keep the full width. The pair's top is the field box's top (its
 * measured `y` below the label) plus half the difference of the box's height and the pair's, so + and − are
 * centred on the box at any text size, not beside the label.
 */
function FieldRow({ boxWidth, stepper, children }: { boxWidth: number; stepper: React.ReactNode; children: (onFieldLayout: (event: LayoutChangeEvent) => void) => React.ReactNode }) {
  // Until the box is measured, an estimate of the same: the one-line label and its gap above, then the box's centring
  // offset. FlashList remounts a recycled card, so starting at 0 would show the pair jumping into place.
  const { fontScale } = useWindowDimensions();
  const [top, setTop] = useState(() => {
    const label = Math.round(typography.footnote.lineHeight * fontScale) + space.xs;
    const box = Math.max(touchTarget, Math.round(typography.body.lineHeight * fontScale) + 2 * space.sm + 2);
    return label + (box - touchTarget) / 2;
  });
  const onFieldLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    const next = y + (height - touchTarget) / 2;
    setTop((old) => (Math.abs(old - next) < 0.01 ? old : next));
  }, []);
  return (
    <View style={FIELD_ROW}>
      {children(onFieldLayout)}
      <View style={{ position: 'absolute', top, left: boxWidth + space.xs, width: INLINE_PAIR_WIDTH }}>{stepper}</View>
    </View>
  );
}

export const LineCard = React.memo(function LineCard({ item, oneTime, last, charge, labour, lastKey, inputWidths, actions, styles }: Props) {
  const number = formatIdentifier(item.dispatch_no);
  const field = (name: LineCardField, state: FieldState | undefined) => {
    const key = cellKey(item.temp_id, name);
    return (
      // The key is on this wrapper (line and field): a recycled row gets a new input, with no focus ring or clear icon carried over.
      <FieldRow
        key={key}
        boxWidth={inputWidths[name]}
        stepper={<LineStepper tempId={item.temp_id} dispatchNo={item.dispatch_no} field={name} rate={item[name]} state={state} actions={actions} />}
      >
        {(onFieldLayout) => (
        <RateInput
          ref={actions.refFor(key)}
          label={fieldHeading(name)}
          numeric
          selectTextOnFocus
          showClearButton={false}
          keyboardType="decimal-pad"
          returnKeyType={key === lastKey ? 'done' : 'next'}
          inputStyle={FIELD_INPUT}
          containerStyle={FIELD_CONTAINER}
          fieldStyle={{ ...FIELD_BOX, width: inputWidths[name] }}
          onFieldLayout={onFieldLayout}
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
  const names: LineCardField[] = oneTime ? ['charge'] : ['charge', 'labour_rate'];
  const states = { charge, labour_rate: labour };
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
