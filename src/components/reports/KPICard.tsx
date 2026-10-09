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
    valueRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      justifyContent: 'center',
      columnGap: space.xs,
      maxWidth: '100%',
    },
    value: {
      ...typography.title3,
      color: t.text.primary,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    valueCompact: {
      ...typography.headline,
    },
    unit: {
      ...typography.subhead,
      color: t.text.secondary,
    },
    unitCompact: {
      ...typography.footnote,
    },
    label: {
      ...typography.footnote,
      color: t.text.secondary,
      textAlign: 'center',
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
  typeof val === 'number' ? new Intl.NumberFormat('en-IN').format(val) : val;

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
        accessibilityLabel={`${label}, loading`}
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
  const trendWord = trend === 1 ? 'up' : trend === -1 ? 'down' : 'unchanged';

  const a11yLabel = [
    `${label}: ${shown}${unit ? ` ${unit}` : ''}`,
    hasTrend ? `${trendWord} ${trendValue}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={[styles.card, compact && styles.cardCompact]} accessible accessibilityLabel={a11yLabel}>
      <View style={[styles.iconCircle, compact && styles.iconCircleCompact, circle]}>
        <Icon name={icon} size={compact ? iconSize.md : iconSize.xl} color={glyph} />
      </View>

      <View style={styles.valueRow}>
        <Text style={[styles.value, compact && styles.valueCompact]}>{shown}</Text>
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
