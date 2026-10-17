/**
 * "Change the rate?": the question before a change of a rate in force (This customer only / Everyone) is
 * kept in the GRN form. It looks like ConfirmDialog (docs/STYLE_GUIDE.md §13.9) and scrolls like
 * ConfirmInputDialog, but the facts are laid out in parts instead of one block of text:
 *
 * - what: the item and its weight band, centred under the title;
 * - who pays it, with what that means for other customers or for this customer's own rate;
 * - the figures as Old / New columns, the ones that change in bold with an arrow between;
 * - when: the period, with what happens to the old rate before and after it;
 * - which GRNs it reaches, as a footnote.
 *
 * The three actions are stacked (three side by side do not fit a phone): Change the rate, Only this GRN, Back.
 * Back, the Android back button and a tap on the scrim save nothing.
 *
 * The Old / New figures are a TanStack table (`components/table/appTable`, `useAppTable`) drawn here and not by
 * `DataTable`: the dialog's table is a flat inset on the dialog (not an outlined card), its heading is hidden from screen
 * readers (each row says its own figures), and the figure columns grow with the text instead of having a fixed width.
 */
import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { Button } from '@/components/ui/Button';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { bandText, dateText, money } from '@/features/item-pricing/rateText';
import { fontWeight, iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { ChangeFacts, RateRow } from './grnRateModel';

export interface RateFigureLine {
  key: 'rent' | 'labour' | 'tax';
  label: string;
  old: string;
  next: string;
  changed: boolean;
}

/** The facts of a change, sorted into the parts of the dialog. */
export interface RateChangeSummary {
  /** "Fictional Gur, 0–50 kg" */
  subject: string;
  /** "For: every customer (this weight band)" */
  audience: string;
  /** What the change means for other customers, or for this customer's own rate. */
  audienceNotes: string[];
  figures: RateFigureLine[];
  /** "From 12 Oct 2026 to 14 Nov 2026" */
  period: string;
  /** What happens to the old rate before and after the period. */
  periodNotes: string[];
  /** Which GRNs use the new rate. */
  reach: string;
}

export function rateChangeSummary(facts: ChangeFacts, row: Pick<RateRow, 'item_name'>, customerName: string, oneTime: boolean): RateChangeSummary {
  const pct = (n: number) => `${localizeDigits(String(n))}%`;
  const labels: Record<RateFigureLine['key'], string> = {
    rent: t('grn.rates.confirm.rentLabel'),
    labour: t('grn.rates.confirm.labourLabel'),
    tax: t('grn.rates.confirm.taxLabel'),
  };
  const figure = (key: RateFigureLine['key'], old: number, next: number, show: (n: number) => string): RateFigureLine => ({
    key,
    label: labels[key],
    old: show(old),
    next: show(next),
    changed: old !== next,
  });
  const oldRent = money(facts.old.unit_price);

  const audienceNotes: string[] = [];
  if ('overrides' in facts.ends) audienceNotes.push(t('grn.rates.confirm.overrides', { customer: customerName, rent: oldRent }));
  if (facts.keepsOwn) audienceNotes.push(t('grn.rates.confirm.keepsOwn', { customer: customerName, rent: money(facts.keepsOwn.rent) }));

  const periodNotes: string[] = [];
  if ('lastDay' in facts.ends) periodNotes.push(t('grn.rates.confirm.endsOn', { rent: oldRent, date: dateText(facts.ends.lastDay) }));
  else if ('replaced' in facts.ends) periodNotes.push(t('grn.rates.confirm.replaced', { rent: oldRent, date: dateText(facts.from) }));
  if (facts.resumes) periodNotes.push(t('grn.rates.confirm.resumes', { rent: money(facts.resumes.figures.unit_price), date: dateText(facts.resumes.from) }));

  return {
    subject: t('grn.rates.confirm.item', { item: row.item_name, band: bandText(facts.band.weight_min, facts.band.weight_max) }),
    audience: facts.scope === 'customer' ? t('grn.rates.confirm.forCustomer', { customer: customerName }) : t('grn.rates.confirm.forEveryone'),
    audienceNotes,
    figures: [
      figure('rent', facts.old.unit_price, facts.next.unit_price, money),
      ...(oneTime ? [] : [figure('labour', facts.old.labour_rate, facts.next.labour_rate, money)]),
      figure('tax', facts.old.tax_percent, facts.next.tax_percent, pct),
    ],
    period: facts.to
      ? t('grn.rates.confirm.period', { from: dateText(facts.from), to: dateText(facts.to) })
      : t('grn.rates.confirm.periodOpen', { from: dateText(facts.from) }),
    periodNotes,
    reach:
      facts.scope === 'customer'
        ? t('grn.rates.confirm.reachesCustomer', { customer: customerName, date: dateText(facts.from) })
        : t('grn.rates.confirm.reachesEveryone', { date: dateText(facts.from) }),
  };
}

export interface RateChangeDialogProps {
  /** Null: the dialog is closed. */
  summary: RateChangeSummary | null;
  scope: 'customer' | 'everyone';
  onChangeRate: () => void;
  onOnlyGrn: () => void;
  onBack: () => void;
  testID?: string;
}

const figureColumn = createAppColumnHelper<RateFigureLine>();

const ICON_CIRCLE = layout.avatar.lg - space.xs;
const TABULAR = ['tabular-nums' as const];
/** The figure columns: wide enough for "₹1,234.50" at the default text size; they grow with larger text. */
const VALUE_MIN_WIDTH = 72;

const makeStyles = (th: ThemeTokens) => ({
  overlay: {
    flex: 1,
    backgroundColor: th.overlay.scrim,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.xxl,
  },
  dialog: {
    backgroundColor: th.surface.sheet,
    borderRadius: radius.card,
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    maxHeight: '100%' as const,
    flexShrink: 1,
    ...th.shadow[4],
  },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.lg, gap: space.lg },
  head: { alignItems: 'center' as const },
  iconCircle: {
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: space.lg,
    backgroundColor: th.status.critical.background,
  },
  title: { ...typography.title3, color: th.text.primary, textAlign: 'center' as const },
  subject: { ...typography.subhead, color: th.text.secondary, textAlign: 'center' as const, marginTop: space.xs },
  part: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: space.sm },
  partText: { flex: 1, gap: space.xs },
  lead: { ...typography.subhead, fontWeight: fontWeight.semibold, color: th.text.primary },
  sub: { ...typography.subhead, color: th.text.secondary },
  table: { backgroundColor: th.background.base, borderRadius: radius.button, paddingHorizontal: space.md, paddingVertical: space.xs },
  tableRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs, paddingVertical: space.s6 },
  tableHead: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: th.border.separator },
  label: { ...typography.subhead, flex: 1, color: th.text.secondary },
  headText: { ...typography.footnote, color: th.text.secondary, textAlign: 'right' as const, minWidth: VALUE_MIN_WIDTH },
  value: { ...typography.body, color: th.text.secondary, textAlign: 'right' as const, minWidth: VALUE_MIN_WIDTH, fontVariant: TABULAR },
  valueNew: { color: th.text.primary, fontWeight: fontWeight.semibold },
  arrow: { width: iconSize.sm, alignItems: 'center' as const },
  reach: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: space.sm, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.border.divider },
  reachText: { ...typography.footnote, flex: 1, color: th.text.secondary },
  actions: { gap: space.sm, paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.xl },
});

export function RateChangeDialog({ summary, scope, onChangeRate, onOnlyGrn, onBack, testID }: RateChangeDialogProps) {
  const styles = useThemedStyles(makeStyles);
  const th = useTokens();
  const insets = useSafeAreaInsets();

  const columns = useMemo(
    () =>
      figureColumn.columns([
        figureColumn.display({
          id: 'label',
          header: '',
          meta: { width: 'grow' },
          cell: ({ row }) => <Text style={styles.label}>{row.original.label}</Text>,
        }),
        figureColumn.display({
          id: 'old',
          header: t('grn.rates.confirm.colOld'),
          meta: { width: VALUE_MIN_WIDTH, numeric: true },
          cell: ({ row }) => <Text style={styles.value}>{row.original.old}</Text>,
        }),
        figureColumn.display({
          id: 'arrow',
          header: '',
          meta: { width: iconSize.sm },
          cell: ({ row }) => (
            <View style={styles.arrow}>
              {row.original.changed ? <Icon name="arrow-right" size={iconSize.sm} color={th.icon.secondary} /> : null}
            </View>
          ),
        }),
        figureColumn.display({
          id: 'new',
          header: t('grn.rates.confirm.colNew'),
          meta: { width: VALUE_MIN_WIDTH, numeric: true },
          cell: ({ row }) => <Text style={[styles.value, row.original.changed && styles.valueNew]}>{row.original.next}</Text>,
        }),
      ]),
    [styles, th]
  );
  const figures = useAppTable({ columns, data: summary?.figures ?? [], getRowId: line => line.key });

  return (
    <Modal visible={summary !== null} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onBack}>
      <View style={[styles.overlay, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onBack} accessible={false} importantForAccessibility="no" />
        {summary ? (
          <View style={styles.dialog} accessibilityViewIsModal testID={testID}>
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false}>
              <View style={styles.head}>
                <View style={styles.iconCircle} accessible={false} importantForAccessibility="no-hide-descendants">
                  <Icon name="alert-outline" size={iconSize.xl} color={th.status.critical.text} />
                </View>
                <Text style={styles.title} accessibilityRole="header">{t('grn.rates.confirm.title')}</Text>
                <Text style={styles.subject}>{summary.subject}</Text>
              </View>

              <View style={styles.part} testID="rate-confirm-audience">
                <Icon name={scope === 'customer' ? 'account-outline' : 'account-multiple-outline'} size={iconSize.md} color={th.icon.secondary} />
                <View style={styles.partText}>
                  <Text style={styles.lead}>{summary.audience}</Text>
                  {summary.audienceNotes.map(note => <Text key={note} style={styles.sub}>{note}</Text>)}
                </View>
              </View>

              <View style={styles.table} testID="rate-confirm-figures">
                <View style={[styles.tableRow, styles.tableHead]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  {figures.getHeaderGroups()[0]?.headers.map(h => {
                    const meta = h.column.columnDef.meta;
                    const text = h.column.columnDef.header as string;
                    if (meta?.width === 'grow') return <Text key={h.id} style={styles.label} />;
                    return meta?.numeric ? <Text key={h.id} style={styles.headText}>{text}</Text> : <View key={h.id} style={styles.arrow} />;
                  })}
                </View>
                {figures.getRowModel().rows.map(row => {
                  const line = row.original;
                  return (
                    <View
                      key={row.id}
                      style={styles.tableRow}
                      accessible
                      accessibilityLabel={line.changed
                        ? t('grn.rates.confirm.figureA11y', { label: line.label, old: line.old, new: line.next })
                        : t('grn.rates.confirm.figureSameA11y', { label: line.label, value: line.next })}
                      testID={`rate-confirm-${line.key}`}
                    >
                      {row.getAllCells().map(cell => <figures.FlexRender key={cell.id} cell={cell} />)}
                    </View>
                  );
                })}
              </View>

              <View style={styles.part} testID="rate-confirm-period">
                <Icon name="calendar-range" size={iconSize.md} color={th.icon.secondary} />
                <View style={styles.partText}>
                  <Text style={styles.lead}>{summary.period}</Text>
                  {summary.periodNotes.map(note => <Text key={note} style={styles.sub}>{note}</Text>)}
                </View>
              </View>

              <View style={styles.reach} testID="rate-confirm-reach">
                <Icon name="information-outline" size={iconSize.sm} color={th.icon.secondary} />
                <Text style={styles.reachText}>{summary.reach}</Text>
              </View>
            </ScrollView>

            <View style={styles.actions}>
              <Button type="primary" size="fullWidth" onPress={onChangeRate} testID="rate-confirm-change">{t('grn.rates.confirm.change')}</Button>
              <Button type="secondary" size="fullWidth" onPress={onOnlyGrn} testID="rate-confirm-only-grn">{t('grn.rates.confirm.onlyGrn')}</Button>
              <Button type="secondary" variant="normal" size="fullWidth" onPress={onBack} testID="rate-confirm-back">{t('grn.rates.confirm.back')}</Button>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

export default RateChangeDialog;
