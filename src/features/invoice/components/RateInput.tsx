/**
 * Text field for one line rate (charge, labour rate or tax).
 *
 * The field keeps the typed text while it has the focus, so a decimal point
 * survives between two key presses. Each complete number inside the server's
 * range is passed on at once; anything else is reported through
 * `onErrorChange` and not passed on. When the field loses the focus it shows
 * the stored rate again.
 */
import React, { useState } from 'react';
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

  const handleChange = (typed: string) => {
    const parsed = parseRateInput(field, typed);
    setText(parsed.text);
    onErrorChange?.(parsed.error);
    if (parsed.value !== null) onCommit(parsed.value);
  };

  const handleBlur = () => {
    setText(null);
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
