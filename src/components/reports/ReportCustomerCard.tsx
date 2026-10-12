/**
 * ReportCustomerCard - Reusable customer object cell for report screens
 *
 * Follows the object cell spec in docs/STYLE_GUIDE.md §13.6:
 * - 44 avatar on the left (shared `Avatar`, keyed by the customer id)
 * - Title (`headline`, two lines), subtitle (`subhead`, two lines) and, when there
 *   is one, the status tag on a line of its own under them (left-aligned)
 * - Value (`headline`, tabular) and its label on the right: that column is only as
 *   wide as the value and its label, so a long tag never squeezes the name
 * - Chevron in `icon.secondary`; pressed row `surface.cardPressed`
 * - Optional share button (`touchTarget` square, `brand.tint`): a target of its own
 *   beside the row's, 8 apart, not inside it, so a screen reader reaches each
 *   one with its own label (§11.2, §11.3, as the pin in §13.6)
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
import { HighlightedText } from '@/features/filters/components/HighlightedText';
import { formatNumber as formatShared } from '@/utils/formatters';
import { t as tr } from '@/i18n';
import { FactLines, joinFacts } from './FactLines';

// ============================================================================
// TYPES
// ============================================================================

export interface ReportCustomerCardProps {
  /** Customer name (title) */
  title: string;
  /** Lower-cased search words to show in bold in the name (docs/STYLE_GUIDE.md §14.6). */
  highlightWords?: string[];
  /**
   * Subtitle (e.g., "3 dispatches"). Give several facts as a list: they share one
   * line in English and get a line each in Gujarati (see FactLines).
   */
  subtitle: string | string[];
  /**
   * Line limit of the subtitle in English (default 2, so a longer fact wraps
   * rather than being cut, §4). Gujarati stacks the facts, two lines each,
   * whatever this says.
   */
  subtitleLines?: number;
  /** Main numeric value to display */
  value: number | string;
  /** Label for the value (default: "units", in the app's language) */
  valueLabel?: string;
  /** Press handler for navigation */
  onPress: () => void;
  /** Customer id: keys the avatar colour so a customer looks the same on every screen. */
  customerId?: string | null;
  /** Optional status tag under the subtitle, on its own line (at most one per row, guide §3.5). */
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
    // With a share button: the row and the button side by side, the row's target full height.
    withShare: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: space.sm,
      backgroundColor: t.surface.card,
    },
    rowWithShare: {
      flex: 1,
      paddingRight: 0,
    },
    shareSlot: {
      justifyContent: 'center',
      paddingRight: space.sm,
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
    // The value keeps its width; the title and facts take what is left.
    valueContainer: {
      alignItems: 'flex-end',
      flexShrink: 0,
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
    // On its own line under the subtitle, left-aligned with the name. It never
    // takes the value column's width, and never grows wider than the content column.
    status: {
      alignSelf: 'flex-start',
      maxWidth: '100%',
      marginTop: space.xs,
    },
  });

// ============================================================================
// COMPONENT
// ============================================================================

export const ReportCustomerCard: React.FC<ReportCustomerCardProps> = ({
  title,
  highlightWords,
  subtitle,
  subtitleLines = 2,
  value,
  valueLabel,
  onPress,
  customerId,
  status,
  onShare,
  isSharing,
  accessibilityLabel,
  accessibilityHint = tr('reports.shared.opensDetailsHint'),
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // The word beside the figure: "unit" for 1, "units" otherwise, unless the screen names its own.
  const label = valueLabel ?? tr('reports.shared.units', { count: value });
  const facts = Array.isArray(subtitle) ? subtitle : [subtitle];
  const subtitleText = joinFacts(facts);

  // Auto-generate accessibility label if not provided
  const a11yLabel =
    accessibilityLabel ??
    [title, subtitleText, tr('reports.components.valueWithLabel', { value: formatNumber(value), label }), status?.label].filter(Boolean).join(', ');

  const row = (
    <Pressable
      style={({ pressed }) => [styles.card, onShare && styles.rowWithShare, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={accessibilityHint}
    >
      {/* A. Avatar */}
      <Avatar name={title} id={customerId} />

      {/* B. Main Content */}
      <View style={styles.content}>
        <HighlightedText style={styles.title} numberOfLines={2} text={title} words={highlightWords} />
        <FactLines facts={facts} style={styles.subtitle} numberOfLines={subtitleLines} />
        {status && <StatusTag status={status.status} label={status.label} style={styles.status} />}
      </View>

      {/* C. Value */}
      <View style={styles.valueContainer}>
        <Text style={styles.value}>{formatNumber(value)}</Text>
        <Text style={styles.valueLabel}>{label}</Text>
      </View>

      {/* D. Navigation Chevron */}
      <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
    </Pressable>
  );

  if (!onShare) return row;

  // E. Share button: a sibling of the row, never nested in it.
  return (
    <View style={styles.withShare}>
      {row}
      <View style={styles.shareSlot}>
        <Pressable
          onPress={onShare}
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
      </View>
    </View>
  );
};

export default ReportCustomerCard;
