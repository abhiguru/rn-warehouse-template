/**
 * One report on the Reports tab: a card with two targets side by side.
 *
 *   the report    icon, title and description; opens the report
 *   the star      pins the report to the top of the tab, or unpins it
 *
 * The star is a sibling of the report's target, not inside it, so each has its own full
 * touch area and its own screen-reader element. A pin is a reversible personal preference,
 * so a one-tap control in the row is allowed (docs/STYLE_GUIDE.md §13.6). The glyph says
 * whether the report is pinned (filled or outline), not only its colour.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReportDefinition } from '@/features/reports/reportRegistry';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export interface ReportHubRowProps {
  /** The registry's definition itself, never a copy: its title and description are getters. */
  report: ReportDefinition;
  pinned: boolean;
  onOpen: () => void;
  onTogglePin: () => void;
}

const makeStyles = (t: ThemeTokens) => ({
  card: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    // 8 between the report's target and the star (§11.2).
    gap: space.sm,
    minHeight: layout.objectCellMinHeight,
    paddingRight: space.xs,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
    ...t.shadow[2],
  },
  open: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: layout.objectCellMinHeight,
    paddingVertical: space.lg,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    borderRadius: radius.card,
  },
  openPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  iconContainer: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.card,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.brand.subtle,
  },
  content: {
    flex: 1,
  },
  title: {
    ...typography.headline,
    color: t.text.primary,
    marginBottom: space.xxs,
  },
  description: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  // The star's touch area is the full height of the row; the pressed circle is the target's size.
  star: {
    width: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  starCircle: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  starPressed: {
    backgroundColor: t.brand.subtle,
  },
});

export const ReportHubRow: React.FC<ReportHubRowProps> = ({ report, pinned, onOpen, onTogglePin }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const title = report.title;
  const description = report.description;

  return (
    <View style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.open, pressed && styles.openPressed]}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={tr('nav.reports.cardLabel', { title, description })}
      >
        <View style={styles.iconContainer}>
          <Icon name={report.icon} size={iconSize.lg} color={t.brand.tint} />
        </View>
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        </View>
      </Pressable>
      <Pressable
        style={styles.star}
        onPress={onTogglePin}
        accessibilityRole="button"
        accessibilityState={{ selected: pinned }}
        accessibilityLabel={pinned ? tr('reports.hub.unpin', { title }) : tr('reports.hub.pin', { title })}
      >
        {({ pressed }) => (
          <View style={[styles.starCircle, pressed && styles.starPressed]}>
            <Icon
              name={pinned ? 'star' : 'star-outline'}
              size={iconSize.lg}
              color={pinned ? t.brand.tint : t.icon.primary}
            />
          </View>
        )}
      </Pressable>
    </View>
  );
};

export default ReportHubRow;
