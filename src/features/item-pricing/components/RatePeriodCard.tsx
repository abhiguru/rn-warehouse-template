/**
 * One period of an item's default rate on the Pricing tab of the item page (Items -> an item -> Pricing): a status
 * tag (Upcoming, In force, Ended), the days it covers, its weight bands (weights, rent, and labour and tax) and,
 * for a period that can still change, its buttons. An ended period has none.
 */
import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { KeyValueCell } from '@/components/fiori/KeyValueCell';
import { Button } from '@/components/ui/Button';
import { StatusTag } from '@/components/ui/StatusTag';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { RatePeriod } from '../ratePeriods';
import { dateText, money, percentRange, unitText, labourText } from '../rateText';
import type { TierTag } from '../standardRate';
import { BandList } from './BandList';
import type { RateStripAction } from './RateStrip';

export interface RatePeriodCardProps {
  period: RatePeriod;
  /** One tag per band ('Standard' or 'This item'): a default monthly rate in force, when the standard rate is known. */
  tags?: TierTag[] | null;
  /** Buttons under the figures: Change and Cancel, or Correct this rate and Stop this rate. */
  actions?: RateStripAction[];
  /** The item's packaging (Bag, Box, Crate): the rate and the labour are per bag, box or crate. */
  packaging?: string | null;
  /** Under the figures, above the buttons (the strip of a rate that stops). */
  children?: React.ReactNode;
}

const makeStyles = (th: ThemeTokens) => ({
  card: {
    backgroundColor: th.surface.card,
    borderRadius: radius.card,
    marginHorizontal: layout.marginCompact,
    padding: space.lg,
    gap: space.md,
  },
  head: { gap: space.xs },
  days: { ...typography.subhead, color: th.text.secondary },
  unit: { ...typography.subhead, color: th.text.secondary },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: space.sm },
});

export function RatePeriodCard({ period, tags, actions, packaging, children }: RatePeriodCardProps) {
  const styles = useThemedStyles(makeStyles);
  const { fontScale } = useWindowDimensions();
  const stackedLayout = fontScale >= 1.3 ? 'stacked' : 'inline';
  const { rows, priceType, state } = period;
  const oneTime = priceType === 'one_time';
  const sameLabour = new Set(rows.map(r => r.labour_rate)).size === 1;
  const sameTax = new Set(rows.map(r => r.tax_percent)).size === 1;

  const tag =
    state === 'upcoming' ? (
      <StatusTag status="informative" label={t('pricing.period.upcoming')} testID={`period-tag-${period.key}`} />
    ) : state === 'inForce' ? (
      <StatusTag status="positive" label={t('pricing.item.inForce')} testID={`period-tag-${period.key}`} />
    ) : (
      <StatusTag status="neutral" icon={null} label={t('pricing.tag.ended')} testID={`period-tag-${period.key}`} />
    );
  const days = period.to
    ? t('pricing.item.range', { from: dateText(period.from), to: dateText(period.to) })
    : t('pricing.item.since', { date: dateText(period.from) });

  return (
    <View style={styles.card} testID={`rate-period-${period.key}`}>
      <View style={styles.head}>
        {tag}
        <Text style={styles.days}>{days}</Text>
      </View>
      <Text style={styles.unit}>{unitText(priceType, packaging)}</Text>
      <BandList bands={rows} priceType={priceType} tags={tags} />
      <View>
        {oneTime || !sameLabour ? null : (
          <KeyValueCell layout={stackedLayout} keyLabel={t('pricing.item.labour')} value={labourText(money(rows[0].labour_rate), packaging)} showDivider={sameTax} />
        )}
        {sameTax ? (
          <KeyValueCell layout={stackedLayout} keyLabel={t('pricing.item.tax')} value={t('pricing.item.taxValue', { percent: percentRange(rows[0].tax_percent, rows[0].tax_percent) })} />
        ) : null}
      </View>
      {children}
      {actions && actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map(action => (
            <Button
              key={action.label}
              type="tertiary"
              variant={action.negative ? 'negative' : 'tint'}
              onPress={action.onPress}
              disabled={action.disabled}
              accessibilityLabel={action.a11yLabel}
              testID={action.testID}
            >
              {action.label}
            </Button>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default RatePeriodCard;
