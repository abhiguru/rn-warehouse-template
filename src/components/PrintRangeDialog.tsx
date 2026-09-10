/**
 * PrintRangeDialog - Reusable dialog for selecting print range
 *
 * SAP Fiori Design System - Modal/Dialog Component
 * @see design/sap-fiori-specs/10-modal-dialog.md
 *
 * Pre-populates both start and end fields with the selected item number
 * User can override to print a range or just click OK to print single item
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import theme, { colors, darkColors } from '@/theme';
import { listColors } from '@/theme/listColors';

// =============================================================================
// FIORI DESIGN CONSTANTS
// =============================================================================
const FIORI = {
  // Modal dimensions (from 10-modal-dialog.md)
  modal: {
    cornerRadius: 16,
    maxWidth: 400,
  },
  // Header
  header: {
    height: 56,
    paddingHorizontal: 16,
  },
  // Typography
  typography: {
    title: {
      fontSize: 17,
      fontWeight: '600' as const,
      lineHeight: 22,
    },
    body: {
      fontSize: 15,
      fontWeight: '400' as const,
      lineHeight: 20,
    },
    caption: {
      fontSize: 13,
      fontWeight: '400' as const,
      lineHeight: 18,
    },
    button: {
      fontSize: 17,
      fontWeight: '600' as const,
    },
    label: {
      fontSize: 14,
      fontWeight: '600' as const,
      lineHeight: 20,
    },
  },
  // Buttons
  button: {
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 20,
  },
  // Input
  input: {
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 17,
  },
  // Touch targets
  touchTarget: {
    minHeight: 44,
    minWidth: 44,
  },
  // Spacing
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
  },
  // Backdrop
  backdrop: {
    opacity: 0.4,
  },
} as const;

interface PrintRangeDialogProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (startNumber: string, endNumber: string) => Promise<void>;
  title: string;
  defaultNumber: string;
  label: string;
  placeholder?: string;
  onViewJobs?: () => void;
}

export const PrintRangeDialog: React.FC<PrintRangeDialogProps> = ({
  visible,
  onDismiss,
  onConfirm,
  title,
  defaultNumber,
  label,
  placeholder = '',
  onViewJobs,
}) => {
  // Dark mode support
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

  const [startNumber, setStartNumber] = useState(defaultNumber);
  const [endNumber, setEndNumber] = useState(defaultNumber);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      if (__DEV__) console.log('[PrintRangeDialog] Dialog opened with defaultNumber:', defaultNumber);
      setStartNumber(defaultNumber);
      setEndNumber(defaultNumber);
      setError(null);
      setLoading(false);
    }
  }, [visible, defaultNumber]);

  const handleConfirm = async () => {
    setError(null);

    if (!startNumber.trim() || !endNumber.trim()) {
      setError('Please enter both start and end numbers');
      return;
    }

    setLoading(true);

    try {
      await onConfirm(startNumber.trim(), endNumber.trim());
      onDismiss();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}
      >
        <Pressable style={styles.backdropPressable} onPress={onDismiss} />

        <View style={styles.dialogContainer}>
          <View style={[styles.dialog, { backgroundColor: themeColors.white }]}>
            {/* Fiori Header */}
            <View style={[styles.header, { borderBottomColor: themeColors.gray[200] }]}>
              <View style={styles.headerIcon}>
                <Icon name="print-outline" size={24} color={themeColors.primary} />
              </View>
              <Text style={[styles.title, { color: themeColors.fiori.text.primary }]}>{title}</Text>
              <Pressable
                onPress={onDismiss}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.closeButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Icon name="close" size={24} color={themeColors.fiori.text.secondary} />
              </Pressable>
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: themeColors.gray[200] }]} />

            {/* Content */}
            <View style={styles.content}>
              {/* Description */}
              <Text style={[styles.description, { color: themeColors.fiori.text.primary }]}>
                Select the range of {label.toLowerCase()}s to print.
              </Text>
              <Text style={[styles.helpText, { color: themeColors.fiori.text.secondary }]}>
                Leave both fields the same to print a single item.
              </Text>

              {/* Range Input Section */}
              <View style={styles.rangeSection}>
                {/* From Input */}
                <View style={styles.inputGroup}>
                  <View style={styles.inputLabel}>
                    <Icon name="arrow-forward-circle" size={18} color={themeColors.primary} />
                    <Text style={[styles.inputLabelText, { color: themeColors.fiori.text.primary }]}>From</Text>
                  </View>
                  <TextInput
                    value={startNumber}
                    onChangeText={setStartNumber}
                    placeholder={placeholder || `Start ${label}`}
                    placeholderTextColor={themeColors.gray[400]}
                    editable={!loading}
                    style={[styles.input, { color: themeColors.fiori.text.primary, backgroundColor: themeColors.gray[50], borderColor: themeColors.gray[200] }, loading && styles.inputDisabled]}
                    returnKeyType="next"
                  />
                </View>

                {/* Arrow */}
                <View style={styles.arrowContainer}>
                  <Icon name="arrow-forward" size={20} color={themeColors.gray[400]} />
                </View>

                {/* To Input */}
                <View style={styles.inputGroup}>
                  <View style={styles.inputLabel}>
                    <Icon name="arrow-forward-circle" size={18} color={themeColors.primary} />
                    <Text style={[styles.inputLabelText, { color: themeColors.fiori.text.primary }]}>To</Text>
                  </View>
                  <TextInput
                    value={endNumber}
                    onChangeText={setEndNumber}
                    placeholder={placeholder || `End ${label}`}
                    placeholderTextColor={themeColors.gray[400]}
                    editable={!loading}
                    style={[styles.input, { color: themeColors.fiori.text.primary, backgroundColor: themeColors.gray[50], borderColor: themeColors.gray[200] }, loading && styles.inputDisabled]}
                    returnKeyType="done"
                    onSubmitEditing={handleConfirm}
                  />
                </View>
              </View>

              {/* Error Message */}
              {error && (
                <View style={styles.errorContainer}>
                  <Icon name="alert-circle" size={18} color={themeColors.semantic.error} />
                  <Text style={[styles.errorText, { color: themeColors.semantic.error }]}>{error}</Text>
                </View>
              )}
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: themeColors.gray[200] }]} />

            {/* Actions */}
            <View style={styles.actions}>
              {/* Left Actions */}
              <View style={styles.leftActions}>
                {onViewJobs && (
                  <Pressable
                    onPress={onViewJobs}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.viewJobsButton,
                      { borderColor: themeColors.primary },
                      pressed && { backgroundColor: themeColors.orange[50] },
                      loading && styles.buttonDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="View print jobs"
                  >
                    <Icon name="list-outline" size={20} color={themeColors.primary} />
                    <Text style={[styles.viewJobsButtonText, { color: themeColors.primary }]}>View Jobs</Text>
                  </Pressable>
                )}
              </View>

              {/* Right Actions */}
              <View style={styles.rightActions}>
                {/* Cancel Button - Fiori Tertiary */}
                <Pressable
                  onPress={onDismiss}
                  disabled={loading}
                  style={({ pressed }) => [
                    styles.cancelButton,
                    pressed && styles.buttonPressed,
                    loading && styles.buttonDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={[styles.cancelButtonText, { color: themeColors.fiori.text.secondary }]}>Cancel</Text>
                </Pressable>

                {/* Print Button - Fiori Primary */}
                <Pressable
                  onPress={handleConfirm}
                  disabled={loading}
                  style={({ pressed }) => [
                    styles.printButton,
                    { backgroundColor: themeColors.primary },
                    pressed && { backgroundColor: themeColors.orange[600] },
                    loading && styles.printButtonLoading,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Print"
                >
                  {loading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color={themeColors.white} />
                      <Text style={[styles.printButtonText, { color: themeColors.white }]}>Printing...</Text>
                    </View>
                  ) : (
                    <>
                      <Icon name="print" size={18} color={themeColors.white} />
                      <Text style={[styles.printButtonText, { color: themeColors.white }]}>Print</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// =============================================================================
// STYLES - SAP Fiori Design System
// =============================================================================
const styles = StyleSheet.create({
  // Backdrop
  backdrop: {
    flex: 1,
    backgroundColor: `rgba(0, 0, 0, ${FIORI.backdrop.opacity})`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdropPressable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  // Dialog Container
  dialogContainer: {
    width: '90%',
    maxWidth: FIORI.modal.maxWidth,
  },
  dialog: {
    borderRadius: FIORI.modal.cornerRadius,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  // ==========================================================================
  // HEADER
  // ==========================================================================
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: FIORI.header.height,
    paddingHorizontal: FIORI.header.paddingHorizontal,
    gap: FIORI.spacing.sm,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: FIORI.typography.title.fontSize,
    fontWeight: FIORI.typography.title.fontWeight,
    lineHeight: FIORI.typography.title.lineHeight,
  },
  closeButton: {
    width: FIORI.touchTarget.minWidth,
    height: FIORI.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -FIORI.spacing.xs,
  },
  closeButtonPressed: {
    opacity: 0.7,
  },
  divider: {
    height: 1,
  },

  // ==========================================================================
  // CONTENT
  // ==========================================================================
  content: {
    padding: FIORI.spacing.md,
  },
  description: {
    fontSize: FIORI.typography.body.fontSize,
    fontWeight: '500' as const,
    lineHeight: FIORI.typography.body.lineHeight,
    marginBottom: FIORI.spacing.xs,
  },
  helpText: {
    fontSize: FIORI.typography.caption.fontSize,
    fontWeight: FIORI.typography.caption.fontWeight,
    lineHeight: FIORI.typography.caption.lineHeight,
    marginBottom: FIORI.spacing.lg,
  },

  // Range Section
  rangeSection: {
    gap: FIORI.spacing.md,
  },
  inputGroup: {
    gap: FIORI.spacing.xs,
  },
  inputLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI.spacing.xs,
  },
  inputLabelText: {
    fontSize: FIORI.typography.label.fontSize,
    fontWeight: FIORI.typography.label.fontWeight,
    lineHeight: FIORI.typography.label.lineHeight,
  },
  input: {
    height: FIORI.input.height,
    borderRadius: FIORI.input.borderRadius,
    paddingHorizontal: FIORI.input.paddingHorizontal,
    fontSize: FIORI.input.fontSize,
    borderWidth: 1,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  arrowContainer: {
    alignItems: 'center',
    paddingVertical: FIORI.spacing.xxs,
  },

  // Error
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: FIORI.spacing.xs,
    paddingHorizontal: FIORI.spacing.sm,
    paddingVertical: FIORI.spacing.xs,
    borderRadius: 8,
    marginTop: FIORI.spacing.md,
    borderLeftWidth: 3,
  },
  errorText: {
    flex: 1,
    fontSize: FIORI.typography.caption.fontSize,
    fontWeight: '500' as const,
    lineHeight: FIORI.typography.caption.lineHeight,
  },

  // ==========================================================================
  // ACTIONS
  // ==========================================================================
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: FIORI.spacing.md,
    paddingVertical: FIORI.spacing.sm,
  },
  leftActions: {
    flex: 1,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI.spacing.xs,
  },

  // View Jobs Button - Fiori Tertiary Tint
  viewJobsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: FIORI.button.height,
    paddingHorizontal: FIORI.spacing.sm,
    gap: FIORI.spacing.xs,
    borderWidth: 1,
    borderRadius: FIORI.button.borderRadius,
  },
  viewJobsButtonText: {
    fontSize: FIORI.typography.button.fontSize,
    fontWeight: '400' as const,
  },

  // Cancel Button - Fiori Tertiary
  cancelButton: {
    height: FIORI.button.height,
    paddingHorizontal: FIORI.button.paddingHorizontal,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: FIORI.typography.button.fontSize,
    fontWeight: '400' as const,
  },

  // Print Button - Fiori Primary
  printButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: FIORI.button.height,
    paddingHorizontal: FIORI.button.paddingHorizontal,
    borderRadius: FIORI.button.borderRadius,
    gap: FIORI.spacing.xs,
    minWidth: 100,
  },
  printButtonPressed: {},
  printButtonLoading: {
    opacity: 0.8,
  },
  printButtonText: {
    fontSize: FIORI.typography.button.fontSize,
    fontWeight: FIORI.typography.button.fontWeight,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Loading
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI.spacing.xs,
  },
});

export default PrintRangeDialog;
