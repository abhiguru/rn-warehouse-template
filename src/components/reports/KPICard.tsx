/**
 * KPICard: one KPI tile for report screens.
 *
 * Follows docs/STYLE_GUIDE.md §13.11: `surface.card`, `radius.card`, `shadow[2]`,
 * an icon in a 44 circle, the value in `title3` with tabular figures, the unit in
 * `subhead` and the label in `footnote`. A trend shows an arrow and its value in
 * positive or negative text, but only when the KPI says whether up is good;
 * otherwise the trend is shown in neutral text.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { formatNumber } from '@/utils/formatters';
import { t as tr } from '@/i18n';

export type KPIVariant = 'primary' | 'secondary' | 'accent' | 'neutral' | 'success' | 'warning';

interface KPICardProps {
  /** Icon name from MaterialCommunityIcons */
  icon: string;
  /** The KPI value to display */
  value: string | number;
  /** Label describing the KPI */
  label: string;
  /** Colour variant of the icon circle */
  variant?: KPIVariant;
  /** Optional unit suffix (e.g., "kg", "%") */
  unit?: string;
  /** Optional trend indicator (-1 = down, 0 = flat, 1 = up) */
  trend?: -1 | 0 | 1;
  /** Optional trend value, e.g. "12%" */
  trendValue?: string;
  /**
   * Whether a rising value is good for this KPI. Required for the trend to be
   * coloured positive or negative; when omitted the trend is neutral.
   */
  upIsGood?: boolean;
  /** Whether the card is in loading state */
  isLoading?: boolean;
  /** Compact mode for smaller cards */
  compact?: boolean;
}

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    card: {
      flex: 1,
      backgroundColor: t.surface.card,
      borderRadius: radius.card,
      paddingVertical: space.lg,
      paddingHorizontal: space.md,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.s6,
      minHeight: 120,
      ...t.shadow[2],
    },
    cardCompact: {
      paddingVertical: space.md,
      paddingHorizontal: space.sm,
      gap: space.xs,
      minHeight: layout.objectCellMinHeight,
    },
    iconCircle: {
      width: layout.avatar.md,
      height: layout.avatar.md,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCircleCompact: {
      width: layout.avatar.sm,
      height: layout.avatar.sm,
    },
    brandCircle: { backgroundColor: t.brand.subtle },
    positiveCircle: { backgroundColor: t.status.positive.background },
    criticalCircle: { backgroundColor: t.status.critical.background },
    neutralCircle: { backgroundColor: t.status.neutral.background },
    // One line: the value shrinks to fit and the unit keeps its size, so a long
    // weight never pushes its unit onto a second line (tiles stay the same height).
    valueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'center',
      alignSelf: 'stretch',
      columnGap: space.xs,
    },
    value: {
      ...typography.title3,
      color: t.text.primary,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
      flexShrink: 1,
    },
    valueCompact: {
      ...typography.headline,
    },
    unit: {
      ...typography.subhead,
      color: t.text.secondary,
      flexShrink: 0,
    },
    unitCompact: {
      ...typography.footnote,
    },
    // Full width, so a two-word label wraps only when it really does not fit.
    label: {
      ...typography.footnote,
      color: t.text.secondary,
      textAlign: 'center',
      alignSelf: 'stretch',
    },
    trendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xxs,
    },
    trendText: {
      ...typography.caption1,
      fontWeight: fontWeight.semibold,
      fontVariant: ['tabular-nums'],
    },
    trendPositive: { color: t.status.positive.text },
    trendNegative: { color: t.status.negative.text },
    trendNeutral: { color: t.text.secondary },
    skeletonCircle: {
      width: iconSize.md,
      height: iconSize.md,
      borderRadius: radius.pill,
      backgroundColor: t.surface.cardActive,
    },
    skeletonValue: {
      width: 56,
      height: 20,
      borderRadius: radius.field,
      backgroundColor: t.surface.cardActive,
    },
    skeletonLabel: {
      width: 64,
      height: 12,
      borderRadius: radius.field,
      backgroundColor: t.surface.cardActive,
    },
  });

type Styles = ReturnType<typeof makeStyles>;

/** Icon circle background and glyph colour for each variant (guide §13.11). */
function variantColours(
  variant: KPIVariant,
  t: ThemeTokens,
  styles: Styles
): { circle: object; glyph: string } {
  switch (variant) {
    case 'success':
      return { circle: styles.positiveCircle, glyph: t.status.positive.text };
    case 'warning':
      return { circle: styles.criticalCircle, glyph: t.status.critical.text };
    case 'neutral':
    case 'secondary':
      return { circle: styles.neutralCircle, glyph: t.status.neutral.text };
    case 'primary':
    case 'accent':
    default:
      return { circle: styles.brandCircle, glyph: t.brand.tint };
  }
}

const formatValue = (val: string | number): string =>
  typeof val === 'number' ? formatNumber(val) : val;

export const KPICard: React.FC<KPICardProps> = ({
  icon,
  value,
  label,
  variant = 'primary',
  unit,
  trend,
  trendValue,
  upIsGood,
  isLoading = false,
  compact = false,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const { circle, glyph } = variantColours(variant, t, styles);

  if (isLoading) {
    return (
      <View
        style={[styles.card, compact && styles.cardCompact]}
        accessible
        accessibilityLabel={tr('reports.components.kpiLoading', { label })}
        accessibilityState={{ busy: true }}
      >
        <View style={[styles.iconCircle, compact && styles.iconCircleCompact, circle]}>
          <View style={styles.skeletonCircle} />
        </View>
        <View style={styles.skeletonValue} />
        <View style={styles.skeletonLabel} />
      </View>
    );
  }

  const shown = formatValue(value);
  const hasTrend = trend !== undefined && !!trendValue;
  const trendIcon = trend === 1 ? 'arrow-up' : trend === -1 ? 'arrow-down' : 'minus';
  const trendGood = trend === 0 || upIsGood === undefined ? undefined : (trend === 1) === upIsGood;
  const trendStyle =
    trendGood === undefined ? styles.trendNeutral : trendGood ? styles.trendPositive : styles.trendNegative;
  const trendColour =
    trendGood === undefined ? t.text.secondary : trendGood ? t.status.positive.text : t.status.negative.text;
  const trendKey =
    trend === 1
      ? 'reports.components.trendUp'
      : trend === -1
        ? 'reports.components.trendDown'
        : 'reports.components.trendUnchanged';

  const a11yLabel = [
    unit
      ? tr('reports.components.kpiValueUnit', { label, value: shown, unit })
      : tr('reports.components.kpiValue', { label, value: shown }),
    hasTrend ? tr(trendKey, { value: trendValue }) : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={[styles.card, compact && styles.cardCompact]} accessible accessibilityLabel={a11yLabel}>
      <View style={[styles.iconCircle, compact && styles.iconCircleCompact, circle]}>
        <Icon name={icon} size={compact ? iconSize.md : iconSize.xl} color={glyph} />
      </View>

      <View style={styles.valueRow}>
        <Text
          style={[styles.value, compact && styles.valueCompact]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {shown}
        </Text>
        {unit ? <Text style={[styles.unit, compact && styles.unitCompact]}>{unit}</Text> : null}
      </View>

      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>

      {hasTrend && (
        <View style={styles.trendRow}>
          <Icon name={trendIcon} size={iconSize.sm} color={trendColour} />
          <Text style={[styles.trendText, trendStyle]}>{trendValue}</Text>
        </View>
      )}
    </View>
  );
};

export default KPICard;
