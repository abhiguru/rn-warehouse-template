/**
 * The rate sheet of the GRN Review step: Add rate (a line has no rate) and Change (it has one). It saves
 * nothing itself: the entry goes to the GRN form and is saved with the GRN. A change of a rate in force
 * (This customer only / Everyone) first lists what it does and asks.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { Input } from '@/components/ui/Input';
import { ChoiceChips } from '@/features/filters/components/ChoiceChips';
import { wholeKg } from '@/features/item-pricing/editModel';
import { addDays, dateText } from '@/features/item-pricing/rateText';
import { rowWeightText } from './GrnRatesSection';
import { RateChangeDialog, rateChangeSummary } from './RateChangeDialog';
import { priceNumber } from '@/features/item-pricing/utils/priceNumbers';
import { useModalSheet } from '@/hooks/useModalSheet';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { parseLocalISODate, toLocalISODate } from '@/utils/formatters';
import {
  changeFacts,
  defaultTo,
  entryProblems,
  preloadAdd,
  preloadChange,
  type ChangeFacts,
  type PreloadInput,
  type PricedRow,
  type SheetEntry,
} from './grnRateModel';
import type { RateScope } from './types';

export interface GrnRateSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The row being priced; its `rate` decides Add (null) or Change. */
  row: PricedRow | null;
  input: PreloadInput;
  customerName: string;
  /** "Monthly" / "One-time". */
  priceTypeText: string;
  onSave: (entry: SheetEntry) => void;
}

const SNAP_POINTS = ['90%'];
const text = (n: number | null): string => (n === null ? '' : String(Math.round(n * 100) / 100));

const makeStyles = (th: ThemeTokens) => ({
  sheetBackground: { backgroundColor: th.surface.sheet, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, ...th.shadow[4] },
  handle: { backgroundColor: th.border.separator, width: 36, height: 4 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingLeft: layout.marginCompact,
    paddingRight: space.xs,
    minHeight: touchTarget + space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: th.border.divider,
    gap: space.sm,
  },
  headerText: { flex: 1 },
  title: { ...typography.headline, color: th.text.primary },
  subtitle: { ...typography.footnote, color: th.text.secondary },
  close: { width: touchTarget, height: touchTarget, alignItems: 'center' as const, justifyContent: 'center' as const },
  body: { padding: layout.marginCompact, paddingBottom: space.huge, gap: space.lg },
  label: { ...typography.footnote, color: th.text.secondary, marginBottom: space.xs },
  value: { ...typography.body, color: th.text.primary },
  note: { ...typography.footnote, color: th.text.secondary },
  error: { ...typography.footnote, color: th.status.negative.text },
  row: { flexDirection: 'row' as const, gap: space.md },
  half: { flex: 1 },
});

export function GrnRateSheet({ visible, onClose, row, input, customerName, priceTypeText, onSave }: GrnRateSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const th = useTokens();
  const sheetRef = useRef<BottomSheetModal>(null);
  const sheet = useModalSheet(sheetRef);
  const oneTime = input.ctx.priceType === 'one_time';
  const adding = row !== null && row.rate === null;

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

  useEffect(() => {
    if (visible) sheet.present();
    else sheet.dismiss();
    // present/dismiss are stable
  }, [visible]);

  useEffect(() => {
    if (!visible || !preload) return;
    setScope(preload.scope);
    setFrom(String(preload.band.weight_min));
    setUpTo(String(preload.band.weight_max));
    setRent(text(preload.figures.unit_price));
    setLabour(text(preload.figures.labour_rate));
    setTax(text(preload.figures.tax_percent));
    setTo(preload.to);
    setErrors({});
    setFacts(null);
  }, [preload, visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={1} style={[props.style, { backgroundColor: th.overlay.scrim }]} />
    ),
    [th],
  );

  if (!row || !preload) return null;

  const pickScope = (next: RateScope) => {
    setScope(next);
    setErrors({});
    // The first two scopes end where a planned rate of the band begins; Only this GRN has no end.
    setTo(next === 'grn' ? null : defaultTo(next, row.item_id, { weight_min: wholeKg(from) ?? preload.band.weight_min, weight_max: wholeKg(upTo) ?? preload.band.weight_max }, input));
  };

  const save = () => {
    const next: Record<string, string> = {};
    const min = wholeKg(from);
    const max = wholeKg(upTo);
    if (min === null) next.from = t('pricing.edit.err.wholeKg');
    if (max === null) next.upTo = t('pricing.edit.err.wholeKg');
    const unit = priceNumber(rent, 2);
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
      const kgText = rowWeightText(row.weight);
      if (problems.bandWeights) next.from = t('pricing.edit.err.wholeKg');
      if (problems.bandFrom) next.upTo = t('grn.rates.sheet.errUpToBeforeFrom');
      if (problems.bandHolds) next.upTo = t('grn.rates.sheet.errBandHolds', { weight: kgText });
      if (problems.to) next.to = t('grn.rates.sheet.errTo', { date: dateText(input.ctx.day) });
      if (problems.planned) next.to = t('grn.rates.sheet.errPlanned', { date: dateText(problems.planned.date ?? '') });
      if (problems.overlap) next.upTo = problems.overlap.date ? t('grn.rates.sheet.errPlanned', { date: dateText(problems.overlap.date) }) : t('grn.rates.sheet.errOverlap');
      if (Object.keys(next).length === 0) {
        const found = changeFacts(entry, row, input);
        if (found) setFacts({ facts: found, entry });
        else onSave(entry);
        setErrors({});
        return;
      }
    }
    setErrors(next);
  };

  const subtitle = t('grn.rates.sheet.subtitle', { item: row.item_name, weight: rowWeightText(row.weight) });
  const context = t('grn.rates.sheet.context', { date: dateText(input.ctx.day), customer: customerName, type: priceTypeText });
  const summary = facts ? rateChangeSummary(facts.facts, row, customerName, oneTime) : null;

  return (
    <>
      <BottomSheetModal
        ref={sheetRef}
        onDismiss={() => { sheet.onDismissed(); onClose(); }}
        index={0}
        snapPoints={SNAP_POINTS}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handle}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title} accessibilityRole="header">{adding ? t('grn.rates.sheet.titleAdd') : t('grn.rates.sheet.titleChange')}</Text>
            <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
            <Text style={styles.subtitle} numberOfLines={2}>{context}</Text>
          </View>
          <Pressable style={styles.close} onPress={() => sheet.dismiss()} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Icon name="close" size={iconSize.md} color={th.icon.secondary} />
          </Pressable>
        </View>
        <BottomSheetScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={styles.label}>{t('grn.rates.sheet.appliesTo')}</Text>
            <ChoiceChips<RateScope>
              options={[
                { value: 'customer', label: t('grn.rates.sheet.scopeCustomer') },
                { value: 'everyone', label: t('grn.rates.sheet.scopeEveryone') },
                { value: 'grn', label: t('grn.rates.sheet.scopeGrn') },
              ]}
              value={scope}
              onChange={pickScope}
              accessibilityLabel={t('grn.rates.sheet.appliesTo')}
            />
            {scope === 'grn' ? <Text style={styles.note}>{t('grn.rates.sheet.noteGrn')}</Text> : null}
          </View>

          <View style={styles.row}>
            <View style={styles.half}>
              {adding ? (
                <Input label={t('grn.rates.sheet.from')} numeric selectTextOnFocus value={from} onChangeText={setFrom} keyboardType="number-pad" error={errors.from} testID="rate-from" />
              ) : (
                <>
                  <Text style={styles.label}>{t('grn.rates.sheet.from')}</Text>
                  <Text style={styles.value}>{localizeDigits(from)} {t('pricing.kg')}</Text>
                </>
              )}
            </View>
            <View style={styles.half}>
              {adding ? (
                <Input label={t('grn.rates.sheet.upTo')} numeric selectTextOnFocus value={upTo} onChangeText={setUpTo} keyboardType="number-pad" error={errors.upTo} testID="rate-upto" />
              ) : (
                <>
                  <Text style={styles.label}>{t('grn.rates.sheet.upTo')}</Text>
                  <Text style={styles.value}>{localizeDigits(upTo)} {t('pricing.kg')}</Text>
                </>
              )}
            </View>
          </View>
          {!adding && errors.upTo ? <Text style={styles.error} accessibilityRole="alert">{errors.upTo}</Text> : null}

          <Input
            label={oneTime ? t('pricing.edit.rentOnce') : t('pricing.edit.rentMonthly')}
            required
            numeric
            selectTextOnFocus
            value={rent}
            onChangeText={setRent}
            keyboardType="decimal-pad"
            error={errors.rent}
            testID="rate-rent"
          />
          {oneTime ? null : (
            <Input label={t('pricing.edit.labour')} required numeric selectTextOnFocus value={labour} onChangeText={setLabour} keyboardType="decimal-pad" error={errors.labour} testID="rate-labour" />
          )}
          <Input
            label={t('pricing.edit.tax')}
            required
            numeric
            selectTextOnFocus
            value={tax}
            onChangeText={setTax}
            keyboardType="decimal-pad"
            error={errors.tax}
            rightIcon={<Text style={styles.value}>%</Text>}
            testID="rate-tax"
          />

          <View>
            <Text style={styles.label}>{t('grn.rates.sheet.startDate')}</Text>
            <Text style={styles.value} testID="rate-from-date">{t('grn.rates.sheet.fromGrnDate', { date: dateText(input.ctx.day) })}</Text>
          </View>

          {scope === 'grn' ? null : (
            <View>
              <Text style={styles.label}>{t('grn.rates.sheet.lastDay')}</Text>
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
          )}

          <Button type="primary" size="fullWidth" onPress={save} testID="rate-save">
            {t('grn.rates.sheet.save')}
          </Button>
        </BottomSheetScrollView>
      </BottomSheetModal>

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
