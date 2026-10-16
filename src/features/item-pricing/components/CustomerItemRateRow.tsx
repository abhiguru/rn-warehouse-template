/**
 * One item the customer has an own rate for, on the customer's Pricing tab: the item name, since when, one line per
 * weight band (band, rent, labour, tax), the default rate beside it, tags only when true, and a chevron. A single
 * press target that reads as one sentence to a screen reader; it opens the item's rate box for this customer.
 */
import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { StatusTag } from '@/components/ui/StatusTag';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { iconSize, layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemStoragePrice } from '@/types/item-pricing.types';
import type { CustomerItemEntry } from '../customerRates';
import { bandText, dateText, money, percentRange, rentRange, unitText } from '../rateText';

export interface CustomerItemRateRowProps {
  entry: CustomerItemEntry;
  onPress: (itemId: string) => void;
  testID?: string;
}

const ROW_MIN_HEIGHT = 72;

const makeStyles = (th: ThemeTokens) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: ROW_MIN_HEIGHT,
    gap: space.sm,
    paddingVertical: space.md,
    paddingLeft: layout.marginCompact,
    paddingRight: space.sm,
    backgroundColor: th.surface.card,
  },
  pressed: { backgroundColor: th.surface.cardPressed },
  body: { flex: 1, gap: space.xs },
  name: { ...typography.headline, color: th.text.primary },
  line: { ...typography.subhead, color: th.text.secondary },
  tags: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.xs },
  divider: { height: 1, marginLeft: layout.marginCompact, backgroundColor: th.border.divider },
});

/** "0–100 kg · ₹3.00 · Labour ₹1.50 · Tax 5%" (a one-time rate has no labour). */
export function bandLine(band: ItemStoragePrice): string {
  const parts = [bandText(band.weight_min, band.weight_max), money(band.unit_price)];
  if (band.price_type !== 'one_time') parts.push(t('pricing.row.labour', { amount: money(band.labour_rate) }));
  parts.push(t('pricing.row.tax', { percent: percentRange(band.tax_percent, band.tax_percent) }));
  return parts.join(' · ');
}

/** "Default rate: ₹3.50 per bag, per month", or null when the item has no default rate on the day. */
export function defaultLine(entry: CustomerItemEntry): string | null {
  if (entry.defaultBands.length === 0) return null;
  const prices = entry.defaultBands.map(b => b.unit_price);
  return t('pricing.customerRate.defaultIs', { amount: rentRange(Math.min(...prices), Math.max(...prices)), unit: unitText(entry.priceType) });
}

function tagTexts(entry: CustomerItemEntry): { label: string; informative: boolean }[] {
  const tags: { label: string; informative: boolean }[] = [];
  if (entry.newRateFrom) tags.push({ label: t('pricing.tag.newRate', { date: dateText(entry.newRateFrom) }), informative: true });
  if (entry.rateEnds) tags.push({ label: t('pricing.tag.rateEnds', { date: dateText(entry.rateEnds) }), informative: false });
  return tags;
}

function CustomerItemRateRowBase({ entry, onPress, testID }: CustomerItemRateRowProps) {
  const th = useTokens();
  const styles = useThemedStyles(makeStyles);
  const since = entry.since ? t('pricing.customerTab.since', { date: dateText(entry.since) }) : null;
  const lines = entry.bands.map(bandLine);
  const compare = defaultLine(entry);
  const tags = tagTexts(entry);
  const spoken = [entry.name, since, ...lines, compare, ...tags.map(tag => tag.label)].filter(Boolean).join(', ');
  return (
    <View>
      <Pressable
        onPress={() => onPress(entry.itemId)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        testID={testID ?? `customer-item-row-${entry.itemId}`}
      >
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={2}>{entry.name}</Text>
          {since ? <Text style={styles.line}>{since}</Text> : null}
          {lines.map((line, index) => <Text key={entry.bands[index].id} style={styles.line}>{line}</Text>)}
          {compare ? <Text style={styles.line} testID="default-is">{compare}</Text> : null}
          {tags.length > 0 ? (
            <View style={styles.tags}>
              {tags.map(tag => (
                <StatusTag key={tag.label} status={tag.informative ? 'informative' : 'neutral'} icon={tag.informative ? undefined : null} label={tag.label} />
              ))}
            </View>
          ) : null}
        </View>
        <Icon name="chevron-right" size={iconSize.md} color={th.icon.secondary} />
      </Pressable>
      <View style={styles.divider} />
    </View>
  );
}

export const CustomerItemRateRow = memo(CustomerItemRateRowBase);
