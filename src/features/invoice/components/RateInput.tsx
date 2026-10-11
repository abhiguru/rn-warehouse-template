/**
 * Text field for one line rate (charge, labour rate or tax).
 *
 * The field keeps the typed text while it has the focus, so a decimal point
 * survives between two key presses. Each complete number inside the server's
 * range is passed on at once; anything else is reported through
 * `onErrorChange` and not passed on. When the field loses the focus it shows
 * the stored rate again. A field that is taken off the screen while it holds
 * refused text (another cell opened, its group collapsed) gets no blur, so it
 * withdraws its error when it unmounts: an error nobody can see must not keep
 * the step from continuing.
 */
import React, { useEffect, useRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { localizeDigits } from '@/i18n';
import { amountText, parseRateInput, type RateField } from '@/features/invoice/utils/amountInput';

interface RateInputProps extends Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType' | 'onBlur'> {
  field: RateField;
  /** The stored rate. */
  value: number;
  onCommit: (value: number) => void;
  onErrorChange?: (error: string | null) => void;
  onBlur?: () => void;
}

export const RateInput: React.FC<RateInputProps> = ({ field, value, onCommit, onErrorChange, onBlur, ...rest }) => {
  // null: not being edited, so the stored rate is shown.
  const [text, setText] = useState<string | null>(null);

  const onErrorChangeRef = useRef(onErrorChange);
  onErrorChangeRef.current = onErrorChange;
  const hasErrorRef = useRef(false);
  useEffect(() => () => {
    if (hasErrorRef.current) onErrorChangeRef.current?.(null);
  }, []);

  const handleChange = (typed: string) => {
    const parsed = parseRateInput(field, typed);
    hasErrorRef.current = parsed.error !== null;
    setText(parsed.text);
    onErrorChange?.(parsed.error);
    if (parsed.value !== null) onCommit(parsed.value);
  };

  const handleBlur = () => {
    setText(null);
    hasErrorRef.current = false;
    onErrorChange?.(null);
    onBlur?.();
  };

  return (
    <TextInput
      {...rest}
      value={localizeDigits(text ?? amountText(value))}
      onChangeText={handleChange}
      onBlur={handleBlur}
      keyboardType="decimal-pad"
    />
  );
};

export default RateInput;
