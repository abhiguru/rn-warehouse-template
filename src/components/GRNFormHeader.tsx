import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

import { showAlert } from '@/utils/alert';
export interface GRNFormHeaderProps {
  title: string; // e.g., "Create GRN"
  onCancel: () => void; // Called after user confirms cancellation
  showCancelButton?: boolean; // Default: true
  confirmCancel?: boolean; // Show confirmation alert (default: true)
  cancelMessage?: string; // Custom cancel confirmation message
}

const HEADER_HEIGHT = 56;

const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.surface.header,
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
  },
  content: {
    minHeight: HEADER_HEIGHT,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: layout.marginCompact,
    gap: space.sm,
  },
  side: {
    flex: 1,
    alignItems: 'flex-start' as const,
  },
  cancelButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingRight: space.sm,
  },
  cancelText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  title: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'center' as const,
    flex: 2,
  },
  pressed: {
    backgroundColor: t.brand.subtle,
    borderRadius: radius.button,
  },
});

/**
 * Header of the GRN form flow: Cancel on the left, step title in the centre.
 * Cancelling asks for confirmation before discarding the draft.
 */
export default function GRNFormHeader({
  title,
  onCancel,
  showCancelButton = true,
  confirmCancel = true,
  cancelMessage = 'The details you entered will be lost.',
}: GRNFormHeaderProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const handleCancelPress = useCallback(() => {
    if (confirmCancel) {
      showAlert(
        'Discard this GRN?',
        cancelMessage,
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard GRN', style: 'destructive', onPress: onCancel },
        ],
        { cancelable: true }
      );
    } else {
      onCancel();
    }
  }, [confirmCancel, cancelMessage, onCancel]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <View style={styles.side}>
          {showCancelButton && (
            <Pressable
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              onPress={handleCancelPress}
              hitSlop={space.sm}
              accessibilityRole="button"
              accessibilityLabel="Cancel GRN"
              accessibilityHint="Asks before discarding the details you entered"
            >
              <MaterialCommunityIcons name="close" size={iconSize.lg} color={t.brand.tint} />
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>

        <View style={styles.side} />
      </View>
    </View>
  );
}
