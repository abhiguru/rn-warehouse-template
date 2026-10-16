/**
 * "For GRNs only" on the item page (backend migration 86): the rates set for one GRN only. Loaded when the page
 * opens, after the rates; a failure is a line of text, never a blocker. Rates of invoiced GRNs (archived) are not
 * here: they are listed under Old rates.
 *
 * One card per GRN, laid out like the rate card above it (owner, 2026-10-16: the one-line rows were too dense):
 * the GRN number and customer, the rent with its unit, then Weight each, Labour, Tax and GRN date as key-value
 * rows. A GRN with several weight bands shows them as a band list.
 */
import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { KeyValueCell } from '@/components/fiori/KeyValueCell';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useThemedStyles } from '@/hooks/useTheme';
import { formatIdentifier, localizeDigits, t } from '@/i18n';
import { layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemGrnRate } from '@/types/item-pricing.types';
import { bandText, dateText, money, percentRange, unitText } from '../rateText';
import { BandList } from './BandList';

/** One line for an archived GRN rate under Old rates. */
export const grnOnlyLine = (rate: ItemGrnRate): string =>
  t('pricing.item.grnOnlyRow', {
    number: formatIdentifier(rate.gr_no),
    customer: rate.customer_name ?? '',
    date: dateText(rate.grn_date),
  });

export const grnOnlyFigures = (rate: ItemGrnRate): string =>
  t(rate.price_type === 'one_time' ? 'grn.rates.figuresOneTime' : 'grn.rates.figures', {
    band: bandText(rate.weight_min, rate.weight_max),
    rent: money(rate.unit_price),
    labour: money(rate.labour_rate),
    tax: localizeDigits(String(rate.tax_percent)),
  });

/** The rates by GRN, in the order the server gave the GRNs, each GRN's bands by weight. */
export function groupByGrn(rates: ItemGrnRate[]): ItemGrnRate[][] {
  const groups = new Map<string, ItemGrnRate[]>();
  for (const rate of rates) groups.set(rate.gr_id, [...(groups.get(rate.gr_id) ?? []), rate]);
  return [...groups.values()].map(bands => [...bands].sort((a, b) => a.weight_min - b.weight_min));
}

const TABULAR = ['tabular-nums' as const];

const makeStyles = (th: ThemeTokens) => ({
  wrap: { marginHorizontal: layout.marginCompact, marginBottom: space.lg },
  block: { gap: space.md, marginBottom: space.lg },
  card: { backgroundColor: th.surface.card, borderRadius: radius.card, marginHorizontal: layout.marginCompact, padding: space.lg, gap: space.md },
  head: { gap: space.xxs },
  grn: { ...typography.headline, color: th.text.primary },
  customer: { ...typography.subhead, color: th.text.secondary },
  figure: { ...typography.title3, color: th.text.primary, fontVariant: TABULAR },
  unit: { ...typography.subhead, color: th.text.secondary },
  note: { ...typography.footnote, color: th.text.secondary },
});

function GrnRateCard({ bands }: { bands: ItemGrnRate[] }) {
  const styles = useThemedStyles(makeStyles);
  const { fontScale } = useWindowDimensions();
  const kv = fontScale >= 1.3 ? 'stacked' : 'inline';
  const first = bands[0];
  const oneTime = first.price_type === 'one_time';
  const single = bands.length === 1;
  const sameLabour = new Set(bands.map(b => b.labour_rate)).size === 1;
  const taxes = bands.map(b => b.tax_percent);
  return (
    <View style={styles.card} testID={`grn-only-card-${first.gr_id}`}>
      <View style={styles.head}>
        <Text style={styles.grn} accessibilityRole="header">{t('pricing.item.grnOnlyGrn', { number: formatIdentifier(first.gr_no) })}</Text>
        {first.customer_name ? <Text style={styles.customer} numberOfLines={2}>{first.customer_name}</Text> : null}
      </View>
      {single ? (
        <Text>
          <Text style={styles.figure}>{money(first.unit_price)}</Text>
          <Text style={styles.unit}>{`  ${unitText(first.price_type)}`}</Text>
        </Text>
      ) : (
        <>
          <Text style={styles.unit}>{unitText(first.price_type)}</Text>
          <BandList bands={bands} priceType={first.price_type} />
        </>
      )}
      <View>
        {single ? <KeyValueCell layout={kv} keyLabel={t('pricing.band.weightEach')} value={bandText(first.weight_min, first.weight_max)} showDivider /> : null}
        {oneTime || !sameLabour ? null : (
          <KeyValueCell layout={kv} keyLabel={t('pricing.item.labour')} value={t('pricing.item.labourShort', { amount: money(first.labour_rate) })} showDivider />
        )}
        <KeyValueCell layout={kv} keyLabel={t('pricing.item.tax')} value={t('pricing.item.taxShort', { percent: percentRange(Math.min(...taxes), Math.max(...taxes)) })} showDivider />
        <KeyValueCell layout={kv} keyLabel={t('pricing.item.grnDate')} value={dateText(first.grn_date)} />
      </View>
    </View>
  );
}

export function GrnOnlyRatesSection({ rates, failed }: { rates: ItemGrnRate[] | null; failed: boolean }) {
  const styles = useThemedStyles(makeStyles);
  if (failed) return <View style={styles.wrap}><Text style={styles.note} testID="grn-only-failed">{t('pricing.item.grnOnlyFailed')}</Text></View>;
  const groups = groupByGrn((rates ?? []).filter(r => !r.archived));
  if (groups.length === 0) return null;
  return (
    <View testID="grn-only-section">
      <SectionHeader title={t('pricing.item.grnOnlyTitle')} count={groups.length} />
      <View style={styles.block}>
        {groups.map(bands => <GrnRateCard key={bands[0].gr_id} bands={bands} />)}
      </View>
    </View>
  );
}

export default GrnOnlyRatesSection;
