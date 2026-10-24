/**
 * CustomerChoiceRows - a card of customers to choose one from: avatar, name, an
 * optional second line (the city) and a chevron (docs/STYLE_GUIDE.md §13.6).
 *
 * Shared by the report customer picker and the business chooser on Create order,
 * so a customer account picks among its own customers the same way in both. The
 * rows are not a list of their own: the caller scrolls them and decides which
 * customers are offered.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Avatar } from '@/components/ui/Avatar';
import { StatusTag } from '@/components/ui';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';

export interface CustomerChoice {
  id: string;
  /** Empty when the facility gave no name; the row then shows `unnamedLabel`. */
  name: string;
  /** A second line under the name, e.g. the city. Left out when empty. */
  detail?: string;
  /** A small neutral tag next to the name, e.g. "Deactivated". Read after the name and city. */
  tag?: string;
}

export interface CustomerChoiceRowsProps<T extends CustomerChoice> {
  customers: readonly T[];
  /** The customer whose row was pressed, as it was passed in. */
  onPick: (customer: T) => void;
  /** Read after a row's name: what choosing it does. */
  hint: string;
  /** A row's test id is this followed by the customer's id. */
  testIDPrefix: string;
  /** Shown and read for a customer with no name. */
  unnamedLabel: string;
}

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    card: { backgroundColor: t.surface.card, borderRadius: radius.card, ...t.shadow[2] },
    cardClip: { borderRadius: radius.card, overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: layout.objectCellMinHeight,
      paddingVertical: space.md,
      paddingLeft: layout.marginCompact,
      paddingRight: space.sm,
      gap: space.md,
      backgroundColor: t.surface.card,
    },
    rowPressed: { backgroundColor: t.surface.cardPressed },
    text: { flex: 1 },
    name: { ...typography.headline, color: t.text.primary },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.xxs },
    detail: { ...typography.subhead, color: t.text.secondary },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: layout.marginCompact + layout.avatar.md + space.md,
      backgroundColor: t.border.divider,
    },
  });

export function CustomerChoiceRows<T extends CustomerChoice>({
  customers,
  onPick,
  hint,
  testIDPrefix,
  unnamedLabel,
}: CustomerChoiceRowsProps<T>) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        {customers.map((customer, index) => {
          const name = customer.name || unnamedLabel;
          const detail = customer.detail || '';
          return (
            <React.Fragment key={customer.id}>
              <Pressable
                testID={`${testIDPrefix}${customer.id}`}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => onPick(customer)}
                accessibilityRole="button"
                // Two customers of one name are told apart by the second line, so it is read too.
                accessibilityLabel={[name, detail, customer.tag].filter(Boolean).join(', ')}
                accessibilityHint={hint}
              >
                <Avatar name={name} id={customer.id} />
                <View style={styles.text}>
                  <Text style={styles.name} numberOfLines={2}>
                    {name}
                  </Text>
                  {detail ? (
                    <Text style={styles.detail} numberOfLines={1}>
                      {detail}
                    </Text>
                  ) : null}
                  {customer.tag ? (
                    <View style={styles.tagRow} testID={`${testIDPrefix}${customer.id}-tags`}>
                      <StatusTag status="neutral" label={customer.tag} />
                    </View>
                  ) : null}
                </View>
                <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
              </Pressable>
              {index < customers.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

export default CustomerChoiceRows;
