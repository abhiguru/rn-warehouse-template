/**
 * The full-screen rate form, built along the lines of the GRN Change rate screen. State, checks and the save are the
 * rate editor's (`useRateEditor`). It serves two places:
 *  - a customer's own rate: Customers → a customer → Pricing → "+ Add item" → an item (owner, 2026-10-17; mode
 *    addCustomer, the draft starts as a copy of the item's default rate);
 *  - the item's default rate: Items → an item → Pricing → "+ Add rate", "Correct this rate" or "Change" (modes add,
 *    correct and upcoming; the type is the one chosen on the tab). It has no "View default rate", and the lines of what
 *    changes come from the editor (the old rate until the day before, then the new one). A correction keeps the
 *    rate's own start day.
 *
 * Top to bottom: ✕ and a one-line header ("Add rate for <customer> · Monthly", or "Add rate · Monthly", over the item); Monthly | One-time when
 * the type can still be chosen; Starts on (the chips always shown) with the rule under it; one outlined card per weight
 * band (From / Up to and the rent, each with + and −; labour and tax in the card only when the bands differ in them);
 * otherwise one row of labour and tax for every band; Add weight band and Copy weight bands; "View default rate", an
 * outlined pill closed by default that opens into a table of the default's bands; what changes. Save is pinned at the
 * bottom, disabled until something differs from the copy; leaving with changes asks "Discard this rate?" (both for the
 * default rate and for a customer's rate); a save goes back to the Pricing tab.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/RadioButton';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { useAppSelector } from '@/store/hooks';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { fromOf, lotsRule, removeBand, summaryLines, wholeKg, setBandField, setBandFrom, setFirstFrom, setUpTo, type Draft } from '../editModel';
import { priceNumber } from '@/utils/priceNumbers';
import { laterDialogText } from '../laterRates';
import { bandText, dateText, money, todayDay, unitText } from '../rateText';
import { planScope } from '../scopePlan';
import { useItemRatesFor } from '../useItemRates';
import { useEditorFields } from '../useEditorFields';
import { figuresStack } from '../figureRow';
import { useRateEditor, type EditorView } from '../useRateEditor';
import { priceTypeLabel } from '../utils/priceLabels';
import { BandsFooter } from './BandsFooter';
import { ChangeSummary } from './ChangeSummary';
import { ChangesTable, type ChangeRow } from './ChangesTable';
import { CopyTiersSheet, confirmReplaceBands } from './CopyTiersSheet';
import { DefaultRatesTable } from './DefaultRatesTable';
import { EditorStrip } from './EditorStrip';
import { fieldLink } from './fieldLink';
import { FigureStepper, type StepKind } from './FigureStepper';
import { RatesState } from './RatesState';
import { StartsOnField } from './StartsOnField';
import type { PriceType } from '@/types/item-pricing.types';
import type { EditorMode } from '../contract';

const makeStyles = (th: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: th.background.base },
  flex: { flex: 1 },
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
  close: { width: touchTarget, height: touchTarget, alignItems: 'center' as const, justifyContent: 'center' as const },
  headerText: { flex: 1 },
  kicker: { ...typography.footnote, color: th.text.secondary },
  title: { ...typography.headline, color: th.text.primary },
  body: { paddingHorizontal: layout.marginCompact, paddingTop: space.md, paddingBottom: space.xl, gap: space.lg },
  section: { gap: space.xs },
  note: { ...typography.footnote, color: th.text.secondary },
  warning: { ...typography.footnote, color: th.status.critical.text },
  // One band: an outlined card (owner, 2026-10-17: one card per weight band).
  card: { borderWidth: 1, borderColor: th.border.divider, borderRadius: radius.card, padding: space.md, gap: space.md, backgroundColor: th.surface.card },
  cardOpen: { borderColor: th.border.button },
  cardHead: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: touchTarget, marginVertical: -space.sm, gap: space.xs },
  cardToggle: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: touchTarget, gap: space.sm },
  cardTitles: { flex: 1 },
  cardTitle: { ...typography.subhead, fontWeight: '600' as const, color: th.text.primary },
  cardLine: { ...typography.footnote, color: th.text.secondary },
  remove: { width: touchTarget, height: touchTarget, alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: -space.sm },
  pair: { flexDirection: 'row' as const, gap: space.sm, alignItems: 'flex-start' as const },
  stack: { gap: space.sm },
  cell: { flex: 1 },
  // "View default rate": a full-width outlined pill that opens into the same box (a filled pill is a fixed fact).
  refBox: { borderRadius: radius.button, borderWidth: 1, borderColor: th.border.button, overflow: 'hidden' as const },
  refToggle: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: touchTarget, gap: space.sm, paddingHorizontal: space.md },
  refToggleText: { ...typography.subhead, fontWeight: '600' as const, color: th.text.primary, flex: 1 },
  refBody: { paddingHorizontal: space.sm, paddingBottom: space.sm, gap: space.xs },
  footer: { paddingHorizontal: layout.marginCompact, paddingTop: space.sm, gap: space.xs, backgroundColor: th.surface.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.border.divider },
  skeleton: { gap: space.md, paddingTop: space.md },
});

interface Props {
  itemId: string;
  /** addCustomer: a customer's own rate. add, correct and upcoming: the item's default rate. */
  mode: Extract<EditorMode, 'add' | 'addCustomer' | 'correct' | 'upcoming'>;
  /** The customer of a customer's rate (mode addCustomer); absent for the default rate. */
  customerId?: string;
  /** From the link; the rows give it too once a customer has any rate. */
  customerName?: string;
  /** The price type chosen on the Pricing tab (default rate); a customer's first rate may still choose it. */
  priceType?: PriceType;
  /** correct and upcoming: the start of the period being corrected or changed. */
  startsOn?: string;
  /** A customer's rate (mode addCustomer): true = the customer is deactivated, null = not known yet. Both leave Save off. */
  customerDeactivated?: boolean | null;
  /** The read of the customer's state failed (Save stays off): a strip says so, with Try again. */
  customerCheckFailed?: boolean;
  onRetryCustomerCheck?: () => void;
}

/** A typed rupee figure as money ("₹12.50"), or a dash while it is empty or not a number. */
const figure = (text: string): string => (text.trim() !== '' && Number.isFinite(Number(text)) ? money(Number(text)) : '—');

export function RateForm({ itemId, mode, customerId, customerName: nameFromLink, priceType: typeFromLink, startsOn: startFromLink, customerDeactivated, customerCheckFailed, onRetryCustomerCheck }: Props) {
  const styles = useThemedStyles(makeStyles);
  const th = useTokens();
  const insets = useSafeAreaInsets();
  const { fontScale, width: windowWidth } = useWindowDimensions();
  // A row of fields stacks at large text, or when the widest rent (9999.99) does not fit the field (figureRow.ts).
  const stackedFor = (count: number): boolean => figuresStack({ width: windowWidth, fontScale, count, edge: layout.marginCompact + space.md + 1 });
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const offline = useIsOffline();
  const today = todayDay();
  const { itemRates, status, notFound, refresh } = useItemRatesFor(itemId);
  const rows = itemRates?.rows ?? null;
  const item = useMemo(() => itemRates?.item ?? { id: itemId, name: '' }, [itemRates, itemId]);
  const customerName = nameFromLink || (customerId ? rows?.find(r => r.customer_id === customerId)?.customer_name : '') || '';
  const [copyOpen, setCopyOpen] = useState(false);
  const [defaultOpen, setDefaultOpen] = useState(false);
  // The bands are an accordion: one open at a time, the first at the start (owner, 2026-10-17).
  const [openBand, setOpenBand] = useState(0);

  // The fields register with the rate editor's helper: a focused field is scrolled clear of the keyboard and the
  // pinned Save, Next moves to the next field, and a refused save brings the first wrong field into view (owner,
  // 2026-10-17: the input in focus stays in view when the keyboard opens).
  const [order, setOrder] = useState<string[]>([]);
  const { scrollRef, onScroll, fields, setBarHeight, scrollToError, scrollToTop } = useEditorFields(order, { trackKeyboard: true });
  const view = useRef<EditorView | null>(null);
  view.current = {
    scrollToTop,
    // A refused save opens the band that holds the first wrong field, then brings it into view.
    scrollToError: key => {
      const band = key === 'firstFrom' || key === 'bands' ? 0 : key.startsWith('band.') ? Number(key.split('.')[1]) : null;
      if (band !== null && band !== openBand) {
        setOpenBand(band);
        setTimeout(() => scrollToError(key), 60);
      } else scrollToError(key);
    },
  };
  const leave = useRef<() => void>(() => undefined);

  const editor = useRateEditor({
    item,
    customer: customerId ? { id: customerId, name: customerName } : null,
    priceType: typeFromLink,
    mode,
    params: startFromLink ? { starts_on: startFromLink } : undefined,
    rows,
    refreshRows: () => { void refresh(); },
    role,
    today,
    onSaved: () => leave.current(),
    view,
  });
  const { leaveWithoutAsking } = useLeaveGuard({
    hasChanges: editor.ready && editor.dirty,
    // While a save runs the ways out are held, not asked about.
    blocked: editor.saving,
    // Both the item's rate and a customer's rate ask "Discard this rate?" (house rule: create forms name the thing).
    title: t('pricing.rateForm.discardTitle'),
  });
  // A band just added opens; a removed one leaves the open band in range.
  const bandCount = editor.draft?.bands.length ?? 0;
  const lastCount = useRef(bandCount);
  useEffect(() => {
    if (bandCount > lastCount.current && lastCount.current > 0) setOpenBand(bandCount - 1);
    else if (openBand > bandCount - 1) setOpenBand(Math.max(0, bandCount - 1));
    lastCount.current = bandCount;
  }, [bandCount]);
  const orderKey = editor.order.join('|');
  useEffect(() => { setOrder(editor.order); }, [orderKey]);
  // A save goes back to the Pricing tab without asking (the editor shows "Customer rate saved." or "New rate saved.").
  leave.current = () => leaveWithoutAsking(() => router.back());

  // The keypad's Next moves through the fields in the editor's order; the last shows Done (it closes the keyboard).
  const keypad = (key: string) => ({
    ...fieldLink(fields, key),
    returnKeyType: order.indexOf(key) < order.length - 1 ? ('next' as const) : ('done' as const),
  });

  const { draft, ctx, errors, saving, later } = editor;
  const priceType: PriceType = draft?.priceType ?? 'monthly';
  const oneTime = priceType === 'one_time';
  const defaultBands = useMemo(
    () => (rows && customerId ? planScope(rows.filter(r => r.customer_id === null), today).plans.find(p => p.priceType === priceType)?.view.inForce ?? [] : []),
    [rows, today, priceType, customerId],
  );
  const type = priceTypeLabel(priceType);
  const heading = customerId
    ? customerName
      ? t('pricing.addForm.kicker', { customer: customerName, type })
      : t('pricing.addForm.kickerNoName', { type })
    : mode === 'correct'
      ? t('pricing.rateForm.kickerCorrect', { type })
      : mode === 'upcoming'
        ? t('pricing.rateForm.kickerUpcoming', { type })
        : t('pricing.rateForm.kickerAdd', { type });

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
      <Pressable style={styles.close} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.close')} testID="add-rate-close">
        <Icon name="close" size={iconSize.md} color={th.icon.primary} />
      </Pressable>
      <View style={styles.headerText} accessible accessibilityRole="header" accessibilityLabel={`${heading}, ${item.name}`}>
        <Text style={styles.kicker} numberOfLines={1} testID="add-rate-kicker">{heading}</Text>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail" adjustsFontSizeToFit minimumFontScale={0.85} testID="add-rate-item">{item.name}</Text>
      </View>
    </View>
  );

  if (status === 'error' || notFound || !editor.ready || !draft || !ctx) {
    return (
      <View style={styles.screen}>
        {header}
        {status === 'error' ? (
          <RatesState icon="alert-circle-outline" title={t('pricing.list.loadErrorTitle')} text={t('pricing.list.loadErrorText')} actionLabel={t('pricing.list.tryAgain')} onAction={() => { void refresh(); }} testID="add-rate-load-error" />
        ) : notFound ? (
          <RatesState icon="package-variant-closed" title={t('pricing.item.notFound')} actionLabel={t('pricing.item.back')} onAction={() => router.back()} testID="add-rate-not-found" />
        ) : (
          <View style={styles.skeleton} testID="add-rate-skeleton" accessibilityLabel={t('pricing.list.loadingLabel')}>
            <ListSkeletonCard metricsCount={3} />
          </View>
        )}
      </View>
    );
  }

  const set = (next: Draft) => editor.setDraft(next);
  const perBand = draft.bands.some(b => b.labour !== undefined);
  const fromTextOf = (i: number) => (i === 0 ? draft.firstFromText ?? String(draft.firstFrom) : draft.bands[i].fromText ?? (fromOf(draft, i) === null ? '' : String(fromOf(draft, i))));
  const inThePast = !!draft.startsOn && draft.startsOn < ctx.today && ctx.mode !== 'correct';
  // The default rate: why it cannot be saved (a rate that was cancelled meanwhile, or a role that may not correct), and the lines of what changes.
  const refusal = ctx.managerOnly ? t('pricing.edit.managerOnly') : ctx.plannedGone ? t('pricing.error.notARateStart') : null;
  const lots = customerId ? null : lotsRule(draft, ctx);
  const changeLines = customerId ? [] : summaryLines(draft, ctx);
  // What changes, band by band, against the default's same band (shown once something was changed).
  const changeRows: ChangeRow[] = draft.bands.flatMap((band, i) => {
    const from = fromOf(draft, i);
    const upTo = wholeKg(band.upTo);
    if (from === null || upTo === null) return [];
    const base = defaultBands.find(r => r.weight_min === from && r.weight_max === upTo);
    return [{
      key: `${from}-${upTo}`,
      band: bandText(from, upTo),
      rent: priceNumber(band.rent, 2),
      labour: oneTime ? 0 : priceNumber(perBand ? band.labour ?? '' : draft.labour, 2),
      tax: priceNumber(perBand ? band.tax ?? '' : draft.tax, 2),
      defaultRent: base ? Number(base.unit_price) : null,
      defaultLabour: base ? Number(base.labour_rate) : null,
      defaultTax: base ? Number(base.tax_percent) : null,
    }];
  });
  const laterText = later && later.length > 0 && draft.startsOn ? laterDialogText(later, draft.startsOn, ctx.today) : null;
  const helper = offline ? t('pricing.error.offline') : !draft.startsOn ? t('pricing.edit.chooseDate') : null;
  // Nothing to save until the copy of the default rate is changed (owner, 2026-10-17).
  const saveDisabled = saving || offline || !draft.startsOn || !editor.dirty || refusal !== null || (customerDeactivated !== undefined && customerDeactivated !== false);
  const saveLabel = ctx.mode === 'correct' ? t('pricing.edit.saveCorrection') : customerId ? t('pricing.edit.saveCustomer') : t('pricing.edit.save');

  /** A number field with + and − under it. */
  const field = (stacked: boolean, key: string, label: string, value: string, onText: (text: string) => void, kind: StepKind, fieldName: string, suffix?: string) => (
    <View key={key} style={stacked ? undefined : styles.cell}>
      <Input
        label={label}
        numeric
        selectTextOnFocus
        value={value}
        onChangeText={onText}
        keyboardType={kind === 'kg' ? 'number-pad' : 'decimal-pad'}
        {...keypad(key)}
        error={errors[key]}
        rightIcon={suffix ? <Text style={styles.note}>{suffix}</Text> : undefined}
        testID={`add-rate-${key}`}
      />
      <FigureStepper kind={kind} value={value} onChange={onText} fieldName={fieldName} testID={`add-rate-${key}`} />
    </View>
  );

  const rentLabel = oneTime ? t('pricing.addForm.rentOnce') : t('pricing.addForm.rent');
  const pairStacked = stackedFor(2);
  // Rent beside labour and tax (per-band figures), or labour beside tax (shared), or rent alone.
  const figuresStacked = stackedFor(1 + (perBand && !oneTime ? 1 : 0) + (perBand ? 1 : 0));
  const sharedStacked = stackedFor(oneTime ? 1 : 2);

  return (
    <View style={styles.screen}>
      {header}
      {/* Edge to edge the window is not resized for the keyboard on Android either: padding keeps the pinned Save above
          it, as on the GRN Change rate screen (style guide §5.2). */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" onScroll={onScroll} scrollEventThrottle={16}>
          {customerDeactivated === true ? <EditorStrip variant="warning" message={t('pricing.customerTab.deactivated')} testID="add-rate-deactivated" /> : null}
          {customerCheckFailed && customerDeactivated == null ? (
            <View>
              <EditorStrip variant="critical" message={t('pricing.customerTab.checkFailed')} testID="add-rate-customer-check-failed" />
              {onRetryCustomerCheck ? (
                <Button type="tertiary" onPress={onRetryCustomerCheck} testID="add-rate-customer-check-retry">{t('pricing.list.tryAgain')}</Button>
              ) : null}
            </View>
          ) : null}
          {refusal ? <EditorStrip variant="critical" message={refusal} testID="add-rate-refused" /> : null}
          {ctx.mode === 'correct' && !refusal ? (
            <EditorStrip variant="warning" message={t('pricing.edit.correctWarning', { date: dateText(draft.startsOn ?? '') })} testID="add-rate-correct-warning" />
          ) : null}
          {editor.strip && editor.strip !== errors.bands ? <EditorStrip variant="critical" message={editor.strip} testID="add-rate-error" /> : null}
          {editor.rowsChanged ? <EditorStrip variant="warning" message={t('pricing.edit.rowsChanged')} testID="add-rate-rows-changed" /> : null}
          {editor.copiedFrom ? (
            <Text style={styles.note} testID="add-rate-copied">{t('pricing.edit.copiedFromItem', { item: editor.copiedFrom })}</Text>
          ) : ctx.copied && customerId ? (
            <Text style={styles.note} numberOfLines={1} testID="add-rate-copied">{t('pricing.addForm.copied')}</Text>
          ) : null}

          {ctx.priceTypeChoosable ? (
            <SegmentedControl
              stacked
              style={{ paddingHorizontal: 0, paddingVertical: 0, minHeight: 0 }}
              label={t('pricing.edit.type')}
              value={priceType}
              onValueChange={value => editor.switchType(value as PriceType)}
              options={[
                { value: 'monthly', label: priceTypeLabel('monthly') },
                { value: 'one_time', label: priceTypeLabel('one_time') },
              ]}
            />
          ) : null}

          {/* Starts on: the choice always shown, the rule under it. */}
          <View style={styles.section} testID="add-rate-starts">
            <StartsOnField
              choice={draft.startsOnChoice}
              day={draft.startsOn}
              today={ctx.today}
              earliest={ctx.earliestStart}
              canStartInPast={ctx.canStartInPast}
              error={errors.startsOn}
              onChange={editor.setStartsOn}
              fixed={draft.startsOnChoice === 'fixed'}
              hideRequired
            />
            {lots ? (
              <Text style={styles.note} testID="add-rate-rule">{lots}</Text>
            ) : draft.startsOn && ctx.mode !== 'correct' ? (
              <Text style={styles.note} numberOfLines={1} testID="add-rate-rule">{t('pricing.addForm.rule', { date: dateText(draft.startsOn) })}</Text>
            ) : null}
            {inThePast && ctx.canStartInPast ? <Text style={styles.warning}>{t('pricing.edit.pastDate', { date: dateText(draft.startsOn ?? '') })}</Text> : null}
          </View>

          {/* One card per weight band, as an accordion: the title names the weights, and closed, the rate. */}
          {draft.bands.map((band, i) => {
            const n = localizeDigits(String(i + 1));
            const fromKey = i === 0 ? 'firstFrom' : `band.${i}.from`;
            const open = i === openBand;
            const from = fromOf(draft, i);
            const upTo = wholeKg(band.upTo);
            const range = from !== null && upTo !== null ? bandText(from, upTo) : t('pricing.addForm.bandNew');
            const labour = perBand ? band.labour ?? '' : draft.labour;
            const tax = perBand ? band.tax ?? '' : draft.tax;
            // The typed figures in the language's digits (Gujarati digits in Gujarati), "—" where one is not a number yet.
            const rate = oneTime
              ? t('pricing.addForm.bandRateOnce', { rent: figure(band.rent), tax: localizeDigits(tax || '—') })
              : t('pricing.addForm.bandRate', { rent: figure(band.rent), labour: figure(labour), tax: localizeDigits(tax || '—') });
            const title = t('pricing.addForm.bandTitle', { n, range });
            return (
              <View key={i} style={[styles.card, open && styles.cardOpen]} testID={`add-rate-band-${i}`}>
                <View style={styles.cardHead}>
                  <Pressable
                    style={styles.cardToggle}
                    onPress={() => setOpenBand(open ? -1 : i)}
                    accessibilityRole="button"
                    accessibilityLabel={`${title}, ${rate}`}
                    accessibilityState={{ expanded: open }}
                    testID={`add-rate-band-${i}-toggle`}
                  >
                    <View style={styles.cardTitles}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
                      {open ? null : <Text style={styles.cardLine} numberOfLines={2} testID={`add-rate-band-${i}-rate`}>{rate}</Text>}
                    </View>
                    <Icon name={open ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={th.brand.tint} />
                  </Pressable>
                  {draft.bands.length > 1 ? (
                    <Pressable style={styles.remove} onPress={() => set(removeBand(draft, i))} accessibilityRole="button" accessibilityLabel={t('pricing.addForm.removeBand', { n })} testID={`add-rate-band-${i}-remove`}>
                      <Icon name="trash-can-outline" size={iconSize.md} color={th.icon.secondary} />
                    </Pressable>
                  ) : null}
                </View>
                {open ? (
                  <>
                    <View style={pairStacked ? styles.stack : styles.pair}>
                      {field(pairStacked, fromKey, t('pricing.addForm.fromKg'), fromTextOf(i), text => set(i === 0 ? setFirstFrom(draft, text) : setBandFrom(draft, i, text)), 'kg', t('pricing.addForm.fieldFrom'))}
                      {field(pairStacked, `band.${i}.upTo`, t('pricing.addForm.upToKg'), band.upTo, text => set(setUpTo(draft, i, text)), 'kg', t('pricing.addForm.fieldUpTo'))}
                    </View>
                    <View style={figuresStacked ? styles.stack : styles.pair}>
                      {field(figuresStacked, `band.${i}.rent`, rentLabel, band.rent, text => set(setBandField(draft, i, 'rent', text)), 'rent', t('pricing.addForm.fieldRent'))}
                      {perBand && !oneTime ? field(figuresStacked, `band.${i}.labour`, t('pricing.addForm.labour'), band.labour ?? '', text => set(setBandField(draft, i, 'labour', text)), 'rupee', t('pricing.addForm.fieldLabour')) : null}
                      {perBand ? field(figuresStacked, `band.${i}.tax`, t('pricing.addForm.tax'), band.tax ?? '', text => set(setBandField(draft, i, 'tax', text)), 'percent', t('pricing.addForm.fieldTax'), '%') : null}
                    </View>
                  </>
                ) : null}
              </View>
            );
          })}

          {/* Labour and tax once, for every band, unless the bands differ in them. */}
          {perBand ? null : (
            <View style={styles.section} testID="add-rate-shared">
              <Text style={styles.note}>{t('pricing.addForm.sharedCaption')}</Text>
              <View style={sharedStacked ? styles.stack : styles.pair}>
                {oneTime ? null : field(sharedStacked, 'labour', t('pricing.addForm.labour'), draft.labour, text => set({ ...draft, labour: text }), 'rupee', t('pricing.addForm.fieldLabour'))}
                {field(sharedStacked, 'tax', t('pricing.addForm.tax'), draft.tax, text => set({ ...draft, tax: text }), 'percent', t('pricing.addForm.fieldTax'), '%')}
              </View>
              {oneTime ? <Text style={styles.note}>{t('pricing.edit.oneTimeLabour')}</Text> : null}
            </View>
          )}

          <View style={styles.section}>
            <BandsFooter draft={draft} ctx={ctx} errors={errors} onChange={set} />
            <Button type="tertiary" leftIcon="content-copy" onPress={() => setCopyOpen(true)} disabled={offline} testID="add-rate-copy">
              {t('pricing.edit.copyTiers')}
            </Button>
          </View>

          {/* The item's default rate, to set the new figures against; closed until asked for. A customer's rate only. */}
          {customerId ? (
          <View style={styles.refBox} testID="add-rate-default">
            <Pressable
              style={styles.refToggle}
              onPress={() => setDefaultOpen(o => !o)}
              accessibilityRole="button"
              accessibilityLabel={t('pricing.addForm.viewDefault')}
              accessibilityState={{ expanded: defaultOpen }}
              testID="add-rate-default-toggle"
            >
              <Icon name="table-eye" size={iconSize.md} color={th.brand.tint} />
              <Text style={styles.refToggleText} numberOfLines={1}>{t('pricing.addForm.viewDefault')}</Text>
              <Icon name={defaultOpen ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={th.brand.tint} />
            </Pressable>
            {defaultOpen ? (
              <View style={styles.refBody}>
                <Text style={styles.note} numberOfLines={1}>{t('pricing.addForm.inForceToday', { unit: unitText(priceType) })}</Text>
                {defaultBands.length === 0 ? (
                  <Text style={styles.note} testID="add-rate-no-default">{t('pricing.addForm.noDefault')}</Text>
                ) : (
                  <DefaultRatesTable bands={defaultBands} oneTime={oneTime} />
                )}
              </View>
            ) : null}
          </View>
          ) : null}

          {customerId && editor.dirty && changeRows.length > 0 && draft.startsOn ? <ChangesTable rows={changeRows} from={dateText(draft.startsOn)} oneTime={oneTime} /> : null}
          {changeLines.length > 0 ? (
            <View style={styles.section} testID="add-rate-changes">
              <ChangeSummary lines={changeLines} />
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: space.sm + insets.bottom }]} onLayout={e => setBarHeight(e.nativeEvent.layout.height)} testID="add-rate-footer">
          {helper ? <Text style={styles.note}>{helper}</Text> : null}
          <Button type="primary" size="fullWidth" onPress={() => { void editor.submit(); }} disabled={saveDisabled} loading={saving} testID="add-rate-save">
            {saveLabel}
          </Button>
        </View>
      </KeyboardAvoidingView>

      {copyOpen ? (
        <CopyTiersSheet
          visible
          onClose={() => setCopyOpen(false)}
          itemId={ctx.itemId}
          priceType={draft.priceType}
          today={ctx.today}
          onPick={(picked, pickedRows) => {
            setCopyOpen(false);
            // Typed figures are not replaced without asking.
            if (!editor.dirty) editor.copyFrom(picked, pickedRows);
            else void confirmReplaceBands(picked.name).then(yes => { if (yes) editor.copyFrom(picked, pickedRows); });
          }}
        />
      ) : null}
      <ConfirmDialog
        visible={!!later?.[0]}
        variant="warning"
        title={laterText?.title ?? ''}
        message={laterText?.message ?? ''}
        confirmText={t('pricing.edit.laterConfirm')}
        cancelText={t('pricing.edit.laterKeep')}
        busy={saving}
        onConfirm={() => void editor.submit(true)}
        onCancel={editor.dismissLater}
      />
    </View>
  );
}

export default RateForm;
