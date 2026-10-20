/**
 * One number field with + and − under it, as the GRN Change rate screen draws its figures (the field from ui/Input, the
 * buttons from FigureStepper). Registers with the page's field registry (Next key, scroll above the keyboard).
 * In a row it takes an equal share of the width; `stacked` (large text, or a figure that would be cut short) gives it
 * the whole width, one field under another. A refused figure only marks the field (`error` -> red outline, spoken
 * message): the message itself is drawn once, full width, under the row (RateBandFields), so a long text never makes
 * one column taller than its neighbours and the + and − stay in line. A read-only field has no + and −.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { Input } from '@/components/ui/Input';
import { useThemedStyles } from '@/hooks/useTheme';
import { typography, type ThemeTokens } from '@/theme/tokens';
import { fieldLink, type FieldRegistry } from './fieldLink';
import { FigureStepper, type StepKind } from './FigureStepper';

interface Props {
  /** The registry key (`band.0.rent`, `labour`): what the Next key and the error scroll know the field by. */
  fieldKey: string;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  kind: StepKind;
  /** The field and its band in the TalkBack label of + and −: "Raise the rent (0 to 50 kg) by ₹0.25". */
  fieldName: string;
  /** What the screen reader says for the field itself: field, band and unit ("Rent, 0 to 50 kg, rupees per bag, per month"). */
  a11yLabel: string;
  /** A unit shown at the end of the field ("%"). */
  suffix?: string;
  /** The refusal of this figure: marks the field. The caller shows the message under the row. */
  error?: string;
  fields?: FieldRegistry;
  returnKeyType: 'next' | 'done';
  readOnly?: boolean;
  stacked: boolean;
  testID: string;
}

const makeStyles = (th: ThemeTokens) => ({
  cell: { flex: 1 },
  suffix: { ...typography.footnote, color: th.text.secondary },
});

export function FigureField({ fieldKey, label, value, onChangeText, kind, fieldName, a11yLabel, suffix, error, fields, returnKeyType, readOnly = false, stacked, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={stacked ? undefined : styles.cell}>
      <Input
        label={label}
        numeric
        selectTextOnFocus
        value={value}
        onChangeText={onChangeText}
        keyboardType={kind === 'kg' ? 'number-pad' : 'decimal-pad'}
        returnKeyType={returnKeyType}
        editable={!readOnly}
        invalid={!!error}
        accessibilityLabel={a11yLabel}
        accessibilityHint={error}
        rightIcon={suffix ? <Text style={styles.suffix}>{suffix}</Text> : undefined}
        testID={testID}
        {...fieldLink(fields, fieldKey)}
      />
      {readOnly ? null : <FigureStepper kind={kind} value={value} onChange={onChangeText} fieldName={fieldName} testID={testID} />}
    </View>
  );
}

export default FigureField;
