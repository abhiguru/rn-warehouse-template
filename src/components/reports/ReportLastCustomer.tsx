/**
 * The customer this account opened last in a report, as one row above the
 * report's customers list (docs/STYLE_GUIDE.md §14.10). The customer most
 * likely to be wanted again is one tap away, without a search.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import type { ReportCustomerRef } from '@/store/slices/reportPrefsSlice';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export interface ReportLastCustomerProps {
  customer: ReportCustomerRef;
  onPress: (customer: ReportCustomerRef) => void;
  /** What opening the customer shows, e.g. "Shows this customer's GRNs". */
  accessibilityHint?: string;
}

const makeStyles = (t: ThemeTokens) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: touchTarget,
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    paddingVertical: space.sm,
    paddingLeft: space.md,
    paddingRight: space.sm,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
  },
  rowPressed: { backgroundColor: t.surface.cardPressed },
  body: { flex: 1 },
  label: { ...typography.caption1, color: t.text.secondary },
  name: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary },
});

export function ReportLastCustomer({ customer, onPress, accessibilityHint }: ReportLastCustomerProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const name = customer.name || tr('reports.shared.unnamedCustomer');
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(customer)}
      accessibilityRole="button"
      accessibilityLabel={tr('reports.scaffold.lastOpenedCustomer', { name })}
      accessibilityHint={accessibilityHint}
    >
      <Icon name="history" size={iconSize.md} color={t.icon.secondary} />
      <View style={styles.body}>
        <Text style={styles.label}>{tr('reports.scaffold.lastOpened')}</Text>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
      </View>
      <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
    </Pressable>
  );
}

export default ReportLastCustomer;
