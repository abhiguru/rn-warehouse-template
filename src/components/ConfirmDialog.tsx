/**
 * ConfirmDialog - Dark mode compliant confirmation modal
 *
 * SAP Fiori Design System - Modal/Dialog Component
 * Replaces native Alert.alert() for dark mode support
 */

import React, { ComponentProps } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, darkColors } from '@/theme';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

// ============================================================================
// SAP Fiori Design Constants
// ============================================================================
const FIORI = {
  modal: {
    cornerRadius: 16,
    padding: 24,
    maxWidth: 340,
    backdropOpacity: 0.4,
  },
  button: {
    height: 44,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  typography: {
    title: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
    body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  },
  icon: {
    containerSize: 56,
    iconSize: 28,
  },
} as const;

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
}

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
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

  // Get variant-specific colors
  const getVariantColors = () => {
    switch (variant) {
      case 'warning':
        return {
          iconBg: themeColors.orange[100],
          iconColor: themeColors.orange[500],
          confirmBg: themeColors.orange[500],
          confirmBgPressed: themeColors.orange[600],
        };
      case 'danger':
        return {
          iconBg: themeColors.fiori.semantic.negativeLight,
          iconColor: themeColors.fiori.semantic.negative,
          confirmBg: themeColors.fiori.semantic.negative,
          confirmBgPressed: '#b91c1c',
        };
      default:
        return {
          iconBg: themeColors.fiori.semantic.positiveLight,
          iconColor: themeColors.fiori.semantic.positive,
          confirmBg: themeColors.primary,
          confirmBgPressed: themeColors.orange[600],
        };
    }
  };

  const variantColors = getVariantColors();

  // Default icons based on variant
  const getDefaultIcon = (): IoniconsName => {
    switch (variant) {
      case 'warning':
        return 'alert-circle';
      case 'danger':
        return 'warning';
      default:
        return 'help-circle';
    }
  };

  const iconName: IoniconsName = icon || getDefaultIcon();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal={true}
      accessibilityLabel="Confirmation Dialog"
    >
      <View style={styles.overlay}>
        <View style={[styles.dialog, { backgroundColor: themeColors.white }]}>
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: variantColors.iconBg }]}>
            <Ionicons
              name={iconName}
              size={FIORI.icon.iconSize}
              color={variantColors.iconColor}
            />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: themeColors.fiori.text.primary }]}>
            {title}
          </Text>

          {/* Message */}
          <Text style={[styles.message, { color: themeColors.fiori.text.secondary }]}>
            {message}
          </Text>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            {/* Cancel Button */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                { borderColor: themeColors.gray[300] },
                pressed && { backgroundColor: themeColors.gray[100] },
              ]}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel={cancelText}
            >
              <Text style={[styles.cancelButtonText, { color: themeColors.fiori.text.primary }]}>
                {cancelText}
              </Text>
            </Pressable>

            {/* Confirm Button */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.confirmButton,
                { backgroundColor: variantColors.confirmBg },
                pressed && { backgroundColor: variantColors.confirmBgPressed },
              ]}
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel={confirmText}
            >
              <Text style={[styles.confirmButtonText, { color: themeColors.white }]}>
                {confirmText}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: `rgba(0, 0, 0, ${FIORI.modal.backdropOpacity})`,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    borderRadius: FIORI.modal.cornerRadius,
    padding: FIORI.modal.padding,
    width: '100%',
    maxWidth: FIORI.modal.maxWidth,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  iconContainer: {
    width: FIORI.icon.containerSize,
    height: FIORI.icon.containerSize,
    borderRadius: FIORI.icon.containerSize / 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: FIORI.typography.title.fontSize,
    fontWeight: FIORI.typography.title.fontWeight,
    lineHeight: FIORI.typography.title.lineHeight,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: FIORI.typography.body.fontSize,
    fontWeight: FIORI.typography.body.fontWeight,
    lineHeight: FIORI.typography.body.lineHeight,
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    height: FIORI.button.height,
    borderRadius: FIORI.button.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: FIORI.button.fontSize,
    fontWeight: FIORI.button.fontWeight,
  },
  confirmButton: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  confirmButtonText: {
    fontSize: FIORI.button.fontSize,
    fontWeight: FIORI.button.fontWeight,
  },
});

export default ConfirmDialog;
