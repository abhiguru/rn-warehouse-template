/**
 * "For GRNs only" on the item page (backend migration 86): the rates set for one GRN only, a row per GRN
 * with its band and figures. Loaded when the page opens, after the rates; a failure is a line of text, never a
 * blocker. Rates of invoiced GRNs (archived) are not here: they are listed under Old rates.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { formatIdentifier, localizeDigits, t } from '@/i18n';
import { layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemGrnRate } from '@/types/item-pricing.types';
import { bandText, dateText, money } from '../rateText';

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

const makeStyles = (th: ThemeTokens) => ({
  wrap: { marginHorizontal: layout.marginCompact, gap: space.sm, marginBottom: space.lg },
  card: { backgroundColor: th.surface.card, borderRadius: radius.card, padding: space.lg, gap: space.md },
  line: { ...typography.body, color: th.text.primary },
  figures: { ...typography.footnote, color: th.text.secondary },
  note: { ...typography.footnote, color: th.text.secondary },
});

export function GrnOnlyRatesSection({ rates, failed }: { rates: ItemGrnRate[] | null; failed: boolean }) {
  const styles = useThemedStyles(makeStyles);
  if (failed) return <View style={styles.wrap}><Text style={styles.note} testID="grn-only-failed">{t('pricing.item.grnOnlyFailed')}</Text></View>;
  const active = (rates ?? []).filter(r => !r.archived);
  if (active.length === 0) return null;
  return (
    <View style={styles.wrap} testID="grn-only-section">
      <Text style={styles.note} accessibilityRole="header">{t('pricing.item.grnOnlyTitle')}</Text>
      <View style={styles.card}>
        {active.map(rate => (
          <View key={rate.id}>
            <Text style={styles.line}>{grnOnlyLine(rate)}</Text>
            <Text style={styles.figures}>{grnOnlyFigures(rate)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default GrnOnlyRatesSection;
