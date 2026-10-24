/** An empty, error or not-found block for the rate screens: icon, title, text and one action. */
import React from 'react';
import { Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import type { IconName } from '@/types/icon.types';
import { Button } from '@/components/ui/Button';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, space, typography, type ThemeTokens } from '@/theme/tokens';

export interface RatesStateProps {
  icon: IconName;
  title: string;
  text?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** What a screen reader says for the action when it differs from the label ("+ Add item" is read without the plus). */
  actionAccessibilityLabel?: string;
  testID?: string;
}

const makeStyles = (th: ThemeTokens) => ({
  wrap: { alignItems: 'center' as const, justifyContent: 'center' as const, padding: space.xxl, gap: space.sm },
  title: { ...typography.title3, textAlign: 'center' as const, color: th.text.primary },
  text: { ...typography.subhead, textAlign: 'center' as const, color: th.text.secondary },
  action: { marginTop: space.md },
});

export function RatesState({ icon, title, text, actionLabel, onAction, actionAccessibilityLabel, testID }: RatesStateProps) {
  const th = useTokens();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrap} testID={testID}>
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <Icon name={icon} size={iconSize.hero} color={th.icon.secondary} />
      </View>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {text ? <Text style={styles.text}>{text}</Text> : null}
      {actionLabel && onAction ? (
        <Button type="secondary" onPress={onAction} style={styles.action} accessibilityLabel={actionAccessibilityLabel}>{actionLabel}</Button>
      ) : null}
    </View>
  );
}
