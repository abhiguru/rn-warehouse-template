/**
 * ReportEmptyState Component
 *
 * A consistent empty state display for when reports have no data.
 * Uses dynamic colors for dark mode support.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';

interface ReportEmptyStateProps {
  /** Icon name from MaterialCommunityIcons */
  icon?: string;
  /** Main message to display */
  message: string;
  /** Optional description */
  description?: string;
}

export const ReportEmptyState: React.FC<ReportEmptyStateProps> = ({
  icon = 'chart-box-outline',
  message,
  description,
}) => {
  const colors = useListColors();

  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, { backgroundColor: colors.gray100 }]}>
        <Icon name={icon} size={64} color={colors.textTertiary} />
      </View>
      <Text style={[styles.message, { color: colors.textPrimary }]}>{message}</Text>
      {description && (
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {description}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    minHeight: 300,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  message: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    // color: applied inline for dark mode
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  description: {
    fontSize: theme.fontSize.sm,
    // color: applied inline for dark mode
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
});

export default ReportEmptyState;
