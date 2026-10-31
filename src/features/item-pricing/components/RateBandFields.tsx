/**
 * The weight bands of a rate box, laid out as the GRN Change rate screen lays out its figures (owner, 2026-10-20): for
 * every band a band line ("Weight band 0 – 50 kg"), the band's From and Up to side by side with + and − under each,
 * and under them Rent, Labour and Tax side by side with + and − under each. At large text, where the widest rent
 * (9999.99) would not fit a field, or where a field could not hold its + and − as two touch targets, a row stacks one
 * field under another (`figuresStack`, as the GRN form does). A refused figure marks its field; its message is drawn
 * once, full width, under its row, so the + and − stay in line.
 * A rate whose labour and tax are the same for every band shows them in the band's row while there is one band, and
 * once under all the bands ("Labour and tax for every band") when there are several. The state, the checks and the
 * setters are the rate editor's (`editModel`); the keys, test ids and Next-key order are the ones the band table had.
 */
import React from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import {
  fromOf,
  gapBefore,
  removeBand,
  setBandField,
  setBandFrom,
  setFirstFrom,
  setUpTo,
  wholeKg,
  type Draft,
  type EditorContext,
} from '../editModel';
import { figuresStack } from '../figureRow';
import { bandText, unitText } from '../rateText';
import type { TierTag } from '../standardRate';
import { TierTagView } from './BandList';
import { BandsFooter } from './BandsFooter';
import type { FieldRegistry } from './fieldLink';
import { FigureField } from './FigureField';

interface Props {
  draft: Draft;
  ctx: EditorContext;
  errors: Record<string, string>;
  onChange: (next: Draft) => void;
  /** The keys of the number fields in the order the Next key walks them (the last one shows Done). */
  order: string[];
  fields?: FieldRegistry;
  /** One tag per band ('Standard' or 'This item'), shown under the band line. */
  tags?: TierTag[] | null;
  /** The fields cannot be typed in (a box that waits for the other one, or a read-only one). */
  readOnly?: boolean;
  testID?: string;
}

const makeStyles = (th: ThemeTokens) => ({
  list: { gap: space.lg },
  band: { gap: space.md },
  // Several bands: one outlined card each (as the full-screen rate form), a single band is flat as on the GRN screen.
  card: { borderWidth: 1, borderColor: th.border.divider, borderRadius: radius.card, padding: space.md, backgroundColor: th.surface.card },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: touchTarget, marginVertical: -space.sm, gap: space.xs },
  title: { ...typography.subhead, fontWeight: '600' as const, color: th.text.primary, flex: 1 },
  remove: { width: touchTarget, height: touchTarget, alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: -space.sm },
  row: { flexDirection: 'row' as const, gap: space.sm, alignItems: 'flex-start' as const },
  stack: { gap: space.sm },
  note: { ...typography.footnote, color: th.text.secondary },
  error: { ...typography.footnote, color: th.status.negative.text },
  tag: { alignItems: 'flex-start' as const },
  shared: { gap: space.sm },
});

/** The width the fields lose to the box's margins and, in a card, its padding and outline. */
const CARD_CHROME = space.md + 1;

/** The first refusal among the keys (a row shows one message). */
const firstError = (errors: Record<string, string>, keys: string[]): string | undefined => keys.map(key => errors[key]).find(Boolean);

export function RateBandFields({ draft, ctx, errors, onChange, order, fields, tags, readOnly = false, testID = 'bands' }: Props) {
  const styles = useThemedStyles(makeStyles);
  const th = useTokens();
  const { width, fontScale } = useWindowDimensions();
  const oneTime = draft.priceType === 'one_time';
  const perBand = draft.bands.some(b => b.labour !== undefined);
  const customer = !!ctx.customerId;
  const several = draft.bands.length >= 2;
  // With one band the shared labour and tax sit in its row; with several they sit once under the bands.
  const inRow = perBand || !several;
  const edge = layout.marginCompact + (several ? CARD_CHROME : 0);
  // A row of `count` fields stacks when the widest figure would not fit, or when a field could not hold its + and − as
  // two touch targets with the gap between them. `lost` is the width the row loses at each side of the window: the
  // band's (a card, with several bands) or, for the shared block that sits in no card, the box's margin alone.
  const stackedFor = (count: number, lost: number = edge): boolean => {
    if (figuresStack({ width, fontScale, count, edge: lost })) return true;
    const field = (width - 2 * lost - (count - 1) * space.sm) / count;
    return count > 1 && field < 2 * touchTarget + space.sm;
  };
  const keypad = (key: string): 'next' | 'done' => (order.indexOf(key) < order.length - 1 ? 'next' : 'done');
  const kg = localizeDigits;

  const rentLabel = oneTime ? t('pricing.addForm.rentOnce') : t('pricing.addForm.rent');
  const labourLabel = t('pricing.addForm.labour');
  const taxLabel = t('pricing.addForm.tax');

  // What the screen reader says: "Rent, 0 to 50 kg, rupees per bag, per month" for a field; "Raise the rent (0 to 50 kg)
  // by ₹0.25" for its + (the band is part of the field's name there).
  const name = {
    from: t('pricing.edit.firstFrom'),
    upTo: t('pricing.edit.upTo'),
    rent: t('pricing.band.rentOnce'),
    labour: t('pricing.item.labour'),
    tax: t('pricing.item.tax'),
  };
  const unit = {
    kg: t('pricing.box.unitKg'),
    rent: t('pricing.box.unitRupees', { unit: unitText(oneTime ? 'one_time' : 'monthly') }),
    labour: t('pricing.box.unitLabour'),
    percent: t('pricing.box.unitPercent'),
  };
  const spoken = (field: string, band: string, unitText: string) => t('pricing.box.cellA11y', { field, band, unit: unitText });
  const stepName = (field: string, band: string) => `${field} (${band})`;
  const allBands = t('pricing.box.allBands');

  /** Labour and tax shared by every band; `band` is what the screen reader names them for. */
  const sharedFigures = (stacked: boolean, band: string) => (
    <>
      {oneTime ? null : (
        <FigureField
          fieldKey="labour"
          label={labourLabel}
          value={draft.labour}
          onChangeText={text => onChange({ ...draft, labour: text })}
          kind="rupee"
          fieldName={stepName(t('pricing.addForm.fieldLabour'), band)}
          a11yLabel={spoken(name.labour, band, unit.labour)}
          error={errors.labour}
          fields={fields}
          returnKeyType={keypad('labour')}
          readOnly={readOnly}
          stacked={stacked}
          testID="labour"
        />
      )}
      <FigureField
        fieldKey="tax"
        label={taxLabel}
        value={draft.tax}
        onChangeText={text => onChange({ ...draft, tax: text })}
        kind="percent"
        fieldName={stepName(t('pricing.addForm.fieldTax'), band)}
        a11yLabel={spoken(name.tax, band, unit.percent)}
        suffix="%"
        error={errors.tax}
        fields={fields}
        returnKeyType={keypad('tax')}
        readOnly={readOnly}
        stacked={stacked}
        testID="tax"
      />
    </>
  );

  return (
    <View style={styles.list} testID={testID}>
      {draft.bands.map((band, i) => {
        const from = fromOf(draft, i);
        const upTo = wholeKg(band.upTo);
        const kgText = (n: number | null) => (n === null ? '–' : kg(String(n)));
        const range = from !== null && upTo !== null ? bandText(from, upTo) : t('pricing.addForm.bandNew');
        const title = several ? t('pricing.addForm.bandTitle', { n: kg(String(i + 1)), range }) : t('pricing.box.bandLine', { range });
        const fromKey = i === 0 ? 'firstFrom' : `band.${i}.from`;
        const fromText = i === 0 ? draft.firstFromText ?? String(draft.firstFrom) : band.fromText ?? String(from ?? '');
        const gap = customer ? gapBefore(draft, i) : null;
        // The band as the screen reader and the remove button name it ("0 to 50 kg", or "From 51 kg" while the end is not set).
        const bandName = from !== null && upTo !== null
          ? t('pricing.edit.bandRange', { from: kgText(from), to: kgText(upTo) })
          : t('pricing.edit.fromKg', { kg: kgText(from) });
        const pairStacked = stackedFor(customer ? 2 : 1);
        // Rent beside labour and tax: the figures of this band (its own, or the shared ones while there is one band).
        const count = 1 + (inRow ? (oneTime ? 0 : 1) + 1 : 0);
        const figuresStacked = stackedFor(count);
        const pairError = firstError(errors, [fromKey, `band.${i}.upTo`]);
        const figureError = firstError(errors, [
          `band.${i}.rent`,
          ...(perBand ? [`band.${i}.labour`, `band.${i}.tax`] : inRow ? ['labour', 'tax'] : []),
        ]);
        return (
          <View key={i} style={[styles.band, several && styles.card]} testID={`band-${i}`}>
            <View style={styles.head}>
              <Text style={styles.title} numberOfLines={2} accessibilityRole="header" testID={`band-${i}-title`}>{title}</Text>
              {several && !readOnly ? (
                <Pressable
                  style={styles.remove}
                  onPress={() => onChange(removeBand(draft, i))}
                  accessibilityRole="button"
                  accessibilityLabel={t('pricing.edit.removeBand', { band: bandName })}
                  testID={`band-${i}-remove`}
                >
                  <Icon name="trash-can-outline" size={iconSize.md} color={th.icon.secondary} />
                </Pressable>
              ) : null}
            </View>
            {tags?.[i] ? (
              <View style={styles.tag}>
                <TierTagView tag={tags[i]} testID={`band-tag-${i}`} />
              </View>
            ) : null}
            {gap ? (
              <Text style={styles.note} testID={`band-${i}-gap`}>
                {t('pricing.edit.gapHint', { band: bandText(gap.from, gap.to) })}
              </Text>
            ) : null}

            <View style={pairStacked ? styles.stack : styles.row} testID={`band-${i}-span`}>
              {customer ? (
                <FigureField
                  fieldKey={fromKey}
                  label={t('pricing.addForm.fromKg')}
                  value={fromText}
                  onChangeText={text => onChange(i === 0 ? setFirstFrom(draft, text) : setBandFrom(draft, i, text))}
                  kind="kg"
                  fieldName={stepName(t('pricing.addForm.fieldFrom'), bandName)}
                  a11yLabel={spoken(name.from, bandName, unit.kg)}
                  error={errors[fromKey]}
                  fields={fields}
                  returnKeyType={keypad(fromKey)}
                  readOnly={readOnly}
                  stacked={pairStacked}
                  testID={i === 0 ? 'first-from' : `band-${i}-from`}
                />
              ) : null}
              <FigureField
                fieldKey={`band.${i}.upTo`}
                label={t('pricing.addForm.upToKg')}
                value={band.upTo}
                onChangeText={text => onChange(setUpTo(draft, i, text))}
                kind="kg"
                fieldName={stepName(t('pricing.addForm.fieldUpTo'), bandName)}
                a11yLabel={spoken(name.upTo, bandName, unit.kg)}
                error={errors[`band.${i}.upTo`]}
                fields={fields}
                returnKeyType={keypad(`band.${i}.upTo`)}
                readOnly={readOnly}
                stacked={pairStacked}
                testID={`band-${i}-upTo`}
              />
            </View>
            {pairError ? (
              <Text style={styles.error} accessibilityRole="alert" testID={`band-${i}-span-error`}>{pairError}</Text>
            ) : null}

            <View style={figuresStacked ? styles.stack : styles.row} testID={`band-${i}-figures`}>
              <FigureField
                fieldKey={`band.${i}.rent`}
                label={rentLabel}
                value={band.rent}
                onChangeText={text => onChange(setBandField(draft, i, 'rent', text))}
                kind="rent"
                fieldName={stepName(t('pricing.addForm.fieldRent'), bandName)}
                a11yLabel={spoken(name.rent, bandName, unit.rent)}
                error={errors[`band.${i}.rent`]}
                fields={fields}
                returnKeyType={keypad(`band.${i}.rent`)}
                readOnly={readOnly}
                stacked={figuresStacked}
                testID={`band-${i}-rent`}
              />
              {perBand ? (
                <>
                  {oneTime ? null : (
                    <FigureField
                      fieldKey={`band.${i}.labour`}
                      label={labourLabel}
                      value={band.labour ?? ''}
                      onChangeText={text => onChange(setBandField(draft, i, 'labour', text))}
                      kind="rupee"
                      fieldName={stepName(t('pricing.addForm.fieldLabour'), bandName)}
                      a11yLabel={spoken(name.labour, bandName, unit.labour)}
                      error={errors[`band.${i}.labour`]}
                      fields={fields}
                      returnKeyType={keypad(`band.${i}.labour`)}
                      readOnly={readOnly}
                      stacked={figuresStacked}
                      testID={`band-${i}-labour`}
                    />
                  )}
                  <FigureField
                    fieldKey={`band.${i}.tax`}
                    label={taxLabel}
                    value={band.tax ?? ''}
                    onChangeText={text => onChange(setBandField(draft, i, 'tax', text))}
                    kind="percent"
                    fieldName={stepName(t('pricing.addForm.fieldTax'), bandName)}
                    a11yLabel={spoken(name.tax, bandName, unit.percent)}
                    suffix="%"
                    error={errors[`band.${i}.tax`]}
                    fields={fields}
                    returnKeyType={keypad(`band.${i}.tax`)}
                    readOnly={readOnly}
                    stacked={figuresStacked}
                    testID={`band-${i}-tax`}
                  />
                </>
              ) : inRow ? (
                sharedFigures(figuresStacked, bandName)
              ) : null}
            </View>
            {figureError ? (
              <Text style={styles.error} accessibilityRole="alert" testID={`band-${i}-error`}>{figureError}</Text>
            ) : null}
            {inRow && !perBand && oneTime ? <Text style={styles.note}>{t('pricing.edit.oneTimeLabour')}</Text> : null}
          </View>
        );
      })}

      {inRow ? null : (
        <View style={styles.shared} testID="shared-figures">
          <Text style={styles.note}>{t('pricing.addForm.sharedCaption')}</Text>
          <View style={stackedFor(oneTime ? 1 : 2, layout.marginCompact) ? styles.stack : styles.row}>
            {sharedFigures(stackedFor(oneTime ? 1 : 2, layout.marginCompact), allBands)}
          </View>
          {firstError(errors, ['labour', 'tax']) ? (
            <Text style={styles.error} accessibilityRole="alert" testID="shared-figures-error">{firstError(errors, ['labour', 'tax'])}</Text>
          ) : null}
          {oneTime ? <Text style={styles.note}>{t('pricing.edit.oneTimeLabour')}</Text> : null}
        </View>
      )}

      {readOnly ? null : (
        <View style={styles.shared}>
          <BandsFooter draft={draft} ctx={ctx} errors={errors} onChange={onChange} />
        </View>
      )}
    </View>
  );
}

export default RateBandFields;
