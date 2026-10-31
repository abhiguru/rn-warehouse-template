/**
 * The weight bands of a rate as an editable table (style guide 13.2 and 13.7): one card, a header row
 * "Up to (kg) | Rent (₹) | Labour (₹) | Tax (%)", one row per band and a borderless cell for every figure.
 * A cell shows a 2 px `border.fieldFocus` ring while it is focused (an error ring while it is wrong), selects its
 * text on focus, opens a number pad and is at least 48 dp tall. The "From" of a band is text beside its
 * "Up to"; in a customer's rate it is a cell too (a customer's bands may leave gaps). Labour and tax are two
 * rows under the bands unless the bands differ in them, then they are columns.
 *
 * When the text is large (font scale 1.3 and up) or the columns would crowd the first one, the table is not
 * drawn: the card-per-band editor takes its place with the same draft, errors and setters, so one fallback
 * serves large text and narrow screens.
 */
import React, { useState } from 'react';
import { Text, TextInput, View, useWindowDimensions, type TextInputProps } from 'react-native';
import { HeaderCell, makeTableStyles, numberColumnWidth, rowWidth, useTableLayout, type TableLayout } from '@/components/common/DetailTable';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useThemedStyles } from '@/hooks/useTheme';
import { localizeDigits, normalizeDigits, t } from '@/i18n';
import { radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
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
import { bandText, unitText } from '../rateText';
import { packageUnit } from '@/utils/packagingWord';
import type { TierTag } from '../standardRate';
import { TierTagView } from './BandList';
import { BandsEditor } from './BandsEditor';
import { BandsFooter } from './BandsFooter';
import { fieldLink, type FieldNode, type FieldRegistry } from './fieldLink';

interface Props {
  draft: Draft;
  ctx: EditorContext;
  errors: Record<string, string>;
  onChange: (next: Draft) => void;
  fields?: FieldRegistry;
  /** One tag per band ('Standard' or 'This item'), shown under the row. */
  tags?: TierTag[] | null;
  /** The cells cannot be typed in (a box that waits for the other one to be saved or discarded). */
  readOnly?: boolean;
  /** The item's packaging (Bag, Box, Crate), for "per box" in the field labels; "bag" when unknown. */
  packaging?: string | null;
  testID?: string;
}

/** From this font scale the card-per-band editor replaces the table. */
export const TABLE_FALLBACK_SCALE = 1.3;
/** A cell never grows past this text size, so the columns sized to the text keep their figures on one line. */
const CELL_MAX_FONT_SCALE = TABLE_FALLBACK_SCALE;

/** The ring (2) and the padding (xs) on each side of a cell's text. */
const CELL_CHROME = 2 * (2 + space.xs);
/** Widths of the columns at font scale 1, for the figures a rate holds (₹999.99, 100 %, 9,999 kg). */
const BASE = { from: 52, upTo: 56, rent: 64, labour: 56, tax: 44 } as const;
/** The room the first column keeps for the "From" in front of its "Up to": text, or a cell and a dash. */
const FROM_TEXT_LEAD = 48;
const FROM_CELL_LEAD = 84;

const makeStyles = (th: ThemeTokens) => {
  const table = makeTableStyles(th);
  return {
    card: { ...table.card, marginHorizontal: 0, marginTop: 0, marginBottom: 0, ...th.shadow[0] },
    headerRow: table.headerRow,
    headerCell: table.headerCell,
    /** A band: its cells and, under them, its tag and its messages, closed by the divider. */
    band: { borderBottomWidth: 1, borderBottomColor: th.table.divider, paddingBottom: space.xs },
    line: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: space.sm,
      paddingHorizontal: space.md,
      paddingTop: space.xs,
    },
    first: { flex: 1, minWidth: 0, flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
    from: { ...typography.subhead, color: th.text.secondary, fontVariant: ['tabular-nums' as const] },
    grow: { flex: 1, minWidth: 0 },
    label: { ...typography.subhead, color: th.text.primary, flex: 1 },
    hint: { ...typography.footnote, color: th.text.secondary, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.xs },
    note: { ...typography.footnote, color: th.text.secondary, paddingHorizontal: space.md, paddingTop: space.xs },
    error: { ...typography.footnote, color: th.status.negative.text, paddingHorizontal: space.md, paddingTop: space.xs },
    tag: { paddingHorizontal: space.md, paddingTop: space.xs, alignItems: 'flex-start' as const },
    cell: {
      ...typography.subhead,
      fontVariant: ['tabular-nums' as const],
      color: th.text.primary,
      textAlign: 'right' as const,
      minHeight: touchTarget,
      paddingVertical: 0,
      paddingHorizontal: space.xs,
      borderWidth: 2,
      borderColor: 'transparent',
      borderRadius: radius.field,
    },
    cellFocused: { borderColor: th.border.fieldFocus, backgroundColor: th.surface.field },
    cellError: { borderColor: th.status.negative.border },
    cellDisabled: { color: th.text.secondary },
    dash: { ...typography.subhead, color: th.text.secondary },
    remove: { width: touchTarget, alignItems: 'center' as const, justifyContent: 'center' as const },
    footer: { gap: space.sm, paddingTop: space.sm },
  };
};

/** The width of a number column: its width at font scale 1 grown with the text, or with its widest figure or heading. */
function columnWidth(table: TableLayout, base: number, values: readonly string[], heading: string): number {
  const typed = numberColumnWidth(table, base, values);
  const headed = numberColumnWidth(table, 0, [], [heading], typography.footnote.fontSize ?? 13);
  return Math.max(typed, headed) + CELL_CHROME;
}

interface CellProps {
  fieldKey: string;
  value: string;
  onChangeText: (text: string) => void;
  label: string;
  error?: string;
  keyboardType: 'number-pad' | 'decimal-pad';
  returnKeyType: 'next' | 'done';
  fields?: FieldRegistry;
  readOnly?: boolean;
  width?: number;
  testID: string;
}

type Link = { ref?: (node: FieldNode | null) => void; onFocus?: () => void; onSubmitEditing?: () => void; blurOnSubmit?: boolean };

/** One figure of the table: a borderless input that shows its ring while it is being typed in. */
function Cell({ fieldKey, value, onChangeText, label, error, keyboardType, returnKeyType, fields, readOnly, width, testID }: CellProps) {
  const styles = useThemedStyles(makeStyles);
  const [focused, setFocused] = useState(false);
  const link = fieldLink(fields, fieldKey) as Link;
  const props: Partial<TextInputProps> = {
    selectTextOnFocus: true,
    keyboardType,
    returnKeyType,
    maxFontSizeMultiplier: CELL_MAX_FONT_SCALE,
  };
  return (
    <TextInput
      {...props}
      ref={link.ref as never}
      value={localizeDigits(value)}
      onChangeText={text => onChangeText(normalizeDigits(text))}
      onFocus={() => {
        setFocused(true);
        link.onFocus?.();
      }}
      onBlur={() => setFocused(false)}
      onSubmitEditing={link.onSubmitEditing}
      blurOnSubmit={link.blurOnSubmit}
      editable={!readOnly}
      style={[
        styles.cell,
        width !== undefined ? { width } : styles.grow,
        focused && styles.cellFocused,
        !!error && styles.cellError,
        readOnly && styles.cellDisabled,
      ]}
      accessibilityLabel={label}
      accessibilityHint={error}
      accessibilityState={{ disabled: !!readOnly }}
      testID={testID}
    />
  );
}

export function BandsTable({ draft, ctx, errors, onChange, fields, tags, readOnly = false, packaging, testID = 'bands-table' }: Props) {
  const styles = useThemedStyles(makeStyles);
  const table = useTableLayout();
  const { fontScale } = useWindowDimensions();
  const oneTime = draft.priceType === 'one_time';
  const perBand = draft.bands.some(b => b.labour !== undefined);
  const showLabour = perBand && !oneTime;
  const customer = !!ctx.customerId;
  const removable = draft.bands.length >= 2 && !readOnly;

  const rentValues = draft.bands.map(b => b.rent);
  const widths = {
    from: columnWidth(table, BASE.from, draft.bands.map((b, i) => (i === 0 ? draft.firstFromText ?? String(draft.firstFrom) : b.fromText ?? String(fromOf(draft, i) ?? ''))), t('pricing.edit.firstFrom')),
    upTo: columnWidth(table, BASE.upTo, draft.bands.map(b => b.upTo), t('pricing.edit.upTo')),
    rent: columnWidth(table, BASE.rent, rentValues, `${t('pricing.band.rentOnce')} (₹)`),
    labour: columnWidth(table, BASE.labour, draft.bands.map(b => b.labour ?? ''), `${t('pricing.item.labour')} (₹)`),
    tax: columnWidth(table, BASE.tax, draft.bands.map(b => b.tax ?? draft.tax), `${t('pricing.item.tax')} (%)`),
  };
  const columns = [widths.rent, ...(showLabour ? [widths.labour] : []), ...(perBand ? [widths.tax] : []), ...(removable ? [touchTarget] : [])];
  // The first column holds the From and the Up to; it keeps what they need, and the rest is for the figure columns.
  const taken = columns.reduce((sum, width) => sum + width + space.sm, 0);
  const firstNeeds = Math.ceil((customer ? FROM_CELL_LEAD : FROM_TEXT_LEAD) * table.scale) + widths.upTo;
  const crowd = rowWidth(table) - taken < firstNeeds;

  // Large text or crowded columns: the card-per-band editor, with the shared labour and tax under it.
  if (fontScale >= TABLE_FALLBACK_SCALE || crowd) {
    return (
      <View style={styles.footer} testID={`${testID}-stacked`}>
        <BandsEditor draft={draft} ctx={ctx} errors={errors} onChange={onChange} fields={fields} />
        {perBand ? null : (
          <>
            {oneTime ? (
              <Text style={styles.note}>{t('pricing.edit.oneTimeLabour')}</Text>
            ) : (
              <Input
                label={t('pricing.edit.labour')}
                required
                numeric
                selectTextOnFocus
                value={draft.labour}
                onChangeText={text => onChange({ ...draft, labour: text })}
                keyboardType="decimal-pad"
                returnKeyType="next"
                error={errors.labour}
                leftIcon={<Text style={styles.dash}>₹</Text>}
                testID="labour"
                {...fieldLink(fields, 'labour')}
              />
            )}
            <Input
              label={t('pricing.edit.tax')}
              required
              numeric
              selectTextOnFocus
              value={draft.tax}
              onChangeText={text => onChange({ ...draft, tax: text })}
              keyboardType="decimal-pad"
              returnKeyType="done"
              error={errors.tax}
              rightIcon={<Text style={styles.dash}>%</Text>}
              testID="tax"
              {...fieldLink(fields, 'tax')}
            />
          </>
        )}
      </View>
    );
  }

  const unit = {
    kg: t('pricing.box.unitKg'),
    rent: t('pricing.box.unitRupees', { unit: unitText(oneTime ? 'one_time' : 'monthly', packaging) }),
    labour: t('pricing.box.unitLabour', { unit: packageUnit(packaging) }),
    percent: t('pricing.box.unitPercent'),
  };
  const name = {
    from: t('pricing.edit.firstFrom'),
    upTo: t('pricing.edit.upTo'),
    rent: t('pricing.band.rentOnce'),
    labour: t('pricing.item.labour'),
    tax: t('pricing.item.tax'),
  };
  const a11y = (field: string, band: string, unitText: string) => t('pricing.box.cellA11y', { field, band, unit: unitText });
  const allBands = t('pricing.box.allBands');

  const header = (text: string, width: number) => (
    <HeaderCell numeric oneLine style={{ width, paddingRight: CELL_CHROME / 2 }}>{text}</HeaderCell>
  );

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.headerRow}>
        <HeaderCell oneLine style={styles.grow}>
          {customer ? `${name.from} – ${name.upTo} (${t('pricing.kg')})` : `${name.upTo} (${t('pricing.kg')})`}
        </HeaderCell>
        {header(`${t('pricing.band.rentOnce')} (₹)`, widths.rent)}
        {showLabour ? header(`${t('pricing.item.labour')} (₹)`, widths.labour) : null}
        {perBand ? header(`${t('pricing.item.tax')} (%)`, widths.tax) : null}
        {removable ? <View style={{ width: touchTarget }} /> : null}
      </View>
      {readOnly ? null : <Text style={styles.hint}>{t('pricing.box.hint')}</Text>}

      {draft.bands.map((band, i) => {
        const from = fromOf(draft, i);
        const to = wholeKg(band.upTo);
        const kgText = (n: number | null) => (n === null ? '–' : localizeDigits(String(n)));
        const bandName =
          from !== null && to !== null
            ? t('pricing.edit.bandRange', { from: kgText(from), to: kgText(to) })
            : t('pricing.edit.fromKg', { kg: kgText(from) });
        const keys = [i === 0 ? 'firstFrom' : `band.${i}.from`, `band.${i}.upTo`, `band.${i}.rent`, `band.${i}.labour`, `band.${i}.tax`];
        const rowError = keys.map(k => errors[k]).find(Boolean);
        const gap = customer ? gapBefore(draft, i) : null;
        const fromKey = i === 0 ? 'firstFrom' : `band.${i}.from`;
        const removeName = bandName;
        return (
          <View key={i} style={styles.band} testID={`band-${i}`}>
            <View style={styles.line}>
              <View style={styles.first}>
                {customer ? (
                  <>
                    <Cell
                      fieldKey={fromKey}
                      value={i === 0 ? draft.firstFromText ?? String(draft.firstFrom) : band.fromText ?? String(from ?? '')}
                      onChangeText={text => onChange(i === 0 ? setFirstFrom(draft, text) : setBandFrom(draft, i, text))}
                      label={a11y(name.from, bandName, unit.kg)}
                      error={errors[fromKey]}
                      keyboardType="number-pad"
                      returnKeyType="next"
                      fields={fields}
                      readOnly={readOnly}
                      width={widths.from}
                      testID={i === 0 ? 'first-from' : `band-${i}-from`}
                    />
                    <Text style={styles.dash}>–</Text>
                  </>
                ) : (
                  <Text style={styles.from} testID={`band-${i}-from`}>{`${kgText(from)} –`}</Text>
                )}
                <Cell
                  fieldKey={`band.${i}.upTo`}
                  value={band.upTo}
                  onChangeText={text => onChange(setUpTo(draft, i, text))}
                  label={a11y(name.upTo, bandName, unit.kg)}
                  error={errors[`band.${i}.upTo`]}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  fields={fields}
                  readOnly={readOnly}
                  testID={`band-${i}-upTo`}
                />
              </View>
              <Cell
                fieldKey={`band.${i}.rent`}
                value={band.rent}
                onChangeText={text => onChange(setBandField(draft, i, 'rent', text))}
                label={a11y(name.rent, bandName, unit.rent)}
                error={errors[`band.${i}.rent`]}
                keyboardType="decimal-pad"
                returnKeyType="next"
                fields={fields}
                readOnly={readOnly}
                width={widths.rent}
                testID={`band-${i}-rent`}
              />
              {showLabour ? (
                <Cell
                  fieldKey={`band.${i}.labour`}
                  value={band.labour ?? ''}
                  onChangeText={text => onChange(setBandField(draft, i, 'labour', text))}
                  label={a11y(name.labour, bandName, unit.labour)}
                  error={errors[`band.${i}.labour`]}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  fields={fields}
                  readOnly={readOnly}
                  width={widths.labour}
                  testID={`band-${i}-labour`}
                />
              ) : null}
              {perBand ? (
                <Cell
                  fieldKey={`band.${i}.tax`}
                  value={band.tax ?? ''}
                  onChangeText={text => onChange(setBandField(draft, i, 'tax', text))}
                  label={a11y(name.tax, bandName, unit.percent)}
                  error={errors[`band.${i}.tax`]}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  fields={fields}
                  readOnly={readOnly}
                  width={widths.tax}
                  testID={`band-${i}-tax`}
                />
              ) : null}
              {removable ? (
                <View style={styles.remove}>
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
                </View>
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
            {rowError ? (
              <Text style={styles.error} accessibilityRole="alert" testID={`band-${i}-error`}>{rowError}</Text>
            ) : null}
          </View>
        );
      })}

      {perBand ? null : (
        <>
          {oneTime ? (
            <Text style={styles.note}>{t('pricing.edit.oneTimeLabour')}</Text>
          ) : (
            <SharedRow
              label={`${name.labour} (₹)`}
              cell={
                <Cell
                  fieldKey="labour"
                  value={draft.labour}
                  onChangeText={text => onChange({ ...draft, labour: text })}
                  label={a11y(name.labour, allBands, unit.labour)}
                  error={errors.labour}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  fields={fields}
                  readOnly={readOnly}
                  width={widths.rent}
                  testID="labour"
                />
              }
              error={errors.labour}
              testID="labour-row"
            />
          )}
          <SharedRow
            label={`${name.tax} (%)`}
            cell={
              <Cell
                fieldKey="tax"
                value={draft.tax}
                onChangeText={text => onChange({ ...draft, tax: text })}
                label={a11y(name.tax, allBands, unit.percent)}
                error={errors.tax}
                keyboardType="decimal-pad"
                returnKeyType="done"
                fields={fields}
                readOnly={readOnly}
                width={widths.rent}
                testID="tax"
              />
            }
            error={errors.tax}
            testID="tax-row"
          />
        </>
      )}

      {readOnly ? null : (
        <View style={[styles.line, styles.footer]}>
          <View style={styles.grow}>
            <BandsFooter draft={draft} ctx={ctx} errors={errors} onChange={onChange} />
          </View>
        </View>
      )}
    </View>
  );
}

/** Labour or tax shared by every band: a row under the bands with its cell in the rent column. */
function SharedRow({ label, cell, error, testID }: { label: string; cell: React.ReactNode; error?: string; testID: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.band} testID={testID}>
      <View style={styles.line}>
        <Text style={styles.label}>{label}</Text>
        {cell}
      </View>
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

export default BandsTable;