/**
 * Old rates, folded: "Show 1 old rate" / "Hide old rates". Read-only, for every warehouse role.
 * An old rate is "Ended" (neutral) and still bills lots received in its window (P-12).
 * Rows saved together (same scope and dates) are one old rate.
 */
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { StatusTag } from '@/components/ui/StatusTag';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { layout, space, typography, radius, type ThemeTokens } from '@/theme/tokens';
import type { ItemGrnRate, ItemStoragePrice } from '@/types/item-pricing.types';
import { grnOnlyFigures, grnOnlyLine } from '../grnOnlyText';
import { dateText, rangeText, rentRange, unitText } from '../rateText';

export interface OldRatesSectionProps {
  /** Rows whose last day is before the day shown (any scope). */
  rows: ItemStoragePrice[];
  /** Name the customer on each old rate (item page); off on a customer's own page. */
  showCustomer?: boolean;
  /** Rates for one GRN only whose GRN is invoiced (archived), listed with the old rates. */
  archivedGrnRates?: ItemGrnRate[];
}

interface OldRate {
  key: string;
  customer: string | null;
  priceType: ItemStoragePrice['price_type'];
  from: string;
  to: string;
  min: number;
  max: number;
}

export function groupOldRates(rows: ItemStoragePrice[]): OldRate[] {
  const groups = new Map<string, OldRate>();
  for (const r of rows) {
    if (!r.effective_to) continue;
    const key = `${r.customer_id ?? 'default'}|${r.price_type}|${r.effective_from}|${r.effective_to}`;
    const g = groups.get(key);
    if (g) {
      g.min = Math.min(g.min, r.unit_price);
      g.max = Math.max(g.max, r.unit_price);
    } else {
      groups.set(key, { key, customer: r.customer_id ? r.customer_name ?? '' : null, priceType: r.price_type, from: r.effective_from, to: r.effective_to, min: r.unit_price, max: r.unit_price });
    }
  }
  return [...groups.values()].sort((a, b) => b.to.localeCompare(a.to) || b.from.localeCompare(a.from));
}

const makeStyles = (th: ThemeTokens) => ({
  wrap: { marginHorizontal: layout.marginCompact, gap: space.sm },
  card: { backgroundColor: th.surface.card, borderRadius: radius.card, padding: space.lg, gap: space.sm, marginTop: space.xs },
  rate: { ...typography.body, color: th.text.primary },
  note: { ...typography.footnote, color: th.text.secondary },
  rows: { gap: space.md },
});

export function OldRatesSection({ rows, showCustomer = true, archivedGrnRates = [] }: OldRatesSectionProps) {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => groupOldRates(rows), [rows]);
  const total = groups.length + archivedGrnRates.length;
  if (total === 0) return null;
  return (
    <View style={styles.wrap}>
      <Button type="tertiary" onPress={() => setOpen(v => !v)} accessibilityState={{ expanded: open }} testID="old-rates-toggle">
        {open ? t('pricing.item.hideOld') : t('pricing.item.showOld', { count: total })}
      </Button>
      {open ? (
        <View style={styles.card} testID="old-rates">
          {groups.map(g => {
            const amount = rentRange(g.min, g.max);
            const range = rangeText(g.from, g.to);
            const line = g.customer !== null && showCustomer
              ? t('pricing.item.oldRateCustomer', { customer: g.customer, amount, unit: unitText(g.priceType), range })
              : t('pricing.item.oldRate', { amount, unit: unitText(g.priceType), range });
            return (
              <View key={g.key} style={styles.rows}>
                <Text style={styles.rate}>{line}</Text>
                <StatusTag status="neutral" icon={null} label={t('pricing.tag.ended')} />
                <Text style={styles.note}>{t('pricing.item.oldStillUsed', { from: dateText(g.from), to: dateText(g.to) })}</Text>
              </View>
            );
          })}
          {archivedGrnRates.map(rate => (
            <View key={rate.id} style={styles.rows} testID={`old-grn-rate-${rate.id}`}>
              <Text style={styles.rate}>{grnOnlyLine(rate)}</Text>
              <Text style={styles.note}>{grnOnlyFigures(rate)}</Text>
              <StatusTag status="neutral" icon={null} label={t('grn.details.ratesArchived')} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
