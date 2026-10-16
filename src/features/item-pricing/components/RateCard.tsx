/**
 * The rate in force for one scope (default or one customer) and one price type, with what can
 * be done to it. All actions are visible buttons (no swipe). An upcoming rate is a strip under
 * the figure and never the figure itself (P-10).
 */
import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { KeyValueCell } from '@/components/fiori/KeyValueCell';
import { Button } from '@/components/ui/Button';
import { useThemedStyles } from '@/hooks/useTheme';
import { localizeDigits, t } from '@/i18n';
import { layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import type { UpcomingGroup } from '../rateModel';
import { applicableRate } from '../rateModel';
import { addDays, bandText, dateText, money, percentRange, rentRange, todayDay, unitText } from '../rateText';
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
  canCorrect: boolean;
  canWrite: boolean;
  offline: boolean;
  /** The day the screen shows, for the rate invoices use on an overlap. */
  day: string;
  onChange: () => void;
  onCorrect: () => void;
  onStop: () => void;
  onEditUpcoming: () => void;
  onCancelUpcoming: () => void;
  onUndoStop: () => void;
  /** Disable actions while one runs. */
  busy?: boolean;
  /** One tag per band in force ('Standard' or 'This item'): a default monthly rate only, and only when the standard rate is known. */
  tags?: TierTag[] | null;
  /**
   * The read-only card opened from a GRN's Rates (owner, 2026-10-16): the figure and its unit on one
   * line, short values, and no tier tag, upcoming rate or stop strip (those are about days after today,
   * not the GRN's day).
   */
  compact?: boolean;
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
  note: { ...typography.footnote, color: th.text.secondary },
  actions: { gap: space.sm },
  cardNote: { marginTop: -space.xs },
  actionsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.sm, alignItems: 'center' as const },
});

/** "Lots received since 1 Apr 2026" or "Lots received 1 Apr 2026 – 31 Dec 2026"; short: "Since 1 Apr 2026" / "1 Apr 2026 – 31 Dec 2026". */
export function inForceText(bands: ItemStoragePrice[], short = false): string {
  const from = bands.reduce((min, b) => (b.effective_from < min ? b.effective_from : min), bands[0].effective_from);
  const to = bands[0].effective_to;
  if (short) return to ? t('pricing.item.rangeShort', { from: dateText(from), to: dateText(to) }) : t('pricing.item.sinceShort', { date: dateText(from) });
  return to ? t('pricing.item.range', { from: dateText(from), to: dateText(to) }) : t('pricing.item.since', { date: dateText(from) });
}

export function RateCard(props: RateCardProps) {
  const { priceType, bands, upcoming, stopsAfter, overlap, canCorrect, canWrite, offline, busy, compact = false } = props;
  const styles = useThemedStyles(makeStyles);
  const { fontScale } = useWindowDimensions();
  const stackedLayout = fontScale >= 1.3 ? 'stacked' : 'inline';
  const disabled = offline || Boolean(busy);
  const oneTime = priceType === 'one_time';
  const hasRate = bands.length > 0;
  // Undo stop restarts the rate on the day after the last day: staff may do that only for a day still ahead.
  const canUndoStop = canWrite && Boolean(stopsAfter) && (canCorrect || addDays(stopsAfter as string, 1) > todayDay());

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
              {compact ? (
                <Text accessibilityRole="header">
                  <Text style={styles.figure}>{money(bands[0].unit_price)}</Text>
                  <Text style={styles.unit}>{`  ${unitText(priceType)}`}</Text>
                </Text>
              ) : (
                <>
                  <Text style={styles.figure} accessibilityRole="header">{money(bands[0].unit_price)}</Text>
                  <Text style={styles.unit}>{unitText(priceType)}</Text>
                </>
              )}
              {props.tags?.[0] && !compact ? <TierTagView tag={props.tags[0]} testID="band-tag-0" /> : null}
              <View>
                <KeyValueCell layout={stackedLayout} keyLabel={t('pricing.band.weightEach')} value={bandText(bands[0].weight_min, bands[0].weight_max)} showDivider />
                {oneTime ? null : (
                  <KeyValueCell
                    layout={stackedLayout}
                    keyLabel={t('pricing.item.labour')}
                    value={t(compact ? 'pricing.item.labourShort' : 'pricing.item.labourValue', { amount: money(bands[0].labour_rate) })}
                    showDivider
                  />
                )}
                <KeyValueCell
                  layout={stackedLayout}
                  keyLabel={t('pricing.item.tax')}
                  value={t(compact ? 'pricing.item.taxShort' : 'pricing.item.taxValue', { percent: percentRange(Math.min(...bands.map(b => b.tax_percent)), Math.max(...bands.map(b => b.tax_percent))) })}
                  showDivider
                />
                <KeyValueCell layout={stackedLayout} keyLabel={t('pricing.item.inForce')} value={inForceText(bands, compact)} />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.unit}>{unitText(priceType)}</Text>
              <BandList bands={bands} priceType={priceType} tags={props.tags} />
              <View>
                {oneTime || new Set(bands.map(b => b.labour_rate)).size > 1 ? null : (
                  <KeyValueCell
                    layout={stackedLayout}
                    keyLabel={t('pricing.item.labour')}
                    value={t(compact ? 'pricing.item.labourShort' : 'pricing.item.labourValue', { amount: money(bands[0].labour_rate) })}
                    showDivider
                  />
                )}
                <KeyValueCell
                  layout={stackedLayout}
                  keyLabel={t('pricing.item.tax')}
                  value={t(compact ? 'pricing.item.taxShort' : 'pricing.item.taxValue', { percent: percentRange(Math.min(...bands.map(b => b.tax_percent)), Math.max(...bands.map(b => b.tax_percent))) })}
                  showDivider
                />
                <KeyValueCell layout={stackedLayout} keyLabel={t('pricing.item.inForce')} value={inForceText(bands, compact)} />
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

      {upcoming && !compact ? (
        <RateStrip
          variant="info"
          message={t('pricing.item.upcoming', { date: dateText(upcoming.startsOn), amount: upcomingAmount, unit: unitText(priceType) })}
          actions={
            canWrite
              ? [
                  { label: t('pricing.action.editUpcoming'), onPress: props.onEditUpcoming, disabled, testID: 'edit-upcoming' },
                  { label: t('pricing.action.cancelUpcoming'), onPress: props.onCancelUpcoming, disabled, negative: true, testID: 'cancel-upcoming' },
                ]
              : undefined
          }
        />
      ) : null}

      {hasRate && stopsAfter && !compact ? (
        <RateStrip
          variant="warning"
          message={t('pricing.item.stops', { date: dateText(stopsAfter) })}
          actions={canUndoStop ? [{ label: t('pricing.action.undoStop'), onPress: props.onUndoStop, disabled, testID: 'undo-stop' }] : undefined}
        />
      ) : null}

      {hasRate && stopsAfter && canWrite && !canUndoStop ? <Text style={[styles.note, styles.cardNote]}>{t('pricing.item.undoManagerOnly')}</Text> : null}

      {hasRate && canWrite ? (
        <View style={styles.actions}>
          <View style={fontScale >= 1.3 ? styles.actions : styles.actionsRow}>
            <Button
              type="secondary"
              leftIcon="pencil-outline"
              size={fontScale >= 1.3 ? 'fullWidth' : 'standalone'}
              onPress={props.onChange}
              disabled={disabled}
              testID="rate-change"
            >
              {t('pricing.action.change')}
            </Button>
            {canCorrect ? (
              <Button type="tertiary" size={fontScale >= 1.3 ? 'fullWidth' : 'auto'} onPress={props.onCorrect} disabled={disabled} testID="rate-correct">
                {t('pricing.action.correct')}
              </Button>
            ) : null}
            <Button
              type="tertiary"
              variant="negative"
              size={fontScale >= 1.3 ? 'fullWidth' : 'auto'}
              onPress={props.onStop}
              disabled={disabled}
              testID="rate-stop"
            >
              {t('pricing.action.stop')}
            </Button>
          </View>
          {canCorrect ? null : <Text style={styles.note}>{t('pricing.item.staffCorrectNote')}</Text>}
          {offline ? <Text style={styles.note}>{t('pricing.item.offlineChange')}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
