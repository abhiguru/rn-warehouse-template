/**
 * A rate field of a line card or of the "(all lines)" block: the field `Input`, which keeps its own
 * text while it has the focus (see `useOwnText`), so a form that reformats or drops its entry cannot
 * change what is being typed. It lets go of the native focus when it unmounts, so a recycled row
 * carries no focus ring.
 */
import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { useOwnText } from '@/components/table/EditableNumberCell';
import { Input, type InputProps } from '@/components/ui/Input';
import type { TextInputRef } from '@/types/nativeRefs';

type Props = Omit<InputProps, 'value' | 'onChangeText'> & {
  /** The text, with 0-9 digits. */
  value: string;
  onChangeText: (text: string) => void;
};

export function RateInput({ value, onChangeText, onFocus, onBlur, ref, ...rest }: Props) {
  const own = useOwnText(value, onChangeText);
  const node = useRef<TextInputRef | null>(null);
  useLayoutEffect(
    () => () => {
      if (node.current?.isFocused?.()) node.current.blur();
    },
    []
  );
  // Stable while the caller's ref is: a new callback each render would release and set the ref each time.
  const setRef = useCallback(
    (input: TextInputRef | null) => {
      node.current = input;
      if (typeof ref === 'function') ref(input);
      else if (ref) (ref as React.MutableRefObject<TextInputRef | null>).current = input;
    },
    [ref]
  );
  return (
    <Input
      {...rest}
      ref={setRef}
      value={own.shown}
      onChangeText={own.change}
      onFocus={(event) => {
        own.focus();
        onFocus?.(event);
      }}
      onBlur={(event) => {
        own.blur();
        onBlur?.(event);
      }}
    />
  );
}
