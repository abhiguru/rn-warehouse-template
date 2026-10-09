/**
 * ReportEmptyState: empty, no-access and error states of report screens.
 *
 * Follows docs/STYLE_GUIDE.md §13.6: centred hero icon in `icon.secondary`
 * (`status.negative.text` for errors), title in `title3`, message in `subhead`
 * `text.secondary`, and an optional button such as "Try again".
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space, typography, type ThemeTokens } from '@/theme/tokens';

interface ReportEmptyStateProps {
  /** Icon name from MaterialCommunityIcons */
  icon?: string;
  /** Main message to display */
  message: string;
  /** Optional description */
  description?: string;
  /** `error` shows the icon in negative status colour. */
  tone?: 'default' | 'error';
  /** Optional action label, e.g. "Try again" or "Clear filters" */
  actionLabel?: string;
  /** Called when the action is pressed */
  onAction?: () => void;
  /** Button type of the action (default: secondary) */
  actionType?: 'primary' | 'secondary';
}

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: space.xxl,
      paddingVertical: space.xxxl,
      minHeight: 300,
      gap: space.sm,
    },
    icon: {
      marginBottom: space.sm,
    },
    message: {
      ...typography.title3,
      color: t.text.primary,
      textAlign: 'center',
    },
    description: {
      ...typography.subhead,
      color: t.text.secondary,
      textAlign: 'center',
      maxWidth: 320,
    },
    action: {
      marginTop: space.lg,
    },
  });

export const ReportEmptyState: React.FC<ReportEmptyStateProps> = ({
  icon = 'chart-box-outline',
  message,
  description,
  tone = 'default',
  actionLabel,
  onAction,
  actionType = 'secondary',
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  return (
    <View style={styles.container} accessibilityLiveRegion={tone === 'error' ? 'polite' : 'none'}>
      <Icon
        name={icon}
        size={iconSize.hero}
        color={tone === 'error' ? t.status.negative.text : t.icon.secondary}
        style={styles.icon}
        accessible={false}
        importantForAccessibility="no"
      />
      <Text style={styles.message} accessibilityRole="header">
        {message}
      </Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button type={actionType} size="standalone" onPress={onAction}>
            {actionLabel}
          </Button>
        </View>
      ) : null}
    </View>
  );
};

export default ReportEmptyState;
