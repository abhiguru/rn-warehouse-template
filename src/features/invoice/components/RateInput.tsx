/**
 * Text field for one line rate (charge, labour rate or tax).
 *
 * The field keeps the typed text while it has the focus, so a decimal point
 * survives between two key presses. Each complete number inside the server's
 * range is passed on at once; anything else is reported through
 * `onErrorChange` and not passed on. When the field loses the focus it shows
 * the stored rate again.
 *
 * Two ways to keep the typed text:
 * - On its own (no `onDraftChange`): the field holds the text. A field that is
 *   taken off the screen while it holds refused text (another cell opened, its
 *   group collapsed) gets no blur, so it withdraws its error when it unmounts:
 *   an error nobody can see must not keep the step from continuing.
 * - Controlled (`onDraftChange` given): the owner holds the text and the cursor
 *   (`draft`, `selection`), so a field that a list takes off the screen and
 *   draws again shows what was typed, where the cursor was, and keeps its
 *   error. The owner decides when a draft and its error end; the field does
 *   not withdraw its error when it unmounts.
 */
import React, { useEffect, useRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { localizeDigits } from '@/i18n';
import { amountText, parseRateInput, type RateField } from '@/features/invoice/utils/amountInput';

export interface RateSelection {
  start: number;
  end: number;
}

/** A change to a controlled field's draft. `text: null` ends the draft (the stored rate shows again). */
export interface RateDraftChange {
  text?: string | null;
  selection?: RateSelection;
}

interface RateInputProps
  extends Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType' | 'onBlur' | 'selection' | 'onSelectionChange'> {
  field: RateField;
  /** The stored rate. */
  value: number;
  onCommit: (value: number) => void;
  onErrorChange?: (error: string | null) => void;
  onBlur?: () => void;
  /** Controlled mode: the typed text, or null/undefined while nothing is typed. */
  draft?: string | null;
  /** Controlled mode: the cursor to restore when the field is drawn again. */
  selection?: RateSelection;
  /** Turns on controlled mode. */
  onDraftChange?: (change: RateDraftChange) => void;
}

export const RateInput: React.FC<RateInputProps> = ({
  field,
  value,
  onCommit,
  onErrorChange,
  onBlur,
  draft,
  selection,
  onDraftChange,
  ...rest
}) => {
  const controlled = onDraftChange !== undefined;

  // null: not being edited, so the stored rate is shown.
  const [ownText, setOwnText] = useState<string | null>(null);
  const text = controlled ? draft ?? null : ownText;

  // A controlled field restores the cursor it was given when it mounts, and
  // then leaves the cursor to the user (a cursor set on every key press jumps).
  const [restoreSelection, setRestoreSelection] = useState<RateSelection | undefined>(() => (controlled ? selection : undefined));

  const onErrorChangeRef = useRef(onErrorChange);
  onErrorChangeRef.current = onErrorChange;
  const hasErrorRef = useRef(false);
  const controlledRef = useRef(controlled);
  controlledRef.current = controlled;
  useEffect(() => () => {
    if (hasErrorRef.current && !controlledRef.current) onErrorChangeRef.current?.(null);
  }, []);

  const handleChange = (typed: string) => {
    const parsed = parseRateInput(field, typed);
    hasErrorRef.current = parsed.error !== null;
    if (controlled) onDraftChange({ text: parsed.text });
    else setOwnText(parsed.text);
    onErrorChange?.(parsed.error);
    if (parsed.value !== null) onCommit(parsed.value);
  };

  const handleSelectionChange: TextInputProps['onSelectionChange'] = (event) => {
    if (!controlled) return;
    if (restoreSelection) setRestoreSelection(undefined);
    onDraftChange({ selection: event.nativeEvent.selection });
  };

  const handleBlur = () => {
    hasErrorRef.current = false;
    if (controlled) onDraftChange({ text: null });
    else setOwnText(null);
    onErrorChange?.(null);
    onBlur?.();
  };

  return (
    <TextInput
      {...rest}
      value={localizeDigits(text ?? amountText(value))}
      onChangeText={handleChange}
      onBlur={handleBlur}
      {...(controlled ? { selection: restoreSelection, onSelectionChange: handleSelectionChange } : null)}
      keyboardType="decimal-pad"
    />
  );
};

export default RateInput;
