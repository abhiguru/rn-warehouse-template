/**
 * The title row of a top-level list (docs/STYLE_GUIDE.md §13.8): the large title, the buttons that belong to the list, and
 * Profile and settings, with an optional slot under it (the Orders | Queue switch). It is the top of `FilteredListHeader`,
 * and on its own it is all a list draws above its "needs a connection" state while the phone is offline (WH-381, Design
 * offline-capture.md 13.1 A).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { listRefreshAccessibility } from '@/components/lists/listRefreshAccessibility';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as translate } from '@/i18n';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export interface ListTitleRowProps {
  title: string;
  /** Buttons before Profile and settings. */
  actions?: React.ReactNode;
  /** The list's refresh: offered to screen readers as a "Refresh" action on the title (WH-220). */
  onRefresh?: () => void;
  /** Shown under the title row. */
  children?: React.ReactNode;
}

const makeStyles = (t: ThemeTokens) => ({
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingLeft: layout.marginCompact,
    paddingRight: space.sm,
    paddingVertical: space.xs,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  // Top-level tab title (guide §13.8): large title on every tab.
  title: { ...typography.largeTitle, color: t.text.primary, flexShrink: 1 },
  actions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  iconButtonPressed: { backgroundColor: t.surface.cardPressed },
  slot: { backgroundColor: t.surface.header },
});

export function ListTitleRow({ title, actions, onRefresh, children }: ListTitleRowProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  return (
    <>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} {...(onRefresh ? listRefreshAccessibility(onRefresh) : null)}>{title}</Text>
        <View style={styles.actions}>
          {actions}
          <Pressable
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel={translate('common.toolsAndSettings')}
          >
            <Icon name="cog-outline" size={iconSize.lg} color={t.icon.primary} />
          </Pressable>
        </View>
      </View>
      {children ? <View style={styles.slot}>{children}</View> : null}
    </>
  );
}

export default ListTitleRow;
