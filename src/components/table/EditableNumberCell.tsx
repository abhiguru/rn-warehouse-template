/**
 * One editable figure of a table (style guide 13.7, "Editable tables"): a borderless input in the
 * table's text style (subhead, right-aligned tabular numbers); with `boxed` (the invoice items table, owner
 * decision 2026-10-19) it is drawn as an input box at rest, a 1 dp `border.field` frame on `surface.field`, so it is
 * plain which figures can be changed. It shows a 2 px ring while it is
 * being typed in (`border.fieldFocus`) or wrong (`status.negative.border`). It selects its text on
 * focus, opens a decimal pad, is at least `touchTarget` tall and never grows past
 * `CELL_MAX_FONT_SCALE`, so a column sized to its text keeps the figure on one line.
 *
 * A touch that starts over a cell belongs to the list: the view around the text input always ignores
 * touches (`pointerEvents="none"`), and a tap on the cell, which is a `Pressable`, scrolls its row up
 * (`onStart`), then focuses the input, or selects all its text when it is focused already. Without this
 * an Android text input swallows the vertical drags that start over a column of cells (it disallows
 * the parent's intercept on touch down), and the page cannot be scrolled from there. The setting is on a
 * plain view, not on the input: Android's native text input takes the touch even when it is given
 * `pointerEvents="none"` itself, while a view group honours it for everything inside. The focus ring lives in the
 * cell, so a list that recycles a row for another record has to give the cell a new `key`.
 *
 * It has its own spoken label (field, record, unit) and carries the error in `accessibilityHint`;
 * the row draws the same error as a line under it. The cell holds no text of its own: `value` is
 * the text (0-9 digits, shown in the language's digits) and `onChangeText` gets 0-9. While the cell
 * has the focus it shows the text it took from `value` on focus and the keys since, whatever `value`
 * becomes meanwhile (a form that reformats or drops its entry cannot change what is being typed);
 * after the blur it shows `value` again. A cell that unmounts while focused lets go of the focus.
 */
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { localizeDigits, normalizeDigits } from '@/i18n';
import { radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

/**
 * The text of a field while it has the focus (0-9 digits): copied from `value` on focus, then the
 * keys. `shown` is that text while focused and `value` otherwise.
 */
export function useOwnText(value: string, onChangeText: (text: string) => void) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);
  return {
    focused,
    shown: focused ? draft : value,
    focus: () => {
      setDraft(value);
      setFocused(true);
    },
    blur: () => setFocused(false),
    change: (text: string) => {
      setDraft(text);
      onChangeText(text);
    },
  };
}

/** A cell never grows past this text size (the table's columns are sized for it). */
export const CELL_MAX_FONT_SCALE = 1.3;

const makeStyles = (t: ThemeTokens) => ({
  cell: {
    ...typography.subhead,
    fontVariant: ['tabular-nums' as const],
    color: t.text.primary,
    textAlign: 'right' as const,
    minHeight: touchTarget,
    paddingVertical: 0,
    paddingHorizontal: space.xs,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: radius.field,
  },
  // `boxed`: an input box at rest (the field look of 13.2: a 1 dp `border.field` frame on `surface.field`). The ring
  // (2 dp) takes one dp from the padding, so the cell's size never changes.
  boxed: { borderWidth: 1, paddingHorizontal: space.xs + 1, borderColor: t.border.field, backgroundColor: t.surface.field },
  focused: { borderWidth: 2, paddingHorizontal: space.xs, borderColor: t.border.fieldFocus, backgroundColor: t.surface.field },
  invalid: { borderWidth: 2, paddingHorizontal: space.xs, borderColor: t.status.negative.border },
  // A cell that cannot be changed is a plain figure: no box, even when `boxed`.
  disabled: { color: t.text.secondary },
  unboxed: { borderWidth: 2, paddingHorizontal: space.xs, borderColor: 'transparent', backgroundColor: 'transparent' },
  // Centres the input when the parent stretches the cell taller than it (a row of the invoice items table), so the whole height is its touch area.
  grow: { flex: 1, minWidth: 0, justifyContent: 'center' as const },
});

export interface EditableNumberCellProps
  extends Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType' | 'style' | 'accessibilityLabel' | 'accessibilityHint'> {
  /** The text, with 0-9 digits. */
  value: string;
  onChangeText: (text: string) => void;
  /** Spoken label: field, record and unit. */
  label: string;
  /** The error, spoken as the hint; the ring shows when it is set. */
  error?: string;
  /** Column width in dp; without it the cell fills its parent. */
  width?: number;
  /** The cell is being pressed (true on touch down, false on release): the caller holds its layout from then on. */
  onHold?: (held: boolean) => void;
  /** A tap, before the input is focused: the caller scrolls the cell's row up. */
  onStart?: () => void;
  /** Draw the cell as an input box at rest (default false: borderless, the general rule of 13.7). */
  boxed?: boolean;
  ref?: React.Ref<TextInput>;
}

export function EditableNumberCell({
  value,
  onChangeText,
  label,
  error,
  width,
  onHold,
  onStart,
  boxed = false,
  ref,
  onFocus,
  onBlur,
  editable = true,
  returnKeyType = 'next',
  ...rest
}: EditableNumberCellProps) {
  const styles = useThemedStyles(makeStyles);
  const own = useOwnText(value, onChangeText);
  const focused = own.focused;
  const input = useRef<TextInput | null>(null);
  // A cell that goes (its row is recycled for another record) does not leave the native focus on the
  // view that is reused.
  useLayoutEffect(
    () => () => {
      if (input.current?.isFocused?.()) input.current.blur();
    },
    []
  );
  // The tap focuses the input, and the caller's ref gets the same input.
  const setRefs = useCallback(
    (node: TextInput | null) => {
      input.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<TextInput | null>).current = node;
    },
    [ref]
  );
  return (
    <Pressable
      accessible={false}
      onPressIn={onHold ? () => onHold(true) : undefined}
      onPressOut={onHold ? () => onHold(false) : undefined}
      onPress={() => {
        const node = input.current;
        if (!node) return;
        onStart?.();
        // A tap on a cell that has the focus selects its text, as the first tap does (`selectTextOnFocus`
        // only acts when the focus arrives), so the next digit replaces the figure.
        if (node.isFocused?.()) node.setSelection?.(0, own.shown.length);
        else node.focus();
      }}
      disabled={!editable}
      style={width !== undefined ? { width } : styles.grow}
      testID={rest.testID ? `${rest.testID}-tap` : undefined}
    >
      <View pointerEvents="none" testID={rest.testID ? `${rest.testID}-touch` : undefined}>
        <TextInput
          ref={setRefs}
          selectTextOnFocus
          blurOnSubmit={false}
          maxFontSizeMultiplier={CELL_MAX_FONT_SCALE}
          {...rest}
          keyboardType="decimal-pad"
          returnKeyType={returnKeyType}
          value={localizeDigits(own.shown)}
          onChangeText={(text) => own.change(normalizeDigits(text))}
          onFocus={(event) => {
            own.focus();
            onFocus?.(event);
          }}
          onBlur={(event) => {
            own.blur();
            onBlur?.(event);
          }}
          editable={editable}
          style={[
            styles.cell,
            boxed && styles.boxed,
            focused && styles.focused,
            !!error && styles.invalid,
            !editable && styles.disabled,
            !editable && boxed && styles.unboxed,
          ]}
          accessibilityLabel={label}
          accessibilityHint={error}
          accessibilityState={{ disabled: !editable }}
        />
      </View>
    </Pressable>
  );
}

export default EditableNumberCell;
