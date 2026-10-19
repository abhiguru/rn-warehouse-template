/**
 * The + then − side by side beside a dispatch line's own figure in a line card (the cards shown while a screen reader is on; the sideways table has no steppers): the step is 0.25 for
 * Charge and Labour (a line has no Tax figure). A press goes through `actions.stepCell`, which applies the stepped figure
 * like an accepted entry in that line's cell, so the line keeps its own figure. Both buttons are disabled while
 * the cell holds refused or unfinished text, − at 0 and + at the field's maximum. The buttons are not in the Next
 * key's field walk.
 */
import React from 'react';
import { StepperButtons } from '@/components/fiori/StepperInput';
import { cellKey, lineStepLabels, lineView, stepperState, type FieldState, type ItemsActions, type RateField } from './itemsModel';

interface Props {
  tempId: string;
  dispatchNo: string;
  field: Exclude<RateField, 'tax'>;
  /** The line's stored rate for the field. */
  rate: number;
  /** What the cell holds while it differs from the stored rate (typed text). */
  state: FieldState | undefined;
  actions: ItemsActions;
}

export const LineStepper = React.memo(function LineStepper({ tempId, dispatchNo, field, rate, state, actions }: Props) {
  const stepper = stepperState(field, lineView(field, rate), state);
  const labels = lineStepLabels(field, dispatchNo, stepper.aboveMax);
  return (
    <StepperButtons
      orientation="inline"
      canDecrement={stepper.canDecrease}
      canIncrement={stepper.canIncrease}
      onDecrement={() => actions.stepCell(tempId, field, -1)}
      onIncrement={() => actions.stepCell(tempId, field, 1)}
      decreaseLabel={labels.decrease}
      increaseLabel={labels.increase}
      testID={`step|${cellKey(tempId, field)}`}
    />
  );
});
