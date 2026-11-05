/**
 * The weight bands of a rate: one card per band with a read-only "From", an "Up to" in whole
 * kilograms, the rent, and (only when the loaded bands differ) a labour and tax of its own.
 * In a default rate a band starts where the one before ends (no gap, no overlap, the server
 * refuses a gap). In a customer rate the "From" can be typed above that, which leaves a gap whose weights pay the default rate. Built from ui/Input only, with no field or dialog of its own (P-26).
 */
import React from 'react';
import { Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useThemedStyles } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import {
  fromOf,
  gapBefore,
  nowText,
  setBandField,
  setBandFrom,
  setFirstFrom,
  setUpTo,
  removeBand,
  wholeKg,
  type Draft,
  type EditorContext,
} from '../editModel';
import { packageUnit } from '@/utils/packagingWord';
import { ReviewCard, ReviewSection } from '@/components/review/ReviewSections';
import { bandText } from '../rateText';
import { BandsFooter } from './BandsFooter';
import { fieldLink, type FieldRegistry } from './fieldLink';

/**
 * Opt-in folding (Standard rate): the bands draw as the style guide's folding card, one open at a time, the
 * open one owned by the screen. Without it the editor draws one card per band, as the item rate editor does.
 */
export interface FoldingBands {
  /** Index of the open band, or null when all are closed. */
  open: number | null;
  onToggle: (index: number) => void;
  /** A band was added: the screen opens it. */
  onAdd: (index: number) => void;
  /** Band `index` was removed: the screen keeps the right band open; `count` is the number left. */
  onRemove: (index: number, count: number) => void;
  /** Position of the card (`'card'`) and of each band's block inside it, for scrolling a heading into view. */
  onLayout?: (which: number | 'card', y: number) => void;
}

interface Props {
  draft: Draft;
  ctx: EditorContext;
  errors: Record<string, string>;
  onChange: (next: Draft) => void;
  fields?: FieldRegistry;
  /** The item's packaging, for "per Katta" in the labels; unknown (the standard rate) keeps "per bag". */
  packaging?: string | null;
  folding?: FoldingBands;
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
  foldBody: { gap: space.xs },
  removeRow: { alignItems: 'flex-end' as const },
});

export function BandsEditor({ draft, ctx, errors, onChange, fields, packaging, folding }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= STACK_FROM_SCALE;
  const oneTime = draft.priceType === 'one_time';
  const perBand = draft.bands.some(b => b.labour !== undefined);
  const unit = packaging === undefined ? undefined : packageUnit(packaging);
  const rentLabel = unit !== undefined
    ? t(oneTime ? 'pricing.edit.rentOnceFor' : 'pricing.edit.rentMonthlyFor', { unit })
    : oneTime ? t('pricing.edit.rentOnce') : t('pricing.edit.rentMonthly');
  const labourLabel = unit !== undefined ? t('pricing.edit.labourFor', { unit }) : t('pricing.edit.labour');

  const dash = '–';
  const money = (v: string | undefined, sign: 'rupee' | 'percent'): string => {
    const text = v?.trim();
    if (!text) return dash;
    return sign === 'rupee' ? `₹${localizeDigits(text)}` : `${localizeDigits(text)}%`;
  };
  const changeDraft = (next: Draft) => {
    onChange(next);
    if (folding && next.bands.length > draft.bands.length) folding.onAdd(next.bands.length - 1);
  };
  const bandCards = draft.bands.map((band, i) => {
        const from = fromOf(draft, i);
        const to = wholeKg(band.upTo);
        const title = from !== null && to !== null && to >= from ? bandText(from, to) : t('pricing.edit.fromKg', { kg: localizeDigits(String(from ?? '–')) });
        const removeName = from !== null && to !== null
          ? t('pricing.edit.bandRange', { from: localizeDigits(String(from)), to: localizeDigits(String(to)) })
          : title;
        const now = nowText(draft, ctx, i);
        const removeButton = draft.bands.length >= 2 ? (
          <Button
            type="tertiary"
            variant="negative"
            iconOnly
            leftIcon="delete-outline"
            onPress={() => {
              onChange(removeBand(draft, i));
              folding?.onRemove(i, draft.bands.length - 1);
            }}
            accessibilityLabel={t('pricing.edit.removeBand', { band: removeName })}
            testID={`band-${i}-remove`}
          >
            {t('pricing.edit.removeBand', { band: removeName })}
          </Button>
        ) : null;
        const body = (
          <>
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
                label={labourLabel}
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
          </>
        );
        if (folding) {
          const closedLine = t('pricing.standard.bandLine', {
            rent: money(band.rent, 'rupee'),
            labour: money(band.labour, 'rupee'),
            tax: money(band.tax, 'percent'),
          });
          const hasError = Object.keys(errors).some(k => k.startsWith(`band.${i}.`) && errors[k]);
          return (
            <ReviewSection
              key={i}
              id={String(i)}
              testIDPrefix="band"
              blockTestID={`band-${i}`}
              title={title}
              tag={hasError ? t('pricing.standard.bandNeedsFix') : undefined}
              closedLine={closedLine}
              wrapClosedLine
              open={folding.open === i}
              onToggle={() => folding.onToggle(i)}
              first={i === 0}
              onLayout={(e: LayoutChangeEvent) => folding.onLayout?.(i, e.nativeEvent.layout.y)}
              bodyStyle={styles.foldBody}
            >
              {removeButton ? <View style={styles.removeRow}>{removeButton}</View> : null}
              {body}
            </ReviewSection>
          );
        }
        return (
          <View key={i} style={styles.card} testID={`band-${i}`}>
            <View style={styles.head}>
              <Text style={styles.title} accessibilityRole="header">{title}</Text>
              {removeButton}
            </View>
            {body}
          </View>
        );
  });

  return (
    <View style={styles.list}>
      {folding ? (
        <ReviewCard testID="bands-card" onLayout={(e: LayoutChangeEvent) => folding.onLayout?.('card', e.nativeEvent.layout.y)}>
          {bandCards}
        </ReviewCard>
      ) : bandCards}
      <BandsFooter draft={draft} ctx={ctx} errors={errors} onChange={changeDraft} packaging={packaging} />
    </View>
  );
}

export default BandsEditor;
