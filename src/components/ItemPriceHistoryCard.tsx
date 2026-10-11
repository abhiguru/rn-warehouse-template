/**
 * One entry of the price history: what happened, the item and customer, the values,
 * then when and who. Read-only (style guide §13.6; the layout follows the change log
 * of ChangeLogBottomSheet).
 */
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemPriceHistoryEntry } from '@/types/item-pricing.types';
import { formatDateTime } from '@/utils/formatters';
import { t as tr } from '@/i18n';
import { priceHistoryChanges, truncatedPriceCount } from '@/features/item-pricing/utils/priceHistory';
import {
  priceHistoryActionLabel,
  priceHistoryAuthor,
  priceHistoryFieldLabel,
  priceHistoryValueText,
} from '@/features/item-pricing/utils/priceHistoryLabels';

const ACTION_ICONS: Record<string, string> = {
  insert: 'plus-circle-outline',
  update: 'pencil-outline',
  delete: 'trash-can-outline',
  truncate: 'delete-sweep-outline',
};

interface ItemPriceHistoryCardProps {
  entry: ItemPriceHistoryEntry;
}

const ItemPriceHistoryCard = memo<ItemPriceHistoryCardProps>(({ entry }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const { action } = entry;
  const isTruncate = action === 'truncate';
  const isUpdate = action === 'update' && !!entry.old_values && !!entry.new_values;
  const actionLabel = priceHistoryActionLabel(action);
  // The icon colour repeats what the words beside it say (style guide §3.5).
  const actionColor =
    action === 'insert'
      ? t.status.positive.text
      : action === 'delete' || isTruncate
        ? t.status.negative.text
        : t.status.informative.text;

  const itemName = isTruncate ? null : entry.item_name || tr('pricing.history.deletedItem');
  const customerName = isTruncate
    ? null
    : !entry.customer_id
      ? tr('pricing.history.defaultPrice')
      : entry.customer_name || tr('pricing.history.deletedCustomer');

  const rows = priceHistoryChanges(action, entry.old_values, entry.new_values).map((change) => {
    const label = priceHistoryFieldLabel(change.field);
    if (isUpdate) {
      const before = priceHistoryValueText(change.field, change.before);
      const after = priceHistoryValueText(change.field, change.after);
      return { field: change.field, label, before, after, spoken: tr('pricing.history.changeLabel', { label, old: before, new: after }) };
    }
    // A price that was added shows its new values; one that was deleted, its old ones.
    const value = priceHistoryValueText(change.field, action === 'delete' ? change.before : change.after);
    return { field: change.field, label, before: null, after: value, spoken: tr('pricing.form.labelValue', { label, value }) };
  });

  const removed = isTruncate ? truncatedPriceCount(entry.old_values) : null;
  const note = isTruncate
    ? removed === null
      ? null
      : tr('pricing.history.pricesRemoved', { count: removed })
    : rows.length === 0
      ? tr('pricing.history.noValuesChanged')
      : null;

  const when = formatDateTime(entry.changed_at);
  const who = priceHistoryAuthor(entry);
  const spoken = [actionLabel, itemName, customerName, ...rows.map((row) => row.spoken), note, when, who]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.card} accessible accessibilityLabel={spoken} testID={`price-history-entry-${entry.id}`}>
      <View style={styles.actionRow}>
        <Icon name={ACTION_ICONS[action] ?? ACTION_ICONS.update} size={iconSize.md} color={actionColor} />
        <Text style={styles.actionText}>{actionLabel}</Text>
      </View>

      {itemName !== null && <Text style={styles.itemName}>{itemName}</Text>}
      {customerName !== null && <Text style={styles.customerName}>{customerName}</Text>}

      {(rows.length > 0 || note !== null) && (
        <View style={styles.values}>
          {rows.map((row) => (
            <View key={row.field} style={styles.valueRow}>
              <Text style={styles.valueLabel}>{row.label}</Text>
              {row.before === null ? (
                <Text style={styles.valueNew}>{row.after}</Text>
              ) : (
                <View style={styles.changeRow}>
                  <Text style={styles.valueOld}>{row.before}</Text>
                  <Icon name="arrow-right" size={iconSize.sm} color={t.icon.secondary} />
                  <Text style={styles.valueNew}>{row.after}</Text>
                </View>
              )}
            </View>
          ))}
          {note !== null && <Text style={styles.note}>{note}</Text>}
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Icon name="clock-outline" size={iconSize.sm} color={t.icon.secondary} />
          <Text style={styles.footerText}>{when}</Text>
        </View>
        <View style={styles.footerRow}>
          <Icon name="account-outline" size={iconSize.sm} color={t.icon.secondary} />
          <Text style={styles.footerText}>{who}</Text>
        </View>
      </View>
    </View>
  );
});

ItemPriceHistoryCard.displayName = 'ItemPriceHistoryCard';

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
  actionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  actionText: {
    ...typography.headline,
    flex: 1,
    color: t.text.primary,
  },
  itemName: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
  customerName: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  values: {
    marginTop: space.xs,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
    gap: space.sm,
  },
  valueRow: {
    gap: space.xxs,
  },
  valueLabel: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  changeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  valueOld: {
    ...typography.subhead,
    color: t.text.secondary,
    fontVariant: ['tabular-nums' as const],
  },
  valueNew: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  note: {
    ...typography.subhead,
    color: t.text.primary,
  },
  footer: {
    marginTop: space.xs,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
    gap: space.xs,
  },
  footerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  footerText: {
    ...typography.footnote,
    flex: 1,
    color: t.text.secondary,
  },
});

export default ItemPriceHistoryCard;
