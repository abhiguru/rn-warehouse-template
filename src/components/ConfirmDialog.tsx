/**
 * ConfirmDialog - confirmation dialog (docs/STYLE_GUIDE.md §13.9).
 *
 * surface.sheet, radius.card and shadow[4] over overlay.scrim. Optional icon:
 * warning in status.critical.text, danger in status.negative.text. Title in
 * title3, message in body text.secondary. Cancel is a secondary button and the
 * action a primary one (the destructive fill for `danger`). The Android back
 * button and a tap on the scrim cancel.
 *
 * Wording (§12.2): the title asks a question naming the object, and the
 * confirm button repeats the verb ("Delete GRN", "Cancel").
 */

import React, { ComponentProps } from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

export type ConfirmVariant = 'default' | 'warning' | 'danger';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: ConfirmVariant;
  /** Optional icon name (Ionicons) */
  icon?: IoniconsName;
  /** Whether tapping the scrim cancels (default true). The back button always cancels. */
  dismissible?: boolean;
}

const ICON_CIRCLE = layout.avatar.lg - space.xs;

const makeStyles = (t: ThemeTokens) => ({
  overlay: {
    flex: 1,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxl,
  },
  dialog: {
    backgroundColor: t.surface.sheet,
    borderRadius: radius.card,
    padding: space.xxl,
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    alignItems: 'center' as const,
    ...t.shadow[4],
  },
  iconContainer: {
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: space.lg,
  },
  iconDefault: { backgroundColor: t.brand.subtle },
  iconWarning: { backgroundColor: t.status.critical.background },
  iconDanger: { backgroundColor: t.status.negative.background },
  title: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginBottom: space.sm,
  },
  message: {
    ...typography.body,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.xxl,
  },
  buttonContainer: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    width: '100%' as const,
  },
  button: {
    flexGrow: 1,
    flexBasis: 120,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: t.border.button,
  },
  cancelButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  cancelButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  confirmPrimary: { backgroundColor: t.brand.fill },
  confirmPrimaryPressed: { backgroundColor: t.brand.fillPressed },
  confirmPrimaryText: { color: t.brand.onFill },
  confirmDestructive: { backgroundColor: t.destructive.fill },
  confirmDestructivePressed: { backgroundColor: t.destructive.fillPressed },
  confirmDestructiveText: { color: t.destructive.onFill },
  confirmButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    textAlign: 'center' as const,
  },
});

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default',
  icon,
  dismissible = true,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const destructive = variant === 'danger';

  // Icon: status colours for warning and danger, brand tint otherwise
  const iconName: IoniconsName | undefined =
    icon ?? (variant === 'danger' ? 'alert-circle-outline' : variant === 'warning' ? 'warning-outline' : undefined);
  const iconColor =
    variant === 'danger' ? t.status.negative.text : variant === 'warning' ? t.status.critical.text : t.brand.tint;
  const iconBg =
    variant === 'danger' ? styles.iconDanger : variant === 'warning' ? styles.iconWarning : styles.iconDefault;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Scrim: tap to cancel */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissible ? onCancel : undefined}
          accessible={false}
          importantForAccessibility="no"
        />
        <View
          style={styles.dialog}
          accessibilityViewIsModal
          accessibilityRole="alert"
          accessibilityLabel={title}
        >
          {iconName && (
            <View style={[styles.iconContainer, iconBg]} accessible={false} importantForAccessibility="no-hide-descendants">
              <Ionicons name={iconName} size={iconSize.xl} color={iconColor} />
            </View>
          )}

          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>

          <Text style={styles.message}>{message}</Text>

          <View style={styles.buttonContainer}>
            <Pressable
              style={({ pressed }) => [styles.button, styles.cancelButton, pressed && styles.cancelButtonPressed]}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel={cancelText}
            >
              <Text style={styles.cancelButtonText}>{cancelText}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                destructive ? styles.confirmDestructive : styles.confirmPrimary,
                pressed && (destructive ? styles.confirmDestructivePressed : styles.confirmPrimaryPressed),
              ]}
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel={confirmText}
            >
              <Text
                style={[
                  styles.confirmButtonText,
                  destructive ? styles.confirmDestructiveText : styles.confirmPrimaryText,
                ]}
              >
                {confirmText}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default ConfirmDialog;
