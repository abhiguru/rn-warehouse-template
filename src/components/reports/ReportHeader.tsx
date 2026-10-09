/**
 * ReportHeader: the navigation bar of report and sensor screens.
 *
 * Follows the stack header spec in docs/STYLE_GUIDE.md §13.8: `surface.header`,
 * title in `headline`, back and actions in `brand.tint`, no shadow and a hairline
 * `border.divider` at the bottom. It also sets the status bar style from tokens.
 * Export, print and other actions go on the right (§14.10).
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export interface ReportHeaderAction {
  /** MaterialCommunityIcons glyph */
  icon: string;
  /** Accessible name of the action, e.g. "Share PDF" */
  label: string;
  onPress: () => void;
  /** Shows a spinner instead of the icon and ignores presses */
  busy?: boolean;
}

interface ReportHeaderProps {
  /** Report title */
  title: string;
  /** Optional subtitle (e.g., date range) */
  subtitle?: string;
  /** Whether to show back button (default: true) */
  showBack?: boolean;
  /** Custom back action */
  onBack?: () => void;
  /** Right-side action button */
  actionIcon?: string;
  /** Right-side action callback */
  onAction?: () => void;
  /** Right-side action accessibility label */
  actionLabel?: string;
  /** Further right-side actions, shown after `actionIcon` */
  actions?: ReportHeaderAction[];
}

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      backgroundColor: t.surface.header,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border.divider,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      paddingHorizontal: space.xs,
      paddingVertical: space.xs,
    },
    side: {
      minWidth: touchTarget,
      flexDirection: 'row',
      alignItems: 'center',
    },
    sideRight: {
      justifyContent: 'flex-end',
    },
    center: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: space.sm,
    },
    navButton: {
      width: touchTarget,
      height: touchTarget,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: radius.pill,
    },
    navButtonPressed: {
      backgroundColor: t.brand.subtle,
    },
    title: {
      ...typography.headline,
      color: t.text.primary,
      textAlign: 'center',
    },
    subtitle: {
      ...typography.footnote,
      color: t.text.secondary,
      textAlign: 'center',
    },
  });

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  title,
  subtitle,
  showBack = true,
  onBack,
  actionIcon,
  onAction,
  actionLabel,
  actions = [],
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  const allActions: ReportHeaderAction[] = [
    ...(actionIcon && onAction ? [{ icon: actionIcon, label: actionLabel || title, onPress: onAction }] : []),
    ...actions,
  ];
  // Both sides share one width so the title stays centred; the labelled
  // back button needs two touch targets.
  const sideWidth = { width: Math.max(showBack ? 2 : 1, allActions.length) * touchTarget };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <View style={styles.content}>
        <View style={[styles.side, sideWidth]}>
          {showBack && (
            <HeaderBackButton onPress={handleBack} />
          )}
        </View>

        <View style={styles.center}>
          <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={[styles.side, styles.sideRight, sideWidth]}>
          {allActions.map(action => (
            <Pressable
              key={action.label}
              style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
              onPress={action.onPress}
              disabled={action.busy}
              accessibilityLabel={action.label}
              accessibilityRole="button"
              accessibilityState={{ busy: !!action.busy, disabled: !!action.busy }}
            >
              {action.busy ? (
                <ActivityIndicator size="small" color={t.brand.tint} />
              ) : (
                <Icon name={action.icon} size={iconSize.lg} color={t.brand.tint} />
              )}
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
};

export default ReportHeader;
