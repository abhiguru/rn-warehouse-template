/**
 * The "(all lines)" figures of a group (Charge for 2 or more lines, Labour, Tax): one part under the
 * group's head, in both modes. A value typed here is applied to every line that has not been given its
 * own (typed on the line, or saved differently on an edited invoice); "Mixed" (Labour, Tax) says the lines without their
 * own figure differ among themselves; Charge shows their weighted average instead.
 *
 * The fields stand side by side in one row of equal columns (1 to 3), each with its label, the field, its
 * notes and, under them, + then − buttons that step the figure by 0.25 (charge, labour) or 1 (tax). When the
 * columns would be too narrow for their figures and buttons (large text, `sharedSideBySide`) the same
 * parts stand one under the other, each field full width with its buttons beneath it.
 *
 * A press goes through `actions.step`, which applies the stepped figure like an accepted entry in the field.
 * Both buttons are disabled while the field shows "Mixed" (Labour, Tax), while every line keeps its own figure (Charge shows the
 * weighted average of the lines instead of "Mixed", but its buttons step from `stepFrom`, the rate the lines without their own
 * charge share, not from the average), or holds text that is refused or unfinished, at 0 (−) and at the
 * field's maximum (+). The buttons are not in the Next key's field walk.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { StepperButtons } from '@/components/fiori/StepperInput';
import { CELL_MAX_FONT_SCALE } from '@/components/table/EditableNumberCell';
import { useTokens } from '@/hooks/useTheme';
import { localizeDigits, t as tr } from '@/i18n';
import { RateInput } from './RateInput';
import { touchTarget } from '@/theme/tokens';
import {
  groupCellLabel,
  groupFieldKey,
  fieldHeading,
  averageNote,
  keepOwnNote,
  STEP,
  stepperState,
  maxAmountText,
  type FieldState,
  type ItemsActions,
  type RateField,
  type SharedView,
} from './itemsModel';
import type { ItemsStyles } from './itemsStyles';

/** The text input itself is at least a touch target tall (the field's frame alone is not what a finger meets). */
const FIELD_INPUT = { minHeight: touchTarget };
/** The field's own container has no space under it: the column places the buttons. */
const FIELD_CONTAINER = { marginBottom: 0 };

interface BlockProps {
  groupKey: string;
  itemName: string;
  /** The item with its mark, as a screen reader says it (the buttons' labels and the announcement). */
  spokenItem: string;
  fields: RateField[];
  /** The number of lines of the group (the average is over all of them). */
  lineCount: number;
  oneTime: boolean;
  views: Record<RateField, SharedView>;
  charge?: FieldState;
  labour?: FieldState;
  tax?: FieldState;
  /** The heading above the fields ("All dispatches"), or null for a group of one line. */
  heading: string | null;
  /** The fields are columns of one row; false stacks them. */
  sideBySide: boolean;
  lastKey?: string;
  actions: ItemsActions;
  styles: ItemsStyles;
}

const NAME_KEY = {
  charge: 'invoice.items.stepNameCharge',
  labour_rate: 'invoice.items.stepNameLabour',
  tax: 'invoice.items.stepNameTax',
} as const;

/** "₹0.25" or "1%", in the language's digits. */
const stepAmount = (field: RateField): string =>
  field === 'tax'
    ? tr('invoice.items.stepAmountTax', { amount: localizeDigits(String(STEP.tax)) })
    : tr('invoice.items.stepAmountMoney', { amount: localizeDigits(String(STEP[field])) });

export const SharedBlock = React.memo(function SharedBlock({ groupKey, itemName, spokenItem, fields, lineCount, oneTime, views, charge, labour, tax, heading, sideBySide, lastKey, actions, styles }: BlockProps) {
  const states = { charge, labour_rate: labour, tax };
  const t = useTokens();
  // How far a stacked field starts below the top of the part: the stack's place in the block plus the field's in the stack.
  // (Children report their layout before the parent, so both are kept and the sum is reported whenever either arrives.)
  const stackY = React.useRef(0);
  const itemY = React.useRef<Record<string, number>>({}).current;
  const report = (key: string) => actions.stackedOffset(key, stackY.current + (itemY[key] ?? 0));
  React.useEffect(() => {
    if (sideBySide) fields.forEach((field) => actions.stackedOffset(groupFieldKey(groupKey, field), null));
    return () => fields.forEach((field) => actions.stackedOffset(groupFieldKey(groupKey, field), null));
  }, [sideBySide, fields, groupKey, actions]);
  return (
    <View style={[styles.side, styles.rowDivider]} testID={`block-${groupKey}`}>
      <View style={styles.block}>
        {heading ? <Text style={styles.blockTitle} accessibilityRole="header">{heading}</Text> : null}
        <View style={sideBySide ? styles.sharedRow : styles.sharedStack} onLayout={sideBySide ? undefined : (e) => { stackY.current = e.nativeEvent.layout.y; fields.forEach((f) => report(groupFieldKey(groupKey, f))); }}>
          {fields.map((field) => {
            const key = groupFieldKey(groupKey, field);
            const state = states[field];
            const view = views[field];
            const stepper = stepperState(field, view, state);
            const name = tr(NAME_KEY[field]);
            const amount = stepAmount(field);
            return (
              <View key={field} style={sideBySide ? styles.sharedColumn : styles.sharedStackItem} onLayout={sideBySide ? undefined : (e) => { itemY[key] = e.nativeEvent.layout.y; report(key); }}>
                <RateInput
                  key={key}
                  ref={actions.refFor(key)}
                  label={fieldHeading(field)}
                  numeric
                  selectTextOnFocus
                  showClearButton={false}
                  maxFontSizeMultiplier={CELL_MAX_FONT_SCALE}
                  keyboardType="decimal-pad"
                  returnKeyType={key === lastKey ? 'done' : 'next'}
                  containerStyle={FIELD_CONTAINER}
                  inputStyle={FIELD_INPUT}
                  value={state?.text ?? view.text}
                  onChangeText={(text) => actions.change(key, text)}
                  onFocus={() => actions.focus(key)}
                  onBlur={() => actions.blur(key)}
                  onSubmitEditing={() => actions.submit(key)}
                  blurOnSubmit={false}
                  placeholder={view.average ? view.text : view.mixed ? tr('invoice.items.mixed') : '0'}
                  placeholderTextColor={t.text.placeholder}
                  helperText={view.average ? averageNote(lineCount, view.keepOwn) : view.keepOwn > 0 ? keepOwnNote(field, view.keepOwn) : undefined}
                  error={state?.shown ? state.error ?? undefined : undefined}
                  accessibilityLabel={groupCellLabel(field, itemName, oneTime, view.average)}
                  testID={key}
                />
                <View style={styles.sharedButtons}>
                  <StepperButtons
                    canDecrement={stepper.canDecrease}
                    canIncrement={stepper.canIncrease}
                    onDecrement={() => actions.step(groupKey, field, -1)}
                    onIncrement={() => actions.step(groupKey, field, 1)}
                    decreaseLabel={stepper.aboveMax
                      ? tr('invoice.items.stepLowerToMax', { name, amount: maxAmountText(field), item: spokenItem })
                      : tr('invoice.items.stepDecrease', { name, amount, item: spokenItem })}
                    increaseLabel={tr('invoice.items.stepIncrease', { name, amount, item: spokenItem })}
                    testID={`step|${groupKey}|${field}`}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
});
