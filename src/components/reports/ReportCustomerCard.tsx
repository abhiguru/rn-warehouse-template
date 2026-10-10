/**
 * ReportCustomerCard - Reusable customer object cell for report screens
 *
 * Follows the object cell spec in docs/STYLE_GUIDE.md §13.6:
 * - 44 avatar on the left (shared `Avatar`, keyed by the customer id)
 * - Title (`headline`, two lines) and subtitle (`subhead`)
 * - Optional share button (44 target, `brand.tint`)
 * - Value (`headline`, tabular) and its label on the right
 * - Chevron in `icon.secondary`; pressed row `surface.cardPressed`
 */

import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { Avatar, StatusTag, type StatusKind } from '@/components/ui';
import { formatNumber as formatShared } from '@/utils/formatters';
import { t as tr } from '@/i18n';

// ============================================================================
// TYPES
// ============================================================================

export interface ReportCustomerCardProps {
  /** Customer name (title) */
  title: string;
  /** Subtitle text (e.g., "3 dispatches", "Avg: 120 days") */
  subtitle: string;
  /** Main numeric value to display */
  value: number | string;
  /** Label for the value (default: "units") */
  valueLabel?: string;
  /** Press handler for navigation */
  onPress: () => void;
  /** Customer id: keys the avatar colour so a customer looks the same on every screen. */
  customerId?: string | null;
  /** Optional status tag under the value (at most one per row, guide §3.5). */
  status?: { status: StatusKind; label: string };
  /** Optional share handler */
  onShare?: () => void;
  /** Loading state for share button */
  isSharing?: boolean;
  /** Accessibility label (auto-generated if not provided) */
  accessibilityLabel?: string;
  /** Accessibility hint */
  accessibilityHint?: string;
}

// ============================================================================
// HELPER
// ============================================================================

const formatNumber = (num: number | string): string => {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  return isNaN(n) ? String(num) : formatShared(n);
};

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: space.md,
      paddingLeft: layout.marginCompact,
      paddingRight: space.sm,
      minHeight: layout.objectCellMinHeight,
      backgroundColor: t.surface.card,
      gap: space.md,
    },
    cardPressed: {
      backgroundColor: t.surface.cardPressed,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
    },
    title: {
      ...typography.headline,
      color: t.text.primary,
    },
    subtitle: {
      ...typography.subhead,
      color: t.text.secondary,
      marginTop: space.xxs,
    },
    shareButton: {
      width: touchTarget,
      height: touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
    },
    shareButtonPressed: {
      backgroundColor: t.brand.subtle,
    },
    valueContainer: {
      alignItems: 'flex-end',
    },
    value: {
      ...typography.headline,
      color: t.text.primary,
      fontVariant: ['tabular-nums'],
    },
    valueLabel: {
      ...typography.caption1,
      color: t.text.secondary,
      marginTop: space.xxs,
    },
    status: {
      alignSelf: 'flex-end',
      marginTop: space.xs,
    },
  });

// ============================================================================
// COMPONENT
// ============================================================================

export const ReportCustomerCard: React.FC<ReportCustomerCardProps> = ({
  title,
  subtitle,
  value,
  valueLabel = 'units',
  onPress,
  customerId,
  status,
  onShare,
  isSharing,
  accessibilityLabel,
  accessibilityHint = 'Opens details',
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Auto-generate accessibility label if not provided
  const a11yLabel =
    accessibilityLabel ??
    [title, subtitle, tr('reports.components.valueWithLabel', { value: formatNumber(value), label: valueLabel }), status?.label].filter(Boolean).join(', ');

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={accessibilityHint}
    >
      {/* A. Avatar */}
      <Avatar name={title} id={customerId} />

      {/* B. Main Content */}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      {/* C. Share Button (optional) */}
      {onShare && (
        <Pressable
          onPress={e => {
            e.stopPropagation();
            onShare();
          }}
          style={({ pressed }) => [styles.shareButton, pressed && styles.shareButtonPressed]}
          disabled={isSharing}
          accessibilityRole="button"
          accessibilityLabel={tr('reports.components.sharePdfFor', { name: title })}
          accessibilityState={{ busy: !!isSharing, disabled: !!isSharing }}
        >
          {isSharing ? (
            <ActivityIndicator size="small" color={t.brand.tint} />
          ) : (
            <Icon name="file-pdf-box" size={iconSize.lg} color={t.brand.tint} />
          )}
        </Pressable>
      )}

      {/* D. Value */}
      <View style={styles.valueContainer}>
        <Text style={styles.value}>{formatNumber(value)}</Text>
        <Text style={styles.valueLabel}>{valueLabel}</Text>
        {status && <StatusTag status={status.status} label={status.label} style={styles.status} />}
      </View>

      {/* E. Navigation Chevron */}
      <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
    </Pressable>
  );
};

export default ReportCustomerCard;
