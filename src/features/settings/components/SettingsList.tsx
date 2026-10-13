/**
 * The grouped list of Settings (docs/STYLE_GUIDE.md §14.12): sections with a
 * header, rows on surface.card and an optional footer.
 *
 * A row has an icon (or its own leading element, such as brand swatches), a
 * label, an optional subtitle, an optional current value shown before the
 * chevron, and is read as "label, value, subtitle".
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, trackedText, typography, type ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) => ({
  section: {
    marginBottom: space.xxl,
  },
  sectionHeader: {
    ...typography.footnote,
    textTransform: 'uppercase' as const,
    letterSpacing: trackedText(0.5),
    color: t.text.secondary,
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    paddingHorizontal: space.lg,
  },
  sectionContent: {
    marginHorizontal: layout.marginCompact,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    backgroundColor: t.surface.card,
  },
  sectionFooter: {
    ...typography.footnote,
    color: t.text.secondary,
    marginHorizontal: layout.marginCompact,
    paddingHorizontal: space.lg,
    marginTop: space.sm,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.rowMinHeight + space.md,
    paddingLeft: space.lg,
    backgroundColor: t.surface.card,
  },
  rowPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  rowLeading: {
    marginRight: space.md,
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'stretch' as const,
    paddingVertical: space.sm,
    paddingRight: space.md,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  rowContent: {
    flex: 1,
    marginRight: space.sm,
  },
  rowLabel: {
    ...typography.body,
    color: t.text.primary,
  },
  rowLabelDestructive: {
    color: t.status.negative.text,
  },
  rowSubtitle: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  rowValue: {
    ...typography.body,
    color: t.text.secondary,
    flexShrink: 1,
    textAlign: 'right' as const,
    marginRight: space.xs,
    maxWidth: '45%' as const,
  },
});

/** A grouped-list section: header, rows on surface.card, optional footer. */
export function SettingsSection({
  title,
  footer,
  children,
  testID,
}: {
  title: string;
  footer?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section} testID={testID}>
      <Text style={styles.sectionHeader} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.sectionContent}>{children}</View>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

/** A grouped-list row with an icon, label, optional subtitle, optional current value and chevron. */
export function SettingsRow({
  icon,
  leading,
  label,
  subtitle,
  value,
  onPress,
  showChevron = true,
  destructive = false,
  last = false,
  testID,
}: {
  testID?: string;
  icon?: string;
  /** Drawn in place of the icon, e.g. brand swatches. */
  leading?: React.ReactNode;
  label: string;
  subtitle?: string;
  /** The current choice, shown before the chevron. */
  value?: string;
  onPress: () => void;
  showChevron?: boolean;
  destructive?: boolean;
  last?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  return (
    <Pressable
      testID={testID}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[label, value, subtitle].filter(Boolean).join(', ')}
    >
      {leading ? (
        <View style={styles.rowLeading} accessible={false} importantForAccessibility="no-hide-descendants">
          {leading}
        </View>
      ) : icon ? (
        <Icon
          name={icon}
          size={iconSize.md}
          color={destructive ? t.status.negative.text : t.brand.tint}
          style={styles.rowLeading}
        />
      ) : null}
      <View style={[styles.rowBody, !last && styles.rowDivider]}>
        <View style={styles.rowContent}>
          <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>{label}</Text>
          {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
        </View>
        {value ? (
          <Text style={styles.rowValue} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {showChevron && <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />}
      </View>
    </Pressable>
  );
}
