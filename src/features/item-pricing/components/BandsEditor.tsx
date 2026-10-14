/**
 * The weight bands of a rate: one card per band with a read-only "From", an "Up to" in whole
 * kilograms, the rent, and (only when the loaded bands differ) a labour and tax of its own.
 * In a default rate a band starts where the one before ends (no gap, no overlap, the server
 * refuses a gap). In a customer rate the "From" can be typed above that, which leaves a gap whose weights pay the default rate. Built from ui/Input only, with no field or dialog of its own (P-26).
 */
import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useThemedStyles } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import {
  MAX_BANDS,
  fromOf,
  gapBefore,
  nowText,
  setBandField,
  setBandFrom,
  setFirstFrom,
  setUpTo,
  splitLastBand,
  removeBand,
  wholeKg,
  type Draft,
  type EditorContext,
} from '../editModel';
import { bandText } from '../rateText';
import { fieldLink, type FieldRegistry } from './fieldLink';

interface Props {
  draft: Draft;
  ctx: EditorContext;
  errors: Record<string, string>;
  onChange: (next: Draft) => void;
  fields?: FieldRegistry;
}

/** At this text size From and Up to stack (P-42). */
const STACK_FROM_SCALE = 1.5;

const makeStyles = (t: ThemeTokens) => ({
  list: { gap: space.md },
  card: {
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
    gap: space.xs,
    ...t.shadow[1],
  },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  title: { ...typography.headline, color: t.text.primary, flexShrink: 1 },
  span: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: space.lg },
  spanStacked: { flexDirection: 'column' as const, gap: space.xs },
  from: { ...typography.subhead, color: t.text.secondary, minWidth: 96, paddingTop: space.md },
  upTo: { flex: 1 },
  unit: { ...typography.body, color: t.text.secondary },
  prefix: { ...typography.body, color: t.text.secondary },
  note: { ...typography.footnote, color: t.text.secondary },
  error: { ...typography.footnote, color: t.status.negative.text },
});

export function BandsEditor({ draft, ctx, errors, onChange, fields }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= STACK_FROM_SCALE;
  const oneTime = draft.priceType === 'one_time';
  const perBand = draft.bands.some(b => b.labour !== undefined);
  const canSplit = splitLastBand(draft) !== draft;
  const rentLabel = oneTime ? t('pricing.edit.rentOnce') : t('pricing.edit.rentMonthly');

  return (
    <View style={styles.list}>
      {draft.bands.map((band, i) => {
        const from = fromOf(draft, i);
        const to = wholeKg(band.upTo);
        const title = from !== null && to !== null && to >= from ? bandText(from, to) : t('pricing.edit.fromKg', { kg: localizeDigits(String(from ?? '–')) });
        const removeName = from !== null && to !== null
          ? t('pricing.edit.bandRange', { from: localizeDigits(String(from)), to: localizeDigits(String(to)) })
          : title;
        const now = nowText(draft, ctx, i);
        return (
          <View key={i} style={styles.card} testID={`band-${i}`}>
            <View style={styles.head}>
              <Text style={styles.title} accessibilityRole="header">{title}</Text>
              {draft.bands.length >= 2 && (
                <Button
                  type="tertiary"
                  variant="negative"
                  iconOnly
                  leftIcon="delete-outline"
                  onPress={() => onChange(removeBand(draft, i))}
                  accessibilityLabel={t('pricing.edit.removeBand', { band: removeName })}
                  testID={`band-${i}-remove`}
                >
                  {t('pricing.edit.removeBand', { band: removeName })}
                </Button>
              )}
            </View>
            {ctx.customerId && gapBefore(draft, i) ? (
              <Text style={styles.note} testID={`band-${i}-gap`}>
                {t('pricing.edit.gapHint', { band: bandText(gapBefore(draft, i)!.from, gapBefore(draft, i)!.to) })}
              </Text>
            ) : null}
            <View style={stacked ? styles.spanStacked : styles.span} testID={`band-${i}-span`}>
              {i === 0 && ctx.customerId ? (
                <View style={styles.upTo}>
                  <Input
                    label={t('pricing.edit.firstFrom')}
                    required
                    numeric
                    selectTextOnFocus
                    value={draft.firstFromText ?? String(draft.firstFrom)}
                    onChangeText={text => onChange(setFirstFrom(draft, text))}
                    keyboardType="number-pad"
                    returnKeyType="next"
                    error={errors.firstFrom}
                    rightIcon={<Text style={styles.unit}>{t('pricing.kg')}</Text>}
                    testID="first-from"
                    {...fieldLink(fields, 'firstFrom')}
                  />
                </View>
              ) : i > 0 && ctx.customerId ? (
                <View style={styles.upTo}>
                  <Input
                    label={t('pricing.edit.firstFrom')}
                    required
                    numeric
                    selectTextOnFocus
                    value={band.fromText ?? String(from ?? '')}
                    onChangeText={text => onChange(setBandFrom(draft, i, text))}
                    keyboardType="number-pad"
                    returnKeyType="next"
                    error={errors[`band.${i}.from`]}
                    rightIcon={<Text style={styles.unit}>{t('pricing.kg')}</Text>}
                    testID={`band-${i}-from`}
                    {...fieldLink(fields, `band.${i}.from`)}
                  />
                </View>
              ) : (
                <Text style={styles.from}>{t('pricing.edit.fromKg', { kg: localizeDigits(String(from ?? '–')) })}</Text>
              )}
              <View style={styles.upTo}>
                <Input
                  label={t('pricing.edit.upTo')}
                  required
                  numeric
                  selectTextOnFocus
                  value={band.upTo}
                  onChangeText={text => onChange(setUpTo(draft, i, text))}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  error={errors[`band.${i}.upTo`]}
                  rightIcon={<Text style={styles.unit}>{t('pricing.kg')}</Text>}
                  {...fieldLink(fields, `band.${i}.upTo`)}
                />
              </View>
            </View>
            <Input
              label={rentLabel}
              required
              numeric
              selectTextOnFocus
              value={band.rent}
              onChangeText={text => onChange(setBandField(draft, i, 'rent', text))}
              keyboardType="decimal-pad"
              returnKeyType="next"
              helperText={now ? t('pricing.edit.now', { amount: now }) : undefined}
              error={errors[`band.${i}.rent`]}
              leftIcon={<Text style={styles.prefix}>₹</Text>}
              {...fieldLink(fields, `band.${i}.rent`)}
            />
            {perBand && !oneTime && band.labour !== undefined && (
              <Input
                label={t('pricing.edit.labour')}
                required
                numeric
                selectTextOnFocus
                value={band.labour}
                onChangeText={text => onChange(setBandField(draft, i, 'labour', text))}
                keyboardType="decimal-pad"
                returnKeyType="next"
                error={errors[`band.${i}.labour`]}
                leftIcon={<Text style={styles.prefix}>₹</Text>}
                {...fieldLink(fields, `band.${i}.labour`)}
              />
            )}
            {perBand && band.tax !== undefined && (
              <Input
                label={t('pricing.edit.tax')}
                required
                numeric
                selectTextOnFocus
                value={band.tax}
                onChangeText={text => onChange(setBandField(draft, i, 'tax', text))}
                keyboardType="decimal-pad"
                returnKeyType="next"
                error={errors[`band.${i}.tax`]}
                rightIcon={<Text style={styles.unit}>%</Text>}
                {...fieldLink(fields, `band.${i}.tax`)}
              />
            )}
          </View>
        );
      })}
      {errors.bands ? <Text style={styles.error} accessibilityRole="alert">{errors.bands}</Text> : null}
      {draft.bands.length < MAX_BANDS && (
        <>
          <Button type="tertiary" leftIcon="plus" disabled={!canSplit} onPress={() => onChange(splitLastBand(draft))} testID="add-band">
            {t('pricing.edit.addBand')}
          </Button>
          {canSplit ? null : <Text style={styles.note}>{t('pricing.edit.cannotSplit')}</Text>}
        </>
      )}
      {ctx.customerId ? <Text style={styles.note}>{t('pricing.edit.outsidePay')}</Text> : null}
    </View>
  );
}

export default BandsEditor;
