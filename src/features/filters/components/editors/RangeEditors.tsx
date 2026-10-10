/**
 * Two-ended ranges typed by hand: numbers (weight, quantity) and document
 * numbers. Exact values matter here, so these are fields, not sliders
 * (docs/STYLE_GUIDE.md §13.2: a visible label above every field).
 */
import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { normalizeDigits, t as translate, numericInput } from '@/i18n';
import { radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import type { NumberRangeValue, TextRangeValue } from '../../types';

const makeStyles = (t: ThemeTokens) => ({
  wrap: { gap: space.xs },
  row: { flexDirection: 'row' as const, gap: space.md },
  cell: { flex: 1, gap: space.xs },
  label: { ...typography.footnote, color: t.text.secondary },
  field: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: t.border.field,
    backgroundColor: t.surface.field,
  },
  fieldError: { borderColor: t.status.negative.border },
  input: { ...typography.body, flex: 1, color: t.text.primary, paddingVertical: space.sm },
  unit: { ...typography.subhead, color: t.text.secondary, marginLeft: space.xs },
  error: { ...typography.footnote, color: t.status.negative.text },
});

const toNumber = (text: string, integer: boolean): number | undefined => {
  // ૦-૯ and 0-9 mean the same (docs/I18N.md rule 6).
  const trimmed = normalizeDigits(text).trim();
  if (trimmed === '' || !(integer ? /^\d+$/ : /^\d*\.?\d+$/).test(trimmed)) return undefined;
  return Number(trimmed);
};

export interface NumberRangeEditorProps {
  label: string;
  value: NumberRangeValue | undefined;
  onChange: (value: NumberRangeValue | undefined) => void;
  unit?: string;
  integer?: boolean;
  /** Called with true while the range is the wrong way round. */
  onInvalid?: (invalid: boolean) => void;
}

export function NumberRangeEditor({ label, value, onChange, unit, integer = false, onInvalid }: NumberRangeEditorProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  // Typed text is kept as text, so "12." or an unfinished number is not rewritten under the cursor.
  const [minText, setMinText] = useState(value?.min === undefined ? '' : String(value.min));
  const [maxText, setMaxText] = useState(value?.max === undefined ? '' : String(value.max));

  const update = (nextMin: string, nextMax: string) => {
    const min = toNumber(nextMin, integer);
    const max = toNumber(nextMax, integer);
    const invalid = min !== undefined && max !== undefined && min > max;
    onInvalid?.(invalid);
    onChange(min === undefined && max === undefined ? undefined : { min, max });
  };
  const min = toNumber(minText, integer);
  const max = toNumber(maxText, integer);
  const invalid = min !== undefined && max !== undefined && min > max;

  const cell = (name: string, text: string, onText: (text: string) => void) => (
    <View style={styles.cell}>
      <Text style={styles.label}>{name}</Text>
      <View style={[styles.field, invalid && styles.fieldError]}>
        <TextInput
          style={styles.input}
          {...numericInput(text, onText)}
          keyboardType={integer ? 'number-pad' : 'decimal-pad'}
          placeholder={translate('common.any')}
          placeholderTextColor={t.text.placeholder}
          accessibilityLabel={
            unit
              ? translate('filters.range.cellLabelUnit', { label, name: name.toLowerCase(), unit })
              : translate('filters.range.cellLabel', { label, name: name.toLowerCase() })
          }
          returnKeyType="done"
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {cell(translate('filters.range.minimum'), minText, text => {
          setMinText(text);
          update(text, maxText);
        })}
        {cell(translate('filters.range.maximum'), maxText, text => {
          setMaxText(text);
          update(minText, text);
        })}
      </View>
      {invalid ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">{translate('filters.range.minAboveMax')}</Text>
      ) : null}
    </View>
  );
}

export interface TextRangeEditorProps {
  label: string;
  value: TextRangeValue | undefined;
  onChange: (value: TextRangeValue | undefined) => void;
  placeholder?: [string, string];
}

export function TextRangeEditor({ label, value, onChange, placeholder = [translate('filters.range.from'), translate('filters.range.to')] }: TextRangeEditorProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const set = (end: 'from' | 'to', text: string) => {
    const next = { from: value?.from, to: value?.to, [end]: text };
    onChange(next.from?.trim() || next.to?.trim() ? next : undefined);
  };
  const cell = (end: 'from' | 'to', name: string) => (
    <View style={styles.cell}>
      <Text style={styles.label}>{name}</Text>
      <View style={styles.field}>
        <TextInput
          style={styles.input}
          value={value?.[end] ?? ''}
          onChangeText={text => set(end, normalizeDigits(text))}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={translate('common.any')}
          placeholderTextColor={t.text.placeholder}
          accessibilityLabel={translate('filters.range.cellLabel', { label, name: name.toLowerCase() })}
          returnKeyType="done"
        />
      </View>
    </View>
  );
  return (
    <View style={styles.row}>
      {cell('from', placeholder[0])}
      {cell('to', placeholder[1])}
    </View>
  );
}

export interface TextEditorProps {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
}

export function TextEditor({ label, value, onChange, placeholder }: TextEditorProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.field}>
      <TextInput
        style={styles.input}
        value={value ?? ''}
        onChangeText={text => onChange(text === '' ? undefined : text)}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={placeholder ?? translate('common.any')}
        placeholderTextColor={t.text.placeholder}
        accessibilityLabel={label}
        returnKeyType="done"
      />
    </View>
  );
}
