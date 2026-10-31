/**
 * The rate sheet of the GRN Review step: Add rate (a line has no rate) and Change (it has one). It saves
 * nothing itself: the entry goes to the GRN form and is saved with the GRN. A change of a rate in force
 * (This customer / Everyone) first lists what it does and asks.
 *
 * Compact (owner, 2026-10-17), in the order it is filled: the dates (one line that opens on a tap), "For" (a segmented choice; the full-width row under it says
 * what the choice does and opens what the three mean), the weight band (always editable, checked as a field is left:
 * it must hold this line's weight), the price type (the GRN's, fixed here, set in GRN details), then rent, labour and
 * tax side by side (stacked at large text) with + and − under each; the rates in force, and this GRN's own or waiting
 * one, in a small table above them. It is a full screen (owner, 2026-10-17: not a bottom sheet): close at the
 * start of the header, the form scrolls, Save rate stays pinned at the bottom above the keyboard.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/RadioButton';
import { ChoiceChips } from '@/features/filters/components/ChoiceChips';
import { wholeKg } from '@/features/item-pricing/editModel';
import { figuresStack } from '@/features/item-pricing/figureRow';
import { addDays, bandText, dateText, money } from '@/features/item-pricing/rateText';
import { RateChangeDialog, rateChangeSummary } from './RateChangeDialog';
import { acceptRentText, priceNumber, rentNumber, RENT_MAX } from '@/utils/priceNumbers';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { showAlert } from '@/utils/alert';
import { formatIdentifier, localizeDigits, t } from '@/i18n';
import { ONE_LINE, makeTableStyles } from '@/components/common/DetailTable';
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { DataTable } from '@/components/table/DataTable';
import { amountText, taxText } from './rateFigures';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { formatWeightEach, parseLocalISODate, toLocalISODate } from '@/utils/formatters';
import { rowWeightText } from './GrnRatesSection';
import {
  changeFacts,
  defaultTo,
  entryProblems,
  preloadAdd,
  preloadChange,
  referenceRates,
  type ChangeFacts,
  type ReferenceRate,
  type PreloadInput,
  type PricedRow,
  type SheetEntry,
} from './grnRateModel';
import type { RateScope } from './types';
import type { ScrollViewRef, TextInputRef } from '@/types/nativeRefs';

export interface GrnRateSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The row being priced; its `rate` decides Add (null) or Change. */
  row: PricedRow | null;
  input: PreloadInput;
  customerName: string;
  /** "Monthly" / "One-time". */
  priceTypeText: string;
  /** The number of the GRN being created or edited: the first choice of "For" is named by it ("This GRN" without one). */
  grnNumber?: string;
  onSave: (entry: SheetEntry) => void;
}

const text = (n: number | null): string => (n === null ? '' : String(Math.round(n * 100) / 100));
/** Rupee figures with two decimals, as the table above shows them (owner, 2026-10-17: "88.00", not "88"). */
const rupees = (n: number | null): string => (n === null ? '' : n.toFixed(2));
/** What a − or + press adds, and the most a figure may be (owner, 2026-10-17). */
const STEP = { rent: 0.25, labour: 0.25, tax: 1, from: 1, upTo: 1 } as const;
const MAX = { rent: RENT_MAX, labour: 999999, tax: 100, from: 100000, upTo: 100000 } as const;
type StepKey = keyof typeof STEP;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The − and + buttons are drawn 36 tall; their touch area is padded to touchTarget (as StepperInput's). */
const STEPPER_HEIGHT = 36;
const STEP_HIT_SLOP = { top: (touchTarget - STEPPER_HEIGHT) / 2, bottom: (touchTarget - STEPPER_HEIGHT) / 2 };

const makeStyles = (th: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: th.background.base },
  flex: { flex: 1 },
  // A full screen (owner, 2026-10-17): close at the start of the header, as the app's other full-screen forms.
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingLeft: space.xs,
    paddingRight: layout.marginCompact,
    paddingVertical: space.xs,
    minHeight: touchTarget + space.md,
    backgroundColor: th.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: th.border.divider,
    gap: space.sm,
  },
  headerText: { flex: 1 },
  // As an object header (style guide §13.8): what is being done in footnote, then the item in headline; each one line.
  kicker: { ...typography.footnote, color: th.text.secondary },
  title: { ...typography.headline, color: th.text.primary },
  close: { width: touchTarget, height: touchTarget, alignItems: 'center' as const, justifyContent: 'center' as const },
  body: { paddingHorizontal: layout.marginCompact, paddingTop: space.md, paddingBottom: space.xl, gap: space.lg },
  figures: { flexDirection: 'row' as const, gap: space.sm, alignItems: 'flex-start' as const },
  figure: { flex: 1 },
  stack: { gap: space.sm },
  label: { ...typography.footnote, color: th.text.secondary },
  section: { gap: space.xs },
  bandHint: { marginTop: -space.sm },
  disclosure: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: touchTarget, gap: space.sm, marginBottom: space.sm },
  // The For group: the same padding open and closed (nothing moves); open, it is one shaded panel round the line,
  // the choices and what they mean.
  forGroup: { paddingHorizontal: space.sm, paddingBottom: space.sm, marginHorizontal: -space.sm, borderRadius: radius.card, borderWidth: 1, borderColor: 'transparent' },
  // Open, an outline and no fill: a filled grey shape on this screen means a fixed fact (the start date pill)
  // (owner, 2026-10-17). The border is always there, transparent when closed, so nothing moves.
  forGroupOpen: { borderColor: th.border.divider },
  // Main text colour and an accent chevron: it reads as something to tap, not as a hint (owner, 2026-10-17).
  disclosureText: { ...typography.subhead, color: th.text.primary, flex: 1 },
  // 8 between + and −, the app's spacing between tappable controls (owner, 2026-10-17: 4 was easy to miss-tap).
  steps: { flexDirection: 'row' as const, gap: space.sm, marginTop: space.xs },
  step: {
    flex: 1,
    height: STEPPER_HEIGHT,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: th.border.button,
    borderRadius: radius.button,
  },
  stepPressed: { backgroundColor: th.brand.subtle },
  stepDisabled: { opacity: th.interaction.disabledOpacity },
  segments: { paddingHorizontal: 0, paddingVertical: 0, minHeight: 0 },
  explain: { marginBottom: space.md, gap: space.xs },
  explainLine: { ...typography.footnote, color: th.text.primary },
  explainTerm: { fontWeight: '600' as const },
  // A fixed fact, set apart from the fields round it: a filled pill with no border (fields have one) and a locked
  // calendar (owner, 2026-10-17: grey footnote text blended into the weight fields).
  dates: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.button,
    backgroundColor: th.table.insetFill,
  },
  datesText: { ...typography.subhead, fontWeight: '600' as const, color: th.text.primary },
  datesOpen: { gap: space.sm, paddingTop: space.xs },
  error: { ...typography.footnote, color: th.status.negative.text },
  // A full-width pill that opens: outlined (a filled pill here is a fixed fact, the start date) with an accent chevron
  // (owner, 2026-10-17).
  // The outline holds the toggle and, open, the date and the table: one block (owner, 2026-10-17).
  refBox: { borderRadius: radius.button, borderWidth: 1, borderColor: th.border.button, overflow: 'hidden' as const },
  refToggle: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: touchTarget, gap: space.sm, paddingHorizontal: space.md },
  refBody: { paddingHorizontal: space.sm, paddingBottom: space.sm, gap: space.xs },
  refToggleText: { ...typography.subhead, fontWeight: '600' as const, color: th.text.primary, flex: 1 },
  footer: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.sm,
    backgroundColor: th.surface.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: th.border.divider,
  },
});

/** One row of the reference table: who the rate is for, and the rate (null: none). */
interface ReferenceRow {
  key: 'current' | 'customer' | 'everyone';
  label: string;
  rate: ReferenceRate | null;
}

const referenceColumn = createAppColumnHelper<ReferenceRow>();
/** The width of a figure column of the reference table. */
const REF_WIDTH = 72;

/** "View customer and everyone rates": Who | Rent | Labour | Tax, one row per rate it is set against. */
function ReferenceTable({ rows, oneTime }: { rows: ReferenceRow[]; oneTime: boolean }) {
  const table = useThemedStyles(makeTableStyles);
  const columns = useMemo(() => {
    const figure = (header: string, id: string, pick: (rate: ReferenceRate) => number, text: (n: number | null) => string) =>
      referenceColumn.display({
        id,
        header,
        meta: { width: REF_WIDTH, numeric: true },
        cell: ({ row }) => <Text style={table.number} {...ONE_LINE}>{text(row.original.rate ? pick(row.original.rate) : null)}</Text>,
      });
    return referenceColumn.columns([
      referenceColumn.display({
        id: 'who',
        header: t('grn.rates.sheet.refWho'),
        meta: { width: 'grow' },
        cell: ({ row }) => (
          <>
            <Text style={table.primary} {...ONE_LINE}>{row.original.label}</Text>
            <Text style={table.secondary} {...ONE_LINE}>
              {row.original.rate ? bandText(row.original.rate.band.weight_min, row.original.rate.band.weight_max) : t('grn.rates.sheet.refNoneShort')}
            </Text>
          </>
        ),
      }),
      figure(t('grn.rates.sheet.refRent'), 'rent', rate => rate.figures.unit_price, amountText),
      ...(oneTime ? [] : [figure(t('grn.rates.sheet.refLabour'), 'labour', rate => rate.figures.labour_rate, amountText)]),
      figure(t('grn.rates.sheet.refTax'), 'tax', rate => rate.figures.tax_percent, taxText),
    ]);
  }, [oneTime, table]);
  const tanstack = useAppTable({ columns, data: rows, getRowId: row => row.key });

  const rowLabel = ({ label, rate }: ReferenceRow) =>
    rate
      ? t(oneTime ? 'grn.rates.sheet.refA11yOneTime' : 'grn.rates.sheet.refA11y', {
          who: label,
          band: bandText(rate.band.weight_min, rate.band.weight_max),
          rent: money(rate.figures.unit_price),
          labour: money(rate.figures.labour_rate),
          tax: localizeDigits(String(rate.figures.tax_percent)),
        })
      : t('grn.rates.sheet.refNone', { who: label });

  return <DataTable table={tanstack} variant="nested" rowLabel={row => rowLabel(row.original)} rowTestID={row => `rate-ref-${row.original.key}`} />;
}

export function GrnRateSheet({ visible, onClose, row, input, customerName, priceTypeText, grnNumber, onSave }: GrnRateSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const th = useTokens();
  const insets = useSafeAreaInsets();
  const { fontScale, width: windowWidth } = useWindowDimensions();
  const oneTime = input.ctx.priceType === 'one_time';
  const adding = row !== null && row.rate === null;
  // Large text, or a field too narrow for the widest rent (9999.99): the figures stack, one under another (as the rate tables fall back to cards).
  const stackFigures = figuresStack({ width: windowWidth, fontScale, count: oneTime ? 2 : 3, edge: layout.marginCompact });
  // From and Up to are two fields in a row, whatever the figures below hold.
  const stackPair = figuresStack({ width: windowWidth, fontScale, count: 2, edge: layout.marginCompact });

  const preload = useMemo(
    () => (row ? (row.rate ? preloadChange(row, row.rate, input) : preloadAdd(row, input)) : null),
    // The preload is made once per opening; later reads of the rates do not rewrite what is typed.
    [row?.key, visible],
  );

  const [scope, setScope] = useState<RateScope>('everyone');
  const [from, setFrom] = useState('');
  const [upTo, setUpTo] = useState('');
  const [rent, setRent] = useState('');
  const [labour, setLabour] = useState('');
  const [tax, setTax] = useState('');
  const [to, setTo] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [facts, setFacts] = useState<{ facts: ChangeFacts; entry: SheetEntry } | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  // Where the dates, the weights and the figures sit in the scroll, to bring the first wrong one into view when a save
  // is refused (style guide §14.4).
  const scrollRef = useRef<ScrollViewRef>(null);
  const sectionY = useRef({ dates: 0, band: 0, figures: 0 });
  // The keypad's Next moves through the fields in order; the last one shows Done and only closes the keyboard.
  const fieldRefs = useRef<Partial<Record<StepKey, TextInputRef | null>>>({});

  useEffect(() => {
    if (!visible || !preload) return;
    setScope(preload.scope);
    setFrom(String(preload.band.weight_min));
    setUpTo(String(preload.band.weight_max));
    setRent(rupees(preload.figures.unit_price));
    setLabour(rupees(preload.figures.labour_rate));
    setTax(text(preload.figures.tax_percent));
    setTo(preload.to);
    // A loaded rent above the limit says so at once.
    setErrors(preload.figures.unit_price !== null && preload.figures.unit_price > RENT_MAX ? { rent: t('pricing.edit.err.rent') } : {});
    setFacts(null);
    setExplainOpen(false);
    setReferenceOpen(false);
  }, [preload, visible]);

  if (!row || !preload) return null;

  const pickScope = (next: RateScope) => {
    setScope(next);
    setErrors({});
    // The first two scopes end where a planned rate of the band begins; Only this GRN has no end.
    const nextTo = next === 'grn' ? null : defaultTo(next, row.item_id, { weight_min: wholeKg(from) ?? preload.band.weight_min, weight_max: wholeKg(upTo) ?? preload.band.weight_max }, input);
    setTo(nextTo);
  };

  const save = () => {
    const next: Record<string, string> = bandProblems(from, upTo);
    const min = wholeKg(from);
    const max = wholeKg(upTo);
    const unit = rentNumber(rent);
    if (unit === null) next.rent = t('pricing.edit.err.rent');
    const labourRate = oneTime ? 0 : priceNumber(labour, 2);
    if (labourRate === null) next.labour = t('pricing.edit.err.labour');
    const taxPercent = priceNumber(tax, 2);
    if (taxPercent === null || taxPercent > 100) next.tax = tax.trim() === '' ? t('pricing.edit.err.taxRequired') : t('pricing.edit.err.tax');
    if (min !== null && max !== null && unit !== null && labourRate !== null && taxPercent !== null && taxPercent <= 100) {
      const entry: SheetEntry = {
        scope,
        weight_min: min,
        weight_max: max,
        unit_price: unit,
        labour_rate: labourRate,
        tax_percent: taxPercent,
        to: scope === 'grn' ? null : to,
      };
      const problems = entryProblems(entry, row, input);
      if (problems.to) next.to = t('grn.rates.sheet.errTo', { date: dateText(input.ctx.day) });
      if (problems.planned) next.to = t('grn.rates.sheet.errPlanned', { date: dateText(problems.planned.date ?? '') });
      if (problems.overlap) next.overlap = problems.overlap.date ? t('grn.rates.sheet.errPlanned', { date: dateText(problems.overlap.date) }) : t('grn.rates.sheet.errOverlap');
      if (Object.keys(next).length === 0) {
        const found = changeFacts(entry, row, input);
        if (found) setFacts({ facts: found, entry });
        else onSave(entry);
        setErrors({});
        return;
      }
    }
    setErrors(next);
    const first = next.to ? 'dates' : next.from || next.upTo || next.overlap ? 'band' : next.rent || next.labour || next.tax ? 'figures' : null;
    if (first) scrollRef.current?.scrollTo({ y: Math.max(0, sectionY.current[first] - space.md), animated: true });
  };

  // Leaving with something changed asks once, as every form does (style guide §14.4; owner, 2026-10-17). The screen
  // is a Modal, not a route, so useLeaveGuard does not apply: ✕ and Android Back both come here.
  const dirty =
    scope !== preload.scope ||
    from !== String(preload.band.weight_min) ||
    upTo !== String(preload.band.weight_max) ||
    rent !== rupees(preload.figures.unit_price) ||
    labour !== rupees(preload.figures.labour_rate) ||
    tax !== text(preload.figures.tax_percent) ||
    to !== preload.to;
  const requestClose = () => {
    if (!dirty) {
      onClose();
      return;
    }
    showAlert(
      t('common.discardChangesTitle'),
      t('common.discardChangesMessage'),
      [
        { text: t('common.keepEditing'), style: 'cancel' },
        { text: t('common.discard'), style: 'destructive', onPress: onClose },
      ],
      { cancelable: true },
    );
  };

  const weightEach = row.weight > 0 ? formatWeightEach(row.weight) : t('grn.rates.noWeightTag');
  const heading = adding ? t('grn.rates.sheet.titleAdd') : t('grn.rates.sheet.titleChange');
  /**
   * What is wrong with the band as typed, on the field that is wrong, as the limit it must keep (owner, 2026-10-17:
   * "From (kg) · at most 1 kg"): the band must hold this line's weight, so From is at most it and Up to at least it.
   */
  function bandProblems(fromText: string, upToText: string): Record<string, string> {
    const min = wholeKg(fromText);
    const max = wholeKg(upToText);
    const weight = rowWeightText(row!.weight);
    const found: Record<string, string> = {};
    if (min === null) found.from = t('grn.rates.sheet.ruleWholeKg');
    else if (min > row!.weight) found.from = t('grn.rates.sheet.ruleAtMost', { weight });
    if (max === null) found.upTo = t('grn.rates.sheet.ruleWholeKg');
    else if (max < row!.weight) found.upTo = t('grn.rates.sheet.ruleAtLeast', { weight });
    return found;
  }
  /** The band as typed, checked when a weight field is left or stepped. */
  const checkBand = (fromText = from, upToText = upTo) => {
    const found = bandProblems(fromText, upToText);
    const { from: _f, upTo: _u, overlap: _o, ...rest } = errors;
    setErrors({ ...rest, ...found });
  };
  const summary = facts ? rateChangeSummary(facts.facts, row, customerName, oneTime) : null;
  const grnLabel = grnNumber ? formatIdentifier(grnNumber) : t('grn.rates.sheet.forGrn');
  const what =
    scope === 'customer'
      ? t('grn.rates.sheet.forWhatCustomer')
      : scope === 'everyone'
        ? t('grn.rates.sheet.forWhatEveryone')
        : grnNumber
          ? t('grn.rates.sheet.forWhatGrnNumber', { number: formatIdentifier(grnNumber) })
          : t('grn.rates.sheet.forWhatGrn');
  // A rate for this GRN only has no end, and says so; the others show the end choice under the line, always
  // (owner, 2026-10-17: a folded line read as a missing field).
  const datesLine = scope === 'grn'
    ? [t('grn.rates.sheet.datesFrom', { date: dateText(input.ctx.day) }), t('grn.rates.sheet.datesNoEndGrn')].join(' · ')
    : t('grn.rates.sheet.datesFrom', { date: dateText(input.ctx.day) });

  // The GRN itself first, named by its number (owner, 2026-10-17), then the wider choices.
  // What is in force now for this weight, to set the new figures against (owner, 2026-10-17).
  const reference = referenceRates(row, input);
  // The rate the line has now when it is not one of the two below: this GRN's own rate, or a change waiting in the
  // form. It takes the place of a "was …" under each field (owner, 2026-10-17: that pushed one field's + and − down).
  const current: ReferenceRate | null =
    row.rate && (row.rate.source === 'grn' || row.rate.source === 'change')
      ? { band: { weight_min: row.rate.weight_min, weight_max: row.rate.weight_max }, figures: { unit_price: row.rate.unit_price, labour_rate: row.rate.labour_rate, tax_percent: row.rate.tax_percent } }
      : null;
  const currentLabel = row.rate?.source === 'change' ? t('grn.rates.sheet.refPending') : grnLabel;
  const scopeOptions: { value: RateScope; label: string; a11yLabel?: string }[] = [
    // Read out as "This GRN, WMWM8885": the number alone does not say what the choice does (owner, 2026-10-17).
    { value: 'grn', label: grnLabel, a11yLabel: grnNumber ? t('grn.rates.sheet.forGrnA11y', { number: formatIdentifier(grnNumber) }) : undefined },
    { value: 'customer', label: t('grn.rates.sheet.forCustomer') },
    { value: 'everyone', label: t('grn.rates.sheet.forEveryone') },
  ];
  const stepButton = (key: StepKey, value: string, set: (v: string) => void, dir: -1 | 1, name: string) => {
    const kg = key === 'from' || key === 'upTo';
    const now = (kg ? wholeKg(value) : priceNumber(value, 2)) ?? 0;
    const next = Math.min(MAX[key], Math.max(0, round2(now + dir * STEP[key])));
    const stepText = kg ? `${localizeDigits(String(STEP[key]))} ${t('pricing.kg')}` : key === 'tax' ? `${localizeDigits(String(STEP.tax))}%` : money(STEP[key]);
    const disabled = next === now || (dir > 0 && now >= MAX[key]);
    const toMax = dir < 0 && now > MAX[key];
    // A weight stepped is checked at once, as when its field is left.
    const press = kg
      ? () => { set(String(next)); checkBand(key === 'from' ? String(next) : from, key === 'upTo' ? String(next) : upTo); }
      : () => { set(key === 'tax' ? text(next) : rupees(next)); setErrors(e => { const { [key]: _gone, ...rest } = e; return rest; }); };
    return (
      <Pressable
        style={({ pressed }) => [styles.step, pressed && styles.stepPressed, disabled && styles.stepDisabled]}
        hitSlop={STEP_HIT_SLOP}
        onPress={press}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={
          toMax
            ? t('grn.rates.sheet.stepDownToMax', { field: name, amount: money(MAX[key]) })
            : t(dir < 0 ? 'grn.rates.sheet.stepDown' : 'grn.rates.sheet.stepUp', { field: name, step: stepText })
        }
        accessibilityState={{ disabled }}
        testID={`rate-${key}-${dir < 0 ? 'down' : 'up'}`}
      >
        <Icon name={dir < 0 ? 'minus' : 'plus'} size={iconSize.md} color={th.brand.tint} />
      </Pressable>
    );
  };
  /** + then − (owner, 2026-10-17), under the field. */
  const steppers = (key: StepKey, value: string, set: (v: string) => void) => (
    <View style={styles.steps}>
      {stepButton(key, value, set, 1, t(`grn.rates.sheet.field_${key}`))}
      {stepButton(key, value, set, -1, t(`grn.rates.sheet.field_${key}`))}
    </View>
  );
  const fieldOrder: StepKey[] = oneTime ? ['from', 'upTo', 'rent', 'tax'] : ['from', 'upTo', 'rent', 'labour', 'tax'];
  /** Next / Done on the keypad for a field: Next focuses the field after it; Done (the last) closes the keyboard. */
  const keypadProps = (key: StepKey) => {
    const next = fieldOrder[fieldOrder.indexOf(key) + 1];
    return {
      ref: (node: TextInputRef | null) => { fieldRefs.current[key] = node; },
      returnKeyType: next ? ('next' as const) : ('done' as const),
      submitBehavior: next ? ('submit' as const) : ('blurAndSubmit' as const),
      onSubmitEditing: next ? () => fieldRefs.current[next]?.focus() : undefined,
    };
  };
  const figure = (key: 'rent' | 'labour' | 'tax', label: string, value: string, set: (v: string) => void, preloaded: number | null, suffix?: string) => (
    <View key={key} style={stackFigures ? undefined : styles.figure}>
    <Input
      label={label}
      numeric
      selectTextOnFocus
      value={value}
      onChangeText={
        key === 'rent'
          ? (typed: string) => {
              const kept = acceptRentText(value, typed);
              set(kept);
              // A refused key says why at once; an accepted one takes the message away.
              setErrors(e => {
                // The message stays while a stored rent that is too high is still in the box.
                if (kept !== typed || (priceNumber(kept, 2) ?? 0) > RENT_MAX) return { ...e, rent: t('pricing.edit.err.rent') };
                const { rent: _gone, ...rest } = e;
                return rest;
              });
            }
          : set
      }
      keyboardType="decimal-pad"
      {...keypadProps(key)}
      error={errors[key]}
      rightIcon={suffix ? <Text style={styles.label}>{suffix}</Text> : undefined}
      testID={`rate-${key}`}
    />
      {steppers(key, value, set)}
    </View>
  );

  return (
    <>
      {/* Edge to edge, a Modal is not resized for the keyboard: it pads itself by the insets and lets
          KeyboardAvoidingView count the keyboard once (style guide §5.2). */}
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={requestClose}>
        <View style={[styles.screen, { paddingTop: insets.top }]} testID="rate-screen">
          <View style={styles.header}>
            <Pressable style={styles.close} onPress={requestClose} accessibilityRole="button" accessibilityLabel={t('common.close')} testID="rate-close">
              <Icon name="close" size={iconSize.md} color={th.icon.primary} />
            </Pressable>
            {/* One line each, never wrapped (owner, 2026-10-17): a long item name shrinks a little, then ends in "…";
                the whole of it is read out. */}
            {/* The price type is the GRN's (set in GRN details), so it is a fact in the header, not a field (owner, 2026-10-17). */}
            <View style={styles.headerText} accessible accessibilityRole="header" accessibilityLabel={`${heading}, ${row.item_name}, ${weightEach}, ${priceTypeText}`}>
              <Text style={styles.kicker} numberOfLines={1} testID="rate-sheet-kicker">{[heading, weightEach, priceTypeText].filter(Boolean).join(' · ')}</Text>
              <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail" adjustsFontSizeToFit minimumFontScale={0.85} testID="rate-sheet-item">{row.item_name}</Text>
            </View>
          </View>
          <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={-insets.bottom}>
        <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* No "For" label: the line and the choices say it (owner, 2026-10-17). */}
          <View style={styles.section}>
            <View style={[styles.forGroup, explainOpen && styles.forGroupOpen]} testID="rate-for-group">
              {/* What the choice does, above the choices it is about; a tap opens one panel round the line, the choices
                  and what each means (owner, 2026-10-17: an ⓘ beside the choices was too easy to miss-tap). */}
              <Pressable
                style={styles.disclosure}
                onPress={() => setExplainOpen(o => !o)}
                accessibilityRole="button"
                accessibilityLabel={what}
                accessibilityHint={t('grn.rates.sheet.explainLabel')}
                accessibilityState={{ expanded: explainOpen }}
                testID="rate-explain"
              >
                <Text style={styles.disclosureText} numberOfLines={1} accessibilityLiveRegion="polite" testID="rate-for-what">{what}</Text>
                <Icon name={explainOpen ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={th.brand.tint} />
              </Pressable>
              {/* Open, what each choice means comes before the choices (owner, 2026-10-17). */}
              {explainOpen ? (
                <View style={styles.explain} testID="rate-explain-text">
                  <Text style={styles.explainLine}><Text style={styles.explainTerm}>{grnLabel}: </Text>{t('grn.rates.sheet.explainGrn')}</Text>
                  <Text style={styles.explainLine}><Text style={styles.explainTerm}>{t('grn.rates.sheet.forCustomer')}: </Text>{t('grn.rates.sheet.explainCustomer', { customer: customerName })}</Text>
                  <Text style={styles.explainLine}><Text style={styles.explainTerm}>{t('grn.rates.sheet.forEveryone')}: </Text>{t('grn.rates.sheet.explainEveryone')}</Text>
                </View>
              ) : null}
              {stackFigures ? (
                // Large text: the three segments would cut their words, so the choices wrap as chips.
                <ChoiceChips<RateScope> options={scopeOptions} value={scope} onChange={pickScope} accessibilityLabel={t('grn.rates.sheet.forLabel')} />
              ) : (
                <SegmentedControl stacked dense style={styles.segments} value={scope} onValueChange={v => pickScope(v as RateScope)} options={scopeOptions} />
              )}
            </View>
          </View>

          {/* When the rate applies, under For (owner, 2026-10-17). */}
          <View onLayout={e => { sectionY.current.dates = e.nativeEvent.layout.y; }}>
            {/* The start (the GRN date) never changes here, and a rate for this GRN only has no end: a fact in a filled
                pill, so it does not read as a field (owner, 2026-10-17). */}
            <View style={styles.dates} accessible accessibilityLabel={datesLine} testID="rate-dates">
              <Icon name="calendar-lock" size={iconSize.sm} color={th.icon.secondary} />
              <Text style={styles.datesText} testID="rate-from-date">{datesLine}</Text>
            </View>
            {scope !== 'grn' ? (
              <View style={styles.datesOpen}>
                <ChoiceChips<'none' | 'date'>
                  options={[
                    { value: 'none', label: t('grn.rates.sheet.noEnd') },
                    { value: 'date', label: t('grn.rates.sheet.untilDate') },
                  ]}
                  value={to === null ? 'none' : 'date'}
                  onChange={choice => setTo(choice === 'none' ? null : defaultTo(scope, row.item_id, { weight_min: wholeKg(from) ?? 0, weight_max: wholeKg(upTo) ?? 0 }, input) ?? addDays(input.ctx.day, 30))}
                  accessibilityLabel={t('grn.rates.sheet.lastDay')}
                />
                {to === null && errors.to ? <Text style={styles.error} accessibilityRole="alert">{errors.to}</Text> : null}
                {to !== null ? (
                  <DatePickerInput
                    value={parseLocalISODate(to)}
                    onChange={date => setTo(toLocalISODate(date))}
                    minimumDate={parseLocalISODate(input.ctx.day)}
                    error={errors.to}
                  />
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={stackPair ? styles.stack : styles.figures} onLayout={e => { sectionY.current.band = e.nativeEvent.layout.y; }} testID="rate-band">
            <View style={stackPair ? undefined : styles.figure}>
              <Input label={errors.from ? t('grn.rates.sheet.labelRule', { label: t('grn.rates.sheet.fromKg'), rule: errors.from }) : t('grn.rates.sheet.fromKg')} numeric selectTextOnFocus value={from} onChangeText={setFrom} onBlur={() => checkBand()} keyboardType="number-pad" {...keypadProps('from')} invalid={Boolean(errors.from)} accessibilityHint={errors.from} testID="rate-from" />
              {steppers('from', from, setFrom)}
            </View>
            <View style={stackPair ? undefined : styles.figure}>
              <Input label={errors.upTo ? t('grn.rates.sheet.labelRule', { label: t('grn.rates.sheet.upToKg'), rule: errors.upTo }) : t('grn.rates.sheet.upToKg')} numeric selectTextOnFocus value={upTo} onChangeText={setUpTo} onBlur={() => checkBand()} keyboardType="number-pad" {...keypadProps('upTo')} invalid={Boolean(errors.upTo)} accessibilityHint={errors.upTo} testID="rate-upto" />
              {steppers('upTo', upTo, setUpTo)}
            </View>
          </View>
          {/* A band that clashes with another rate's says so in words: it is not a typing slip. */}
          {errors.overlap ? <Text style={[styles.error, styles.bandHint]} accessibilityRole="alert" testID="rate-band-overlap">{errors.overlap}</Text> : null}

          <View style={styles.refBox} testID="rate-reference">
          {/* Above the figures, so it stays in view over the keyboard while they are typed; closed until asked for, its
              day in the row that opens it so every heading stays on one line (owner, 2026-10-17). */}
          <Pressable
            style={styles.refToggle}
            onPress={() => setReferenceOpen(o => !o)}
            accessibilityRole="button"
            accessibilityLabel={t('grn.rates.sheet.refToggle')}
            accessibilityState={{ expanded: referenceOpen }}
            testID="rate-ref-toggle"
          >
            <Icon name="table-eye" size={iconSize.md} color={th.brand.tint} />
            <Text style={styles.refToggleText} numberOfLines={1}>{t('grn.rates.sheet.refToggle')}</Text>
            <Icon name={referenceOpen ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={th.brand.tint} />
          </Pressable>
          {referenceOpen ? (
          <View style={styles.refBody}>
          <Text style={styles.label} numberOfLines={1} testID="rate-ref-date">{t('grn.rates.sheet.refTitle', { date: dateText(input.ctx.day) })}</Text>
          <ReferenceTable
            oneTime={oneTime}
            rows={[
              ...(current ? [{ key: 'current' as const, label: currentLabel, rate: current }] : []),
              { key: 'customer' as const, label: t('grn.rates.sheet.forCustomer'), rate: reference.customer },
              { key: 'everyone' as const, label: t('grn.rates.sheet.forEveryone'), rate: reference.everyone },
            ]}
          />
          </View>
          ) : null}
          </View>

          <View style={stackFigures ? styles.stack : styles.figures} onLayout={e => { sectionY.current.figures = e.nativeEvent.layout.y; }} testID="rate-figures">
            {figure('rent', oneTime ? t('grn.rates.sheet.rentShortOnce') : t('grn.rates.sheet.rentShort'), rent, setRent, preload.figures.unit_price)}
            {oneTime ? null : figure('labour', t('grn.rates.sheet.labourShort'), labour, setLabour, preload.figures.labour_rate)}
            {figure('tax', t('grn.rates.sheet.taxShort'), tax, setTax, preload.figures.tax_percent, '%')}
          </View>

        </ScrollView>
            <View style={[styles.footer, { paddingBottom: space.sm + insets.bottom }]} testID="rate-footer">
              {/* Changing a rate, nothing to save until something differs; adding, there is nothing to compare with
                  (owner, 2026-10-17: an untouched save stored a copy as this GRN's own rate). */}
              <Button type="primary" size="fullWidth" onPress={save} disabled={!adding && !dirty} testID="rate-save">
                {t('grn.rates.sheet.save')}
              </Button>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <RateChangeDialog
        summary={summary}
        scope={facts?.facts.scope ?? 'everyone'}
        onChangeRate={() => { if (facts) onSave(facts.entry); setFacts(null); }}
        onOnlyGrn={() => { if (facts) onSave({ ...facts.entry, scope: 'grn', to: null }); setFacts(null); }}
        onBack={() => setFacts(null)}
        testID="rate-confirm"
      />
    </>
  );
}

export default GrnRateSheet;
