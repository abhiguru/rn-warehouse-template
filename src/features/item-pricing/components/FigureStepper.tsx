/**
 * The + and − under a number field (owner, 2026-10-17, as on the GRN Change rate screen): + first, 8 apart, drawn 36 dp
 * tall with the touch area padded to touchTarget, disabled at the field's limits. Weights step by 1 kg, rupees by
 * ₹0.25 (shown with two decimals), a tax by 1%.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { iconSize, radius, space, touchTarget, type ThemeTokens } from '@/theme/tokens';
import { money } from '../rateText';
import { priceNumber } from '../utils/priceNumbers';
import { wholeKg } from '../editModel';

export type StepKind = 'kg' | 'rupee' | 'percent';

const STEP: Record<StepKind, number> = { kg: 1, rupee: 0.25, percent: 1 };
const MAX: Record<StepKind, number> = { kg: 100000, rupee: 999999, percent: 100 };
const HEIGHT = 36;
const HIT_SLOP = { top: (touchTarget - HEIGHT) / 2, bottom: (touchTarget - HEIGHT) / 2 };
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The text a stepped value is written back as: whole kg, two-decimal rupees, a plain percent. */
export const stepText = (kind: StepKind, n: number): string => (kind === 'rupee' ? n.toFixed(2) : String(round2(n)));

const makeStyles = (th: ThemeTokens) => ({
  row: { flexDirection: 'row' as const, gap: space.sm, marginTop: space.xs },
  step: {
    flex: 1,
    height: HEIGHT,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: th.border.button,
    borderRadius: radius.button,
  },
  pressed: { backgroundColor: th.brand.subtle },
  disabled: { opacity: th.interaction.disabledOpacity },
});

interface Props {
  kind: StepKind;
  value: string;
  onChange: (text: string) => void;
  /** The field in the TalkBack label: "Raise the rent by ₹0.25". */
  fieldName: string;
  disabled?: boolean;
  testID: string;
}

export function FigureStepper({ kind, value, onChange, fieldName, disabled = false, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const th = useTokens();
  const now = (kind === 'kg' ? wholeKg(value) : priceNumber(value, 2)) ?? 0;
  const amount = kind === 'kg' ? `${localizeDigits(String(STEP.kg))} ${t('pricing.kg')}` : kind === 'percent' ? `${localizeDigits(String(STEP.percent))}%` : money(STEP.rupee);
  const button = (dir: 1 | -1) => {
    const next = Math.min(MAX[kind], Math.max(0, round2(now + dir * STEP[kind])));
    const off = disabled || next === now;
    return (
      <Pressable
        key={dir}
        style={({ pressed }) => [styles.step, pressed && styles.pressed, off && styles.disabled]}
        hitSlop={HIT_SLOP}
        onPress={() => onChange(stepText(kind, next))}
        disabled={off}
        accessibilityRole="button"
        accessibilityLabel={t(dir > 0 ? 'pricing.addForm.stepUp' : 'pricing.addForm.stepDown', { field: fieldName, step: amount })}
        accessibilityState={{ disabled: off }}
        testID={`${testID}-${dir > 0 ? 'up' : 'down'}`}
      >
        <Icon name={dir > 0 ? 'plus' : 'minus'} size={iconSize.md} color={th.brand.tint} />
      </Pressable>
    );
  };
  return <View style={styles.row}>{[button(1), button(-1)]}</View>;
}

export default FigureStepper;
