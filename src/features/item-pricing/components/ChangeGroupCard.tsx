/**
 * One save in the history: the rows that replace_item_rates wrote in one transaction (the old
 * rate ended, the new one added) read as one card, "Rate changed from 1 Jan 2027", with only
 * the values that changed (₹11.00 → ₹12.00). Read-only (style guide §13.6).
 */
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { fontWeight, iconSize, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemPriceHistoryEntry } from '@/types/item-pricing.types';
import { formatDateTime } from '@/utils/formatters';
import { bandText, dateText } from '../rateText';
import type { GroupView } from '../utils/priceHistory';
import { priceHistoryAuthor, priceHistoryFieldLabel, priceHistoryValueText } from '../utils/priceHistoryLabels';

interface Props {
  /** In feed order; the first one names the item, the customer, the time and the person. */
  entries: ItemPriceHistoryEntry[];
  view: GroupView;
}

const ChangeGroupCard = memo<Props>(({ entries, view }) => {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const first = entries[0];
  const title =
    view.kind === 'stopped'
      ? t('pricing.changes.groupStopped', { date: dateText(view.day ?? '') })
      : t('pricing.changes.group', { date: dateText(view.day ?? '') });
  const itemName = first.item_name || t('pricing.history.deletedItem');
  const customerName = !first.customer_id ? t('pricing.history.defaultPrice') : first.customer_name || t('pricing.history.deletedCustomer');
  const when = formatDateTime(first.changed_at);
  const who = priceHistoryAuthor(first);

  const bands = view.bands.map(({ band, changes }) => ({
    heading: view.bands.length > 1 && band.min !== null && band.max !== null ? bandText(band.min, band.max) : null,
    rows: changes.map(change => {
      const label = priceHistoryFieldLabel(change.field);
      const after = priceHistoryValueText(change.field, change.after);
      if (change.before === null) return { field: change.field, label, text: after, spoken: t('pricing.form.labelValue', { label, value: after }) };
      const before = priceHistoryValueText(change.field, change.before);
      return {
        field: change.field,
        label,
        text: t('pricing.changes.arrow', { old: before, new: after }),
        spoken: t('pricing.history.changeLabel', { label, old: before, new: after }),
      };
    }),
  }));
  const removed = view.removed.map(r =>
    t('pricing.changes.removed', {
      band: r.band.min !== null && r.band.max !== null ? bandText(r.band.min, r.band.max) : '—',
      amount: priceHistoryValueText(r.field, r.price),
      date: r.from ? dateText(r.from) : '—',
    })
  );
  const spoken = [title, itemName, customerName, ...bands.flatMap(b => [b.heading, ...b.rows.map(r => r.spoken)]), ...removed, when, who].filter(Boolean).join(', ');

  return (
    <View style={styles.card} accessible accessibilityLabel={spoken} testID={`price-history-group-${first.id}`}>
      <View style={styles.actionRow}>
        <Icon name={view.kind === 'stopped' ? 'stop-circle-outline' : 'pencil-outline'} size={iconSize.md} color={tokens.status.informative.text} />
        <Text style={styles.actionText}>{title}</Text>
      </View>
      <Text style={styles.itemName}>{itemName}</Text>
      <Text style={styles.customerName}>{customerName}</Text>

      {bands.some(b => b.rows.length > 0) && (
        <View style={styles.values}>
          {bands.map((b, i) => (
            <View key={i} style={styles.band}>
              {b.heading ? <Text style={styles.bandHeading}>{b.heading}</Text> : null}
              {b.rows.map(row => (
                <View key={row.field} style={styles.valueRow}>
                  <Text style={styles.valueLabel}>{row.label}</Text>
                  <Text style={styles.valueNew}>{row.text}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
      {removed.length > 0 ? (
        <View style={styles.values}>
          {removed.map((text, i) => (
            <Text key={i} style={styles.note} testID="removed-rate">{text}</Text>
          ))}
        </View>
      ) : null}
      {view.kind === 'changed' && bands.every(b => b.rows.length === 0) && removed.length === 0 ? (
        <Text style={styles.note}>{t('pricing.history.noValuesChanged')}</Text>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Icon name="clock-outline" size={iconSize.sm} color={tokens.icon.secondary} />
          <Text style={styles.footerText}>{when}</Text>
        </View>
        <View style={styles.footerRow}>
          <Icon name="account-outline" size={iconSize.sm} color={tokens.icon.secondary} />
          <Text style={styles.footerText}>{who}</Text>
        </View>
      </View>
    </View>
  );
});

ChangeGroupCard.displayName = 'ChangeGroupCard';

const makeStyles = (t: ThemeTokens) => ({
  card: {
    marginHorizontal: space.md,
    marginVertical: space.xs,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
    gap: space.xs,
    ...t.shadow[1],
  },
  actionRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  actionText: { ...typography.headline, flex: 1, color: t.text.primary },
  itemName: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary },
  customerName: { ...typography.subhead, color: t.text.secondary },
  values: {
    marginTop: space.xs,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
    gap: space.md,
  },
  band: { gap: space.sm },
  bandHeading: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.text.secondary },
  valueRow: { gap: space.xxs },
  valueLabel: { ...typography.footnote, color: t.text.secondary },
  valueNew: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary, fontVariant: ['tabular-nums' as const] },
  note: { ...typography.subhead, color: t.text.primary },
  footer: {
    marginTop: space.xs,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
    gap: space.xs,
  },
  footerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  footerText: { ...typography.footnote, flex: 1, color: t.text.secondary },
});

export default ChangeGroupCard;
