/**
 * One item on the Item pricing list: name, the rent in force, one summary line and tags only
 * when true. A single press target (no swipe): the whole row reads as one sentence to a screen
 * reader. At large text the rent drops under the name so nothing is cut (P-42).
 */
import React, { memo } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { HighlightedText } from '@/features/filters/components/HighlightedText';
import { StatusTag } from '@/components/ui/StatusTag';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { iconSize, layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemSummary } from '../rateModel';
import { bandText, dateText, percentRange, rentRange, unitText } from '../rateText';

export interface ItemRateRowProps {
  summary: ItemSummary;
  onPress: (itemId: string) => void;
  /** Lower-cased words of the search, to show in bold. */
  words?: string[];
  testID?: string;
}

/** At or above this system font scale the rent drops under the name. */
export const STACK_RENT_SCALE = 1.5;
const ROW_MIN_HEIGHT = 72;
const TABULAR = ['tabular-nums' as const];

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
  top: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, justifyContent: 'space-between' as const, gap: space.md },
  name: { ...typography.headline, flex: 1, color: th.text.primary },
  rent: { ...typography.headline, color: th.text.primary, fontVariant: TABULAR, textAlign: 'right' as const },
  rentStacked: { textAlign: 'left' as const },
  summary: { ...typography.subhead, color: th.text.secondary },
  tags: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.xs },
  divider: { height: 1, marginLeft: layout.marginCompact, backgroundColor: th.border.divider },
});

/** The second line: "0–100 kg · Labour ₹2.50 · Tax 5%". */
export function summaryLine(s: ItemSummary): string {
  if (s.bands.length === 0) return '—';
  const oneTime = s.priceType === 'one_time';
  const parts: string[] = [];
  if (oneTime) parts.push(t('pricing.row.oneTime'));
  parts.push(s.bands.length > 1 ? t('pricing.row.bands', { count: s.bands.length }) : bandText(s.weightMin as number, s.weightMax as number));
  if (!oneTime) parts.push(t('pricing.row.labour', { amount: rentRange(s.labourMin as number, s.labour as number) }));
  parts.push(t('pricing.row.tax', { percent: percentRange(s.tax as number, s.taxMax as number) }));
  return parts.join(' · ');
}

/** The tags under the row (customer rates, new rate, no rate, rate ends), as text. */
function tagTexts(s: ItemSummary, skipNoRate = false): string[] {
  const tags: string[] = [];
  if (s.customerRateCount > 0) tags.push(t('pricing.tag.customerRates', { count: s.customerRateCount }));
  if (s.upcomingFrom) tags.push(t('pricing.tag.newRate', { date: dateText(s.upcomingFrom) }));
  if (s.noRateToday && !skipNoRate) tags.push(t('pricing.tag.noRate'));
  if (s.rateEnds) tags.push(t('pricing.tag.rateEnds', { date: dateText(s.rateEnds) }));
  return tags;
}

/** What a screen reader says for the whole row: the figures, then the tags (the label replaces the children). */
export function rowA11y(s: ItemSummary): string {
  // A row without a figure already says "no rate today".
  const tags = tagTexts(s, s.bands.length === 0);
  const withTags = (text: string) => [text, ...tags].join(', ');
  if (s.bands.length === 0) return withTags(t('pricing.row.a11yNoRate', { item: s.name }));
  const amount = rentRange(s.minRent as number, s.maxRent as number);
  const unit = unitText(s.priceType ?? 'monthly');
  const band = s.bands.length > 1 ? t('pricing.row.bands', { count: s.bands.length }) : bandText(s.weightMin as number, s.weightMax as number);
  const percent = percentRange(s.tax as number, s.taxMax as number);
  return withTags(
    s.priceType === 'one_time'
      ? t('pricing.row.a11yOneTime', { item: s.name, amount, unit, band, percent })
      : t('pricing.row.a11y', { item: s.name, amount, unit, band, labour: rentRange(s.labourMin as number, s.labour as number), percent })
  );
}

function ItemRateRowBase({ summary, onPress, words, testID }: ItemRateRowProps) {
  const th = useTokens();
  const styles = useThemedStyles(makeStyles);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= STACK_RENT_SCALE;
  const figure = summary.bands.length > 0 ? rentRange(summary.minRent as number, summary.maxRent as number) : '—';
  const rent = (
    <Text
      style={[styles.rent, stacked && styles.rentStacked]}
      numberOfLines={1}
      maxFontSizeMultiplier={2}
      testID={stacked ? 'rent-stacked' : 'rent-right'}
    >
      {figure}
    </Text>
  );

  return (
    <View>
      <Pressable
        onPress={() => onPress(summary.itemId)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={rowA11y(summary)}
        testID={testID ?? `item-rate-row-${summary.itemId}`}
      >
        <View style={styles.body}>
          <View style={styles.top}>
            <HighlightedText text={summary.name} words={words} style={styles.name} numberOfLines={2} />
            {stacked ? null : rent}
          </View>
          {stacked ? rent : null}
          <Text style={styles.summary}>{summaryLine(summary)}</Text>
          <View style={styles.tags}>
            {summary.customerRateCount > 0 ? (
              <StatusTag status="neutral" icon={null} label={t('pricing.tag.customerRates', { count: summary.customerRateCount })} />
            ) : null}
            {summary.upcomingFrom ? (
              <StatusTag status="informative" label={t('pricing.tag.newRate', { date: dateText(summary.upcomingFrom) })} />
            ) : null}
            {summary.noRateToday ? <StatusTag status="critical" label={t('pricing.tag.noRate')} /> : null}
            {summary.rateEnds ? <StatusTag status="neutral" icon={null} label={t('pricing.tag.rateEnds', { date: dateText(summary.rateEnds) })} /> : null}
          </View>
        </View>
        <Icon name="chevron-right" size={iconSize.md} color={th.icon.secondary} />
      </Pressable>
      <View style={styles.divider} />
    </View>
  );
}

export const ItemRateRow = memo(ItemRateRowBase);
