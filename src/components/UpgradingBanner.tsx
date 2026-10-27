/**
 * Upgrading Banner
 *
 * Full-width banner shown while the facility's server is being updated (docs/STYLE_GUIDE.md §13.9, §14.9): a status,
 * not an error, so status.informative with the wrench icon. It sits in the layout above the app and pushes content
 * down, like the offline banner, and adds the top safe-area inset unless the offline banner (above it) already has.
 * It goes away when the server answers again.
 */

import React from 'react';
import { View, Text } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { useUpgrading } from '@/hooks/useUpgrading';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.status.informative.background,
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
    paddingBottom: space.sm,
    paddingHorizontal: layout.marginCompact,
  },
  content: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    paddingTop: space.sm,
  },
  text: { ...typography.footnote, color: t.text.primary, flexShrink: 1 },
});

export const UpgradingBanner: React.FC = () => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const upgrading = useUpgrading();
  const offline = useIsOffline();
  if (!upgrading) return null;
  return (
    <View
      style={[styles.container, { paddingTop: offline ? 0 : insets.top }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.content}>
        <Icon name="wrench-outline" size={iconSize.md} color={t.status.informative.text} />
        <Text style={styles.text}>{tr('components.upgrading.message')}</Text>
      </View>
    </View>
  );
};

export default UpgradingBanner;
