/**
 * ReportCustomerCard - Reusable customer card for report screens
 *
 * Follows SAP Fiori Object Cell pattern:
 * - Avatar on left (customizable colors)
 * - Title + Subtitle in center
 * - Optional share button
 * - Value + label on right
 * - Navigation chevron
 *
 * @see design/sap-fiori-specs/01-object-cell.md
 * @see J14 - DRY fix for CustomerCard duplication
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFioriColors } from '@/theme/fioriColors';
import { FIORI_DIMENSIONS, FIORI_TYPOGRAPHY } from '@/constants/fioriDesignTokens';

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
  /** Optional custom avatar colors */
  avatarColor?: {
    bg: string;
    icon: string;
  };
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
  if (isNaN(n)) return String(num);
  return n.toLocaleString('en-IN');
};

// ============================================================================
// COMPONENT
// ============================================================================

export const ReportCustomerCard: React.FC<ReportCustomerCardProps> = ({
  title,
  subtitle,
  value,
  valueLabel = 'units',
  onPress,
  avatarColor,
  onShare,
  isSharing,
  accessibilityLabel,
  accessibilityHint = 'Tap to view details',
}) => {
  const fiori = useFioriColors();

  // Default avatar colors
  const avatarBg = avatarColor?.bg ?? fiori.colors.tintLight;
  const avatarIcon = avatarColor?.icon ?? fiori.colors.tint;

  // Auto-generate accessibility label if not provided
  const a11yLabel = accessibilityLabel ?? `${title}, ${subtitle}, ${formatNumber(value)} ${valueLabel}`;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: fiori.colors.cardBackground },
        pressed && { backgroundColor: fiori.colors.cardBackgroundPressed },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={accessibilityHint}
    >
      {/* A. Avatar */}
      <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
        <Icon name="account-outline" size={22} color={avatarIcon} />
      </View>

      {/* B. Main Content */}
      <View style={styles.content}>
        <Text style={[styles.title, { color: fiori.colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: fiori.colors.textSecondary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      {/* C. Share Button (optional) */}
      {onShare && (
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onShare();
          }}
          style={styles.shareButton}
          disabled={isSharing}
          accessibilityRole="button"
          accessibilityLabel={`Download PDF for ${title}`}
        >
          {isSharing ? (
            <ActivityIndicator size="small" color={fiori.colors.tint} />
          ) : (
            <Icon name="file-pdf-box" size={22} color={fiori.colors.tint} />
          )}
        </TouchableOpacity>
      )}

      {/* D. Value */}
      <View style={styles.valueContainer}>
        <Text style={[styles.value, { color: fiori.colors.textPrimary }]}>
          {formatNumber(value)}
        </Text>
        <Text style={[styles.valueLabel, { color: fiori.colors.textSecondary }]}>
          {valueLabel}
        </Text>
      </View>

      {/* E. Navigation Chevron */}
      <View style={styles.chevron}>
        <Icon name="chevron-right" size={20} color={fiori.colors.textSecondary} />
      </View>
    </Pressable>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: FIORI_DIMENSIONS.objectCellMinHeight,
  },
  avatar: {
    width: FIORI_DIMENSIONS.objectCellImageSize,
    height: FIORI_DIMENSIONS.objectCellImageSize,
    borderRadius: FIORI_DIMENSIONS.objectCellImageSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: FIORI_TYPOGRAPHY.title.fontSize,
    fontWeight: FIORI_TYPOGRAPHY.title.fontWeight,
    lineHeight: FIORI_TYPOGRAPHY.title.lineHeight,
  },
  subtitle: {
    fontSize: FIORI_TYPOGRAPHY.subtitle.fontSize,
    lineHeight: FIORI_TYPOGRAPHY.subtitle.lineHeight,
    marginTop: 2,
  },
  shareButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  valueContainer: {
    alignItems: 'flex-end',
    marginRight: 8,
  },
  value: {
    fontSize: FIORI_TYPOGRAPHY.footnote.fontSize,
    fontWeight: '600',
  },
  valueLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  chevron: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ReportCustomerCard;
