/**
 * One lot in Find goods (WH-300, Design 3.2 item 6): the GRN card's stock box, item, customer, rack and mark, the GRN
 * and its date, and the number left. The whole row opens the GRN.
 */
import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { getUnsentOverlay } from '@/features/phone-copy/unsentOverlay';
import { HighlightedText } from '@/features/filters/components/HighlightedText';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as translate, formatIdentifier } from '@/i18n';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import type { GRNItem } from '@/services/grn-service';
import { formatCardDate, formatNumber } from '@/utils/formatters';
import { getStatusColors, getStockBadgeLabel, getStockValueLevel, STOCK_VALUE_ICONS } from '@/utils/stockStatus';

const makeStyles = (t: ThemeTokens) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    minHeight: layout.objectCellMinHeight,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.md,
    backgroundColor: t.surface.card,
  },
  pressed: { backgroundColor: t.surface.cardPressed },
  divider: { height: 1, marginLeft: space.lg, backgroundColor: t.border.divider },
  stockBox: {
    width: 40,
    height: 40,
    borderRadius: radius.card,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  main: { flex: 1, gap: space.xxs },
  title: { ...typography.headline, color: t.text.primary },
  subtitle: { ...typography.subhead, color: t.text.secondary },
  whereLine: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: space.xs },
  where: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary },
  noRack: { ...typography.subhead, color: t.text.secondary },
  dot: { width: 3, height: 3, borderRadius: radius.pill, backgroundColor: t.icon.secondary },
  footnote: { ...typography.footnote, color: t.text.secondary },
  footnoteRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: space.xs },
  stack: { alignItems: 'flex-end' as const, gap: space.xs, minWidth: 72, maxWidth: '45%' as const, flexShrink: 0 },
  badge: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xxs },
  badgeText: { ...typography.caption1, fontWeight: fontWeight.semibold, textAlign: 'center' as const },
  stockValue: { ...typography.headline, fontVariant: ['tabular-nums' as const], textAlign: 'right' as const },
  stockLabel: { ...typography.caption2, color: t.text.secondary, textAlign: 'right' as const },
  chevron: { alignSelf: 'center' as const },
});

/** "rack B-3" in a sentence: the first letter of the shared text, lower case. */
const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

export interface FindGoodsRowProps {
  item: GRNItem;
  /** Lower-cased search words, for the bold match. */
  words: string[];
  onPress: (item: GRNItem) => void;
  /** Draws the line under the row. */
  divider: boolean;
}

export const FindGoodsRow = memo(function FindGoodsRow({ item, words, onPress, divider }: FindGoodsRowProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const lotId = String(item.grn_item_id);
  const stock = Number(item.stock) || 0;
  const received = Number(item.qty) || 0;
  const rack = (item.rack ?? '').trim();
  const mark = (item.package_mark ?? '').trim();
  const customer = item.customer_name ?? '';
  const grn = translate('lists.grn.cardTitle', { number: formatIdentifier(item.gr_no) });
  const level = getStockValueLevel(stock, received);
  const colors = getStatusColors(level, t);
  const empty = stock <= 0;

  const overlay = getUnsentOverlay();
  const lessUnsent = overlay.lessUnsent(lotId);
  const lessHeld = overlay.lessHeld(lotId);
  const lessUnsentText = lessUnsent > 0 ? translate('findGoods.lessNotSent', { count: lessUnsent }) : null;
  const lessHeldText = lessHeld > 0 ? translate('findGoods.lessHeld', { count: lessHeld }) : null;

  const label = [
    item.item_name,
    customer,
    rack ? lowerFirst(translate('grn.item.a11yRack', { rack })) : translate('findGoods.noRack'),
    mark ? translate('grn.item.a11yMark', { mark }) : null,
    grn,
    translate('reports.grnActivity.stockLabel', { stock, bags: received }),
    empty ? getStockBadgeLabel(stock, received) : null,
    lessUnsentText,
    lessHeldText,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View>
      <Pressable
        testID={`find-goods-row-${lotId}`}
        onPress={() => onPress(item)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={translate('findGoods.rowHint')}
      >
        <View
          style={[styles.stockBox, { backgroundColor: colors.light, borderColor: colors.border }]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Icon name={STOCK_VALUE_ICONS[level]} size={iconSize.lg} color={colors.main} />
        </View>

        <View style={styles.main}>
          <HighlightedText style={styles.title} numberOfLines={2} text={item.item_name ?? ''} words={words} />
          <HighlightedText style={styles.subtitle} numberOfLines={2} text={customer} words={words} />
          <View style={styles.whereLine}>
            {rack ? (
              <HighlightedText style={styles.where} text={translate('grn.item.rackWithValue', { rack })} words={words} />
            ) : (
              <Text style={styles.noRack}>{translate('findGoods.noRack')}</Text>
            )}
            {mark ? (
              <>
                <View style={styles.dot} />
                <HighlightedText style={styles.where} text={translate('grn.item.markWithValue', { mark })} words={words} />
              </>
            ) : null}
          </View>
          <View style={styles.footnoteRow}>
            <HighlightedText style={styles.footnote} text={grn} words={words} />
            <View style={styles.dot} />
            <Text style={styles.footnote}>{formatCardDate(item.date)}</Text>
          </View>
          {lessUnsentText ? <Text style={styles.footnote} testID={`lot-less-unsent-${lotId}`}>{lessUnsentText}</Text> : null}
          {lessHeldText ? <Text style={styles.footnote} testID={`lot-less-held-${lotId}`}>{lessHeldText}</Text> : null}
        </View>

        <View style={styles.stack}>
          {empty ? (
            <View style={[styles.badge, { backgroundColor: colors.dark }]} testID={`find-goods-row-empty-${lotId}`}>
              <Text style={[styles.badgeText, { color: t.text.inverse }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                {getStockBadgeLabel(stock, received)}
              </Text>
            </View>
          ) : null}
          <View>
            <Text
              style={[styles.stockValue, { color: colors.dark }]}
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              testID={`find-goods-row-stock-${lotId}`}
            >
              {formatNumber(stock)}
            </Text>
            <Text style={styles.stockLabel} maxFontSizeMultiplier={1.3}>{translate('lists.grn.stockLabel')}</Text>
          </View>
        </View>
        <View style={styles.chevron} accessible={false} importantForAccessibility="no-hide-descendants">
          <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
        </View>
      </Pressable>
      {divider ? <View style={styles.divider} /> : null}
    </View>
  );
});
