/**
 * The rate in force for one scope (default or one customer) and one price type, read-only: another
 * day, or a role that cannot write (the editable rate is ScopeRates' box). An upcoming rate is a
 * strip under the figure and never the figure itself (P-10); a stop is a strip too.
 */
import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { KeyValueCell } from '@/components/fiori/KeyValueCell';
import { useThemedStyles } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import type { UpcomingGroup } from '../rateModel';
import { applicableRate } from '../rateModel';
import { bandText, dateText, money, percentRange, rentRange, unitText } from '../rateText';
import type { TierTag } from '../standardRate';
import { BandList, TierTagView } from './BandList';
import { RateStrip } from './RateStrip';

export interface RateCardProps {
  priceType: PriceType;
  /** Rows in force, by weight. Empty when only a later rate exists. */
  bands: ItemStoragePrice[];
  upcoming: UpcomingGroup | null;
  stopsAfter: string | null;
  /** Old data: two rates in force cover the same weights. */
  overlap: boolean;
  /** The day the screen shows, for the rate invoices use on an overlap. */
  day: string;
  /** One tag per band in force ('Standard' or 'This item'): a default monthly rate only, and only when the standard rate is known. */
  tags?: TierTag[] | null;
}

const TABULAR = ['tabular-nums' as const];

const makeStyles = (th: ThemeTokens) => ({
  card: {
    backgroundColor: th.surface.card,
    borderRadius: radius.card,
    marginHorizontal: layout.marginCompact,
    padding: space.lg,
    gap: space.md,
  },
  figure: { ...typography.title3, color: th.text.primary, fontVariant: TABULAR },
  unit: { ...typography.subhead, color: th.text.secondary },
});

/** "Lots received since 1 Apr 2026" or "Lots received 1 Apr 2026 – 31 Dec 2026". */
export function inForceText(bands: ItemStoragePrice[]): string {
  const from = bands.reduce((min, b) => (b.effective_from < min ? b.effective_from : min), bands[0].effective_from);
  const to = bands[0].effective_to;
  return to ? t('pricing.item.range', { from: dateText(from), to: dateText(to) }) : t('pricing.item.since', { date: dateText(from) });
}

export function RateCard(props: RateCardProps) {
  const { priceType, bands, upcoming, stopsAfter, overlap } = props;
  const styles = useThemedStyles(makeStyles);
  const { fontScale } = useWindowDimensions();
  const stackedLayout = fontScale >= 1.3 ? 'stacked' : 'inline';
  const oneTime = priceType === 'one_time';
  const hasRate = bands.length > 0;

  const upcomingAmount = upcoming ? rentRange(Math.min(...upcoming.rows.map(r => r.unit_price)), Math.max(...upcoming.rows.map(r => r.unit_price))) : '';
  const overlapRate = overlap
    ? applicableRate(bands, { customer_id: bands[0].customer_id, weight: bands[0].weight_max, price_type: priceType, day: props.day })
    : undefined;

  return (
    <View style={styles.card} testID={`rate-card-${priceType}`}>
      {hasRate ? (
        <>
          {bands.length === 1 ? (
            <>
              <Text style={styles.figure} accessibilityRole="header">{money(bands[0].unit_price)}</Text>
              <Text style={styles.unit}>{unitText(priceType)}</Text>
              {props.tags?.[0] ? <TierTagView tag={props.tags[0]} testID="band-tag-0" /> : null}
              <View>
                <KeyValueCell layout={stackedLayout} keyLabel={t('pricing.band.weightEach')} value={bandText(bands[0].weight_min, bands[0].weight_max)} showDivider />
                {oneTime ? null : (
                  <KeyValueCell layout={stackedLayout} keyLabel={t('pricing.item.labour')} value={t('pricing.item.labourValue', { amount: money(bands[0].labour_rate) })} showDivider />
                )}
                <KeyValueCell layout={stackedLayout} keyLabel={t('pricing.item.tax')} value={t('pricing.item.taxValue', { percent: percentRange(Math.min(...bands.map(b => b.tax_percent)), Math.max(...bands.map(b => b.tax_percent))) })} showDivider />
                <KeyValueCell layout={stackedLayout} keyLabel={t('pricing.item.inForce')} value={inForceText(bands)} />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.unit}>{unitText(priceType)}</Text>
              <BandList bands={bands} priceType={priceType} tags={props.tags} />
              <View>
                {oneTime || new Set(bands.map(b => b.labour_rate)).size > 1 ? null : (
                  <KeyValueCell layout={stackedLayout} keyLabel={t('pricing.item.labour')} value={t('pricing.item.labourValue', { amount: money(bands[0].labour_rate) })} showDivider />
                )}
                <KeyValueCell layout={stackedLayout} keyLabel={t('pricing.item.tax')} value={t('pricing.item.taxValue', { percent: percentRange(Math.min(...bands.map(b => b.tax_percent)), Math.max(...bands.map(b => b.tax_percent))) })} showDivider />
                <KeyValueCell layout={stackedLayout} keyLabel={t('pricing.item.inForce')} value={inForceText(bands)} />
              </View>
            </>
          )}
          {overlap && overlapRate ? (
            <RateStrip
              variant="critical"
              message={t('pricing.item.overlap', {
                band: bandText(overlapRate.weight_min, overlapRate.weight_max),
                amount: money(overlapRate.unit_price),
              })}
            />
          ) : null}
        </>
      ) : null}

      {upcoming ? (
        <RateStrip
          variant="info"
          message={t('pricing.item.upcoming', { date: dateText(upcoming.startsOn), amount: upcomingAmount, unit: unitText(priceType) })}
        />
      ) : null}

      {hasRate && stopsAfter ? (
        <RateStrip
          variant="warning"
          message={t('pricing.item.stops', { date: dateText(stopsAfter) })}
        />
      ) : null}
    </View>
  );
}
