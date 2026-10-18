/**
 * The top of a group's card: the item name, its mark (up to two lines, never an empty chip), the
 * weights, how many bags were dispatched, the group total and, in a new invoice for those who
 * may change prices, the pencil that opens the item's price list.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { nb, numberColumnWidth, rowWidth, useTableLayout } from '@/components/common/DetailTable';
import { useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { iconSize, space, touchTarget, typography } from '@/theme/tokens';
import { formatNumber, formatWeightEach } from '@/utils/formatters';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import type { InvoiceItemGroup } from '@/features/invoice/utils/groupInvoiceItems';
import type { ItemsStyles } from './itemsStyles';
import type { ItemsActions } from './itemsModel';

interface Props {
  group: InvoiceItemGroup;
  groupKey: string;
  total: number;
  canEditPricing: boolean;
  /** The hint "Tap a figure to change it." sits here when the group has no column headings (cards). */
  showHint: boolean;
  actions: ItemsActions;
  styles: ItemsStyles;
}

/** The total sits beside the name while it takes no more than this share of the heading; otherwise it goes under the name. */
export const HEAD_TOTAL_SHARE = 0.45;

export const GroupHead = React.memo(function GroupHead({ group, groupKey, total, canEditPricing, showHint, actions, styles }: Props) {
  const t = useTokens();
  const table = useTableLayout();
  const totalText = formatInvoiceAmount(total);
  // Never cut: when the total (weight 600, at the text size) would take more than its share of the
  // heading beside the name, it goes on its own line under the name, as wide as the heading.
  const totalWidth = numberColumnWidth(table, 0, [], [totalText], typography.headline.fontSize ?? 17);
  const headingWidth = rowWidth(table) - (canEditPricing ? touchTarget - space.sm : 0) - space.sm;
  const underName = totalWidth > headingWidth * HEAD_TOTAL_SHARE;
  const totalBlock = (
    <>
      <Text style={styles.headTotalLabel}>{tr('common.total')}</Text>
      <Text style={styles.headTotalValue} numberOfLines={1}>{totalText}</Text>
    </>
  );
  const mark = group.package_mark?.trim() ?? '';
  // One tag for each weight of the group's lots, lightest first; a group with no weight has none.
  const weights = [...new Set(group.weights_each.map((weight) => formatWeightEach(weight)).filter((text): text is string => text !== null))];
  const dispatched = tr('invoice.items.dispatchedOf', { dispatched: formatNumber(group.total_dispatched), received: formatNumber(group.gr_quantity) });
  const spoken = [
    group.item_name,
    mark ? tr('invoice.items.markA11y', { mark }) : null,
    weights.length > 0 ? weights.join(', ') : null,
    dispatched,
    tr('invoice.items.totalA11y', { total: totalText }),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.top} testID={`items-head-${groupKey}`}>
      <View style={styles.headRow}>
        <View style={[styles.headRow, styles.grow]} accessible accessibilityLabel={spoken}>
        <View style={styles.headContent}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={2}>{group.item_name}</Text>
          </View>
          {mark !== '' || weights.length > 0 ? (
            <View style={styles.chips}>
              {mark !== '' ? (
                <View style={styles.chip}>
                  <Icon name="tag-outline" size={iconSize.sm} color={t.status.neutral.text} />
                  <Text style={styles.chipText} numberOfLines={2} ellipsizeMode="tail">{nb(mark)}</Text>
                </View>
              ) : null}
              {weights.map((weight) => (
                <View key={weight} style={styles.chip}>
                  <Icon name="weight-kilogram" size={iconSize.sm} color={t.status.neutral.text} />
                  <Text style={styles.chipText} numberOfLines={1}>{nb(weight)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.dispatched}>{nb(dispatched)}</Text>
          {underName ? <View style={styles.headTotalUnder} testID={`items-head-total-under-${groupKey}`}>{totalBlock}</View> : null}
        </View>
        {underName ? null : <View style={styles.headTotal} testID={`items-head-total-beside-${groupKey}`}>{totalBlock}</View>}
        </View>
        {canEditPricing ? (
          <Pressable
            style={({ pressed }) => [styles.pencil, pressed && styles.pencilPressed]}
            onPress={() => actions.editPricing(groupKey)}
            accessibilityRole="button"
            accessibilityLabel={tr('invoice.items.editPricingA11y', { item: group.item_name })}
          >
            <Icon name="pencil-outline" size={iconSize.md} color={t.brand.tint} />
          </Pressable>
        ) : null}
      </View>
      {showHint ? <Text style={styles.hint}>{tr('invoice.items.hint')}</Text> : null}
    </View>
  );
});
