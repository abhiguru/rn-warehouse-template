/** One customer's own rate on the item page: avatar, name, weights and start, the rent, a chevron. */
import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Avatar } from '@/components/ui/Avatar';
import { StatusTag } from '@/components/ui/StatusTag';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { iconSize, layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemStoragePrice } from '@/types/item-pricing.types';
import { bandText, dateText, rentRange, unitText } from '../rateText';

export interface CustomerRateRowProps {
  customerId: string;
  customerName: string;
  /** The rows in force (or, with only a later rate, the later rows). */
  bands: ItemStoragePrice[];
  /** The start of a rate that has not begun, when the row shows only that. */
  newRateFrom?: string | null;
  onPress: (customerId: string) => void;
}

const TABULAR = ['tabular-nums' as const];

const makeStyles = (th: ThemeTokens) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 64,
    gap: space.md,
    paddingVertical: space.sm,
    paddingLeft: layout.marginCompact,
    paddingRight: space.sm,
    backgroundColor: th.surface.card,
  },
  pressed: { backgroundColor: th.surface.cardPressed },
  body: { flex: 1, gap: space.xxs },
  name: { ...typography.headline, color: th.text.primary },
  line: { ...typography.subhead, color: th.text.secondary },
  amount: { ...typography.headline, color: th.text.primary, fontVariant: TABULAR },
  divider: { height: 1, marginLeft: layout.marginCompact, backgroundColor: th.border.divider },
});

function Base({ customerId, customerName, bands, newRateFrom, onPress }: CustomerRateRowProps) {
  const th = useTokens();
  const styles = useThemedStyles(makeStyles);
  const first = bands[0];
  const min = bands.length ? Math.min(...bands.map(b => b.unit_price)) : 0;
  const max = bands.length ? Math.max(...bands.map(b => b.unit_price)) : 0;
  const weights = bands.length > 1 ? t('pricing.row.bands', { count: bands.length }) : first ? bandText(first.weight_min, first.weight_max) : '';
  const since = first ? dateText(first.effective_from) : '';
  return (
    <View>
      <Pressable
        onPress={() => onPress(customerId)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t('pricing.row.customerA11y', { customer: customerName, amount: rentRange(min, max), unit: unitText(first?.price_type ?? 'monthly'), band: weights, date: since })}
        testID={`customer-rate-row-${customerId}`}
      >
        <Avatar name={customerName} id={customerId} size="sm" />
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={2}>{customerName}</Text>
          {first ? <Text style={styles.line}>{t('pricing.item.customerLine', { band: weights, date: since })}</Text> : null}
          {newRateFrom ? <StatusTag status="informative" label={t('pricing.tag.newRate', { date: dateText(newRateFrom) })} /> : null}
        </View>
        {first ? <Text style={styles.amount} numberOfLines={1}>{rentRange(min, max)}</Text> : null}
        <Icon name="chevron-right" size={iconSize.md} color={th.icon.secondary} />
      </Pressable>
      <View style={styles.divider} />
    </View>
  );
}

export const CustomerRateRow = memo(Base);
